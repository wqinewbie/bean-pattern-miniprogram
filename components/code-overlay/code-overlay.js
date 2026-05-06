/**
 * 色号覆盖层组件
 * 使用独立的高分辨率 Canvas 绘制色号文字
 * 确保色号在任何缩放比例下都保持清晰
 */
Component({
  properties: {
    width: { type: Number, value: 320 },
    height: { type: Number, value: 320 },
    gridSize: { type: Number, value: 52 },
    scale: { type: Number, value: 1 },
    gridData: { type: Array, value: [] },
    colorCodeMap: { type: Object, value: {} },
    show: { type: Boolean, value: true },
    // 完美版：可视区域裁剪参数
    canvasOffsetX: { type: Number, value: 0 },
    canvasOffsetY: { type: Number, value: 0 },
    areaWidth: { type: Number, value: 0 },
    areaHeight: { type: Number, value: 0 }
  },

  data: {
    canvasId: 'code-overlay-' + Date.now(),
    _visible: 'visible'
  },

  lifetimes: {
    attached() {
      console.log('[CodeOverlay] 组件加载');
    },
    ready() {
      setTimeout(() => this.initCanvas(), 100);
    },
    detached() {
      this.canvas = null;
      this.ctx = null;
    }
  },

  observers: {
    'width, height, gridSize': function(width, height, gridSize) {
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) this.drawCodes();
    },
    'gridData': function(gridData) {
      if (this.ctx && gridData && gridData.length > 0) this.drawCodes();
    },
    'colorCodeMap': function(colorCodeMap) {
      if (this.ctx && colorCodeMap) this.drawCodes();
    },
    'scale': function(scale) {
      console.log('[CodeOverlay] 缩放变化:', scale);
      // 立即重绘，不等待 touchEnd
      if (this.ctx) {
        this.drawCodes();
      }
    },
    'show': function(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
    }
  },

  methods: {
    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#codeCanvas').node().exec((res) => {
        if (!res || !res[0]) return;
        this.canvas = res[0].node;
        this.ctx = this.canvas.getContext('2d');
        this.dpr = wx.getSystemInfoSync().pixelRatio || 2;
        console.log('[CodeOverlay] Canvas 初始化成功');
        this.drawCodes();
      });
    },

    drawCodes() {
      if (!this.ctx || !this.canvas) return;

      const { width, height, gridSize, gridData, colorCodeMap, scale, canvasOffsetX, canvasOffsetY, areaWidth, areaHeight } = this.data;
      
      if (!gridData || gridData.length === 0 || !colorCodeMap || Object.keys(colorCodeMap).length === 0) {
        return;
      }

      const ctx = this.ctx;
      const canvas = this.canvas;
      
      // 完美版：色号层 DPR 策略（文字需要更高清晰度）
      const currentScale = scale || 1;
      const systemDpr = this.dpr || 2;
      const qualityFactor = 2.0; // 文字层需要最高清晰度
      const targetDpr = systemDpr * qualityFactor * Math.max(1, Math.min(currentScale, 1.5));
      
      // 限制 Canvas 最大物理尺寸为 4096px
      const maxPhysicalSize = 4096;
      const maxDprByWidth = maxPhysicalSize / width;
      const maxDprByHeight = maxPhysicalSize / height;
      const dpr = Math.max(1, Math.min(targetDpr, maxDprByWidth, maxDprByHeight, 8));

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      
      // 完美版：文字渲染必须开启高质量抗锯齿
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const cellSize = width / gridSize;
      const visualCell = cellSize * currentScale;

      // 完美版：色号显示阈值优化（提高到25px，约2倍缩放才显示）
      if (visualCell < 25) {
        return; // 太小不显示
      }

      // 完美版：字体大小分级策略（再减少80%，极致精简）
      let fontSize;
      if (visualCell < 35) {
        fontSize = Math.max(3, cellSize * 0.0175); // 1.75%
      } else if (visualCell < 60) {
        fontSize = Math.max(4, cellSize * 0.02); // 2%
      } else {
        fontSize = Math.max(5, Math.min(cellSize * 0.0225, 8)); // 2.25%，最大8px
      }

      // 完美版：计算可视区域（只绘制可见的色号）
      let startRow = 0;
      let endRow = gridSize;
      let startCol = 0;
      let endCol = gridSize;

      if (areaWidth > 0 && areaHeight > 0) {
        const scaledCellSize = cellSize * currentScale;
        const visibleLeft = Math.max(0, -canvasOffsetX);
        const visibleTop = Math.max(0, -canvasOffsetY);
        const visibleRight = Math.min(width * currentScale, areaWidth - canvasOffsetX);
        const visibleBottom = Math.min(height * currentScale, areaHeight - canvasOffsetY);

        startCol = Math.max(0, Math.floor(visibleLeft / scaledCellSize) - 1);
        startRow = Math.max(0, Math.floor(visibleTop / scaledCellSize) - 1);
        endCol = Math.min(gridSize, Math.ceil(visibleRight / scaledCellSize) + 1);
        endRow = Math.min(gridSize, Math.ceil(visibleBottom / scaledCellSize) + 1);
      }

      let drawnCount = 0;
      let totalCount = 0;

      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          const rawColor = gridData[y] ? gridData[y][x] : null;
          if (!rawColor) continue;

          const color = String(rawColor).trim().toUpperCase();
          if (color === '#FFFFFF') continue;

          totalCount++;

          const code = colorCodeMap[color] || colorCodeMap[String(rawColor).trim()] || '';
          if (!code) continue;

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          this._drawCode(ctx, color, code, px, py, fontSize, dpr);
          drawnCount++;
        }
      }

      console.log('[CodeOverlay] 完美渲染:', { 
        scale: currentScale.toFixed(2),
        dpr: dpr.toFixed(2),
        fontSize: fontSize.toFixed(1),
        drawn: drawnCount,
        total: totalCount,
        culling: startRow > 0 || endRow < gridSize || startCol > 0 || endCol < gridSize,
        ratio: totalCount > 0 ? (drawnCount / totalCount * 100).toFixed(1) + '%' : '100%'
      });
    },

    _drawCode(ctx, color, code, cx, cy, fontSize, dpr) {
      if (!code) return;

      const textColor = this._getCodeTextColor(color);

      // 完美版：使用最清晰的字体渲染设置
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 完美版：亚像素对齐（关键！）
      const alignedX = Math.round(cx * dpr) / dpr;
      const alignedY = Math.round(cy * dpr) / dpr;

      // 完美版：添加文字描边增强对比度
      if (textColor === '#FFFFFF') {
        // 白色文字添加黑色描边
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = Math.max(0.8, fontSize * 0.12);
        ctx.strokeText(code, alignedX, alignedY);
      } else {
        // 黑色文字添加白色描边
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = Math.max(0.8, fontSize * 0.12);
        ctx.strokeText(code, alignedX, alignedY);
      }

      // 绘制填充文字
      ctx.fillStyle = textColor;
      ctx.fillText(code, alignedX, alignedY);
    },

    _getCodeTextColor(hexColor) {
      if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 7) {
        return '#222222';
      }

      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      return luminance > 0.62 ? '#222222' : '#FFFFFF';
    },

    redraw() {
      this.drawCodes();
    }
  }
});
