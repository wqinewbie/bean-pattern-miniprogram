/**
 * 网格覆盖层组件
 * 使用独立的高分辨率 Canvas 绘制网格，通过 CSS transform 缩放
 * 确保网格在任何缩放比例下都保持清晰
 */
Component({
  properties: {
    // 画布宽度（逻辑像素）
    width: {
      type: Number,
      value: 320
    },
    // 画布高度（逻辑像素）
    height: {
      type: Number,
      value: 320
    },
    // 网格尺寸（格子数量）
    gridSize: {
      type: Number,
      value: 52
    },
    // 缩放比例
    scale: {
      type: Number,
      value: 1
    },
    // 是否显示网格
    show: {
      type: Boolean,
      value: true
    }
  },

  data: {
    canvasId: 'grid-overlay-' + Date.now()
  },

  lifetimes: {
    attached() {
      console.log('[GridOverlay] 组件加载');
    },
    
    ready() {
      // 延迟初始化，确保 DOM 已渲染
      setTimeout(() => {
        this.initCanvas();
      }, 100);
    },
    
    detached() {
      console.log('[GridOverlay] 组件卸载');
      this.canvas = null;
      this.ctx = null;
    }
  },

  observers: {
    // 监听尺寸和网格大小变化，重新绘制
    'width, height, gridSize': function(width, height, gridSize) {
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) {
        console.log('[GridOverlay] 尺寸变化，重新绘制:', { width, height, gridSize });
        this.drawGrid();
      }
    },
    
    // 监听缩放比例变化（用于动态调整 DPR）
    'scale': function(scale) {
      console.log('[GridOverlay] 缩放变化:', scale);
      // 缩放时不立即重绘（性能优化）
      // 等待缩放结束后由外部调用 redraw()
    },
    
    // 监听显示状态
    'show': function(show) {
      this.setData({
        _visible: show ? 'visible' : 'hidden'
      });
    }
  },

  methods: {
    /**
     * 初始化 Canvas
     */
    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#gridCanvas').node().exec((res) => {
        if (!res || !res[0]) {
          console.error('[GridOverlay] 无法获取 Canvas 节点');
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 获取设备像素比
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        
        console.log('[GridOverlay] Canvas 初始化成功:', {
          width: this.data.width,
          height: this.data.height,
          gridSize: this.data.gridSize,
          dpr: dpr
        });

        this.canvas = canvas;
        this.ctx = ctx;
        this.dpr = dpr;

        // 绘制网格
        this.drawGrid();
      });
    },

    /**
     * 绘制网格
     */
    drawGrid() {
      if (!this.ctx || !this.canvas) {
        console.warn('[GridOverlay] Canvas 未初始化');
        return;
      }

      const { width, height, gridSize } = this.data;
      const ctx = this.ctx;
      const canvas = this.canvas;
      
      // 动态计算 DPR：根据当前缩放比例提高分辨率
      const baseDpr = wx.getSystemInfoSync().pixelRatio || 2;
      const scale = this.data.scale || 1;
      // 缩放越大，使用越高的 DPR
      const dpr = Math.min(baseDpr * Math.max(1, scale * 1.5), 6);

      console.log('[GridOverlay] 绘制网格，DPR:', dpr, '缩放:', scale);

      // 设置 Canvas 物理尺寸（高分辨率）
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      // 缩放上下文以匹配逻辑像素
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置 transform
      ctx.scale(dpr, dpr);

      // 清空画布
      ctx.clearRect(0, 0, width, height);

      // 禁用抗锯齿，让线条更清晰
      ctx.imageSmoothingEnabled = false;

      // 计算格子大小
      const cellSize = width / gridSize;

      console.log('[GridOverlay] 开始绘制网格:', {
        cellSize,
        gridSize,
        dpr
      });

      // 绘制细线（每个格子）
      this._drawThinLines(ctx, width, height, gridSize, cellSize, dpr);

      // 绘制粗线（每5个格子）
      this._drawThickLines(ctx, width, height, gridSize, cellSize, dpr);

      console.log('[GridOverlay] 网格绘制完成');
    },

    /**
     * 绘制细线
     */
    _drawThinLines(ctx, width, height, gridSize, cellSize, dpr) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.5;
      ctx.beginPath();

      for (let i = 0; i <= gridSize; i++) {
        // 像素对齐
        const pos = this._alignToPixel(i * cellSize, dpr);
        
        // 垂直线
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
        
        // 水平线
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
      }

      ctx.stroke();
    },

    /**
     * 绘制粗线
     */
    _drawThickLines(ctx, width, height, gridSize, cellSize, dpr) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 0; i <= gridSize; i += 5) {
        // 像素对齐
        const pos = this._alignToPixel(i * cellSize, dpr);
        
        // 垂直线
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
        
        // 水平线
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
      }

      ctx.stroke();
    },

    /**
     * 像素对齐
     * 确保线条位置对齐到设备像素，避免模糊
     */
    _alignToPixel(value, dpr) {
      return Math.round(value * dpr) / dpr;
    },

    /**
     * 外部调用：强制重绘
     */
    redraw() {
      this.drawGrid();
    }
  }
});
