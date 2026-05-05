function renderResult(ctx, payload = {}, env = {}) {
  const rgbData = payload.rgbData || [];
  const gridData = payload.gridData || [];
  const colorPalette = payload.colorPalette || [];
  const width = Number(env.width) || 512;
  const height = Number(env.height) || 512;

  const debugInfo = {
    width,
    height,
    rgbArray: Array.isArray(rgbData),
    rgbLen: Array.isArray(rgbData) ? rgbData.length : -1,
    rgbRowArray: Array.isArray(rgbData) && rgbData.length > 0 ? Array.isArray(rgbData[0]) : false,
    rgbColLen: Array.isArray(rgbData) && rgbData.length > 0 && Array.isArray(rgbData[0]) ? rgbData[0].length : -1,
    rgbCellArray: Array.isArray(rgbData) && rgbData.length > 0 && Array.isArray(rgbData[0]) && rgbData[0].length > 0 ? Array.isArray(rgbData[0][0]) : false,
    gridArray: Array.isArray(gridData),
    gridLen: Array.isArray(gridData) ? gridData.length : -1,
    paletteLen: Array.isArray(colorPalette) ? colorPalette.length : -1,
    branch: 'none'
  };

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const is2dRgb = Array.isArray(rgbData)
    && rgbData.length > 0
    && Array.isArray(rgbData[0])
    && rgbData[0].length > 0
    && Array.isArray(rgbData[0][0]);

  if (is2dRgb) {
    const rows = rgbData.length;
    const cols = rgbData[0].length;
    const cell = Math.max(1, Math.floor(Math.min(width / Math.max(1, cols), height / Math.max(1, rows))));
    const drawWidth = cell * cols;
    const drawHeight = cell * rows;
    const startX = Math.floor((width - drawWidth) / 2);
    const startY = Math.floor((height - drawHeight) / 2);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const rgb = rgbData[y] ? rgbData[y][x] : null;
        const r = rgb && rgb.length > 0 ? Number(rgb[0]) : 255;
        const g = rgb && rgb.length > 1 ? Number(rgb[1]) : 255;
        const b = rgb && rgb.length > 2 ? Number(rgb[2]) : 255;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(startX + x * cell, startY + y * cell, cell + 0.5, cell + 0.5);
      }
    }

    debugInfo.branch = '2d-rgb';
    return { width, height, startX, startY, cellSize: cell, gridSize: Math.max(rows, cols), rows, cols, empty: false, debug: debugInfo };
  }

  const isFlatRgb = Array.isArray(rgbData)
    && rgbData.length > 0
    && typeof rgbData[0] === 'number';

  if (isFlatRgb) {
    const size = Math.max(1, Math.round(Math.sqrt(rgbData.length / 3)));
    const cell = Math.max(1, Math.floor(Math.min(width, height) / size));
    const startX = Math.floor((width - cell * size) / 2);
    const startY = Math.floor((height - cell * size) / 2);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3;
        const r = Number(rgbData[i] || 255);
        const g = Number(rgbData[i + 1] || 255);
        const b = Number(rgbData[i + 2] || 255);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(startX + x * cell, startY + y * cell, cell + 0.5, cell + 0.5);
      }
    }

    debugInfo.branch = 'flat-rgb';
    return { width, height, startX, startY, cellSize: cell, gridSize: size, rows: size, cols: size, empty: false, debug: debugInfo };
  }

  const hasLegacyGrid = Array.isArray(gridData)
    && gridData.length > 0
    && Array.isArray(gridData[0])
    && Array.isArray(colorPalette)
    && colorPalette.length > 0;

  if (hasLegacyGrid) {
    const rows = gridData.length;
    const cols = gridData[0].length;
    const cell = Math.max(1, Math.floor(Math.min(width / Math.max(1, cols), height / Math.max(1, rows))));
    const drawWidth = cell * cols;
    const drawHeight = cell * rows;
    const startX = Math.floor((width - drawWidth) / 2);
    const startY = Math.floor((height - drawHeight) / 2);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = gridData[y] ? gridData[y][x] : -1;
        const color = idx >= 0 ? colorPalette[idx] : null;
        const r = color ? Number(color.r) : 255;
        const g = color ? Number(color.g) : 255;
        const b = color ? Number(color.b) : 255;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(startX + x * cell, startY + y * cell, cell + 0.5, cell + 0.5);
      }
    }

    debugInfo.branch = 'legacy-grid';
    return { width, height, startX, startY, cellSize: cell, gridSize: Math.max(rows, cols), rows, cols, empty: false, debug: debugInfo };
  }

  debugInfo.branch = 'empty';
  return { width, height, empty: true, debug: debugInfo };
}

module.exports = {
  renderResult
};
