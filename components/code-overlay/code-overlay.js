/**
 * 色号覆盖层组件
 *
 * width/height = canvasWidth * scale（缩放后的 CSS 显示尺寸）
 * 内部以 logicalWidth = width/scale 为逻辑坐标绘制，ctx.scale(dpr * scale) 映射到物理像素
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
    canvasOffsetX: { type: Number, value: 0 },
    canvasOffsetY: { type: Number, value: 0 },
    areaWidth: { type: Number, value: 0 },
    areaHeight: { type: Number, value: 0 },
    gesturing: { type: Boolean, value: false }
  },

  data: {
    canvasId: 'code-overlay-' + Date.now(),
    _visible: 'visible'
  },

  lifetimes: {
    attached() {
      this._gestureLock = false;
    },
    ready() {
      setTimeout(() => this.initCanvas(), 100);
    },
    detached() {
      this.canvas = null;
      this.ctx = null;
      this._gestureLock = false;
    }
  },

  observers: {
    'width, height, gridSize': function(width, height, gridSize) {
      if (this._gestureLock || this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) this.drawCodes();
    },
    'gridData': function(gridData) {
      if (this._gestureLock || this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx && gridData && gridData.length > 0) this.drawCodes();
    },
    'colorCodeMap': function(colorCodeMap) {
      if (this._gestureLock || this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx && colorCodeMap) this.drawCodes();
    },
    'scale': function() {
      if (this._gestureLock || this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx) this.drawCodes();
    },
    'show': function(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
    },
    'gesturing': function(gesturing) {
      this._gestureLock = !!gesturing;
      if (!gesturing && this.ctx) {
        this.drawCodes();
      }
    }
  },

  methods: {
    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#codeCanvas').node().exec((res) => {
        if (!res || !res[0]) return;
        this.canvas = res[0].node;
        this.ctx = this.canvas.getContext('2d');
        this.systemDpr = wx.getSystemInfoSync().pixelRatio || 2;
        this.drawCodes();
      });
    },

    drawCodes() {
      if (!this.ctx || !this.canvas) return;

      const { width, height, gridSize, gridData, colorCodeMap, scale } = this.data;
      if (!gridData || gridData.length === 0 || !colorCodeMap || Object.keys(colorCodeMap).length === 0) return;

      const ctx = this.ctx;
      const canvas = this.canvas;

      const currentScale = Math.max(Number(scale) || 1, 0.5);
      const logicalW = width / currentScale;
      const logicalH = height / currentScale;
      const cellSize = logicalW / gridSize;
      const visualCell = cellSize * currentScale;

      const systemDpr = Math.max(1, this.systemDpr || 2);
      const maxPhysicalSize = 4096;
      const maxDprByWidth = maxPhysicalSize / width;
      const maxDprByHeight = maxPhysicalSize / height;
      const dpr = Math.max(1, Math.min(systemDpr, maxDprByWidth, maxDprByHeight));

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      const effectiveDpr = dpr * currentScale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(effectiveDpr, effectiveDpr);
      ctx.clearRect(0, 0, logicalW, logicalH);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (visualCell < 25) return;

      const FIXED_LOGICAL_FONT_SIZE = 7;
      const maxFontByCell = Math.max(5, cellSize * 0.72);
      const fontSize = Math.min(FIXED_LOGICAL_FONT_SIZE, maxFontByCell);

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const rawColor = gridData[y] ? gridData[y][x] : null;
          if (!rawColor) continue;

          const color = String(rawColor).trim().toUpperCase();
          if (color === '#FFFFFF') continue;

          const code = colorCodeMap[color] || colorCodeMap[String(rawColor).trim()] || '';
          if (!code) continue;

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          this._drawCode(ctx, color, code, px, py, fontSize, effectiveDpr);
        }
      }
    },

    _drawCode(ctx, color, code, cx, cy, fontSize, effectiveDpr) {
      if (!code) return;

      const textColor = this._getCodeTextColor(color);
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const alignedX = Math.round(cx * effectiveDpr) / effectiveDpr;
      const alignedY = Math.round(cy * effectiveDpr) / effectiveDpr;

      if (textColor === '#FFFFFF') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      }
      ctx.lineWidth = Math.max(0.3, fontSize * 0.1);
      ctx.strokeText(code, alignedX, alignedY);

      ctx.fillStyle = textColor;
      ctx.fillText(code, alignedX, alignedY);
    },

    _getCodeTextColor(hexColor) {
      if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 7) return '#222222';
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
