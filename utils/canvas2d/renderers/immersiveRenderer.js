/**
 * 沉浸式拼豆渲染器 - Canvas 2D
 * 用于 focus-mode 页面的拼豆网格渲染
 * 方形像素块风格 + 色号标签 + 高亮效果
 */

/**
 * 绘制沉浸式拼豆网格
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
 * @param {Object} options - 绘制选项
 * @param {number} options.width - 画布宽度（逻辑像素）
 * @param {number} options.height - 画布高度（逻辑像素）
 * @param {number} options.gridSize - 网格尺寸（如 32x32）
 * @param {Array<Array<Object>>} options.gridData - 网格数据（二维数组，每个元素包含 {id, r, g, b}）
 * @param {string} options.highlightId - 高亮的色号 ID
 * @param {Object} options.completedMap - 已完成的色号映射 {id: true}
 * @param {number} options.contrast - 对比度（0-100）
 * @param {string} options.mode - 显示模式：'colorId' | 'horizontal' | 'vertical'
 * @param {Array<Array<number>>} options.hRun - 横向计数数组
 * @param {Array<Array<number>>} options.vRun - 竖向计数数组
 * @param {Object} options.recommendedCell - 推荐格子 {row, col}
 * @param {number} options.dpr - 设备像素比
 */
function drawImmersiveGrid(ctx, options) {
  if (!ctx) return;

  const {
    width,
    height,
    gridSize,
    gridData,
    highlightId = null,
    completedMap = {},
    contrast = 50,
    mode = 'colorId',
    hRun = [],
    vRun = [],
    recommendedCell = null,
    dpr = 1
  } = options;

  const cellSize = width / gridSize;
  const dimAlpha = Math.max(0.2, contrast / 100 * 0.5); // 降低未选中的透明度
  const hasFocus = !!highlightId;
  const isCountMode = mode === 'horizontal' || mode === 'vertical';

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 绘制背景
  // 字体大小
  const fontSize = Math.max(8, Math.min(28, Math.floor(cellSize * 0.64)));

  // 绘制拼豆
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const cell = gridData[y] ? gridData[y][x] : null;
      if (!cell) continue;

      const { id, r, g, b } = cell;
      const focused = !hasFocus || id === highlightId;
      const done = !!completedMap[id];
      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;

      // 设置透明度
      if (done) {
        ctx.globalAlpha = 1; // 已完成色号保持纯色显示
      } else if (focused) {
        ctx.globalAlpha = 1; // 高亮的完全不透明
      } else {
        ctx.globalAlpha = dimAlpha; // 未选中的很暗
      }

      // 绘制方形像素块
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      // 如果高亮且未完成，添加高亮边框
      if (hasFocus && focused && !done && !isCountMode) {
        const lineWidth = Math.max(1.5 / dpr, cellSize * 0.08);
        const inset = lineWidth / 2;

        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(
          x * cellSize + inset,
          y * cellSize + inset,
          cellSize - lineWidth,
          cellSize - lineWidth
        );

        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = (r + g + b) > 560 ? '#1f2937' : '#FFFFFF';
        ctx.lineWidth = Math.max(1 / dpr, lineWidth * 0.45);
        ctx.strokeRect(
          x * cellSize + lineWidth,
          y * cellSize + lineWidth,
          cellSize - lineWidth * 2,
          cellSize - lineWidth * 2
        );
      }

      // 绘制文字标签（只在横竖计数模式下显示）
      let text = '';
      if (!done && id && focused && mode !== 'colorId') {
        if (id === highlightId) {
          if (mode === 'horizontal' && hRun[y] && hRun[y][x]) {
            text = String(hRun[y][x]);
          } else if (mode === 'vertical' && vRun[y] && vRun[y][x]) {
            text = String(vRun[y][x]);
          }
        }
      }

      if (text) {
        const isLight = (r + g + b) > 560;
        ctx.globalAlpha = 1;
        ctx.fillStyle = isLight ? '#1f2937' : '#ffffff';
        ctx.font = `700 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(1, fontSize * 0.16);
        ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.75)' : 'rgba(31,41,55,0.65)';
        ctx.strokeText(text, cx, cy);
        ctx.fillText(text, cx, cy);
      }
    }
  }

  // 绘制推荐格子高亮（方形边框）
  if (recommendedCell && highlightId) {
    const rx = recommendedCell.col * cellSize;
    const ry = recommendedCell.row * cellSize;
    
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 2 / dpr;
    ctx.strokeRect(rx, ry, cellSize, cellSize);
    
    // 绘制脉冲动画效果
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 1 / dpr;
    ctx.strokeRect(rx - 2, ry - 2, cellSize + 4, cellSize + 4);
  }

  ctx.globalAlpha = 1;
}

/**
 * 计算文字颜色（深色或浅色）
 * @param {number} r - 红色值
 * @param {number} g - 绿色值
 * @param {number} b - 蓝色值
 * @returns {string} - '#1f2937' 或 '#ffffff'
 */
function getTextColor(r, g, b) {
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? '#1f2937' : '#ffffff';
}

module.exports = {
  drawImmersiveGrid,
  getTextColor
};
