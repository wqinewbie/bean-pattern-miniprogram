const MAX_PHYSICAL_SIZE = 4096;
const MIN_VISUAL_CELL_FOR_CODE = 25;
const FIXED_VISUAL_FONT_SIZE = 14;

Component({
  properties: {
    width: { type: Number, value: 320 },
    height: { type: Number, value: 320 },
    gridSize: { type: Number, value: 52 },
    scale: { type: Number, value: 1 },
    gridData: { type: Array, value: [] },
    colorCodeMap: { type: Object, value: {} },
    show: { type: Boolean, value: true },
    gesturing: { type: Boolean, value: false }
  },

  data: {
    _visible: 'visible',
    labels: []
  },

  lifetimes: {
    attached() {
      this._drawFrame = null;
      this._ready = false;
    },

    ready() {
      setTimeout(() => this.initCanvas(), 100);
    },

    detached() {
      if (this._drawFrame) {
        this._cancelFrame(this._drawFrame);
        this._drawFrame = null;
      }
      this.canvas = null;
      this.ctx = null;
      this._pixelSource = null;
      this._colorCodeMapRef = null;
      this._ready = false;
    }
  },

  observers: {
    'width, height, gridSize': function(width, height, gridSize) {
      if (this.data.gesturing || this.properties.gesturing) return;
      if (width > 0 && height > 0 && gridSize > 0) this._scheduleDraw();
    },

    'gridData': function(gridData) {
      if (this.data.gesturing || this.properties.gesturing) return;
      if (gridData && gridData.length > 0) this._scheduleDraw();
    },

    'colorCodeMap': function(colorCodeMap) {
      if (this.data.gesturing || this.properties.gesturing) return;
      if (colorCodeMap) this._scheduleDraw();
    },

    'scale': function() {
      if (this.data.gesturing || this.properties.gesturing) return;
      this._scheduleDraw();
    },

    'show': function(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
    },

    'gesturing': function(gesturing) {
      if (!gesturing) this._scheduleDraw();
    }
  },

  methods: {
    _requestFrame(callback) {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(callback);
      }
      return setTimeout(callback, 16);
    },

    _cancelFrame(id) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(id);
        return;
      }
      clearTimeout(id);
    },

    _scheduleDraw() {
      if (this._drawFrame) return;
      this._drawFrame = this._requestFrame(() => {
        this._drawFrame = null;
        this.drawCodes();
      });
    },

    setExternalData(pixelSource, colorCodeMap) {
      if (pixelSource) this._pixelSource = pixelSource;
      if (colorCodeMap) this._colorCodeMapRef = colorCodeMap;
      if (this._ready && !this.data.gesturing && !this.properties.gesturing) {
        this._scheduleDraw();
      }
    },

    initCanvas() {
      this._ready = true;
      this._scheduleDraw();
    },

    _getCellColor(row, col) {
      if (this._pixelSource && typeof this._pixelSource.getPixelHex === 'function') {
        return this._pixelSource.getPixelHex(row, col);
      }
      const gridData = this.data.gridData;
      return gridData && gridData[row] ? gridData[row][col] : '';
    },

    drawCodes() {
      const { width, height, gridSize, scale } = this.data;
      const colorCodeMap = this._colorCodeMapRef || this.data.colorCodeMap;
      const safeGridSize = Math.max(1, Number(gridSize) || 1);
      const screenW = Math.max(1, Number(width) || 1);
      const screenH = Math.max(1, Number(height) || 1);
      const viewScale = Math.max(1, Number(scale) || 1);
      const cellW = screenW / safeGridSize;
      const cellH = screenH / safeGridSize;
      const visualCell = Math.min(cellW, cellH) * viewScale;

      if (!colorCodeMap || Object.keys(colorCodeMap).length === 0 || visualCell < MIN_VISUAL_CELL_FOR_CODE) {
        if (this.data.labels.length) this.setData({ labels: [] });
        return;
      }

      const availableCell = Math.max(1, Math.min(cellW, cellH));
      const maxCodeLength = Object.values(colorCodeMap || {}).reduce((max, code) => {
        return Math.max(max, String(code || '').length);
      }, 1);
      const maxByCell = availableCell * 0.58;
      const maxByLength = availableCell / Math.max(1.1, maxCodeLength * 0.62);
      const fontSize = Math.max(3, Math.min(FIXED_VISUAL_FONT_SIZE, maxByCell, maxByLength));
      const labels = [];

      for (let row = 0; row < safeGridSize; row++) {
        for (let col = 0; col < safeGridSize; col++) {
          const rawColor = this._getCellColor(row, col);
          if (!rawColor) continue;

          const color = String(rawColor).trim().toUpperCase();
          if (!color || color === '#FFFFFF') continue;

          const code = colorCodeMap[color] || colorCodeMap[String(rawColor).trim()] || '';
          if (!code) continue;

          const textColor = this._getCodeTextColor(color);
          labels.push({
            key: `${row}-${col}`,
            code,
            style: [
              `left:${col * cellW}px`,
              `top:${row * cellH}px`,
              `width:${cellW}px`,
              `height:${cellH}px`,
              `font-size:${fontSize}px`,
              `color:${textColor}`
            ].join(';')
          });
        }
      }

      this.setData({ labels });
    },

    _drawCode(ctx, color, code, cx, cy, fontSize, dpr, skipStroke) {
      const textColor = this._getCodeTextColor(color);
      const alignedX = Math.round(cx * dpr) / dpr;
      const alignedY = Math.round(cy * dpr) / dpr;

      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;

      if (!skipStroke) {
        ctx.strokeStyle = textColor === '#FFFFFF' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = Math.max(1 / dpr, fontSize * 0.08);
        ctx.strokeText(code, alignedX, alignedY);
      }

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
      this._scheduleDraw();
    }
  }
});
