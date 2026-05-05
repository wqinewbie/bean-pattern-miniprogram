const { DEFAULT_BG_COLOR, GRID_LINE_COLOR, AXIS_BG_COLOR, AXIS_TEXT_COLOR, MIN_FONT_SIZE, MIN_SUMMARY_BLOCK, MAX_EXPORT_SIZE } = require('../constants');

function renderPattern(ctx, payload = {}, env = {}) {
  const gridData = payload.gridData || [];
  const palette = payload.colorPalette || [];
  const gridSize = Number(payload.gridSize) || 64;
  const width = Number(env.width) || 1024;
  const height = Number(env.height) || width;

  ctx.fillStyle = DEFAULT_BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  if (!gridData.length || !palette.length) {
    return { width, height, gridSize, empty: true };
  }

  const board = Math.min(width, height);
  const cellSize = Math.max(1, Math.ceil(board / gridSize));
  const drawWidth = cellSize * gridSize;
  const drawHeight = cellSize * gridSize;
  const startX = Math.floor((width - drawWidth) / 2);
  const startY = Math.floor((height - drawHeight) / 2);

  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 0.7;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = gridData[y] ? gridData[y][x] : -1;
      const color = idx >= 0 ? palette[idx] : null;
      const cellX = startX + x * cellSize;
      const cellY = startY + y * cellSize;
      if (color) {
        ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
      } else {
        ctx.fillStyle = DEFAULT_BG_COLOR;
      }
      ctx.fillRect(cellX, cellY, cellSize, cellSize);
      ctx.strokeRect(cellX, cellY, cellSize, cellSize);
    }
  }

  const axisFont = Math.max(MIN_FONT_SIZE + 3, Math.floor(cellSize * 0.28));
  ctx.fillStyle = AXIS_TEXT_COLOR;
  ctx.font = `${axisFont}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = AXIS_BG_COLOR;
  const axisBand = Math.max(10, Math.floor(cellSize * 0.8));
  ctx.fillRect(startX, startY, cellSize * gridSize, axisBand);
  ctx.fillRect(startX, startY + cellSize * gridSize - axisBand, cellSize * gridSize, axisBand);

  ctx.fillStyle = AXIS_TEXT_COLOR;
  for (let i = 0; i < gridSize; i++) {
    const n = String(i + 1);
    const cx = startX + i * cellSize + cellSize / 2;
    ctx.fillText(n, cx, startY + axisBand * 0.45);
    ctx.fillText(n, cx, startY + cellSize * gridSize - axisBand * 0.45);
  }

  return {
    width,
    height,
    gridSize,
    cellSize,
    startX,
    startY,
    maxExportSize: MAX_EXPORT_SIZE,
    minSummaryBlock: MIN_SUMMARY_BLOCK
  };
}

module.exports = {
  renderPattern
};
