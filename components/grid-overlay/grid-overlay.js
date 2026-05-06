/**
 * 网格覆盖层组件
 */
Component({
  properties: {
    width: { type: Number, value: 320 },
    height: { type: Number, value: 320 },
    gridSize: { type: Number, value: 52 },
    scale: { type: Number, value: 1 },
    show: { type: Boolean, value: true },
    // 完美版：可视区域裁剪参数
    canvasOffsetX: { type: Number, value: 0 },
    canvasOffsetY: { type: Number, value: 0 },
    areaWidth: { type: Number, value: 0 },
    areaHeight: { type: Number, value: 0 }
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

      const { width, height, gridSize, scale, canvasOffsetX, canvasOffsetY, areaWidth, areaHeight } = this.data;
      const ctx = this.ctx;
      const canvas = this.canvas;

      // 完美版：动态 DPR 策略
      const systemDpr = wx.getSystemInfoSync().pixelRatio || 2;
      const qualityFactor = 1.8; // 网格层需要更高清晰度
      const targetDpr = systemDpr * qualityFactor * Math.max(1, Math.min(scale, 2));
      
      // 限制 Canvas 最大物理尺寸为 4096px
      const maxPhysicalSize = 4096;
      const maxDprByWidth = maxPhysicalSize / width;
      const maxDprByHeight = maxPhysicalSize / height;
      const dpr = Math.max(1, Math.min(targetDpr, maxDprByWidth, maxDprByHeight, 6));

      const logicalW = width;
      const logicalH = height;
      canvas.width = Math.max(1, Math.floor(logicalW * dpr));
      canvas.height = Math.max(1, Math.floor(logicalH * dpr));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, logicalW, logicalH);
      
      // 完美版：网格线必须关闭抗锯齿
      ctx.imageSmoothingEnabled = false;

      const cellSize = width / gridSize;
      const visualCellSize = cellSize * scale;

      // 完美版：细网格显示阈值优化（更早显示，避免突然出现）
      const showMinorGrid = visualCellSize >= 8;
      
      // 完美版：计算可视区域（只绘制可见的网格线）
      let visibleRange = null;
      if (areaWidth > 0 && areaHeight > 0) {
        const scaledCellSize = cellSize * scale;
        const visibleLeft = Math.max(0, -canvasOffsetX);
        const visibleTop = Math.max(0, -canvasOffsetY);
        const visibleRight = Math.min(width * scale, areaWidth - canvasOffsetX);
        const visibleBottom = Math.min(height * scale, areaHeight - canvasOffsetY);

        const minCol = Math.max(0, Math.floor(visibleLeft / scaledCellSize) - 1);
        const minRow = Math.max(0, Math.floor(visibleTop / scaledCellSize) - 1);
        const maxCol = Math.min(gridSize, Math.ceil(visibleRight / scaledCellSize) + 1);
        const maxRow = Math.min(gridSize, Math.ceil(visibleBottom / scaledCellSize) + 1);

        visibleRange = { minRow, maxRow, minCol, maxCol };
        
        console.log('[GridOverlay] 可视区域裁剪:', {
          total: (gridSize + 1) * 2,
          visible: (maxRow - minRow + maxCol - minCol) * 2,
          ratio: ((maxRow - minRow + maxCol - minCol) / (gridSize * 2) * 100).toFixed(1) + '%'
        });
      }
      
      if (showMinorGrid) {
        this._drawThinLines(ctx, logicalW, logicalH, gridSize, cellSize, dpr, visibleRange);
      }
      this._drawThickLines(ctx, logicalW, logicalH, gridSize, cellSize, dpr, visibleRange);

      console.log('[GridOverlay] 完美渲染:', {
        scale: scale.toFixed(2),
        dpr: dpr.toFixed(2),
        physicalSize: `${Math.floor(logicalW * dpr)}x${Math.floor(logicalH * dpr)}`,
        visualCellSize: visualCellSize.toFixed(1),
        showMinor: showMinorGrid,
        culling: !!visibleRange
      });
    },

    _drawThinLines(ctx, width, height, gridSize, cellSize, dpr, visibleRange) {
      ctx.strokeStyle = '#CCCCCC';
      // 固定物理像素线宽
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();

      // 完美版：只绘制可见范围的线条
      const startRow = visibleRange ? visibleRange.minRow : 0;
      const endRow = visibleRange ? visibleRange.maxRow : gridSize;
      const startCol = visibleRange ? visibleRange.minCol : 0;
      const endCol = visibleRange ? visibleRange.maxCol : gridSize;

      // 垂直线（跳过5的倍数，避免与粗线重复）
      for (let i = startCol; i <= endCol && i <= gridSize; i++) {
        if (i % 5 === 0) continue; // 跳过粗线位置
        const pos = this._alignToPixel(i * cellSize, dpr);
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
      }
      
      // 水平线（跳过5的倍数，避免与粗线重复）
      for (let i = startRow; i <= endRow && i <= gridSize; i++) {
        if (i % 5 === 0) continue; // 跳过粗线位置
        const pos = this._alignToPixel(i * cellSize, dpr);
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
      }
      
      ctx.stroke();
    },

    _drawThickLines(ctx, width, height, gridSize, cellSize, dpr, visibleRange) {
      ctx.strokeStyle = '#000000';
      // 固定物理像素线宽
      ctx.lineWidth = 2 / dpr;
      ctx.beginPath();

      // 完美版：只绘制可见范围的粗线
      const startRow = visibleRange ? Math.floor(visibleRange.minRow / 5) * 5 : 0;
      const endRow = visibleRange ? Math.ceil(visibleRange.maxRow / 5) * 5 : gridSize;
      const startCol = visibleRange ? Math.floor(visibleRange.minCol / 5) * 5 : 0;
      const endCol = visibleRange ? Math.ceil(visibleRange.maxCol / 5) * 5 : gridSize;

      // 垂直线
      for (let i = startCol; i <= endCol && i <= gridSize; i += 5) {
        const pos = this._alignToPixel(i * cellSize, dpr);
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
      }
      
      // 水平线
      for (let i = startRow; i <= endRow && i <= gridSize; i += 5) {
        const pos = this._alignToPixel(i * cellSize, dpr);
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
