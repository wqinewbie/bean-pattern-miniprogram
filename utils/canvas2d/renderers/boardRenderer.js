/**
 * Drawing board renderer for Canvas 2D.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getLineMetrics(cellSize, viewScale, dpr) {
  const scale = Math.max(Number(viewScale) || 1, 0.1);
  const screenThin = 1;
  const screenThick = 1;

  return {
    thin: screenThin / scale,
    thick: screenThick / scale
  };
}

function alignToScreenPixel(value, viewScale, dpr) {
  const scale = Math.max(Number(viewScale) || 1, 0.1);
  const renderDpr = Math.max(Number(dpr) || 1, 1);
  return Math.round(value * scale * renderDpr) / (scale * renderDpr);
}

function fillClippedText(ctx, text, x, y, clipX, clipY, clipW, clipH) {
  if (!ctx || !clipW || !clipH) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, clipY, clipW, clipH);
  ctx.clip();
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawGridLineRects(ctx, width, height, gridSize, cellSize, viewScale, dpr) {
  const metrics = getLineMetrics(cellSize, viewScale, dpr);
  const uniformLineWidth = metrics.thin;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#BDBDBD';

  for (let i = 0; i <= gridSize; i++) {
    const pos = alignToScreenPixel(i * cellSize, viewScale, dpr);
    ctx.fillRect(pos, 0, uniformLineWidth, height);
    ctx.fillRect(0, pos, width, uniformLineWidth);
  }

  ctx.restore();
}

function drawCheckerCell(ctx, x, y, cellSize) {
  if (!ctx || !cellSize) return;

  const half = cellSize / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, cellSize, cellSize);
  ctx.fillStyle = '#D9D9D9';
  ctx.fillRect(x, y, half, half);
  ctx.fillRect(x + half, y + half, half, half);
}

function drawCheckerboard(ctx, width, height, gridSize, originX = 0, originY = 0) {
  if (!ctx || !width || !height || !gridSize) return;

  const cellSize = width / gridSize;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(originX, originY, width, height);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = originX + col * cellSize;
      const y = originY + row * cellSize;
      const half = cellSize / 2;
      ctx.fillStyle = '#D9D9D9';
      ctx.fillRect(x, y, half, half);
      ctx.fillRect(x + half, y + half, half, half);
    }
  }

  ctx.restore();
}

function drawCoordinateFrame(ctx, options) {
  if (!ctx) return;
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const gridSize = Number(options.gridSize) || 0;
  const inset = Number(options.inset) || 0;
  const viewScale = Math.max(Number(options.viewScale) || 1, 0.1);
  const dpr = Math.max(Number(options.dpr) || 1, 1);
  const showLabels = options.showLabels !== false;
  if (!width || !height || !gridSize || !inset) return;

  const totalWidth = width + inset * 2;
  const totalHeight = height + inset * 2;
  const cellW = width / gridSize;
  const cellH = height / gridSize;
  const line = Math.max(0.5, Math.min(1, inset * 0.08));

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFF4DC';
  ctx.fillRect(0, 0, totalWidth, inset);
  ctx.fillRect(0, inset + height, totalWidth, inset);
  ctx.fillRect(0, inset, inset, height);
  ctx.fillRect(inset + width, inset, inset, height);

  ctx.fillStyle = '#FFEBB5';
  for (let i = 0; i <= gridSize; i++) {
    const x = inset + i * cellW;
    ctx.fillRect(x, 0, line, inset);
    ctx.fillRect(x, inset + height, line, inset);

    const y = inset + i * cellH;
    ctx.fillRect(0, y, inset, line);
    ctx.fillRect(inset + width, y, inset, line);
  }
  ctx.fillRect(0, 0, totalWidth, line);
  ctx.fillRect(0, totalHeight - line, totalWidth, line);
  ctx.fillRect(0, 0, line, totalHeight);
  ctx.fillRect(totalWidth - line, 0, line, totalHeight);
  ctx.fillRect(inset, inset, width, line);
  ctx.fillRect(inset, inset + height - line, width, line);
  ctx.fillRect(inset, inset, line, height);
  ctx.fillRect(inset + width - line, inset, line, height);

  if (!showLabels) {
    ctx.restore();
    return;
  }

  const labelCellSize = Math.max(1, Math.min(inset, cellW, cellH));
  const visualCell = labelCellSize * viewScale;
  const digitCount = String(gridSize).length;
  const maxByCell = visualCell * 0.58;
  const maxByLength = visualCell / Math.max(1.15, digitCount * 0.68);
  const visualFontSize = Math.max(6, Math.min(12, maxByCell, maxByLength));
  let fontSize = Math.max(1, Math.round((visualFontSize / viewScale) * 4) / 4);
  ctx.fillStyle = '#A1887F';
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxLabelWidth = Math.max(1, labelCellSize * 0.84);
  const maxLabelHeight = Math.max(1, labelCellSize * 0.68);
  const maxLabel = String(gridSize);
  const measuredWidth = ctx.measureText ? ctx.measureText(maxLabel).width : 0;
  if (measuredWidth > maxLabelWidth || fontSize > maxLabelHeight) {
    const widthRatio = measuredWidth > 0 ? maxLabelWidth / measuredWidth : 1;
    const heightRatio = maxLabelHeight / fontSize;
    fontSize = Math.max(1, Math.floor(fontSize * Math.min(widthRatio, heightRatio) * 4) / 4);
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  }

  for (let i = 1; i <= gridSize; i++) {
    const label = String(i);
    const x = alignToScreenPixel(inset + (i - 0.5) * cellW, viewScale, dpr);
    const y = alignToScreenPixel(inset + (i - 0.5) * cellH, viewScale, dpr);
    const topY = alignToScreenPixel(inset / 2, viewScale, dpr);
    const bottomY = alignToScreenPixel(inset + height + inset / 2, viewScale, dpr);
    const leftX = alignToScreenPixel(inset / 2, viewScale, dpr);
    const rightX = alignToScreenPixel(inset + width + inset / 2, viewScale, dpr);
    const labelLeft = inset + (i - 1) * cellW;
    const labelTop = inset + (i - 1) * cellH;
    fillClippedText(ctx, label, x, topY, labelLeft, 0, cellW, inset);
    fillClippedText(ctx, label, x, bottomY, labelLeft, inset + height, cellW, inset);
    fillClippedText(ctx, label, leftX, y, 0, labelTop, inset, cellH);
    fillClippedText(ctx, label, rightX, y, inset + width, labelTop, inset, cellH);
  }

  ctx.restore();
}

function drawCellGridRects(ctx, x, y, cellSize, row, col, viewScale, dpr) {
  const metrics = getLineMetrics(cellSize, viewScale, dpr);
  const left = alignToScreenPixel(x, viewScale, dpr);
  const top = alignToScreenPixel(y, viewScale, dpr);
  const right = alignToScreenPixel(x + cellSize, viewScale, dpr);
  const bottom = alignToScreenPixel(y + cellSize, viewScale, dpr);
  const uniformLineWidth = metrics.thin;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#BDBDBD';
  ctx.fillRect(left, top, uniformLineWidth, cellSize);
  ctx.fillRect(left, top, cellSize, uniformLineWidth);
  ctx.fillRect(right - uniformLineWidth, top, uniformLineWidth, cellSize);
  ctx.fillRect(left, bottom - uniformLineWidth, cellSize, uniformLineWidth);
  ctx.restore();
}

function getCellCodeConfig(cellSize, viewScale, maxCodeLength = 2) {
  const scale = Math.max(Number(viewScale) || 1, 0.1);
  const visualCell = cellSize * scale;
  const show = visualCell >= 6;
  const targetVisualFontSize = visualCell < 12 ? 7 : 12;
  const maxByCell = visualCell * 0.58;
  const maxByLength = visualCell / Math.max(1.2, maxCodeLength * 0.62);
  const visualFontSize = Math.max(4.5, Math.min(targetVisualFontSize, maxByCell, maxByLength));
  const fontSize = Math.max(1, Math.round((visualFontSize / scale) * 4) / 4);
  return { show, fontSize, visualFontSize };
}

function getCodeTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 7) return '#222222';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#222222' : '#FFFFFF';
}

function drawCellCode(ctx, color, code, cx, cy, fontSize, opts = {}) {
  if (!code) return;

  const textColor = getCodeTextColor(color);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = textColor;
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(code, cx, cy);
}

function drawCodeLayer(ctx, options) {
  if (!ctx) return;

  const {
    width,
    gridSize,
    viewScale = 1,
    colorCodeMap = null,
    getCellColor = null,
    gridData = null
  } = options;

  if (!width || !gridSize || !colorCodeMap) return;

  const cellSize = width / gridSize;
  const codes = Object.keys(colorCodeMap).map((key) => String(colorCodeMap[key] || ''));
  const maxCodeLength = codes.reduce((max, code) => Math.max(max, code.length), 1);
  const codeCfg = getCellCodeConfig(cellSize, viewScale, maxCodeLength);
  if (!codeCfg.show) return;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = getCellColor ? getCellColor(y, x) : (gridData && gridData[y] ? gridData[y][x] : null);
      if (!color) continue;

      const normalizedColor = String(color).toUpperCase();
      const code = colorCodeMap[normalizedColor];
      if (!code) continue;

      const px = x * cellSize;
      const py = y * cellSize;
      const visualCell = cellSize * Math.max(Number(viewScale) || 1, 1);
      drawCellCode(ctx, normalizedColor, code, px + cellSize / 2, py + cellSize / 2, codeCfg.fontSize, {
        skipStroke: visualCell < 45
      });
    }
  }
}

function drawBoard(ctx, options) {
  if (!ctx) return;

  const {
    width,
    height,
    gridSize,
    gridData,
    showGrid = true,
    hasBackground = false,
    viewScale = 1,
    dpr = 1,
    colorCodeMap = null,
    getCellColor = null,
    skipGridLayer = false,
    skipCodeLayer = false,
    boardInset = 0
  } = options;

  const cellSize = width / gridSize;
  const originX = Number(boardInset) || 0;
  const originY = Number(boardInset) || 0;
  const totalWidth = width + originX * 2;
  const totalHeight = height + originY * 2;

  ctx.clearRect(0, 0, totalWidth || width, totalHeight || height);
  if (originX || originY) {
    drawCoordinateFrame(ctx, { width, height, gridSize, inset: originX, viewScale, dpr, showLabels: true });
  }

  if (!hasBackground) {
    drawCheckerboard(ctx, width, height, gridSize, originX, originY);
  }

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = getCellColor ? getCellColor(y, x) : (gridData[y] ? gridData[y][x] : null);
      if (color === null || color === undefined) continue;
      if (hasBackground && color === '#FFFFFF') continue;

      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, cellSize, cellSize);

    }
  }

  if (!skipCodeLayer) {
    ctx.save();
    ctx.translate(originX, originY);
    drawCodeLayer(ctx, { width, gridSize, viewScale, colorCodeMap, getCellColor, gridData });
    ctx.restore();
  }

  if (!skipGridLayer && showGrid) {
    ctx.save();
    ctx.translate(originX, originY);
    drawGridLineRects(ctx, width, height, gridSize, cellSize, viewScale, dpr);
    ctx.restore();
  }
}

function drawPixel(ctx, options) {
  if (!ctx) return;

  const {
    width,
    gridSize,
    row,
    col,
    color,
    showGrid = true,
    hasBackground = false,
    viewScale = 1,
    dpr = 1,
    colorCodeMap = null,
    getCellColor = null,
    boardInset = 0
  } = options;

  const cellSize = width / gridSize;
  const origin = Number(boardInset) || 0;
  const x = origin + col * cellSize;
  const y = origin + row * cellSize;

  ctx.clearRect(x, y, cellSize, cellSize);

  if (!hasBackground) {
    drawCheckerCell(ctx, x, y, cellSize);
  }

  const cellColor = getCellColor ? getCellColor(row, col) : color;

  if (cellColor !== null && cellColor !== undefined && (!hasBackground || cellColor !== '#FFFFFF')) {
    ctx.fillStyle = cellColor;
    ctx.fillRect(x, y, cellSize, cellSize);

    if (colorCodeMap) {
      const normalizedColor = String(cellColor).toUpperCase();
      const code = colorCodeMap[normalizedColor];
      const maxCodeLength = code ? String(code).length : 1;
      const codeCfg = getCellCodeConfig(cellSize, viewScale, maxCodeLength);
      const visualCell = cellSize * Math.max(Number(viewScale) || 1, 1);
      if (code && codeCfg.show) {
        drawCellCode(ctx, normalizedColor, code, x + cellSize / 2, y + cellSize / 2, codeCfg.fontSize, {
          skipStroke: visualCell < 45
        });
      }
    }
  }

  if (showGrid && (!hasBackground || cellColor !== '#FFFFFF')) {
    drawCellGridRects(ctx, x, y, cellSize, row, col, viewScale, dpr);
  }
}

module.exports = {
  drawBoard,
  drawPixel,
  drawGridLineRects,
  drawCodeLayer,
  drawCheckerboard,
  drawCheckerCell,
  drawCoordinateFrame
};
