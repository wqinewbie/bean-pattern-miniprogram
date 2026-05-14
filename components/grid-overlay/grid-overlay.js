const MAX_PHYSICAL_SIZE = 4096;

Component({
  properties: {
    width: { type: Number, value: 320 },
    height: { type: Number, value: 320 },
    gridSize: { type: Number, value: 52 },
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
    }
  },

  observers: {
    'width, height, gridSize': function(width, height, gridSize) {
      if (this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) {
        this._scheduleDraw();
      }
    },

    'scale': function() {
      if (this.data.gesturing || this.properties.gesturing) return;
      if (this.ctx) this._scheduleDraw();
    },

    'show': function(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
      if (show && this.ctx && !this.data.gesturing && !this.properties.gesturing) {
        this._scheduleDraw();
      }
    },

    'gesturing': function(gesturing) {
      if (gesturing) {
        if (this._drawFrame) {
          this._cancelFrame(this._drawFrame);
          this._drawFrame = null;
        }
        return;
      }
      if (this.ctx) this._scheduleDraw();
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
        this.drawGrid();
      });
    },

    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#gridCanvas').node().exec((res) => {
        if (!res || !res[0]) return;
        this.canvas = res[0].node;
        this.ctx = this.canvas.getContext('2d');
        this._scheduleDraw();
      });
    },

    drawGrid() {
      if (!this.ctx || !this.canvas) return;
      if (this.data.gesturing || this.properties.gesturing || !this.data.show) return;

      const { width, height } = this.data;
      const ctx = this.ctx;
      const canvas = this.canvas;
      const screenW = Math.max(1, Number(width) || 1);
      const screenH = Math.max(1, Number(height) || 1);
      const systemDpr = wx.getSystemInfoSync().pixelRatio || 1;
      const maxDprByWidth = MAX_PHYSICAL_SIZE / screenW;
      const maxDprByHeight = MAX_PHYSICAL_SIZE / screenH;
      const dpr = Math.max(1, Math.min(systemDpr, maxDprByWidth, maxDprByHeight));

      canvas.width = Math.max(1, Math.floor(screenW * dpr));
      canvas.height = Math.max(1, Math.floor(screenH * dpr));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, screenW, screenH);
      ctx.imageSmoothingEnabled = false;
    },

    redraw() {
      this._scheduleDraw();
    }
  }
});
