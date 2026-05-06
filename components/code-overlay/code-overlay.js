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
    show: { type: Boolean, value: true }
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

      const { width, height, gridSize, gridData, colorCodeMap, scale } = this.data;
      
      if (!gridData || gridData.length === 0 || !colorCodeMap || Object.keys(colorCodeMap).length === 0) {
        return;
      }

      const ctx = this.ctx;
      const canvas = this.canvas;
      
      // 适中 DPR 平衡清晰度和性能，避免 Canvas 超限
      const currentScale = scale || 1;
      const systemDpr = this.dpr || 2;
      const targetDpr = systemDpr * 1.5 * Math.max(1, currentScale);
      
      // 限制 Canvas 最大物理尺寸为 3072px（保守限制）
      const maxPhysicalSize = 3072;
      const maxDprByWidth = maxPhysicalSize / width;
      const maxDprByHeight = maxPhysicalSize / height;
      const dpr = Math.min(targetDpr, maxDprByWidth, maxDprByHeight, 12);

      console.log('[CodeOverlay] 绘制色号，DPR:', dpr, '缩放:', currentScale, '物理尺寸:', Math.floor(width * dpr));

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      
      // 文字渲染必须开启抗锯齿
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const cellSize = width / gridSize;
      const visualCell = cellSize * currentScale;

      if (visualCell < 15) {
        console.log('[CodeOverlay] 格子太小，不显示色号:', visualCell);
        return;
      }

      // 字体大小适中，不超出格子
      const fontSize = Math.max(4, Math.min(cellSize * 0.4, visualCell * 0.2));

      console.log('[CodeOverlay] 开始绘制色号:', { cellSize, visualCell, fontSize, gridSize, dpr });

      let drawnCount = 0;
      let nonWhiteCount = 0;
      let missCodeCount = 0;

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const rawColor = gridData[y] ? gridData[y][x] : null;
          if (!rawColor) continue;

          const color = String(rawColor).trim().toUpperCase();
          if (color === '#FFFFFF') continue;

          nonWhiteCount++;

          const code = colorCodeMap[color] || colorCodeMap[String(rawColor).trim()] || '';
          if (!code) {
            missCodeCount++;
            continue;
          }

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          this._drawCode(ctx, color, code, px, py, fontSize, dpr);
          drawnCount++;
        }
      }

      console.log('[CodeOverlay] 色号绘制完成:', { drawnCount, nonWhiteCount, missCodeCount });
    },

    _drawCode(ctx, color, code, cx, cy, fontSize, dpr) {
      if (!code) return;

      const textColor = this._getCodeTextColor(color);

      // 使用清晰的字体渲染
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 亚像素对齐
      const alignedX = Math.round(cx * dpr) / dpr;
      const alignedY = Math.round(cy * dpr) / dpr;

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
