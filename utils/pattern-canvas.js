/**
 * 色号图高清渲染工具
 * 绘制带坐标轴标签和底部色号汇总块的图纸，供 result / preview 共享
 */

function adaptCtx(ctx) {
  if (!ctx) return ctx;
  if (typeof ctx.setFillStyle === 'function' && typeof ctx.fillRect === 'function') {
    return ctx;
  }

  const bound = {
    fillRect: typeof ctx.fillRect === 'function' ? ctx.fillRect.bind(ctx) : null,
    strokeRect: typeof ctx.strokeRect === 'function' ? ctx.strokeRect.bind(ctx) : null,
    fillText: typeof ctx.fillText === 'function' ? ctx.fillText.bind(ctx) : null,
    beginPath: typeof ctx.beginPath === 'function' ? ctx.beginPath.bind(ctx) : null,
    closePath: typeof ctx.closePath === 'function' ? ctx.closePath.bind(ctx) : null,
    arc: typeof ctx.arc === 'function' ? ctx.arc.bind(ctx) : null,
    fill: typeof ctx.fill === 'function' ? ctx.fill.bind(ctx) : null,
    stroke: typeof ctx.stroke === 'function' ? ctx.stroke.bind(ctx) : null,
    measureText: typeof ctx.measureText === 'function' ? ctx.measureText.bind(ctx) : (() => ({ width: 0 })),
    save: typeof ctx.save === 'function' ? ctx.save.bind(ctx) : (() => {}),
    restore: typeof ctx.restore === 'function' ? ctx.restore.bind(ctx) : (() => {}),
    translate: typeof ctx.translate === 'function' ? ctx.translate.bind(ctx) : (() => {}),
    rotate: typeof ctx.rotate === 'function' ? ctx.rotate.bind(ctx) : (() => {})
  };

  return {
    ...bound,
    setFillStyle(v) { if (typeof ctx.setFillStyle === 'function') ctx.setFillStyle(v); else ctx.fillStyle = v; },
    setStrokeStyle(v) { if (typeof ctx.setStrokeStyle === 'function') ctx.setStrokeStyle(v); else ctx.strokeStyle = v; },
    setLineWidth(v) { if (typeof ctx.setLineWidth === 'function') ctx.setLineWidth(v); else ctx.lineWidth = v; },
    setFontSize(v) { if (typeof ctx.setFontSize === 'function') ctx.setFontSize(v); else ctx.font = `${v}px sans-serif`; },
    setTextAlign(v) { if (typeof ctx.setTextAlign === 'function') ctx.setTextAlign(v); else ctx.textAlign = v; },
    setTextBaseline(v) { if (typeof ctx.setTextBaseline === 'function') ctx.setTextBaseline(v); else ctx.textBaseline = v; }
  };
}

/**
 * 在给定的 canvas context 上绘制色号图
 * @param {Object} ctx - canvas.getContext('2d') 返回的 context
 * @param {Array}  gridData - 二维索引数组（每格存 colorPalette 下标，-1 为透明）
 * @param {Array}  colorPalette - 颜色列表，每项 { id, name, r, g, b, count }
 * @param {number} gridSize - 网格边长（格数）
 * @param {number} boardSize - 目标渲染尺寸（像素）
 * @param {Object} options - 可选配置
 *   @param {number} options.maxCanvasSize - 最大画布尺寸
 *   @param {string} options.appName - 小程序名称（显示在顶部）
 *   @param {Object} options.watermark - 水印配置 { enabled, text, fontSize, color, position }
 * @returns {{ totalWidth, totalHeight, axisPad, startX, startY, cellSize,
 *             effectiveOuterSize, effectiveGridWidth, effectiveGridHeight, offsetX, offsetY,
 *             summaryLen, summaryHeight, boardWrapWidth, boardWrapHeight, headerHeight }}
 */
function drawPatternWithAxes(ctx, gridData, colorPalette, gridSize, boardSize, options = {}) {
  ctx = adaptCtx(ctx);

  // 提取配置
  const appName = options.appName || '拼豆魔法屋';
  const watermark = options.watermark || null;

  // 从 gridData 推导实际网格行列数（兼容非方形网格）
  const gridRows = (gridData && gridData.length) || gridSize || 0;
  const gridCols = (gridRows > 0 && gridData[0] && gridData[0].length) ? gridData[0].length : gridRows;

  console.log('[pattern-canvas] 开始绘制', {
    gridDataLength: gridData ? gridData.length : 0,
    colorPaletteLength: colorPalette ? colorPalette.length : 0,
    gridRows: gridRows,
    gridCols: gridCols,
    boardSize: boardSize
  });

  // 统计各色用量（优先从 gridData 计算，避免后端 count 缺失）
  const countById = new Map();
  const paletteByIndex = colorPalette || [];
  const paletteById = new Map();
  paletteByIndex.forEach((color) => {
    if (!color) return;
    if (color.id != null) paletteById.set(String(color.id), color);
    if (color.name != null) paletteById.set(String(color.name), color);
  });
  const resolveColor = (value) => {
    if (typeof value === 'number') return paletteByIndex[value];
    if (value && typeof value === 'object') {
      if (value.id != null && paletteById.has(String(value.id))) return paletteById.get(String(value.id));
      return value;
    }
    const key = String(value == null ? '' : value);
    if (paletteById.has(key)) return paletteById.get(key);
    if (/^\d+$/.test(key)) return paletteByIndex[Number(key)];
    return null;
  };
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const colorValue = gridData[y] ? gridData[y][x] : null;
      const color = resolveColor(colorValue);
      if (!color) continue;
      const id = String(color.id || color.name || '').trim();
      if (!id) continue;
      countById.set(id, (countById.get(id) || 0) + 1);
    }
  }

  let summaryItems = Array.from(countById.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  if (!summaryItems.length && Array.isArray(colorPalette) && colorPalette.length) {
    summaryItems = colorPalette
      .filter((c) => c && (c.id || c.name) && Number(c.count) > 0)
      .map((c) => ({ id: String(c.id || c.name).trim(), count: Number(c.count) }))
      .sort((a, b) => b.count - a.count);
  }

  console.log('[pattern-canvas] 色号汇总统计', {
    countByIdSize: countById.size,
    summaryItemsLength: summaryItems.length,
    summaryItemsSample: summaryItems.slice(0, 5)
  });

  const maxCanvasSize = Math.max(512, Number(options.maxCanvasSize) || 2048);
  var workingBoardSize = boardSize;
  var axisPad = 0;
  var boardWrapWidth = 0;
  var boardWrapHeight = 0;
  var summaryHeight = 0;
  var headerHeight = 0;
  var totalWidth = 0;
  var totalHeight = 0;

  // 计算顶部标题区域高度（紧凑型）
  if (appName) {
    headerHeight = Math.max(40, Math.floor(boardSize * 0.025));
  }

  // 迭代缩小直到总尺寸不超 maxCanvasSize
  var totalGridDim = Math.max(gridRows, gridCols) + 2;
  for (var i = 0; i < 30; i++) {
    axisPad = 0;
    var approxCellSize = Math.floor(workingBoardSize / totalGridDim);
    var effOuterSize = Math.max(20, Math.floor(approxCellSize * 0.6));
    var effGridWidth = gridCols * approxCellSize;
    var effGridHeight = gridRows * approxCellSize;
    var totalGridWidth = effGridWidth + effOuterSize * 2;
    var totalGridHeight = effGridHeight + effOuterSize * 2;
    boardWrapWidth = Math.max(workingBoardSize, totalGridWidth);
    boardWrapHeight = totalGridHeight;

    if (summaryItems.length) {
      var summaryBlockSize = Math.max(40, Math.floor(approxCellSize * 1.2));
      var summaryBlockSpacing = Math.floor(summaryBlockSize * 0.1);
      var summaryAvailWidth = totalGridWidth;
      var summaryBlocksPerRow = Math.max(1, Math.floor(summaryAvailWidth / (summaryBlockSize + summaryBlockSpacing)));
      var maxSummaryRows = 3;
      var summaryRowsNeeded = Math.ceil(summaryItems.length / summaryBlocksPerRow);
      if (summaryRowsNeeded > maxSummaryRows) {
        var targetBlocksPerRow = Math.ceil(summaryItems.length / maxSummaryRows);
        var maxBlockSz = Math.floor(summaryAvailWidth / targetBlocksPerRow - summaryBlockSpacing);
        if (maxBlockSz >= 40) summaryBlockSize = maxBlockSz;
        summaryRowsNeeded = maxSummaryRows;
      }
      summaryHeight = summaryRowsNeeded * (summaryBlockSize + summaryBlockSpacing);
    } else {
      summaryHeight = 0;
    }

    var vertPad = Math.max(12, Math.floor(boardWrapHeight * 0.02));
    totalWidth = boardWrapWidth;
    totalHeight = vertPad + headerHeight + boardWrapHeight + summaryHeight + vertPad;
    if (totalWidth <= maxCanvasSize && totalHeight <= maxCanvasSize) break;
    workingBoardSize = Math.max(540, Math.floor(workingBoardSize * 0.92));
    if (appName) {
      headerHeight = Math.max(40, Math.floor(workingBoardSize * 0.025));
    }
  }

  // 整数格子大小，避免像素偏移
  var effectiveCellSize = Math.floor(workingBoardSize / totalGridDim);
  var effectiveOuterSize = Math.max(20, Math.floor(effectiveCellSize * 0.6));
  var effectiveGridWidth = gridCols * effectiveCellSize;
  var effectiveGridHeight = gridRows * effectiveCellSize;
  var totalGridWidth = effectiveGridWidth + effectiveOuterSize * 2;
  var totalGridHeight = effectiveGridHeight + effectiveOuterSize * 2;
  boardWrapWidth = Math.max(workingBoardSize, totalGridWidth);
  boardWrapHeight = totalGridHeight;

  if (totalGridWidth > boardWrapWidth || totalGridHeight > boardWrapHeight) {
    effectiveCellSize = Math.max(1, Math.floor(workingBoardSize / totalGridDim));
    effectiveOuterSize = Math.max(20, Math.floor(effectiveCellSize * 0.6));
    effectiveGridWidth = gridCols * effectiveCellSize;
    effectiveGridHeight = gridRows * effectiveCellSize;
    totalGridWidth = effectiveGridWidth + effectiveOuterSize * 2;
    totalGridHeight = effectiveGridHeight + effectiveOuterSize * 2;
    boardWrapWidth = Math.max(workingBoardSize, totalGridWidth);
    boardWrapHeight = totalGridHeight;
  }

  var gridOffsetX = Math.floor((boardWrapWidth - totalGridWidth) / 2);
  var vertPad = Math.max(12, Math.floor(boardWrapHeight * 0.02));
  var offsetX = gridOffsetX;
  var offsetY = vertPad + headerHeight;
  var startX = offsetX + effectiveOuterSize;
  var startY = offsetY + effectiveOuterSize;

  totalWidth = boardWrapWidth;
  totalHeight = vertPad + headerHeight + boardWrapHeight + summaryHeight + vertPad;

  // 白底
  ctx.setFillStyle('#ffffff');
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 0. 绘制顶部小程序名称（左对齐，贴着坐标轴）
  if (appName && headerHeight > 0) {
    ctx.setFillStyle('#5D4037');
    const titleFontSize = Math.max(20, Math.floor(headerHeight * 0.5));
    ctx.setFontSize(titleFontSize);
    ctx.setTextAlign('left');
    ctx.setTextBaseline('middle');
    const titleX = offsetX; // 左对齐，与网格区左边缘对齐
    const titleY = headerHeight / 2;
    ctx.fillText(appName, titleX, titleY);
    // 模拟加粗
    ctx.fillText(appName, titleX + 0.5, titleY + 0.5);
  }

  // 1. 外围坐标轴背景（浅蓝）
  ctx.setFillStyle('#E3F2FD');
  for (let x = 0; x < gridCols; x++) {
    ctx.fillRect(startX + x * effectiveCellSize, offsetY, effectiveCellSize, effectiveOuterSize);
    ctx.fillRect(startX + x * effectiveCellSize, offsetY + effectiveGridHeight + effectiveOuterSize, effectiveCellSize, effectiveOuterSize);
  }
  for (let y = 0; y < gridRows; y++) {
    ctx.fillRect(offsetX, startY + y * effectiveCellSize, effectiveOuterSize, effectiveCellSize);
    ctx.fillRect(offsetX + effectiveGridWidth + effectiveOuterSize, startY + y * effectiveCellSize, effectiveOuterSize, effectiveCellSize);
  }

  // 2. 主网格（填色 + 网格线）
  ctx.setStrokeStyle('#999999');
  ctx.setLineWidth(0.7);
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const colorValue = gridData[y] ? gridData[y][x] : null;
      const color = resolveColor(colorValue);
      ctx.setFillStyle(color ? `rgb(${color.r},${color.g},${color.b})` : '#ffffff');
      const cellX = startX + x * effectiveCellSize;
      const cellY = startY + y * effectiveCellSize;
      ctx.fillRect(cellX, cellY, effectiveCellSize, effectiveCellSize);
      ctx.strokeRect(cellX, cellY, effectiveCellSize, effectiveCellSize);
    }
  }

  // 3. 主网格色号文字（模拟加粗）
  ctx.setTextAlign('center');
  ctx.setTextBaseline('middle');
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const colorValue = gridData[y] ? gridData[y][x] : null;
      const color = resolveColor(colorValue);
      if (!color) continue;

      const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
      const textColor = lum > 140 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)';
      const text = String(color.id || color.name || '').trim();

      let fontSize = Math.max(4, Math.floor(effectiveCellSize * 0.45));
      ctx.setFontSize(fontSize);
      let textWidth = ctx.measureText(text).width || fontSize * text.length * 0.6;
      while (textWidth > effectiveCellSize * 0.85 && fontSize > 4) {
        fontSize--;
        ctx.setFontSize(fontSize);
        textWidth = ctx.measureText(text).width || fontSize * text.length * 0.6;
      }

      ctx.setFontSize(fontSize);
      ctx.setFillStyle(textColor);
      const centerX = startX + x * effectiveCellSize + effectiveCellSize / 2;
      const centerY = startY + y * effectiveCellSize + effectiveCellSize / 2;
      ctx.fillText(text, centerX, centerY);
      ctx.fillText(text, centerX + 0.3, centerY + 0.3); // 模拟加粗
    }
  }

  // 4. 坐标轴数字
  const axisFont = Math.max(8, Math.floor(effectiveCellSize * 0.36));
  ctx.setFontSize(axisFont);
  ctx.setFillStyle('#5D4037');
  for (let x = 0; x < gridCols; x++) {
    const label = String(x + 1);
    const centerX = startX + x * effectiveCellSize + effectiveCellSize / 2;
    ctx.fillText(label, centerX, offsetY + effectiveOuterSize / 2);
    ctx.fillText(label, centerX, offsetY + effectiveGridHeight + effectiveOuterSize + effectiveOuterSize / 2);
  }
  for (let y = 0; y < gridRows; y++) {
    const label = String(y + 1);
    const centerY = startY + y * effectiveCellSize + effectiveCellSize / 2;
    ctx.fillText(label, offsetX + effectiveOuterSize / 2, centerY);
    ctx.fillText(label, offsetX + effectiveGridWidth + effectiveOuterSize + effectiveOuterSize / 2, centerY);
  }

  // 5. 底部色号汇总块
  if (summaryItems.length) {
    const axisBottomY = offsetY + effectiveGridHeight + effectiveOuterSize * 2;
    const summaryTop = axisBottomY + Math.floor(effectiveOuterSize * 0.5);

    let blockSize = Math.floor(effectiveCellSize * 1.2);
    const minBlockSize = 40;
    if (blockSize < minBlockSize) blockSize = minBlockSize;
    const blockSpacing = Math.floor(blockSize * 0.1);
    const borderRadius = Math.floor(blockSize * 0.1);
    const availableWidth = totalGridWidth;
    let blocksPerRow = Math.max(1, Math.floor(availableWidth / (blockSize + blockSpacing)));
    const maxRows = 3;
    if (summaryItems.length > blocksPerRow * maxRows) {
      const targetBlocksPerRow = Math.ceil(summaryItems.length / maxRows);
      const maxBlockSize = Math.floor(availableWidth / targetBlocksPerRow - blockSpacing);
      if (maxBlockSize >= minBlockSize) blockSize = maxBlockSize;
      blocksPerRow = targetBlocksPerRow;
    }
    const totalBlocksWidth = blocksPerRow * blockSize + (blocksPerRow - 1) * blockSpacing;
    const blocksStartX = offsetX + Math.floor((availableWidth - totalBlocksWidth) / 2);

    ctx.setTextAlign('center');
    ctx.setTextBaseline('middle');

    summaryItems.forEach((item, idx) => {
      const row = Math.floor(idx / blocksPerRow);
      const col = idx % blocksPerRow;
      const bx = blocksStartX + col * (blockSize + blockSpacing);
      const by = summaryTop + row * (blockSize + blockSpacing);
      const r = borderRadius;
      const w = blockSize;
      const h = blockSize;

      const color = paletteByIndex.find((c) => c.id === item.id) || paletteByIndex.find((c) => c.name === item.id);
      if (color) {
        ctx.setFillStyle(`rgb(${color.r},${color.g},${color.b})`);
        ctx.beginPath();
        ctx.arc(bx + r, by + r, r, Math.PI, Math.PI * 1.5);
        ctx.arc(bx + w - r, by + r, r, Math.PI * 1.5, Math.PI * 2);
        ctx.arc(bx + w - r, by + h - r, r, 0, Math.PI * 0.5);
        ctx.arc(bx + r, by + h - r, r, Math.PI * 0.5, Math.PI);
        ctx.closePath();
        ctx.fill();

        const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
        ctx.setFillStyle(lum > 140 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)');
        const fontSize = Math.max(10, Math.floor(blockSize * 0.25));
        ctx.setFontSize(fontSize);
        const lineHeight = blockSize / 3;
        ctx.fillText(item.id, bx + blockSize / 2, by + lineHeight);
        ctx.fillText(item.id, bx + blockSize / 2 + 0.5, by + lineHeight + 0.5);
        ctx.fillText(`×${item.count}`, bx + blockSize / 2, by + lineHeight * 2);
        ctx.fillText(`×${item.count}`, bx + blockSize / 2 + 0.5, by + lineHeight * 2 + 0.5);
      } else {
        ctx.setFillStyle('#E0E0E0');
        ctx.beginPath();
        ctx.arc(bx + r, by + r, r, Math.PI, Math.PI * 1.5);
        ctx.arc(bx + w - r, by + r, r, Math.PI * 1.5, Math.PI * 2);
        ctx.arc(bx + w - r, by + h - r, r, 0, Math.PI * 0.5);
        ctx.arc(bx + r, by + h - r, r, Math.PI * 0.5, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.setFillStyle('#5D4037');
        ctx.setFontSize(Math.max(10, Math.floor(blockSize * 0.2)));
        ctx.fillText(`${item.id}×${item.count}`, bx + blockSize / 2, by + blockSize / 2);
      }
    });
  }

  // 6. 绘制全屏斜向平铺水印（防盗水印）
  if (watermark && watermark.enabled) {
    console.log('[pattern-canvas] 开始绘制水印', {
      text: watermark.text,
      fontSize: watermark.fontSize,
      color: watermark.color,
      angle: watermark.angle,
      totalWidth,
      totalHeight
    });

    const watermarkText = watermark.text || '拼豆魔法屋出品';
    const watermarkFontSize = watermark.fontSize || Math.max(24, Math.floor(totalWidth * 0.018));
    const watermarkColor = watermark.color || 'rgba(100,100,100,0.25)';
    const watermarkAngle = watermark.angle !== undefined ? watermark.angle : -30; // 倾斜角度
    const watermarkSpacingX = Math.max(180, Math.floor(totalWidth * (watermark.spacingXRatio || 0.22)));
    const watermarkSpacingY = Math.max(120, Math.floor(totalHeight * (watermark.spacingYRatio || 0.18)));

    console.log('[pattern-canvas] 水印参数', {
      watermarkText,
      watermarkFontSize,
      watermarkColor,
      watermarkAngle,
      watermarkSpacingX,
      watermarkSpacingY
    });

    ctx.setFontSize(watermarkFontSize);
    ctx.setFillStyle(watermarkColor);
    ctx.setTextAlign('center');
    ctx.setTextBaseline('middle');

    // 计算旋转后需要覆盖的范围
    const angleRad = (watermarkAngle * Math.PI) / 180;
    
    console.log('[pattern-canvas] 开始平铺水印', {
      angleRad,
      yRange: `0 to ${totalHeight}`,
      xRange: `0 to ${totalWidth}`
    });

    let watermarkCount = 0;
    // 平铺水印（简化版，只绘制可见区域）
    for (let y = -watermarkSpacingY; y < totalHeight + watermarkSpacingY; y += watermarkSpacingY) {
      for (let x = -watermarkSpacingX; x < totalWidth + watermarkSpacingX; x += watermarkSpacingX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angleRad);
        ctx.fillText(watermarkText, 0, 0);
        ctx.restore();
        watermarkCount++;
      }
    }
    
    console.log('[pattern-canvas] 水印绘制完成', { watermarkCount });
  } else {
    console.log('[pattern-canvas] 水印未启用', {
      hasWatermark: !!watermark,
      enabled: watermark ? watermark.enabled : null
    });
  }

  return {
    totalWidth,
    totalHeight,
    axisPad,
    startX,
    startY,
    cellSize: effectiveCellSize,
    effectiveOuterSize,
    effectiveGridWidth,
    effectiveGridHeight,
    offsetX,
    offsetY,
    summaryLen: summaryItems.length,
    summaryHeight,
    boardWrapWidth,
    boardWrapHeight,
    headerHeight,
  };
}

module.exports = { drawPatternWithAxes };
