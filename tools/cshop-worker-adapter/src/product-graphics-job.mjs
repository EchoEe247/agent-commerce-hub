import { toolImage, toolText } from './cshop-client.mjs';

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const OUTPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const ASSET_PANEL_RATIO = 0.36;
const ALLOWED_JOB_FIELDS = new Set([
  'width',
  'height',
  'title',
  'price',
  'titleSize',
  'priceSize',
  'background',
  'titleColor',
  'priceColor',
  'overlayFrom',
  'overlayTo',
  'asset',
  'output',
]);

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function text(value, name, maxLength) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new TypeError(`${name} must be a non-empty string up to ${maxLength} characters`);
  }
  return value;
}

function colour(value, name) {
  if (!HEX_COLOUR.test(value)) throw new TypeError(`${name} must be a 6- or 8-digit hex colour`);
  return value.toLowerCase();
}

function filename(value, name, { output = false } = {}) {
  if (typeof value !== 'string' || !SAFE_FILENAME.test(value) || value.includes('..')) {
    throw new TypeError(`${name} must be a simple workspace filename without path components`);
  }
  if (output) {
    const dot = value.lastIndexOf('.');
    const extension = dot >= 0 ? value.slice(dot).toLowerCase() : '';
    if (!OUTPUT_EXTENSIONS.has(extension)) {
      throw new TypeError(`${name} must end in .png, .jpg, or .jpeg`);
    }
  }
  return value;
}

function quote(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}"`;
}

function parseMeasurement(report) {
  const matches = [...report.matchAll(/measure\s+.+?:\s+(\d+)x(\d+)(?:\s+\(offset\s+(-?\d+),\s*(-?\d+)\))?/g)];
  const match = matches.at(-1);
  if (!match) throw new Error(`C-Shop did not return a usable text measurement: ${report}`);
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    offsetX: Number(match[3] ?? 0),
    offsetY: Number(match[4] ?? 0),
  };
}

function parseDocumentSize(report) {
  const match = /\bdocument:\s+(\d+)x(\d+)\b/.exec(report) ?? /\b(\d+)x(\d+)\b/.exec(report);
  if (!match) throw new Error(`C-Shop did not return a usable document size: ${report}`);
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

export function normalizeProductGraphicsJob(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('job must be an object');
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_JOB_FIELDS.has(key)) {
      throw new TypeError(`unsupported product graphics job field: ${key}`);
    }
  }

  const width = integer(input.width ?? 1200, 'width', 256, 4096);
  const height = integer(input.height ?? 1200, 'height', 256, 4096);
  const title = text(input.title, 'title', 120);
  const price = input.price == null ? null : text(input.price, 'price', 40);
  const asset = input.asset == null ? null : filename(input.asset, 'asset');
  const defaultTitleSize = asset
    ? Math.max(24, Math.round(Math.min(width, height) * 0.06))
    : Math.max(42, Math.round(width * 0.075));
  const titleSize = integer(input.titleSize ?? defaultTitleSize, 'titleSize', 18, 320);
  const defaultPriceSize = asset
    ? Math.max(18, Math.round(titleSize * 0.62))
    : Math.max(30, Math.round(titleSize * 0.62));
  const priceSize = integer(input.priceSize ?? defaultPriceSize, 'priceSize', 14, 240);

  return Object.freeze({
    width,
    height,
    title,
    price,
    titleSize,
    priceSize,
    background: colour(input.background ?? '#111827', 'background'),
    titleColor: colour(input.titleColor ?? '#ffffff', 'titleColor'),
    priceColor: colour(input.priceColor ?? '#f9fafb', 'priceColor'),
    overlayFrom: colour(input.overlayFrom ?? '#00000000', 'overlayFrom'),
    overlayTo: colour(input.overlayTo ?? '#000000cc', 'overlayTo'),
    asset,
    output: filename(input.output ?? 'product-graphic.png', 'output', { output: true }),
  });
}

async function measure(client, value, size, bold = false) {
  const result = await client.runScript(`measure text ${quote(value)} size=${size}${bold ? ' bold' : ''}`, {
    returnImage: false,
  });
  return parseMeasurement(toolText(result));
}

async function fitMeasuredText(client, value, requestedSize, maxWidth, { bold = false, minSize }) {
  let size = requestedSize;
  let measurement = await measure(client, value, size, bold);

  while (measurement.width > maxWidth && size > minSize) {
    const proportional = Math.floor((size * maxWidth) / measurement.width);
    const nextSize = Math.max(minSize, Math.min(size - 1, proportional));
    size = nextSize;
    measurement = await measure(client, value, size, bold);
  }

  if (measurement.width > maxWidth) {
    throw new RangeError(`text cannot fit within ${maxWidth}px even at minimum size ${minSize}`);
  }

  return { size, measurement };
}

function centredX(canvasWidth, measurement, margin = 24) {
  return Math.max(margin, Math.round((canvasWidth - measurement.width) / 2 - measurement.offsetX));
}

function assetPanelHeight(canvasHeight) {
  return Math.min(canvasHeight - 64, Math.max(96, Math.round(canvasHeight * ASSET_PANEL_RATIO)));
}

async function prepareCanvas(client, job) {
  if (!job.asset) {
    await client.runScript(`new ${job.width} ${job.height} background=${job.background}`, {
      returnImage: false,
    });
    return { kind: 'blank' };
  }

  const opened = await client.runScript(`open ${quote(job.asset)}\ninfo`, { returnImage: false });
  const source = parseDocumentSize(toolText(opened));
  const panelHeight = assetPanelHeight(job.height);
  const imageZoneHeight = job.height - panelHeight;
  const containScale = Math.min(job.width / source.width, imageZoneHeight / source.height);
  const verticalShift = Math.round(panelHeight / 2);

  await client.runScript(
    [
      `resize scale=${containScale}`,
      `resize ${job.width} ${job.height} canvas`,
      `move 0 -${verticalShift}`,
      'layer new',
      'set name="commerce-background"',
      `fill ${job.background}`,
      'order bottom',
    ].join('\n'),
    { returnImage: false },
  );

  return {
    kind: 'asset',
    panelTop: imageZoneHeight,
    panelHeight,
    source,
    scale: containScale,
  };
}

export async function executeProductGraphicsJob(client, rawJob) {
  const job = normalizeProductGraphicsJob(rawJob);
  await client.initialize();

  try {
    const layout = await prepareCanvas(client, job);
    const isAssetLayout = layout.kind === 'asset';
    const horizontalMargin = Math.max(24, Math.round(job.width * (isAssetLayout ? 0.08 : 0.04)));
    const maxTextWidth = job.width - horizontalMargin * 2;
    const fittedTitle = await fitMeasuredText(client, job.title, job.titleSize, maxTextWidth, {
      bold: true,
      minSize: 18,
    });
    const titleMeasure = fittedTitle.measurement;
    const titleX = centredX(job.width, titleMeasure, horizontalMargin);

    let fittedPrice = null;
    if (job.price) {
      fittedPrice = await fitMeasuredText(client, job.price, job.priceSize, maxTextWidth, {
        bold: true,
        minSize: 14,
      });
    }

    let titleTop;
    let priceTop = null;
    if (isAssetLayout) {
      const priceHeight = fittedPrice?.measurement.height ?? 0;
      const gap = fittedPrice ? Math.max(12, Math.round(layout.panelHeight * 0.05)) : 0;
      const blockHeight = titleMeasure.height + gap + priceHeight;
      const panelPadding = Math.max(12, Math.round(layout.panelHeight * 0.08));
      if (blockHeight > layout.panelHeight - panelPadding * 2) {
        throw new RangeError('title and price cannot fit within the product-card text panel');
      }
      titleTop = layout.panelTop + Math.round((layout.panelHeight - blockHeight) / 2);
      if (fittedPrice) priceTop = titleTop + titleMeasure.height + gap;
    } else {
      titleTop = Math.round(job.height * 0.69);
      if (fittedPrice) {
        priceTop = Math.min(
          job.height - fittedPrice.measurement.height - 24,
          titleTop + titleMeasure.height + 24,
        );
      }
    }

    const titleBaseline = Math.min(job.height - 24, Math.max(24, titleTop - titleMeasure.offsetY));
    const textLines = [
      `text ${titleX} ${titleBaseline} ${quote(job.title)} size=${fittedTitle.size} color=${job.titleColor} bold`,
    ];

    if (fittedPrice) {
      const priceMeasure = fittedPrice.measurement;
      const priceX = centredX(job.width, priceMeasure, horizontalMargin);
      const priceBaseline = Math.min(job.height - 20, Math.max(20, priceTop - priceMeasure.offsetY));
      textLines.push(
        `text ${priceX} ${priceBaseline} ${quote(job.price)} size=${fittedPrice.size} color=${job.priceColor} bold`,
      );
    }

    const compose = isAssetLayout
      ? [...textLines, `export ${quote(job.output)}`].join('\n')
      : [
          'layer new',
          'set name="commerce-overlay"',
          `gradient 0 ${job.height} 0 ${Math.round(job.height * 0.42)} from=${job.overlayTo} to=${job.overlayFrom}`,
          ...textLines,
          `export ${quote(job.output)}`,
        ].join('\n');

    const result = await client.runScript(compose, { returnImage: true, imageFit: 768 });
    return {
      output: job.output,
      report: toolText(result),
      preview: toolImage(result),
      sessionId: client.sessionId,
    };
  } finally {
    try {
      await client.reset();
    } catch {
      // A failed job must not be hidden by best-effort session cleanup.
    }
  }
}
