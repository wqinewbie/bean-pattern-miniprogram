function clamp(value, min, max) {
  const n = Number(value) || 0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function toCanvasPoint(screenX, screenY, rect, transform = {}) {
  const left = Number(rect && rect.left) || 0;
  const top = Number(rect && rect.top) || 0;
  const scale = Number(transform.scale) || 1;
  const offsetX = Number(transform.offsetX) || 0;
  const offsetY = Number(transform.offsetY) || 0;

  const localX = (Number(screenX) - left - offsetX) / scale;
  const localY = (Number(screenY) - top - offsetY) / scale;

  return { x: localX, y: localY };
}

function toGridCell(point, layout) {
  const startX = Number(layout.startX) || 0;
  const startY = Number(layout.startY) || 0;
  const cellSize = Number(layout.cellSize) || 1;
  const gridSize = Math.max(1, Number(layout.gridSize) || 1);

  const col = Math.floor((Number(point.x) - startX) / cellSize);
  const row = Math.floor((Number(point.y) - startY) / cellSize);

  return {
    col: clamp(col, 0, gridSize - 1),
    row: clamp(row, 0, gridSize - 1),
    outOfRange: col < 0 || row < 0 || col >= gridSize || row >= gridSize
  };
}

module.exports = {
  toCanvasPoint,
  toGridCell
};
