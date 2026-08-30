export const ASSET_PANEL_RATIO = 0.36;

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
  return value;
}

export function assetPanelHeight(canvasHeight) {
  const height = positiveFinite(canvasHeight, 'canvasHeight');
  return Math.min(height - 64, Math.max(96, Math.round(height * ASSET_PANEL_RATIO)));
}

export function assetLayoutGeometry({ canvasWidth, canvasHeight, sourceWidth, sourceHeight }) {
  const width = positiveFinite(canvasWidth, 'canvasWidth');
  const height = positiveFinite(canvasHeight, 'canvasHeight');
  const sourceW = positiveFinite(sourceWidth, 'sourceWidth');
  const sourceH = positiveFinite(sourceHeight, 'sourceHeight');

  const panelHeight = assetPanelHeight(height);
  const imageZoneHeight = height - panelHeight;
  if (imageZoneHeight <= 0) {
    throw new RangeError('asset image zone must have positive height');
  }

  const scale = Math.min(width / sourceW, imageZoneHeight / sourceH);
  const scaledWidth = sourceW * scale;
  const scaledHeight = sourceH * scale;
  const x = (width - scaledWidth) / 2;
  const y = (imageZoneHeight - scaledHeight) / 2;

  return Object.freeze({
    canvasWidth: width,
    canvasHeight: height,
    panelTop: imageZoneHeight,
    panelHeight,
    imageZoneHeight,
    scale,
    scaledWidth,
    scaledHeight,
    x,
    y,
    verticalShift: Math.round(panelHeight / 2),
  });
}

export function assertAssetLayoutInvariants(layout, epsilon = 1e-7) {
  if (!layout || typeof layout !== 'object') {
    throw new TypeError('layout must be an object');
  }

  const values = [
    layout.canvasWidth,
    layout.canvasHeight,
    layout.panelTop,
    layout.panelHeight,
    layout.imageZoneHeight,
    layout.scale,
    layout.scaledWidth,
    layout.scaledHeight,
    layout.x,
    layout.y,
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError('layout contains a non-finite value');
  }

  if (layout.panelHeight < 64 || layout.panelHeight >= layout.canvasHeight) {
    throw new RangeError('text panel must remain inside the canvas');
  }
  if (layout.imageZoneHeight <= 0 || layout.panelTop !== layout.imageZoneHeight) {
    throw new RangeError('image zone must remain above the text panel');
  }
  if (layout.scale <= 0 || layout.scaledWidth <= 0 || layout.scaledHeight <= 0) {
    throw new RangeError('scaled asset dimensions must stay positive');
  }
  if (layout.x < -epsilon || layout.y < -epsilon) {
    throw new RangeError('contained asset cannot start outside the image zone');
  }
  if (layout.x + layout.scaledWidth > layout.canvasWidth + epsilon) {
    throw new RangeError('contained asset exceeds canvas width');
  }
  if (layout.y + layout.scaledHeight > layout.imageZoneHeight + epsilon) {
    throw new RangeError('contained asset overlaps the text panel');
  }

  const fillsWidth = Math.abs(layout.scaledWidth - layout.canvasWidth) <= epsilon;
  const fillsHeight = Math.abs(layout.scaledHeight - layout.imageZoneHeight) <= epsilon;
  if (!fillsWidth && !fillsHeight) {
    throw new RangeError('contained asset must touch at least one image-zone boundary');
  }

  return true;
}
