function renderDrawGrid(ctx, payload = {}, env = {}) {
  const gridData = payload.gridData || [];
  const gridSize = Number(payload.gridSize) || 52;
  const width = Number(env.width) || 320;
  const height = Number(env.height) || 320;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const cellSize = Math.max(1, Math.floor(Math.min(width, height) / gridSize));

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const hex = gridData[y] ? gridData[y][x] : null;
      if (hex) {
        ctx.fillStyle = String(hex);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  return { width, height, cellSize, gridSize, startX: 0, startY: 0 };
}

module.exports = {
  renderDrawGrid
};
