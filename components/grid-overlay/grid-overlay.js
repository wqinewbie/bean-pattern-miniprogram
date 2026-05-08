/**
 * 网格覆盖层组件
 * 
 * width/height = canvasWidth * scale（缩放后的 CSS 显示尺寸）
 * 内部以 logicalWidth = width/scale 为逻辑坐标绘制，ctx.scale(dpr * scale) 映射到物理像素
 * 确保与主 Canvas 使用完全相同的坐标系
 */
Component({
  properties: {
    width: { type: Number, value: 320 },
    height: { type: Number, value: 320 },
    gridSize: { type: Number, value: 52 },
    scale: { type: Number, value: 1 },
    show: { type: Boolean, value: true },
    canvasOffsetX: { type: Number, value: 0 },
    canvasOffsetY: { type: Number, value: 0 },
    areaWidth: { type: Number, value: 0 },
    areaHeight: { type: Number, value: 0 },
    gesturing: { type: Boolean, value: false }
  },

  data: {
    canvasId: 'grid-overlay-' + Date.now(),
    _visible: 'visible'
  },

  _traceEnabled: true,

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
    }
  },

  observers: {
    'width, height, gridSize': function(width, height, gridSize) {
      if (this._gestureLock || this.data.gesturing || this.properties.gesturing) {
        this._trace('skip observer(width,height,gridSize)');
        return;
      }
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) {
        this._trace('run observer(width,height,gridSize)');
        this.drawGrid();
      }
    },
    'scale': function(scale) {
      if (this._gestureLock || this.data.gesturing || this.properties.gesturing) {
        this._trace('skip observer(scale)');
        return;
      }
      if (this.ctx) {
        this._trace('run observer(scale)');
        this.drawGrid();
      }
    },
    'show': function(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
    },
    'gesturing': function(gesturing) {
      this._gestureLock = !!gesturing;
      this._trace('observer(gesturing) -> ' + gesturing);
      if (!gesturing && this.ctx) {
        this._trace('run observer(gesturing=false) redraw');
        this.drawGrid();
      }
    }
  },

  methods: {
    _trace(reason) {
      if (!this._traceEnabled) return;
      const p = this.properties || {};
      console.log('[GRID_REDRAW_TRACE]', reason, {
        gesturingProp: !!p.gesturing,
        gestureLock: !!this._gestureLock,
        scale: p.scale,
        width: p.width,
        height: p.height
      });
    },
    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#gridCanvas').node().exec((res) => {
        if (!res || !res[0]) return;
        this.canvas = res[0].node;
        this.ctx = this.canvas.getContext('2d');
        this.drawGrid();
      });
    },

    drawGrid() {
      if (!this.ctx || !this.canvas) return;

      const { width, height, gridSize, scale } = this.data;
      const ctx = this.ctx;
      const canvas = this.canvas;

      const currentScale = Math.max(Number(scale) || 1, 0.5);
      // Logical size = the base canvas size (before zoom)
      const logicalW = width / currentScale;
      const logicalH = height / currentScale;
      const cellSize = logicalW / gridSize;

      const systemDpr = wx.getSystemInfoSync().pixelRatio || 2;
      const maxPhysicalSize = 4096;
      const maxDprByWidth = maxPhysicalSize / width;
      const maxDprByHeight = maxPhysicalSize / height;
      const dpr = Math.max(1, Math.min(systemDpr, maxDprByWidth, maxDprByHeight));

      const physW = Math.max(1, Math.floor(width * dpr));
      const physH = Math.max(1, Math.floor(height * dpr));
      canvas.width = physW;
      canvas.height = physH;

      // Draw in logical coordinates, scale by dpr * scale to fill the zoomed CSS area
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr * currentScale, dpr * currentScale);
      ctx.clearRect(0, 0, logicalW, logicalH);
      ctx.imageSmoothingEnabled = false;

      const visualCellSize = cellSize * currentScale;
      const showMinorGrid = visualCellSize >= 8;

      if (showMinorGrid) {
        this._drawThinLines(ctx, logicalW, logicalH, gridSize, cellSize, dpr * currentScale);
      }
      this._drawThickLines(ctx, logicalW, logicalH, gridSize, cellSize, dpr * currentScale);
    },

    _drawThinLines(ctx, width, height, gridSize, cellSize, effectiveDpr) {
      ctx.fillStyle = '#CCCCCC';
      const lineWidth = 1 / effectiveDpr;
      const halfLine = lineWidth / 2;

      for (let i = 0; i <= gridSize; i++) {
        if (i % 5 === 0) continue;
        const pos = i * cellSize - halfLine;
        ctx.fillRect(pos, 0, lineWidth, height);
      }
      
      for (let i = 0; i <= gridSize; i++) {
        if (i % 5 === 0) continue;
        const pos = i * cellSize - halfLine;
        ctx.fillRect(0, pos, width, lineWidth);
      }
    },

    _drawThickLines(ctx, width, height, gridSize, cellSize, effectiveDpr) {
      ctx.fillStyle = '#000000';
      const lineWidth = 2 / effectiveDpr;
      const halfLine = lineWidth / 2;

      for (let i = 0; i <= gridSize; i += 5) {
        const pos = i * cellSize - halfLine;
        ctx.fillRect(pos, 0, lineWidth, height);
      }
      
      for (let i = 0; i <= gridSize; i += 5) {
        const pos = i * cellSize - halfLine;
        ctx.fillRect(0, pos, width, lineWidth);
      }
    },

    redraw() {
      this.drawGrid();
    }
  }
});
