function renderFocusBoard(ctx, payload = {}, env = {}) {
  const rgbGrid = payload.rgbGrid || [];
  const gridSize = Number(payload.gridSize) || (rgbGrid.length || 64);
  const width = Number(env.width) || 352;
  const height = Number(env.height) || 352;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  if (!rgbGrid.length) {
    return { width, height, empty: true };
  }

  const cellSize = Math.max(1, Math.floor(Math.min(width, height) / gridSize));

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const c = rgbGrid[y] ? rgbGrid[y][x] : null;
      if (!c) continue;
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  return { width, height, cellSize, gridSize, startX: 0, startY: 0 };
}

module.exports = {
  renderFocusBoard
};
