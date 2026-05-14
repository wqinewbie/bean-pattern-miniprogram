const MAX_PHYSICAL_SIZE = 4096;
const FIXED_VISUAL_FONT_SIZE = 11;

Component({
  properties: {
    width: { type: Number, value: 0 },
    height: { type: Number, value: 0 },
    contentWidth: { type: Number, value: 0 },
    contentHeight: { type: Number, value: 0 },
    inset: { type: Number, value: 0 },
    gridSize: { type: Number, value: 0 },
    scale: { type: Number, value: 1 },
    show: { type: Boolean, value: true },
    gesturing: { type: Boolean, value: false }
  },

  data: {
    _visible: 'visible'
  },

  lifetimes: {
    attached() {
      this._drawFrame = null;
      this._ready = false;
    },

    ready() {
      setTimeout(() => this.initCanvas(), 60);
    },

    detached() {
      if (this._drawFrame) {
        this._cancelFrame(this._drawFrame);
        this._drawFrame = null;
      }
      this.canvas = null;
      this.ctx = null;
      this._ready = false;
    }
  },

  observers: {
    'width, height, contentWidth, contentHeight, inset, gridSize, scale': function() {
      if (this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx) this._scheduleDraw();
    },

    show(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
    },

    gesturing() {}
  },

  methods: {
    _requestFrame(callback) {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
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
        this.draw();
      });
    },

    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#coordinateCanvas').node().exec((res) => {
        if (!res || !res[0]) return;
        this.canvas = res[0].node;
        this.ctx = this.canvas.getContext('2d');
        this.systemDpr = wx.getSystemInfoSync().pixelRatio || 1;
        this._ready = true;
        this._scheduleDraw();
      });
    },

    _align(value, dpr) {
      return Math.round(value * dpr) / dpr;
    },

    draw() {
      if (!this.ctx || !this.canvas) return;

      const width = Math.max(1, Number(this.data.width) || 1);
      const height = Math.max(1, Number(this.data.height) || 1);
      const contentWidth = Number(this.data.contentWidth) || 0;
      const contentHeight = Number(this.data.contentHeight) || 0;
      const inset = Number(this.data.inset) || 0;
      const gridSize = Number(this.data.gridSize) || 0;
      const viewScale = Math.max(1, Number(this.data.scale) || 1);
      if (!contentWidth || !contentHeight || !inset || !gridSize) return;

      const systemDpr = Math.max(1, this.systemDpr || 1);
      const maxDprByWidth = MAX_PHYSICAL_SIZE / width;
      const maxDprByHeight = MAX_PHYSICAL_SIZE / height;
      const dpr = Math.max(1, Math.min(Math.max(systemDpr * viewScale, maxDprByWidth, maxDprByHeight), maxDprByWidth, maxDprByHeight));

      const backingWidth = Math.max(1, Math.floor(width * dpr));
      const backingHeight = Math.max(1, Math.floor(height * dpr));
      if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
      if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;

      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#A1887F';

      const cellW = contentWidth / gridSize;
      const cellH = contentHeight / gridSize;
      const availableCell = Math.max(1, inset);
      const maxByCell = availableCell * 0.48;
      const digitCount = String(gridSize).length;
      const maxByDigits = availableCell / Math.max(1.15, digitCount * 0.68);
      const fontSize = Math.max(3, Math.min(FIXED_VISUAL_FONT_SIZE, maxByCell, maxByDigits));
      ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const topY = this._align(inset / 2, dpr);
      const bottomY = this._align(inset + contentHeight + inset / 2, dpr);
      const leftX = this._align(inset / 2, dpr);
      const rightX = this._align(inset + contentWidth + inset / 2, dpr);

      for (let i = 1; i <= gridSize; i++) {
        const label = String(i);
        const x = this._align(inset + (i - 0.5) * cellW, dpr);
        const y = this._align(inset + (i - 0.5) * cellH, dpr);
        ctx.fillText(label, x, topY);
        ctx.fillText(label, x, bottomY);
        ctx.fillText(label, leftX, y);
        ctx.fillText(label, rightX, y);
      }
    },

    redraw() {
      this._scheduleDraw();
    }
  }
});
