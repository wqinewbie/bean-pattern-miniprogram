const { init2dCanvas, resize2dCanvas, clear2dCanvas } = require('../../utils/canvas2d/core');
const { exportCanvasToTempFilePath } = require('../../utils/canvas2d/export');

Component({
  properties: {
    canvasId: { type: String, value: 'bead-canvas2d' },
    width: { type: Number, value: 300 },
    height: { type: Number, value: 300 },
    autoInit: { type: Boolean, value: true }
  },

  data: {
    ready: false,
    dpr: 1
  },

  lifetimes: {
    attached() {
      this._destroyed = false;
      this._initPromise = null;
      this._readyQueue = [];
      this._resizeTimer = null;
      if (this.data.autoInit) {
        this.init();
      }
    },

    detached() {
      this._destroyed = true;
      this._canvas = null;
      this._ctx = null;
      this._initPromise = null;
      if (this._resizeTimer) {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = null;
      }
      this._readyQueue = [];
    }
  },

  methods: {
    _forwardTouchEvent(name, e) {
      this.triggerEvent(name, {
        touches: e && Array.isArray(e.touches) ? e.touches : [],
        changedTouches: e && Array.isArray(e.changedTouches) ? e.changedTouches : [],
        timeStamp: e && e.timeStamp ? e.timeStamp : Date.now()
      });
    },

    onTouchStart(e) {
      this._forwardTouchEvent('canvastouchstart', e);
    },

    onTouchMove(e) {
      this._forwardTouchEvent('canvastouchmove', e);
    },

    onTouchEnd(e) {
      this._forwardTouchEvent('canvastouchend', e);
    },

    onTouchCancel(e) {
      this._forwardTouchEvent('canvastouchcancel', e);
    },

    init() {
      if (this._initPromise) return this._initPromise;
      this._initPromise = this._doInit();
      return this._initPromise;
    },

    async _doInit() {
      try {
        const info = await init2dCanvas(this, '#' + this.data.canvasId);
        if (this._destroyed) return;

        this._canvas = info.canvas;
        this._ctx = info.ctx;
        this._dpr = info.dpr;

        resize2dCanvas({
          canvas: this._canvas,
          ctx: this._ctx,
          width: this.data.width,
          height: this.data.height,
          dpr: this._dpr
        });

        this.setData({ ready: true, dpr: this._dpr });
        this.triggerEvent('ready', {
          canvasId: this.data.canvasId,
          width: this.data.width,
          height: this.data.height,
          dpr: this._dpr
        });

        this._flushReadyQueue();
      } catch (error) {
        this._initPromise = null;
        if (this._destroyed) return;
        this.triggerEvent('error', {
          canvasId: this.data.canvasId,
          message: error && error.message ? error.message : 'init failed'
        });
      }
    },

    whenReady() {
      if (this.data.ready && this._canvas && this._ctx) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        this._readyQueue.push(resolve);
      });
    },

    _flushReadyQueue() {
      const queue = this._readyQueue.splice(0);
      for (let i = 0; i < queue.length; i++) {
        try { queue[i](); } catch (_) { /* noop */ }
      }
    },

    resize(width, height) {
      if (this._destroyed || !this._canvas || !this._ctx) return;
      if (this._resizeTimer) {
        clearTimeout(this._resizeTimer);
      }
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        this._doResize(width, height);
      }, 16);
    },

    resizeSync(width, height) {
      if (this._destroyed || !this._canvas || !this._ctx) return;
      if (this._resizeTimer) {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = null;
      }
      this._doResize(width, height);
    },

    _doResize(width, height) {
      if (this._destroyed || !this._canvas || !this._ctx) return;
      const nextWidth = Number(width) || this.data.width;
      const nextHeight = Number(height) || this.data.height;
      resize2dCanvas({
        canvas: this._canvas,
        ctx: this._ctx,
        width: nextWidth,
        height: nextHeight,
        dpr: this._dpr || 1
      });
      this.setData({ width: nextWidth, height: nextHeight });
    },

    clear() {
      if (!this._ctx || this._destroyed) return;
      clear2dCanvas(this._ctx, this.data.width, this.data.height);
    },

    getLayout() {
      return {
        width: this.data.width,
        height: this.data.height,
        dpr: this._dpr || 1,
        ready: !!this.data.ready
      };
    },

    getContext() {
      return {
        canvas: this._canvas || null,
        ctx: this._ctx || null,
        dpr: this._dpr || 1,
        ready: !!(this.data.ready && this._canvas && this._ctx && !this._destroyed)
      };
    },

    async exportTempFilePath(options) {
      options = options || {};
      if (this._destroyed) {
        throw new Error('component destroyed');
      }
      if (!this._canvas) {
        await this.whenReady();
      }
      if (this._destroyed || !this._canvas) {
        throw new Error('canvas not ready');
      }
      return exportCanvasToTempFilePath(this._canvas, {
        width: options.width || this.data.width,
        height: options.height || this.data.height,
        sourceWidth: this._canvas.width,
        sourceHeight: this._canvas.height,
        fileType: options.fileType || 'png',
        quality: options.quality == null ? 1 : options.quality,
        maxRetry: options.maxRetry,
        retryDelay: options.retryDelay,
        timeout: options.timeout
      }, this);
    }
  }
});
