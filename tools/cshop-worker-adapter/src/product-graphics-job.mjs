import { toolImage, toolText } from './cshop-client.mjs';

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const OUTPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

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

export function normalizeProductGraphicsJob(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('job must be an object');
  }

  const width = integer(input.width ?? 1200, 'width', 256, 4096);
  const height = integer(input.height ?? 1200, 'height', 256, 4096);
  const title = text(input.title, 'title', 120);
  const price = input.price == null ? null : text(input.price, 'price', 40);
  const titleSize = integer(input.titleSize ?? Math.max(42, Math.round(width * 0.075)), 'titleSize', 18, 320);
  const priceSize = integer(input.priceSize ?? Math.max(30, Math.round(titleSize * 0.62)), 'priceSize', 14, 240);

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
    asset: input.asset == null ? null : filename(input.asset, 'asset'),
    output: filename(input.output ?? 'product-graphic.png', 'output', { output: true }),
  });
}

async function measure(client, value, size, bold = false) {
  const result = await client.runScript(`measure text ${quote(value)} size=${size}${bold ? ' bold' : ''}`, {
    returnImage: false,
  });
  return parseMeasurement(toolText(result));
}

function centredX(canvasWidth, measurement, margin = 24) {
  return Math.max(margin, Math.round((canvasWidth - measurement.width) / 2 - measurement.offsetX));
}

export async function executeProductGraphicsJob(client, rawJob) {
  const job = normalizeProductGraphicsJob(rawJob);
  await client.initialize();

  const bootstrap = job.asset
    ? `open ${quote(job.asset)}\nresize ${job.width} ${job.height}`
    : `new ${job.width} ${job.height} background=${job.background}`;

  try {
    await client.runScript(bootstrap, { returnImage: false });

    const titleMeasure = await measure(client, job.title, job.titleSize, true);
    const titleX = centredX(job.width, titleMeasure);
    const titleTop = Math.round(job.height * 0.69);
    const titleBaseline = Math.min(job.height - 24, Math.max(24, titleTop - titleMeasure.offsetY));

    let priceLine = '';
    if (job.price) {
      const priceMeasure = await measure(client, job.price, job.priceSize, true);
      const priceX = centredX(job.width, priceMeasure);
      const priceTop = Math.min(job.height - priceMeasure.height - 24, titleTop + titleMeasure.height + 24);
      const priceBaseline = Math.min(job.height - 20, Math.max(20, priceTop - priceMeasure.offsetY));
      priceLine = `\ntext ${priceX} ${priceBaseline} ${quote(job.price)} size=${job.priceSize} color=${job.priceColor} bold`;
    }

    const compose = [
      'layer new',
      'set name="commerce-overlay"',
      `gradient 0 ${job.height} 0 ${Math.round(job.height * 0.42)} from=${job.overlayTo} to=${job.overlayFrom}`,
      `text ${titleX} ${titleBaseline} ${quote(job.title)} size=${job.titleSize} color=${job.titleColor} bold${priceLine}`,
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
