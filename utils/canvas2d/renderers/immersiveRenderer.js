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
  const beadRadius = Math.max(1.2, cellSize * 0.42);
  const dimAlpha = Math.max(0.2, contrast / 100 * 0.5); // 降低未选中的透明度
  const hasFocus = !!highlightId;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 绘制背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 字体大小
  const fontSize = Math.max(5, Math.min(10, Math.floor(cellSize * 0.58)));

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
        ctx.globalAlpha = 0.2; // 已完成的更暗
      } else if (focused) {
        ctx.globalAlpha = 1; // 高亮的完全不透明
      } else {
        ctx.globalAlpha = dimAlpha; // 未选中的很暗
      }

      // 绘制方形像素块
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      // 如果高亮且未完成，添加高亮边框
      if (focused && !done) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1 / dpr;
        ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }

      // 如果已完成且高亮，绘制绿色完成标记（小方块）
      if (done && focused) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#22c55e';
        const markSize = Math.max(2, cellSize * 0.3);
        const markX = cx - markSize / 2;
        const markY = cy - markSize / 2;
        ctx.fillRect(markX, markY, markSize, markSize);
      }

      // 绘制文字标签（只在横竖计数模式下显示）
      let text = '';
      if (id && focused && mode !== 'colorId') {
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
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
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
