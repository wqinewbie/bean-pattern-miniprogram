/**
 * 画板渲染器 - Canvas 2D
 * 用于空白画板和编辑模式的绘制
 */

function getLineMetrics(cellSize, viewScale, dpr) {
  const scale = Math.max(Number(viewScale) || 1, 1);
  const renderDpr = Math.max(Number(dpr) || 1, 1);
  const visualCellSize = cellSize * scale;

  const screenThin = Math.max(0.45, Math.min(1.1, visualCellSize * 0.018));
  const screenThick = Math.max(0.8, Math.min(1.9, visualCellSize * 0.032));

  const thin = Math.max(screenThin / scale, 1 / renderDpr);
  const thick = Math.max(screenThick / scale, 1 / renderDpr);

  return { thin, thick };
}

function alignToDevicePixel(value, dpr) {
  const renderDpr = Math.max(Number(dpr) || 1, 1);
  return Math.round(value * renderDpr) / renderDpr;
}

function drawGridLineRects(ctx, width, height, gridSize, cellSize, viewScale, dpr) {
  // 问题1修复：使用细细的实心黑色线条
  // 固定线宽：细线 0.5px，粗线 1px
  const thinLineWidth = 0.5;
  const thickLineWidth = 1;
  
  // 保存当前状态
  ctx.save();
  
  // 禁用抗锯齿，让线条更清晰
  ctx.imageSmoothingEnabled = false;
  
  // 绘制细线（每个格子）
  ctx.strokeStyle = '#000000';  // 实心黑色
  ctx.lineWidth = thinLineWidth;
  ctx.beginPath();
  for (let i = 0; i <= gridSize; i++) {
    const pos = i * cellSize;
    // 垂直线
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height);
    // 水平线
    ctx.moveTo(0, pos);
    ctx.lineTo(width, pos);
  }
  ctx.stroke();
  
  // 绘制粗线（每5个格子）
  ctx.strokeStyle = '#000000';  // 实心黑色
  ctx.lineWidth = thickLineWidth;
  ctx.beginPath();
  for (let i = 0; i <= gridSize; i += 5) {
    const pos = i * cellSize;
    // 垂直线
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, height);
    // 水平线
    ctx.moveTo(0, pos);
    ctx.lineTo(width, pos);
  }
  ctx.stroke();
  
  // 恢复状态
  ctx.restore();
  
  console.log('[网格绘制] 使用实心黑色线条:', { 
    thinLineWidth, 
    thickLineWidth, 
    gridSize, 
    cellSize 
  });
}

function drawCellGridRects(ctx, x, y, cellSize, row, col, viewScale, dpr) {
  // 问题1修复：单个格子的网格线也使用实心黑色
  const thinLineWidth = 0.5;
  const thickLineWidth = 1;
  
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  
  const left = x;
  const top = y;
  const right = x + cellSize;
  const bottom = y + cellSize;

  // 绘制细线边框
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = thinLineWidth;
  ctx.strokeRect(left, top, cellSize, cellSize);

  // 如果是5的倍数位置，绘制粗线
  const isMajorLeft = (col % 5 === 0);
  const isMajorRight = ((col + 1) % 5 === 0);
  const isMajorTop = (row % 5 === 0);
  const isMajorBottom = ((row + 1) % 5 === 0);

  if (isMajorLeft || isMajorRight || isMajorTop || isMajorBottom) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = thickLineWidth;
    ctx.beginPath();
    
    if (isMajorLeft) {
      ctx.moveTo(left, top);
      ctx.lineTo(left, bottom);
    }
    if (isMajorRight) {
      ctx.moveTo(right, top);
      ctx.lineTo(right, bottom);
    }
    if (isMajorTop) {
      ctx.moveTo(left, top);
      ctx.lineTo(right, top);
    }
    if (isMajorBottom) {
      ctx.moveTo(left, bottom);
      ctx.lineTo(right, bottom);
    }
    
    ctx.stroke();
  }
  
  ctx.restore();
}

function getCellCodeConfig(cellSize, viewScale) {
  const visualCell = cellSize * Math.max(Number(viewScale) || 1, 1);
  // 问题2临时修复：降低显示阈值，让色号更早显示，减少闪烁
  const show = visualCell >= 20;  // 从 25 降低到 20
  const maxFontSize = Math.min(cellSize * 0.45, 11);
  const fontSize = Math.max(4, Math.min(maxFontSize, visualCell * 0.16));
  return { show, fontSize };
}

function getCodeTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 7) return '#222222';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#222222' : '#FFFFFF';
}

function drawCellCode(ctx, color, code, cx, cy, fontSize) {
  if (!code) return;
  
  // 问题4修复：提高色码文字清晰度
  // 1. 使用更清晰的字体渲染设置
  ctx.imageSmoothingEnabled = false;
  ctx.imageSmoothingQuality = 'high';
  
  // 2. 使用更粗的字重和更清晰的字体
  ctx.fillStyle = getCodeTextColor(color);
  ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // 3. 添加文字描边增强对比度
  const textColor = getCodeTextColor(color);
  if (textColor === '#FFFFFF') {
    // 白色文字添加黑色描边
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = Math.max(0.5, fontSize * 0.08);
    ctx.strokeText(code, cx, cy);
  } else {
    // 黑色文字添加白色描边
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = Math.max(0.5, fontSize * 0.08);
    ctx.strokeText(code, cx, cy);
  }
  
  // 4. 绘制填充文字
  ctx.fillText(code, cx, cy);
}

/**
 * 绘制完整画板（完美版：支持可视区域裁剪）
 */
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
    visibleRange = null // 完美版：可视区域裁剪
  } = options;

  const cellSize = width / gridSize;
  const codeCfg = getCellCodeConfig(cellSize, viewScale);

  ctx.clearRect(0, 0, width, height);

  if (!hasBackground) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }

  // 完美版：计算绘制范围
  let startRow = 0;
  let endRow = gridSize;
  let startCol = 0;
  let endCol = gridSize;

  if (visibleRange && !visibleRange.isFullView) {
    startRow = visibleRange.minRow;
    endRow = visibleRange.maxRow + 1;
    startCol = visibleRange.minCol;
    endCol = visibleRange.maxCol + 1;
    
    console.log('[boardRenderer] 可视区域裁剪:', {
      total: gridSize * gridSize,
      visible: (endRow - startRow) * (endCol - startCol),
      ratio: ((endRow - startRow) * (endCol - startCol) / (gridSize * gridSize) * 100).toFixed(1) + '%'
    });
  }

  // 完美版：只绘制可见格子
  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const color = gridData[y] ? gridData[y][x] : null;
      if (color === null || color === undefined) continue;

      ctx.fillStyle = color;
      const px = x * cellSize;
      const py = y * cellSize;
      ctx.fillRect(px, py, cellSize, cellSize);

      if (codeCfg.show && colorCodeMap && color !== '#FFFFFF') {
        const code = colorCodeMap[String(color).toUpperCase()];
        if (code) {
          drawCellCode(ctx, color, code, px + cellSize / 2, py + cellSize / 2, codeCfg.fontSize);
        }
      }
    }
  }

  if (showGrid && cellSize >= 2) {
    drawGridLineRects(ctx, width, height, gridSize, cellSize, viewScale, dpr);
  }
}

/**
 * 增量绘制单个像素
 */
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
    colorCodeMap = null
  } = options;

  const cellSize = width / gridSize;
  const codeCfg = getCellCodeConfig(cellSize, viewScale);
  const x = col * cellSize;
  const y = row * cellSize;

  ctx.clearRect(x, y, cellSize, cellSize);

  if (!hasBackground) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, cellSize, cellSize);
  }

  if (color !== null && color !== undefined) {
    if (!hasBackground || color !== '#FFFFFF') {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellSize, cellSize);

      if (codeCfg.show && colorCodeMap && color !== '#FFFFFF') {
        const code = colorCodeMap[String(color).toUpperCase()];
        drawCellCode(ctx, color, code, x + cellSize / 2, y + cellSize / 2, codeCfg.fontSize);
      }
    }
  }

  if (showGrid && cellSize >= 2 && (!hasBackground || color !== '#FFFFFF')) {
    drawCellGridRects(ctx, x, y, cellSize, row, col, viewScale, dpr);
  }
}

module.exports = {
  drawBoard,
  drawPixel
};
