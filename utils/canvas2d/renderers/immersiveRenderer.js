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
    dpr = 1
  } = options;

  const cellSize = width / gridSize;
  const dimAlpha = Math.max(0.15, (100 - contrast) / 100 * 0.65); // 数值越大，未选中背景越浅
  const hasFocus = !!highlightId;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 字体大小随格子缩放，小格子允许更细字号，避免文字被强行裁切后发糊。
  const baseFontSize = Math.max(3, Math.min(20, Math.floor(cellSize * 0.64)));
  const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

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

      // 设置透明度：完成格保持原色纯色，仅未选中的非目标色号降透明度
      if (done || focused) {
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = dimAlpha;
      }

      // 绘制方形像素块
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      // 绘制文字标签（只在横竖计数模式下显示）
      let text = '';
      if (!done && id && focused) {
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
        const isLight = getTextColor(r, g, b) === '#1f2937';
        // 文字宽度尽量利用格子空间，减少不必要的缩小。
        const maxTextWidth = Math.max(1, cellSize * 0.82);
        const minFontSize = Math.max(2.5, Math.min(5, cellSize * 0.58));
        let fontSize = baseFontSize;
        ctx.globalAlpha = 1;
        ctx.fillStyle = isLight ? '#1f2937' : '#ffffff';
        ctx.font = `700 ${fontSize}px ${fontFamily}`;
        while (fontSize > minFontSize && ctx.measureText(text).width > maxTextWidth) {
          fontSize = Math.max(minFontSize, fontSize - 0.5);
          ctx.font = `700 ${fontSize}px ${fontFamily}`;
        }
        ctx.font = `700 ${fontSize}px ${fontFamily}`;
        ctx.save();
        // clip 留出 margin 避免 stroke 溢出格子
        const clipMargin = Math.max(0.6 / dpr, cellSize * 0.025);
        ctx.beginPath();
        ctx.rect(
          x * cellSize + clipMargin,
          y * cellSize + clipMargin,
          cellSize - clipMargin * 2,
          cellSize - clipMargin * 2
        );
        ctx.clip();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        if (fontSize >= 4.5) {
          ctx.lineWidth = Math.max(0.35, Math.min(1.25, fontSize * 0.12));
          ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.82)' : 'rgba(17,24,39,0.62)';
          ctx.strokeText(text, cx, cy);
        }
        ctx.fillText(text, cx, cy);
        ctx.restore();
      }
    }
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
