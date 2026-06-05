// 沉浸式拼豆页面 - Canvas 2D 版本
const request = require('../../utils/request');
const { drawImmersiveBase, drawImmersiveText, drawImmersiveGridLines, getTextColor } = require('../../utils/canvas2d/renderers/immersiveRenderer');
const { getScheduler } = require('../../utils/canvas2d/renderScheduler');
const storage = require('../../utils/storage');

const PINCH_PREVIEW_RENDER_INTERVAL_MS = 96;
const PINCH_PREVIEW_SCALE_DELTA = 0.08;
const EDGE_BACK_GESTURE_WIDTH = 24;

Page({
  data: {
    gridSize: 32,
    canvasSize: 320,
    displayWidth: 320,
    displayHeight: 320,
    boardInset: 0,
    boardCanvasSize: 320,
    gridData: [],
    palette: [],
    tab: 'color',
    highlightId: '',
    contrast: 50,
    completedMap: {},
    rowList: [],
    colList: [],
    remainingByColor: {},
    canvasReady: false,
    textCanvasReady: false,
    gridCanvasReady: false,
    loading: true,
    panelExpanded: false,
    panelHeight: 360,
    gridPaddingBottom: 400,
  },
  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _textCanvas: null,
  _textCtx: null,
  _textDpr: 1,
  _gridCanvas: null,
  _gridCtx: null,
  _gridDpr: 1,
  _hRun: [],
  _vRun: [],
  _longPressTimer: null,
  
  // 视口
  _viewScale: 1,
  _viewOffsetX: 0,
  _viewOffsetY: 0,
  _maxScale: 3,
  _minScale: 1,
  _containerRect: null,

  // 触摸相关
  _isPinching: false,
  _isDragging: false,
  _touchStartDistance: 0,
  _touchStartScale: 1,
  _touchStartOffsetX: 0,
  _touchStartOffsetY: 0,
  _touchStartCenterX: 0,
  _touchStartCenterY: 0,
  _pinchContentX: 0,
  _pinchContentY: 0,
  _dragStartX: 0,
  _dragStartY: 0,
  _lastTapTime: 0,
  _lastTapX: 0,
  _lastTapY: 0,
  _rpxToPx: 1,
  _panelTouchStartY: null,
  _panelStartHeight: null,
  _panelMoved: false,
  _windowWidth: 375,
  _windowHeight: 667,
  _renderResizeTimer: null,
  _destroyed: false,
  _scheduler: null,
  _systemDpr: 1,
  _pinchPreviewRenderTimer: null,
  _pendingPinchPreviewScale: null,
  _lastPinchPreviewScale: 1,
  _lastPinchPreviewRenderAt: 0,
  _edgeBackGesture: false,

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    this._rpxToPx = info.windowWidth / 750;
    this._windowWidth = info.windowWidth;
    this._windowHeight = info.windowHeight;
    this._scheduler = getScheduler();
    this._systemDpr = info.pixelRatio || 1;

    // 动态计算导航栏高度（与 page-nav-bar 组件逻辑完全一致）
    const statusBarHeight = info.statusBarHeight || 20;
    const menuButton = wx.getMenuButtonBoundingClientRect();
    let navBarHeight;
    if (menuButton) {
      const menuCenter = menuButton.top + menuButton.height / 2;
      const navTop = menuCenter - 16;
      navBarHeight = navTop + 42;
    } else {
      navBarHeight = statusBarHeight + 50;
    }

    // 底部安全区（iPhone X+ 的 Home Indicator）
    let safeAreaBottom = 0;
    if (info.safeArea && typeof info.safeArea.bottom === 'number' && typeof info.screenHeight === 'number') {
      safeAreaBottom = Math.max(0, info.screenHeight - info.safeArea.bottom);
    }

    // 底部面板高度：紧凑态 rpx → px，并限制不超过屏幕 55%
    const maxPanelRpx = Math.floor(info.windowHeight * 0.55 / this._rpxToPx);
    const compactPanelRpx = Math.min(this._getCompactPanelHeight(), maxPanelRpx);
    const compactPanelPx = compactPanelRpx * this._rpxToPx;

    // 可视区域 = 窗口高度 - 导航栏 - 底部面板（含安全区）
    const topReserve = navBarHeight;
    const bottomReserve = compactPanelPx + safeAreaBottom;
    const displayWidth = Math.floor(info.windowWidth - 32);
    const displayHeight = Math.floor(Math.max(220, info.windowHeight - topReserve - bottomReserve));

    // 画布内容（网格）最大尺寸
    const maxByHeight = Math.max(220, info.windowHeight - topReserve - bottomReserve - 16);
    const maxSize = Math.min(info.windowWidth - 48, maxByHeight, 600);
    const canvasSize = Math.floor(maxSize);

    // grid-preview 底部留白，确保 canvas 在面板上方可见区域内居中
    const gridPaddingBottom = Math.ceil((compactPanelPx + safeAreaBottom) / this._rpxToPx);

    this.setData({
      canvasSize,
      displayWidth,
      displayHeight,
      boardCanvasSize: canvasSize,
      panelHeight: compactPanelRpx,
      gridPaddingBottom
    });

    // 加载数据
    this._loadData(options);
  },

  onUnload() {
    this._destroyed = true;
    this._saveProgress();
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    if (this._renderResizeTimer) {
      clearTimeout(this._renderResizeTimer);
      this._renderResizeTimer = null;
    }
    this._clearPinchPreviewRenderTimer();
  },

  // ========== 数据加载 ==========
  _loadData(options) {
    const storageKey = options.storageKey;
    const boxId = options.boxId ? parseInt(options.boxId, 10) : null;

    if (storageKey) {
      this._loadFromStorage(storageKey);
    } else if (boxId) {
      this._loadFromBoxId(boxId);
    } else {
      wx.showToast({ title: '数据加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  _loadFromStorage(storageKey) {
    try {
      const data = storage.getJSON(storageKey, null);
      if (!data) throw new Error('数据不存在');
      
      this._initWithData(data);
    } catch (e) {
      console.error('加载数据失败:', e);
      wx.showToast({ title: '数据加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  _loadFromBoxId(boxId) {
    request.get('/box/detail/' + boxId)
      .then((box) => {
        if (!box) throw new Error('图纸不存在');
        
        const data = {
          gridSize: box.gridSize || 32,
          mappedPixelData: this._parseMappedData(box.mappedPixelData),
          colorStats: this._buildColorStats(box),
          completedMap: this._parseProgress(box.focusProgress),
          boxId: box.id
        };
        
        this._confirmRestoreProgress(data);
      })
      .catch((err) => {
        console.error('加载图纸失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      });
  },

  _parseMappedData(data) {
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        return [];
      }
    }
    return data;
  },

  _buildColorStats(box) {
    const mappedData = this._parseMappedData(box.mappedPixelData);
    const stats = new Map();
    
    mappedData.forEach((row) => {
      (row || []).forEach((cell) => {
        if (!cell || cell.isExternal) return;
        const key = cell.id;
        if (!stats.has(key)) {
          stats.set(key, {
            id: cell.id,
            name: cell.name || cell.id,
            r: Number(cell.r),
            g: Number(cell.g),
            b: Number(cell.b),
            hex: cell.hex || '',
            count: 0
          });
        }
        stats.get(key).count += 1;
      });
    });
    
    return Array.from(stats.values()).sort((a, b) => b.count - a.count);
  },

  _parseProgress(progressData) {
    if (!progressData) return {};
    try {
      const data = typeof progressData === 'string' ? JSON.parse(progressData) : progressData;
      return data.completedMap || {};
    } catch (e) {
      return {};
    }
  },

  _initWithData(data) {
    const gridSize = data.gridSize || 32;
    const mappedData = data.mappedPixelData || [];
    const colorStats = data.colorStats || [];
    const completedMap = data.completedMap || {};
    
    const gridData = [];
    for (let y = 0; y < gridSize; y++) {
      const row = [];
      for (let x = 0; x < gridSize; x++) {
        const cell = mappedData[y] && mappedData[y][x];
        if (cell && !cell.isExternal) {
          row.push({
            id: cell.id,
            r: Number(cell.r),
            g: Number(cell.g),
            b: Number(cell.b),
            textColor: getTextColor(Number(cell.r), Number(cell.g), Number(cell.b))
          });
        } else {
          row.push(null);
        }
      }
      gridData.push(row);
    }
    
    const palette = colorStats.map(c => ({
      ...c,
      textColor: getTextColor(c.r, c.g, c.b)
    }));
    
    this._gridData = gridData;
    this._boxId = data.boxId || null;

    // 对齐画布尺寸到格子的整数倍，确保每个格子在物理像素上边缘清晰
    const rawCanvasSize = this.data.canvasSize;
    const snappedCanvasSize = Math.max(gridSize, Math.floor(rawCanvasSize / gridSize) * gridSize);
    const cellSize = snappedCanvasSize / gridSize;
    const boardInset = cellSize;
    const boardCanvasSize = snappedCanvasSize + boardInset * 2;

    // 初始居中：将网格内容放在全屏展示区域中央
    this._viewScale = 1;
    this._viewOffsetX = (this.data.displayWidth - boardCanvasSize) / 2;
    this._viewOffsetY = (this.data.displayHeight - boardCanvasSize) / 2;

    this.setData({
      gridSize,
      canvasSize: snappedCanvasSize,
      gridData,
      palette,
      completedMap,
      highlightId: '',
      boardInset,
      boardCanvasSize,
      loading: false
    }, () => {
      this._calcRuns();
      this._updateLists();
      // 数据加载完成后，如果 Canvas 已就绪，先 resize 再渲染
      if (this.data.canvasReady) {
        this._resizeCanvasToBoardSize(true);
      }
    });
  },

  // ========== Canvas 2D 相关 ==========
  onBaseCanvasReady(e) {
    const canvas2dComponent = this.selectComponent('#immersiveCanvas');
    if (!canvas2dComponent) return;
    const context = canvas2dComponent.getContext();
    if (!context.ready) return;
    this._canvas = context.canvas;
    this._ctx = context.ctx;
    this._dpr = context.dpr;
    this._tryCompleteCanvasInit();
  },

  onTextCanvasReady(e) {
    const canvas2dComponent = this.selectComponent('#immersiveTextCanvas');
    if (!canvas2dComponent) return;
    const context = canvas2dComponent.getContext();
    if (!context.ready) return;
    this._textCanvas = context.canvas;
    this._textCtx = context.ctx;
    this._textDpr = context.dpr;
    this.setData({ textCanvasReady: true });
    this._tryCompleteCanvasInit();
  },

  onGridCanvasReady(e) {
    const canvas2dComponent = this.selectComponent('#immersiveGridCanvas');
    if (!canvas2dComponent) return;
    const context = canvas2dComponent.getContext();
    if (!context.ready) return;
    this._gridCanvas = context.canvas;
    this._gridCtx = context.ctx;
    this._gridDpr = context.dpr;
    this.setData({ gridCanvasReady: true });
    this._tryCompleteCanvasInit();
  },

  _tryCompleteCanvasInit() {
    if (!this._ctx || !this._textCtx || !this._gridCtx || this.data.canvasReady) return;
    this.setData({ canvasReady: true }, () => {
      this._measureContainerRect(() => {
        if (this.data.boardInset > 0) {
          this._resizeCanvasToBoardSize(true);
        } else {
          this._resizeCanvasToDisplaySize(true);
        }
      });
    });
  },

  onCanvasError(e) {
    console.error('Canvas 2D Error:', e.detail);
  },

  _renderCanvas() {
    if (!this._ctx || !this._textCtx || !this._gridCtx || !this.data.canvasReady) return;
    if (!this.data.gridData || this.data.gridData.length === 0) return;

    const { canvasSize, gridSize, gridData, highlightId, completedMap, contrast, tab, boardInset,
            displayWidth, displayHeight } = this.data;

    let mode = 'colorId';
    if (tab === 'row') mode = 'horizontal';
    else if (tab === 'col') mode = 'vertical';

    const vs = this._viewScale;
    const ox = this._viewOffsetX;
    const oy = this._viewOffsetY;

    // 清空三个画布（全屏展示区域）
    [this._ctx, this._textCtx, this._gridCtx].forEach((ctx, i) => {
      const dpr = i === 0 ? this._dpr : i === 1 ? this._textDpr : this._gridDpr;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      ctx.restore();
    });

    // 基础层
    this._ctx.save();
    this._ctx.setTransform(this._dpr * vs, 0, 0, this._dpr * vs, ox * this._dpr, oy * this._dpr);
    drawImmersiveBase(this._ctx, {
      width: canvasSize, height: canvasSize, gridSize, gridData,
      highlightId, completedMap, contrast,
      boardInset: boardInset || 0
    });
    this._ctx.restore();

    // 网格线层
    this._gridCtx.save();
    this._gridCtx.setTransform(this._gridDpr * vs, 0, 0, this._gridDpr * vs, ox * this._gridDpr, oy * this._gridDpr);
    drawImmersiveGridLines(this._gridCtx, {
      width: canvasSize, height: canvasSize, gridSize,
      boardInset: boardInset || 0, gridData
    });
    this._gridCtx.restore();

    // 文字层
    this._textCtx.save();
    this._textCtx.setTransform(this._textDpr * vs, 0, 0, this._textDpr * vs, ox * this._textDpr, oy * this._textDpr);
    drawImmersiveText(this._textCtx, {
      width: canvasSize, height: canvasSize, gridSize, gridData,
      highlightId, completedMap, mode,
      hRun: this._hRun, vRun: this._vRun,
      boardInset: boardInset || 0,
      viewScale: vs
    });
    this._textCtx.restore();
  },

  _confirmRestoreProgress(data) {
    const completedMap = data && data.completedMap ? data.completedMap : {};
    if (!completedMap || Object.keys(completedMap).length === 0) {
      this._initWithData(data);
      return;
    }
    wx.showModal({
      title: '恢复进度',
      content: '检测到上次拼豆进度，是否恢复？',
      confirmText: '恢复',
      cancelText: '重新开始',
      success: (res) => {
        this._initWithData({
          ...data,
          completedMap: res.confirm ? completedMap : {}
        });
      },
      fail: () => {
        this._initWithData(data);
      }
    });
  },

  _forEachCanvasComponent(fn) {
    ['#immersiveCanvas', '#immersiveTextCanvas', '#immersiveGridCanvas'].forEach((selector) => {
      const comp = this.selectComponent(selector);
      if (comp) fn(comp, selector);
    });
  },

  _refreshCanvasContexts() {
    const base = this.selectComponent('#immersiveCanvas');
    if (base) {
      const ctx = base.getContext();
      if (ctx && ctx.ready) {
        this._canvas = ctx.canvas;
        this._ctx = ctx.ctx;
        this._dpr = ctx.dpr;
      }
    }
    const text = this.selectComponent('#immersiveTextCanvas');
    if (text) {
      const ctx = text.getContext();
      if (ctx && ctx.ready) {
        this._textCanvas = ctx.canvas;
        this._textCtx = ctx.ctx;
        this._textDpr = ctx.dpr;
      }
    }
    const grid = this.selectComponent('#immersiveGridCanvas');
    if (grid) {
      const ctx = grid.getContext();
      if (ctx && ctx.ready) {
        this._gridCanvas = ctx.canvas;
        this._gridCtx = ctx.ctx;
        this._gridDpr = ctx.dpr;
      }
    }
  },

  _resizeBothCanvases(width, height, dpr) {
    this._forEachCanvasComponent((comp) => {
      if (comp.resizeWithDpr) {
        comp.resizeWithDpr(width, height, dpr);
      }
    });
    this._refreshCanvasContexts();
  },

  _resizeCanvasToDisplaySize(immediate) {
    if (!this.data.canvasReady) return;
    const { displayWidth, displayHeight } = this.data;

    const applyResize = () => {
      this._forEachCanvasComponent((comp) => {
        if (comp.resizeSync) comp.resizeSync(displayWidth, displayHeight);
        else if (comp.resize) comp.resize(displayWidth, displayHeight);
      });
      this._refreshCanvasContexts();
      this._renderCanvas();
    };

    if (immediate) {
      if (this._renderResizeTimer) {
        clearTimeout(this._renderResizeTimer);
        this._renderResizeTimer = null;
      }
      applyResize();
    } else {
      if (this._renderResizeTimer) clearTimeout(this._renderResizeTimer);
      this._renderResizeTimer = setTimeout(() => {
        this._renderResizeTimer = null;
        applyResize();
      }, 16);
    }
  },

  _resizeCanvasToBoardSize(immediate) {
    if (!this.data.canvasReady) return;
    const { displayWidth, displayHeight } = this.data;
    const qualityDpr = this._getQualityDpr(1, 'high');

    const applyResize = () => {
      this._resizeBothCanvases(displayWidth, displayHeight, qualityDpr);
      this._renderCanvas();
    };

    if (immediate) {
      if (this._renderResizeTimer) {
        clearTimeout(this._renderResizeTimer);
        this._renderResizeTimer = null;
      }
      applyResize();
    } else {
      if (this._renderResizeTimer) clearTimeout(this._renderResizeTimer);
      this._renderResizeTimer = setTimeout(() => {
        this._renderResizeTimer = null;
        applyResize();
      }, 16);
    }
  },

  _measureContainerRect(callback) {
    if (this._destroyed || typeof wx.createSelectorQuery !== 'function') {
      if (callback) callback();
      return;
    }

    wx.createSelectorQuery()
      .in(this)
      .select('.canvas-container')
      .boundingClientRect((rect) => {
        if (rect) {
          this._containerRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }
        if (callback) callback();
      })
      .exec();
  },

  // ========== 计算横竖计数 ==========
  _calcRuns() {
    const { gridSize, highlightId, gridData } = this.data;
    const h = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    const v = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    
    if (!highlightId || !gridData.length) {
      this._hRun = h;
      this._vRun = v;
      return;
    }
    
    // 横向计数
    for (let y = 0; y < gridSize; y++) {
      let run = 0;
      for (let x = 0; x < gridSize; x++) {
        const cell = gridData[y] && gridData[y][x];
        if (cell && cell.id === highlightId) {
          run += 1;
          h[y][x] = run;
        } else {
          run = 0;
        }
      }
    }
    
    // 竖向计数
    for (let x = 0; x < gridSize; x++) {
      let run = 0;
      for (let y = 0; y < gridSize; y++) {
        const cell = gridData[y] && gridData[y][x];
        if (cell && cell.id === highlightId) {
          run += 1;
          v[y][x] = run;
        } else {
          run = 0;
        }
      }
    }
    
    this._hRun = h;
    this._vRun = v;
  },

  // ========== 更新列表数据 ==========
  _updateLists() {
    this._updateRemainingByColor();
    this._updateRowList();
    this._updateColList();
  },

  _updateRemainingByColor() {
    const { gridData, completedMap, palette } = this.data;
    const remaining = {};
    
    palette.forEach(c => {
      remaining[c.id] = 0;
    });
    
    gridData.forEach(row => {
      row.forEach(cell => {
        if (cell && !completedMap[cell.id]) {
          remaining[cell.id] = (remaining[cell.id] || 0) + 1;
        }
      });
    });
    
    this.setData({ remainingByColor: remaining });
  },

  _updateRowList() {
    const { gridSize, gridData, completedMap } = this.data;
    const rowList = [];
    
    for (let y = 0; y < gridSize; y++) {
      let remaining = 0;
      let allDone = true;
      
      for (let x = 0; x < gridSize; x++) {
        const cell = gridData[y] && gridData[y][x];
        if (cell) {
          if (!completedMap[cell.id]) {
            remaining++;
            allDone = false;
          }
        }
      }
      
      rowList.push({
        index: y,
        value: String(y),
        remaining,
        allDone
      });
    }
    
    this.setData({ rowList });
  },

  _updateColList() {
    const { gridSize, gridData, completedMap } = this.data;
    const colList = [];
    
    for (let x = 0; x < gridSize; x++) {
      let remaining = 0;
      let allDone = true;
      
      for (let y = 0; y < gridSize; y++) {
        const cell = gridData[y] && gridData[y][x];
        if (cell) {
          if (!completedMap[cell.id]) {
            remaining++;
            allDone = false;
          }
        }
      }
      
      colList.push({
        index: x,
        value: String(x),
        remaining,
        allDone
      });
    }
    
    this.setData({ colList });
  },

  // ========== 交互事件 ==========
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab }, () => {
      this._renderCanvas();
    });
  },

  onContrastChange(e) {
    const contrast = parseInt(e.detail.value, 10);
    this.setData({ contrast }, () => {
      this._renderCanvas();
    });
  },

  onCardTap(e) {
    if (this._longPressTimer) return;
    
    const { type, value } = e.currentTarget.dataset;
    const currentId = this.data.highlightId;
    
    let nextId = '';
    if (type === 'color') {
      nextId = currentId === value ? '' : value;
    } else if (type === 'row' || type === 'col') {
      nextId = currentId === value ? '' : value;
    }
    
    this.setData({ highlightId: nextId }, () => {
      this._calcRuns();
      this._renderCanvas();
    });
  },

  onCardLongPress(e) {
    const { type, value } = e.currentTarget.dataset;
    
    this._longPressTimer = setTimeout(() => {
      this._longPressTimer = null;
      this._markComplete(type, value);
      wx.vibrateShort();
    }, 500);
  },

  _markComplete(type, value) {
    const { gridData, completedMap } = this.data;
    const newMap = { ...completedMap };
    
    if (type === 'color') {
      if (newMap[value]) {
        delete newMap[value];
      } else {
        newMap[value] = true;
      }
    } else if (type === 'row') {
      const y = parseInt(value, 10);
      const ids = new Set();
      gridData[y].forEach(cell => {
        if (cell) ids.add(cell.id);
      });
      ids.forEach(id => {
        newMap[id] = true;
      });
    } else if (type === 'col') {
      const x = parseInt(value, 10);
      const ids = new Set();
      gridData.forEach(row => {
        const cell = row[x];
        if (cell) ids.add(cell.id);
      });
      ids.forEach(id => {
        newMap[id] = true;
      });
    }
    
    this.setData({ completedMap: newMap }, () => {
      this._updateLists();
      this._renderCanvas();
      this._saveProgress();
    });
  },

  onResetAll() {
    wx.showModal({
      title: '重置进度',
      content: '确定要重置所有进度吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            completedMap: {},
            highlightId: '',
            tab: 'color',
            contrast: 50
          }, () => {
            this._updateLists();
            this._renderCanvas();
            this._saveProgress();
          });
        }
      }
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  // ========== 保存进度 ==========
  _getCompactPanelHeight() {
    return 400;
  },

  _getExpandedPanelHeight() {
    const maxRpx = Math.floor(this._windowHeight * 0.72 / this._rpxToPx);
    return Math.min(760, maxRpx);
  },

  onTogglePanel() {
    if (this._panelMoved) {
      this._panelMoved = false;
      return;
    }

    const panelExpanded = !this.data.panelExpanded;
    this.setData({
      panelExpanded,
      panelHeight: panelExpanded ? this._getExpandedPanelHeight() : this._getCompactPanelHeight()
    });
  },

  onPanelTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    if (this._shouldIgnoreEdgeBackGesture(e, true)) return;
    this._panelTouchStartY = e.touches[0].clientY;
    this._panelStartHeight = this.data.panelHeight;
    this._panelMoved = false;
  },

  onPanelTouchMove(e) {
    if (this._shouldIgnoreEdgeBackGesture(e)) return;
    if (this._panelTouchStartY === null || !e.touches || !e.touches.length) return;

    const currentY = e.touches[0].clientY;
    const deltaY = this._panelTouchStartY - currentY;
    if (Math.abs(deltaY) > 4) this._panelMoved = true;

    const minHeight = this._getCompactPanelHeight();
    const maxHeight = this._getExpandedPanelHeight();
    let panelHeight = this._panelStartHeight + deltaY / this._rpxToPx;
    panelHeight = Math.max(minHeight, Math.min(maxHeight, panelHeight));

    this.setData({
      panelHeight,
      panelExpanded: panelHeight > (minHeight + maxHeight) / 2
    });
  },

  onPanelTouchEnd() {
    if (this._edgeBackGesture) {
      this._edgeBackGesture = false;
      return;
    }

    if (this._panelTouchStartY === null) return;

    const minHeight = this._getCompactPanelHeight();
    const maxHeight = this._getExpandedPanelHeight();
    const panelExpanded = this.data.panelHeight > (minHeight + maxHeight) / 2;

    this.setData({
      panelExpanded,
      panelHeight: panelExpanded ? maxHeight : minHeight
    });

    this._panelTouchStartY = null;
    this._panelStartHeight = null;
    setTimeout(() => {
      this._panelMoved = false;
    }, 0);
  },

  _saveProgress() {
    const { completedMap, gridData } = this.data;
    const boxId = this._boxId;
    
    if (!boxId) return;
    let focusCompletedCells = 0;
    let focusTotalCells = 0;
    (gridData || []).forEach((row) => {
      (row || []).forEach((cell) => {
        if (!cell) return;
        focusTotalCells += 1;
        if (completedMap[cell.id]) focusCompletedCells += 1;
      });
    });
    const focusProgress = JSON.stringify({ completedMap });
    
    request.post('/box/progress', {
      boxId: boxId,
      focusProgress,
      progressData: focusProgress,
      focusCompletedCells,
      focusTotalCells
    }).catch(() => {});
  },

  // ========== 触摸事件（Canvas 变换缩放，不动 CSS） ==========
  _getCanvasOffsetForTouch(centerX, centerY) {
    const rect = this._containerRect;
    if (!rect) return { x: centerX - this._windowWidth / 2, y: centerY - this._windowHeight / 2 };
    return { x: centerX - rect.left, y: centerY - rect.top };
  },

  _shouldIgnoreEdgeBackGesture(e, isStart = false) {
    const touches = e && e.touches ? e.touches : [];
    if (isStart) {
      this._edgeBackGesture = touches.length === 1 && touches[0] && touches[0].clientX <= EDGE_BACK_GESTURE_WIDTH;
    }
    return this._edgeBackGesture;
  },

  handleTouchStart(e) {
    const touches = e.touches;
    if (this._shouldIgnoreEdgeBackGesture(e, true)) return;

    if (touches.length === 2) {
      this._isPinching = true;
      this._isDragging = false;
      this._scheduler.startGesture();

      const touch1 = touches[0];
      const touch2 = touches[1];
      this._touchStartDistance = this._getDistance(touch1, touch2);
      this._touchStartScale = this._viewScale;
      this._touchStartOffsetX = this._viewOffsetX;
      this._touchStartOffsetY = this._viewOffsetY;
      const center = this._getTouchCenter(touch1, touch2);
      this._touchStartCenterX = center.clientX;
      this._touchStartCenterY = center.clientY;

      const pos = this._getCanvasOffsetForTouch(center.clientX, center.clientY);
      this._pinchContentX = (pos.x - this._touchStartOffsetX) / Math.max(this._touchStartScale, 0.001);
      this._pinchContentY = (pos.y - this._touchStartOffsetY) / Math.max(this._touchStartScale, 0.001);
      return;
    }

    if (touches.length === 1) {
      const touch = touches[0];
      const now = Date.now();
      const dt = now - (this._lastTapTime || 0);
      const dx = (touch.clientX || 0) - (this._lastTapX || 0);
      const dy = (touch.clientY || 0) - (this._lastTapY || 0);

      if (dt > 0 && dt <= 300 && dx * dx + dy * dy <= 30 * 30) {
        this._resetViewport();
        this._lastTapTime = 0;
        return;
      }

      this._lastTapTime = now;
      this._lastTapX = touch.clientX || 0;
      this._lastTapY = touch.clientY || 0;

      this._isDragging = true;
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
      this._touchStartOffsetX = this._viewOffsetX;
      this._touchStartOffsetY = this._viewOffsetY;
    }
  },

  handleTouchMove(e) {
    const touches = e.touches;
    if (this._shouldIgnoreEdgeBackGesture(e)) return;

    // 双指缩放
    if (touches.length === 2 && this._isPinching) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const currentDistance = this._getDistance(touch1, touch2);
      if (!this._touchStartDistance) return;

      const scaleChange = currentDistance / this._touchStartDistance;
      let newScale = this._touchStartScale * scaleChange;
      newScale = Math.max(this._minScale, Math.min(this._maxScale, newScale));

      const currentCenter = this._getTouchCenter(touch1, touch2);
      const pos = this._getCanvasOffsetForTouch(currentCenter.clientX, currentCenter.clientY);
      const nextOffsetX = pos.x - this._pinchContentX * newScale;
      const nextOffsetY = pos.y - this._pinchContentY * newScale;

      this._viewScale = newScale;
      this._viewOffsetX = nextOffsetX;
      this._viewOffsetY = nextOffsetY;

      this._requestPinchPreviewRender(newScale);
      return;
    }

    // 单指拖拽
    if (touches.length === 1 && this._isDragging) {
      const deltaX = touches[0].clientX - this._dragStartX;
      const deltaY = touches[0].clientY - this._dragStartY;
      this._viewOffsetX = this._touchStartOffsetX + deltaX;
      this._viewOffsetY = this._touchStartOffsetY + deltaY;
      this._scheduleDragRender();
    }
  },

  handleTouchEnd(e) {
    if (this._edgeBackGesture) {
      this._edgeBackGesture = false;
      this._isPinching = false;
      this._isDragging = false;
      return;
    }

    if (this._isPinching) {
      this._isPinching = false;
      this._clearPinchPreviewRenderTimer();
      this._scheduler.endGesture(() => {
        if (this._destroyed) return;
        this._applyHighQualityRender();
      });
    }
    this._isPinching = false;
    this._isDragging = false;
  },

  _scheduleDragRender() {
    if (this._dragRenderScheduled) return;
    this._dragRenderScheduled = true;
    // 使用 Canvas 2D 的 requestAnimationFrame（微信环境支持）
    const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    raf(() => {
      this._dragRenderScheduled = false;
      if (this._destroyed) return;
      this._renderCanvas();
    });
  },

  _clearPinchPreviewRenderTimer() {
    if (this._pinchPreviewRenderTimer) {
      clearTimeout(this._pinchPreviewRenderTimer);
      this._pinchPreviewRenderTimer = null;
    }
    this._pendingPinchPreviewScale = null;
  },

  _requestPinchPreviewRender(scale) {
    this._pendingPinchPreviewScale = scale;
    const scaleDelta = Math.abs((scale || 1) - (this._lastPinchPreviewScale || 1));
    if (this._pinchPreviewRenderTimer || scaleDelta < PINCH_PREVIEW_SCALE_DELTA) return;

    const elapsed = Date.now() - (this._lastPinchPreviewRenderAt || 0);
    const delay = Math.max(0, PINCH_PREVIEW_RENDER_INTERVAL_MS - elapsed);
    this._pinchPreviewRenderTimer = setTimeout(() => {
      this._pinchPreviewRenderTimer = null;
      const nextScale = this._pendingPinchPreviewScale || this._viewScale || 1;
      this._pendingPinchPreviewScale = null;
      this._lastPinchPreviewScale = nextScale;
      this._lastPinchPreviewRenderAt = Date.now();
      this._applyGestureQualityRender(nextScale);
    }, delay);
  },

  _getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  _getTouchCenter(touch1, touch2) {
    return {
      clientX: ((touch1.clientX || 0) + (touch2.clientX || 0)) / 2,
      clientY: ((touch1.clientY || 0) + (touch2.clientY || 0)) / 2
    };
  },

  _resetViewport() {
    const { displayWidth, displayHeight, boardCanvasSize } = this.data;
    const boardSize = boardCanvasSize || this.data.canvasSize;
    this._viewScale = 1;
    this._viewOffsetX = (displayWidth - boardSize) / 2;
    this._viewOffsetY = (displayHeight - boardSize) / 2;
    this._lastPinchPreviewScale = 1;
    const qualityDpr = this._getQualityDpr(1, 'high');
    this._resizeBothCanvases(displayWidth, displayHeight, qualityDpr);
    this._renderCanvas();
  },

  _getQualityScale() {
    const gridSize = Math.max(1, this.data.gridSize || 32);
    if (gridSize <= 52) return 3;
    if (gridSize <= 78) return 2.75;
    if (gridSize <= 104) return 2.5;
    return 1.5;
  },

  _getQualityDpr(scale, mode) {
    const maxSide = Math.max(this.data.displayWidth, this.data.displayHeight, this.data.boardCanvasSize || 320);
    const safeScale = Math.max(1, scale || 1);
    const qualityScale = this._getQualityScale();
    const qualityFactor = mode === 'high' ? qualityScale : Math.max(1, qualityScale * 0.4);
    const targetDpr = this._systemDpr * safeScale * qualityFactor;
    const maxDprBySize = 3072 / Math.max(1, maxSide);
    return Math.max(1, Math.min(targetDpr, maxDprBySize));
  },

  _restoreSystemDpr() {
    const { displayWidth, displayHeight } = this.data;
    const qualityDpr = this._getQualityDpr(this._viewScale, 'high');
    this._resizeBothCanvases(displayWidth, displayHeight, qualityDpr);
    this._renderCanvas();
  },

  _applyHighQualityRender() {
    const scale = this._viewScale;
    this._lastPinchPreviewScale = scale || 1;
    this._lastPinchPreviewRenderAt = Date.now();
    this._applyCanvasQualityRender(scale, 'high');
  },

  _applyGestureQualityRender(scale) {
    this._applyCanvasQualityRender(scale, 'low');
  },

  _applyCanvasQualityRender(scale, mode) {
    const { displayWidth, displayHeight } = this.data;
    const newDpr = this._getQualityDpr(scale || 1, mode || 'high');
    this._resizeBothCanvases(displayWidth, displayHeight, newDpr);
    this._renderCanvas();
  }
});
