/**
 * 色号覆盖层组件
 * 使用独立的高分辨率 Canvas 绘制色号文字
 * 确保色号在任何缩放比例下都保持清晰
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
    // 网格数据（二维数组，存储颜色）
    gridData: {
      type: Array,
      value: []
    },
    // 色码映射表（颜色 -> 色码）
    colorCodeMap: {
      type: Object,
      value: {}
    },
    // 是否显示
    show: {
      type: Boolean,
      value: true
    }
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
      // 延迟初始化，确保 DOM 已渲染
      setTimeout(() => {
        this.initCanvas();
      }, 100);
    },
    
    detached() {
      console.log('[CodeOverlay] 组件卸载');
      this.canvas = null;
      this.ctx = null;
    }
  },

  observers: {
    // 监听尺寸和网格大小变化，重新绘制
    'width, height, gridSize': function(width, height, gridSize) {
      if (this.ctx && width > 0 && height > 0 && gridSize > 0) {
        console.log('[CodeOverlay] 尺寸变化，重新绘制');
        this.drawCodes();
      }
    },
    
    // 监听网格数据变化
    'gridData': function(gridData) {
      if (this.ctx && gridData && gridData.length > 0) {
        console.log('[CodeOverlay] 数据变化，重新绘制');
        this.drawCodes();
      }
    },
    
    // 监听色码映射表变化
    'colorCodeMap': function(colorCodeMap) {
      if (this.ctx && colorCodeMap) {
        console.log('[CodeOverlay] 色码映射变化，重新绘制');
        this.drawCodes();
      }
    },
    
    // 监听缩放比例变化
    'scale': function(scale) {
      console.log('[CodeOverlay] 缩放变化:', scale);
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
      query.select('#codeCanvas').node().exec((res) => {
        if (!res || !res[0]) {
          console.error('[CodeOverlay] 无法获取 Canvas 节点');
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 获取设备像素比
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        
        console.log('[CodeOverlay] Canvas 初始化成功:', {
          width: this.data.width,
          height: this.data.height,
          gridSize: this.data.gridSize,
          dpr: dpr
        });

        this.canvas = canvas;
        this.ctx = ctx;
        this.dpr = dpr;

        // 绘制色号
        this.drawCodes();
      });
    },

    /**
     * 绘制色号
     */
    drawCodes() {
      if (!this.ctx || !this.canvas) {
        console.warn('[CodeOverlay] Canvas 未初始化');
        return;
      }

      const { width, height, gridSize, gridData, colorCodeMap, scale } = this.data;
      
      if (!gridData || gridData.length === 0) {
        console.warn('[CodeOverlay] 网格数据为空');
        return;
      }
      
      if (!colorCodeMap || Object.keys(colorCodeMap).length === 0) {
        console.warn('[CodeOverlay] 色码映射表为空');
        return;
      }

      const ctx = this.ctx;
      const canvas = this.canvas;
      
      // 动态计算 DPR：根据缩放比例提高分辨率
      const baseDpr = this.dpr || 2;
      const currentScale = scale || 1;
      // 色号需要更高的 DPR 以保持清晰
      const dpr = Math.min(baseDpr * Math.max(1, currentScale * 2), 8);

      console.log('[CodeOverlay] 绘制色号，DPR:', dpr, '缩放:', currentScale);

      // 设置 Canvas 物理尺寸（高分辨率）
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      // 缩放上下文以匹配逻辑像素
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // 清空画布
      ctx.clearRect(0, 0, width, height);

      // 禁用抗锯齿，让文字更清晰
      ctx.imageSmoothingEnabled = false;

      // 计算格子大小
      const cellSize = width / gridSize;
      const visualCell = cellSize * currentScale;

      // 只有当格子足够大时才显示色号（放宽阈值，避免看不到）
      if (visualCell < 15) {
        console.log('[CodeOverlay] 格子太小，不显示色号:', visualCell);
        return;
      }

      // 计算字体大小（确保不超出格子）
      const maxFontSize = Math.min(cellSize * 0.5, 10);
      const fontSize = Math.max(4, Math.min(maxFontSize, visualCell * 0.2));

      console.log('[CodeOverlay] 开始绘制色号:', {
        cellSize,
        visualCell,
        fontSize,
        gridSize
      });

      // 遍历网格，绘制色号
      let drawnCount = 0;
      let nonWhiteCount = 0;
      let missCodeCount = 0;
      let sampleMissColor = '';

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
            if (!sampleMissColor) sampleMissColor = color;
            continue;
          }

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          this._drawCode(ctx, color, code, px, py, fontSize, dpr);
          drawnCount++;
        }
      }

      console.log('[CodeOverlay] 色号绘制完成:', {
        drawnCount,
        nonWhiteCount,
        missCodeCount
      });
    },

    /**
     * 绘制单个色号
     */
    _drawCode(ctx, color, code, cx, cy, fontSize, dpr) {
      if (!code) return;

      // 获取文字颜色（根据背景色自动选择黑色或白色）
      const textColor = this._getCodeTextColor(color);

      // 设置字体（使用更清晰的字体）
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 像素对齐
      const alignedX = Math.round(cx * dpr) / dpr;
      const alignedY = Math.round(cy * dpr) / dpr;

      // 直接绘制填充文字（不绘制描边，避免白边）
      ctx.fillStyle = textColor;
      ctx.fillText(code, alignedX, alignedY);
    },

    /**
     * 根据背景色获取文字颜色
     */
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

    /**
     * 外部调用：强制重绘
     */
    redraw() {
      this.drawCodes();
    }
  }
});
