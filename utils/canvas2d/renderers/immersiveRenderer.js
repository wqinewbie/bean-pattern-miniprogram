/**
 * 沉浸式拼豆渲染器 - Canvas 2D
 * 双层架构：基础层（格子 + 坐标轴）+ 文字层（色号）
 * 缩放/平移通过 Canvas 变换实现，不走 CSS transform
 */

/**
 * 绘制坐标轴框架
 */
function drawCoordinateFrame(ctx, options) {
  if (!ctx) return;
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const gridSize = Number(options.gridSize) || 0;
  const inset = Number(options.inset) || 0;
  if (!width || !height || !gridSize || !inset) return;

  const totalWidth = width + inset * 2;
  const totalHeight = height + inset * 2;
  const cellW = width / gridSize;
  const cellH = height / gridSize;
  const line = Math.max(0.5, Math.min(1, inset * 0.08));
  const dpr = Math.max(1, Number(options.dpr) || 1);

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

  const labelCellSize = Math.max(1, Math.min(inset, cellW, cellH));
  const visualCell = labelCellSize;
  const digitCount = String(gridSize).length;
  const maxByCell = visualCell * 0.44;
  const maxByLength = visualCell / Math.max(1.4, digitCount * 0.82);
  const visualFontSize = Math.max(5, Math.min(10, maxByCell, maxByLength));
  let fontSize = Math.max(1, Math.round(visualFontSize * 4) / 4);

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

  const halfInset = inset / 2;
  for (let i = 1; i <= gridSize; i++) {
    const label = String(i);
    const x = inset + (i - 0.5) * cellW;
    const y = inset + (i - 0.5) * cellH;
    const labelLeft = inset + (i - 1) * cellW;
    const labelTop = inset + (i - 1) * cellH;

    fillClippedText(ctx, label, x, halfInset, labelLeft, 0, cellW, inset);
    fillClippedText(ctx, label, x, inset + height + halfInset, labelLeft, inset + height, cellW, inset);
    fillClippedText(ctx, label, halfInset, y, 0, labelTop, inset, cellH);
    fillClippedText(ctx, label, inset + width + halfInset, y, inset + width, labelTop, inset, cellH);
  }

  ctx.restore();
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

/**
 * 计算格内文字配置（与画板 boardRenderer.getCellCodeConfig 一致，含 viewScale）
 */
function getCellCodeConfig(cellSize, viewScale, maxCodeLength) {
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

/**
 * 绘制基础层：坐标轴 + 格子色块（不含色号文字）
 * 调用方负责清空画布和设置变换矩阵
 */
function drawImmersiveBase(ctx, options) {
  if (!ctx) return;

  const {
    width, height, gridSize, gridData,
    highlightId = null, completedMap = {}, contrast = 50,
    boardInset = 0
  } = options;

  const cellSize = width / gridSize;
  const dimAlpha = Math.max(0.15, (100 - contrast) / 100 * 0.65);
  const hasFocus = !!highlightId;
  const originX = boardInset || 0;
  const originY = boardInset || 0;

  if (originX > 0 || originY > 0) {
    drawCoordinateFrame(ctx, { width, height, gridSize, inset: originX });
  }

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const cell = gridData[y] ? gridData[y][x] : null;
      if (!cell) continue;

      const { id, r, g, b } = cell;
      const focused = !hasFocus || id === highlightId;
      ctx.globalAlpha = focused ? 1 : dimAlpha;

      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px, py, cellSize, cellSize);
    }
  }

  ctx.globalAlpha = 1;
}

/**
 * 绘制文字层：色号标签（透明背景，叠在基础层之上）
 * 调用方负责清空画布和设置变换矩阵
 */
function drawImmersiveText(ctx, options) {
  if (!ctx) return;

  const {
    width, height, gridSize, gridData,
    highlightId = null, completedMap = {},
    mode = 'colorId', hRun = [], vRun = [],
    boardInset = 0,
    viewScale = 1
  } = options;

  const cellSize = width / gridSize;
  const hasFocus = !!highlightId;
  const originX = boardInset || 0;
  const originY = boardInset || 0;
  const safeScale = Math.max(0.1, Number(viewScale) || 1);

  const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  let maxCodeLength = 2;
  if (mode === 'colorId') {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cell = gridData[y] ? gridData[y][x] : null;
        if (cell && cell.id) {
          maxCodeLength = Math.max(maxCodeLength, String(cell.id).length);
        }
      }
    }
  }
  const codeCfg = getCellCodeConfig(cellSize, safeScale, maxCodeLength);
  if (!codeCfg.show) return;

  ctx.font = `600 ${codeCfg.fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const cell = gridData[y] ? gridData[y][x] : null;
      if (!cell) continue;

      const { id, r, g, b } = cell;
      const focused = !hasFocus || id === highlightId;
      const done = !!completedMap[id];
      if (done) continue;

      let text = '';
      if (focused && id) {
        if (id === highlightId) {
          if (mode === 'colorId') {
            text = String(id);
          } else if (mode === 'horizontal' && hRun[y] && hRun[y][x]) {
            text = String(hRun[y][x]);
          } else if (mode === 'vertical' && vRun[y] && vRun[y][x]) {
            text = String(vRun[y][x]);
          }
        } else if (!hasFocus && mode === 'colorId') {
          text = String(id);
        }
      }

      if (text) {
        const cx = originX + x * cellSize + cellSize / 2;
        const cy = originY + y * cellSize + cellSize / 2;
        ctx.fillStyle = getTextColor(r, g, b);
        ctx.fillText(text, cx, cy);
      }
    }
  }
}

/**
 * 绘制网格线层：格子边界线
 * 调用方负责清空画布和设置变换矩阵
 */
function drawImmersiveGridLines(ctx, options) {
  if (!ctx) return;

  const { width, height, gridSize, boardInset = 0, gridData } = options;
  const originX = boardInset || 0;
  const originY = boardInset || 0;
  const cellSize = width / gridSize;
  const lineWidth = Math.max(0.3, cellSize * 0.04);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#BDBDBD';

  for (let i = 0; i <= gridSize; i++) {
    const pos = originX + i * cellSize;
    ctx.fillRect(pos - lineWidth / 2, originY, lineWidth, height);
    ctx.fillRect(originX, pos - lineWidth / 2, width, lineWidth);
  }

  ctx.restore();
}

function getTextColor(r, g, b) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#222222' : '#FFFFFF';
}

module.exports = {
  drawImmersiveBase,
  drawImmersiveText,
  drawImmersiveGridLines,
  getTextColor
};
