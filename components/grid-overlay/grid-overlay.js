/**
 * 网格覆盖层组件
 */
Component({
  properties: {
    width: { type: Number, value: 320 },
    height: { type: Number, value: 320 },
    gridSize: { type: Number, value: 52 },
    scale: { type: Number, value: 1 },
    show: { type: Boolean, value: true }
  },

  data: {
    canvasId: 'grid-overlay-' + Date.now(),
    _visible: 'visible'
  },

  lifetimes: {
    attached() {
      console.log('[GridOverlay] 组件加载');
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
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) this.drawGrid();
    },
    'scale': function(scale) {
      console.log('[GridOverlay] 缩放变化:', scale);
      if (this.ctx) this.drawGrid();
    },
    'show': function(show) {
      this.setData({ _visible: show ? 'visible' : 'hidden' });
    }
  },

  methods: {
    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#gridCanvas').node().exec((res) => {
        if (!res || !res[0]) return;
        this.canvas = res[0].node;
        this.ctx = this.canvas.getContext('2d');
        console.log('[GridOverlay] Canvas 初始化成功');
        this.drawGrid();
      });
    },

    drawGrid() {
      if (!this.ctx || !this.canvas) return;

      const { width, height, gridSize } = this.data;
      const scale = this.data.scale || 1;
      const ctx = this.ctx;
      const canvas = this.canvas;

      // 适中 DPR 平衡清晰度和性能，避免 Canvas 超限
      const systemDpr = wx.getSystemInfoSync().pixelRatio || 2;
      const targetDpr = systemDpr * 1.5 * Math.max(1, scale);
      
      // 限制 Canvas 最大物理尺寸为 3072px（保守限制）
      const maxPhysicalSize = 3072;
      const maxDprByWidth = maxPhysicalSize / width;
      const maxDprByHeight = maxPhysicalSize / height;
      const dpr = Math.min(targetDpr, maxDprByWidth, maxDprByHeight, 12);

      const logicalW = width;
      const logicalH = height;
      canvas.width = Math.max(1, Math.floor(logicalW * dpr));
      canvas.height = Math.max(1, Math.floor(logicalH * dpr));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, logicalW, logicalH);
      
      // 线条需要关闭抗锯齿才锐利
      ctx.imageSmoothingEnabled = false;

      const cellSize = width / gridSize;
      const visualCellSize = cellSize * scale;

      // 次网格小于阈值隐藏，主网格永不隐藏
      if (visualCellSize >= 5) {
        this._drawThinLines(ctx, logicalW, logicalH, gridSize, cellSize, dpr);
      }
      this._drawThickLines(ctx, logicalW, logicalH, gridSize, cellSize, dpr);

      console.log('[GridOverlay] 绘制参数:', {
        width,
        height,
        gridSize,
        scale,
        dpr,
        physicalSize: Math.floor(logicalW * dpr),
        visualCellSize,
        showMinor: visualCellSize >= 5
      });
    },

    _drawThinLines(ctx, width, height, gridSize, cellSize, dpr) {
      ctx.strokeStyle = '#CCCCCC';
      // 固定物理像素线宽
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();

      for (let i = 0; i <= gridSize; i++) {
        const pos = this._alignToPixel(i * cellSize, dpr);
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
      }
      ctx.stroke();
    },

    _drawThickLines(ctx, width, height, gridSize, cellSize, dpr) {
      ctx.strokeStyle = '#000000';
      // 固定物理像素线宽
      ctx.lineWidth = 2 / dpr;
      ctx.beginPath();

      for (let i = 0; i <= gridSize; i += 5) {
        const pos = this._alignToPixel(i * cellSize, dpr);
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
      }
      ctx.stroke();
    },

    _alignToPixel(value, dpr) {
      // 精确像素对齐
      return Math.round(value * dpr) / dpr;
    },

    redraw() {
      this.drawGrid();
    }
  }
});
