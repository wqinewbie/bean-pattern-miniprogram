// 拼豆画板 - Canvas 2D 版本
const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const storage = require('../../utils/storage');
const { drawBoard, drawPixel } = require('../../utils/canvas2d/renderers/boardRenderer');
const { getScheduler } = require('../../utils/canvas2d/renderScheduler');
const { resize2dCanvas } = require('../../utils/canvas2d/core');
const HistoryManager = require('../../utils/canvas2d/HistoryManager');
const PixelStore = require('./module/pixelStore');
const CanvasRenderer = require('./module/canvasRenderer');
const ColorBarManager = require('./module/colorBarManager');
const Magnifier = require('./module/magnifier');
const ToolEngine = require('./module/toolEngine');

// 画板内置基础色板（工具层默认，非拼豆品牌色）
const DEFAULT_COLORS = ['#FFFFFF','#000000','#FF0000','#00FF00','#0000FF','#FFFF00','#FF6B35','#FF69B4','#00CED1','#9370DB','#FFA500','#008B8B','#DC143C','#32CD32','#4169E1','#FFD700','#808080','#2F4F4F','#FF6B6B','#90EE90','#87CEEB','#DDA0DD','#F0E68C','#E6E6FA'];
const MAX_GRID_SIZE = 200;
const MIN_GRID_SIZE = 24;
const SIZE_LIMIT_TIP = '超出限值，数值范围24~200';
const BASE_PRESET_SIZES = [24, 36, 50, 52, 64, 78, 104, 200];
const PIXEL_EDITOR_ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
const LOCAL_RECOVERY_KEY = 'draw_local_recovery_v1';
const LEFT_TOOLBAR_SAFE_RPX = 96;
const BOTTOM_COLORBAR_VISUAL_SAFE_RPX = 220;
const PINCH_SCALE_DEADZONE = 0.018;
const PINCH_PAN_DEADZONE_PX = 2;
const PINCH_SMOOTHING = 0.28;
const MAX_REALTIME_PHYSICAL_SIZE = 3072;

Page({
  data: {
    gridSize: 52,
    canvasWidth: 320,
    canvasHeight: 320,
    coordinateCellSize: 0,
    coordinateLabelFontSize: 8,
    boardInset: 0,
    boardCanvasWidth: 320,
    boardCanvasHeight: 320,
    gridCellSize: 320 / 52,
    majorGridSizePx: 320 / 52 * 5,
    gridLineWidth: 1,
    majorLineWidth: 2,
    tool: 'pen',
    brushSize: 1,
    showGrid: true,
    symmetry: false,
    mirror: false,
    locked: false,
    activeLayer: 'canvas',
    showCanvas: true,
    showBackground: false,
    backgroundImage: '',
    backgroundImageWidth: 0,
    backgroundImageHeight: 0,
    backgroundMirror: false,
    hasPixels: false,
    currentColor: '',
    currentCode: '',
    colors: DEFAULT_COLORS,
    colorsWithCode: [],
    showColorModal: false,
    colorCount: 0,
    loading: false,
    loadingText: '处理中...',
    canUndo: false,
    canRedo: false,
    source: 'blank',
    storageKey: '',
    brand: 'MARD',
    brandList: [],
    brandIndex: 0,
    presetSizes: BASE_PRESET_SIZES.filter((size) => size <= MAX_GRID_SIZE),
    isPresetSize: true,
    customSize: '',
    sizeDropdownOpen: false,
    brandDropdownOpen: false,
    paletteDropdownOpen: false,
    kitList: [],
    selectedKitId: null,
    selectedKitName: '',
    colorPalette: [],
    statusBarHeight: 20,
    showSettings: false,
    settingsClosing: false,
    colorbarExpanded: false,
    colorbarHeight: 340,
    usedColors: [],
    virtualColorsWithCode: [],
    virtualColorsOffsetTop: 0,
    virtualColorsTotalHeight: 0,
    colorsRow1: [],
    colorsRow2: [],
    canvasReady: false,
    canvas2dComponent: null,
    canvasOffsetX: 0,
    canvasOffsetY: 0,
    canvasScale: 1,
    currentZoomLabel: '100%',
    overlayScale: 1,
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1,
    canvasAreaWidth: 0, // 完美版：canvas-area 宽度
    canvasAreaHeight: 0, // 完美版：canvas-area 高度
    canvasAreaLeft: 0,
    canvasAreaTop: 0,
    minCanvasScale: 0.5,
    maxCanvasScale: 6,
    // 标准架构：去掉 stageOffsetX/Y/Scale，锁定模式通过同步变量实现
    showColorReplaceModal: false,
    replaceTargetColor: '',
    // 拖动色块替换
    isDraggingColor: false,
    disableColorScroll: false,
    draggingColor: '',
    draggingColorCode: '',
    dragX: 0,
    dragY: 0,
    dragTargetColor: '',
    // 吸色放大镜
    showMagnifier: false,
    magnifierX: 0,
    magnifierY: 0,
    magnifierColor: '#FFFFFF',
    magnifierData: [],
    showReplaceModal: false,
    replaceSourceColor: '',
    replaceSourceCode: '',
    replaceTargetColor: '',
    isPinching: false
  },

  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _gridData: null,
  _cellSize: 10,
  _history: null,  // 使用 HistoryManager 替代旧 undo/redo 栈
  _isDrawing: false,
  _isDragging: false,
  _lastPos: null,
  _dragStartX: 0,
  _dragStartY: 0,
  _canvasRect: null,
  _originalGridData: null,
  _originalColorPalette: null,
  _renderTimer: null,
  _pendingChangedCells: new Set(),
  _colorUsageMap: new Map(),
  _nonWhiteCount: 0,
  _lastHasPixelsValue: null,
  _colorCodeMapCacheKey: '',
  _colorCodeMapCache: null,
  _colorRgbCacheKey: '',
  _colorRgbCache: null,
  _renderScheduler: null, // 完美版：渲染调度器
  _canvasRenderer: null,
  _colorBarManager: null,
  _magnifierModule: null,
  _toolEngine: null,
  _rpxToPx: 0.5,
  _pendingDrawPos: null, // 完美版：待绘制位置（防误触）
  _pendingDrawTime: 0, // 完美版：待绘制时间（防误触）
  
  // 拖拽和缩放优化
  _touchStartDistance: 0,
  _touchStartScale: 1,
  _isPinching: false,
  _lastTouchTime: 0,
  _velocityX: 0,
  _velocityY: 0,
  _animationFrame: null,
  _minScale: 0.5,
  // 移除固定的 _maxScale，改用动态方法 _getMaxScale()
  _compositeRect: null,
  _cachedCompositeCanvas: null,
  _isCompositing: false,
  _localSaveTimer: null,
  _isRestoringLocalDraft: false,

  _getActiveTransformTarget() {
    if (this.data.activeLayer === 'background' && !this.data.locked && this.data.backgroundImage) {
      return 'background';
    }
    return 'canvas';
  },

  /**
   * 动态计算最大缩放倍率
   * 根据画布大小返回不同的最大缩放，确保性能和稳定性
   */
  _getMaxScale() {
    const canvasWidth = this.data.canvasWidth || 320;

    // 小画布（≤400px）：允许 6 倍放大，享受高清体验
    if (canvasWidth <= 400) {
      return 6;
    }

    // 中画布（≤700px）：允许 5 倍放大，DPR 会自动降低
    if (canvasWidth <= 700) {
      return 5;
    }

    // 大画布（>700px）：限制 3 倍，保持稳定性
    return 3;
  },

  _getSystemPixelRatio() {
    try {
      const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : null;
      return Math.max(1, Number(deviceInfo && deviceInfo.pixelRatio) || 1);
    } catch (_) {
      return 1;
    }
  },

  _getInitialQualityScale(gridSize = this.data.gridSize) {
    const size = Math.max(1, Number(gridSize) || 1);
    if (size <= 52) return 3;
    if (size <= 78) return 2;
    if (size <= 104) return 1.5;
    return 1.15;
  },

  _getGridOverlayMetrics(viewScale) {
    const scale = Math.max(Number(viewScale) || 1, 0.1);
    const screenThin = 1;
    const screenThick = 1;
    return {
      gridLineWidth: Math.max(screenThin / scale, 0.02),
      majorLineWidth: Math.max(screenThick / scale, 0.04)
    };
  },

  _getEventTouches(e) {
    const sourceTouches = (e && Array.isArray(e.touches))
      ? e.touches
      : (e && e.detail && Array.isArray(e.detail.touches) ? e.detail.touches : []);

    return sourceTouches.map((touch) => {
      const clientX = Number.isFinite(touch && touch.clientX)
        ? touch.clientX
        : (Number.isFinite(touch && touch.pageX) ? touch.pageX : touch && touch.x);
      const clientY = Number.isFinite(touch && touch.clientY)
        ? touch.clientY
        : (Number.isFinite(touch && touch.pageY) ? touch.pageY : touch && touch.y);

      return {
        ...touch,
        clientX: Number.isFinite(clientX) ? clientX : 0,
        clientY: Number.isFinite(clientY) ? clientY : 0,
        pageX: Number.isFinite(touch && touch.pageX) ? touch.pageX : (Number.isFinite(clientX) ? clientX : 0),
        pageY: Number.isFinite(touch && touch.pageY) ? touch.pageY : (Number.isFinite(clientY) ? clientY : 0),
        x: Number.isFinite(touch && touch.x) ? touch.x : (Number.isFinite(clientX) ? clientX : 0),
        y: Number.isFinite(touch && touch.y) ? touch.y : (Number.isFinite(clientY) ? clientY : 0)
      };
    });

  },

  _hasUsableTouchPoints(touches) {
    return Array.isArray(touches) && touches.every((touch) =>
      touch &&
      Number.isFinite(touch.clientX) &&
      Number.isFinite(touch.clientY)
    );
  },

  _getEventTimestamp(e) {
    if (e && Number.isFinite(e.timeStamp)) return e.timeStamp;
    if (e && e.detail && Number.isFinite(e.detail.timeStamp)) return e.detail.timeStamp;
    return Date.now();
  },

  _scheduleGestureFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16);
  },

  _cancelGestureFrame(id) {
    if (!id) return;
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(id);
      return;
    }
    clearTimeout(id);
  },

  _startPendingDrawStroke(nextPos = null) {
    const startPos = this._pendingDrawPos;
    if (!startPos || this._isDrawing || this._isPinching) return false;

    this._isDrawing = true;
    this._lastPos = startPos;
    this._beginStrokeUndo();
    this._dirtyRect = { x1: startPos.col, y1: startPos.row, x2: startPos.col, y2: startPos.row };

    if (nextPos && (nextPos.row !== startPos.row || nextPos.col !== startPos.col)) {
      this._paintLine(startPos.row, startPos.col, nextPos.row, nextPos.col);
      this._lastPos = nextPos;
    } else {
      this._paintPixel(startPos.row, startPos.col);
    }

    this._pendingDrawPos = null;
    this._pendingDrawTime = 0;
    return true;
  },

  _endRenderGesture() {
    if (this._renderScheduler && typeof this._renderScheduler.endGesture === 'function') {
      this._renderScheduler.endGesture();
    }
  },

  _maybeStartPinchFromTouches(touches, now) {
    if (touches.length < 2 || this._isPinching || !this._hasUsableTouchPoints(touches)) {
      return false;
    }
    return this._beginPinchGesture(touches, now);
  },

  _shouldIgnoreContainerTouchEvent(e) {
    const detailTouches = e && e.detail && Array.isArray(e.detail.touches) ? e.detail.touches : null;
    return !detailTouches && this._lastCanvasTouchEventAt && (Date.now() - this._lastCanvasTouchEventAt) < 80;
  },

  _setCanvasTransform(updates) {
    const nextCanvasScale = updates.canvasScale == null ? this.data.canvasScale : updates.canvasScale;
    const nextUpdates = this._isPinching
      ? {
        ...updates,
        isPinching: true
      }
      : {
        ...updates,
        currentZoomLabel: this._getZoomLabel(nextCanvasScale),
        overlayScale: nextCanvasScale,
        isPinching: false,
        ...this._getGridOverlayMetrics(nextCanvasScale)
      };

    this.setData(nextUpdates, () => {
      if (this._canvasRenderer && !this._isPinching) {
        this._canvasRenderer.setLowQualityMode(false);
      }
    });
  },

  _applyDragDelta(deltaX, deltaY) {
    if (!deltaX && !deltaY) return;

    if (this.data.locked && this.data.backgroundImage) {
      this.setData({
        canvasOffsetX: this.data.canvasOffsetX + deltaX,
        canvasOffsetY: this.data.canvasOffsetY + deltaY,
        backgroundOffsetX: this.data.backgroundOffsetX + deltaX,
        backgroundOffsetY: this.data.backgroundOffsetY + deltaY
      });
      return;
    }

    const target = this._getActiveTransformTarget();
    if (target === 'background') {
      this.setData({
        backgroundOffsetX: this.data.backgroundOffsetX + deltaX,
        backgroundOffsetY: this.data.backgroundOffsetY + deltaY
      });
    } else {
      this.setData({
        canvasOffsetX: this.data.canvasOffsetX + deltaX,
        canvasOffsetY: this.data.canvasOffsetY + deltaY
      });
    }
  },

  _flushPendingDragFrame() {
    if (this._dragRafId) {
      this._cancelGestureFrame(this._dragRafId);
      this._dragRafId = null;
    }

    const curX = this._dragCurrentX;
    const curY = this._dragCurrentY;
    if (curX == null || curY == null) return;

    const deltaX = curX - this._dragStartX;
    const deltaY = curY - this._dragStartY;
    this._applyDragDelta(deltaX, deltaY);
    this._dragStartX = curX;
    this._dragStartY = curY;
  },

  _beginPinchGesture(touches, now) {
    if (!Array.isArray(touches) || touches.length < 2) return false;

    if (this._isDrawing && !this._isPinching) {
      this._isDrawing = false;
      this._lastPos = null;
      if (this._history && this._history.getState().canUndo && (now - this._lastTouchTime) < 200) {
        this.onUndo();
      }
    }

    this._pendingDrawPos = null;
    this._isPinching = true;
    this._isDrawing = false;
    this._isDragging = false;
    this._viewportHistoryBefore = this._viewportHistoryBefore || this._createViewportMetaSnapshot();

    if (this._canvasRenderer) this._canvasRenderer.setLowQualityMode(true);
    this.setData({ isPinching: true, overlayScale: this.data.canvasScale });

    if (this.data.showMagnifier) {
      this.setData({ showMagnifier: false });
    }
    this._cachedCompositeCanvas = null;
    this._compositeRect = null;

    if (!this._toolBeforePinch) {
      this._toolBeforePinch = this.data.tool;
    }

    const touch1 = touches[0];
    const touch2 = touches[1];
    this._touchStartDistance = this._getDistance(touch1, touch2);
    this._touchStartScale = this.data.canvasScale;
    this._touchStartBackgroundScale = this.data.backgroundScale;
    this._lockScaleRatio = (this.data.canvasScale > 0)
      ? (this.data.backgroundScale / this.data.canvasScale)
      : 1;

    this._pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
    this._pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
    this._pinchStartCenterX = this._pinchCenterX;
    this._pinchStartCenterY = this._pinchCenterY;
    this._pinchConfirmed = false;
    this._smoothedPinchScaleChange = 1;
    this._smoothedPinchCenterX = this._pinchCenterX;
    this._smoothedPinchCenterY = this._pinchCenterY;

    this._touchStartCanvasOffsetX = this.data.canvasOffsetX;
    this._touchStartCanvasOffsetY = this.data.canvasOffsetY;
    this._touchStartBackgroundOffsetX = this.data.backgroundOffsetX;
    this._touchStartBackgroundOffsetY = this.data.backgroundOffsetY;
    return true;
  },

  onWxsPinchStart() {
    const now = Date.now();
    this._lastCanvasTouchEventAt = now;

    if (this._isDrawing && !this._isPinching) {
      this._isDrawing = false;
      this._lastPos = null;
      if (this._history && this._history.getState().canUndo && (now - this._lastTouchTime) < 200) {
        this.onUndo();
      }
    }

    this._pendingDrawPos = null;
    this._pendingDrawTime = 0;
    this._lastPos = null;
    this._pendingPinch = null;
    this._canvasRect = null;
    if (this._pinchRafId) {
      this._cancelGestureFrame(this._pinchRafId);
      this._pinchRafId = null;
    }

    this._isPinching = true;
    this._isDrawing = false;
    this._isDragging = false;
    this._viewportHistoryBefore = this._viewportHistoryBefore || this._createViewportMetaSnapshot();

    if (this._canvasRenderer) this._canvasRenderer.setLowQualityMode(true);
    if (this.data.showMagnifier) {
      this.setData({ showMagnifier: false });
    }

    this._cachedCompositeCanvas = null;
    this._compositeRect = null;

    if (!this._toolBeforePinch) {
      this._toolBeforePinch = this.data.tool;
    }

    const updates = {
      isPinching: true,
      overlayScale: this.data.canvasScale
    };
    this.setData(updates);
  },

  onWxsPinchMove(state = {}) {
    this._lastCanvasTouchEventAt = Date.now();
    this._pendingWxsPinchRenderState = state;

    if (this._pinchResizeRafId) return;
    this._pinchResizeRafId = this._scheduleGestureFrame(() => {
      this._pinchResizeRafId = null;
      const pendingState = this._pendingWxsPinchRenderState;
      this._pendingWxsPinchRenderState = null;
      this._renderRealtimePinchResolution(pendingState);
    });
  },

  _renderRealtimePinchResolution(state = {}) {
    // 固定高清预算模式：双指缩放期间只让 WXS/CSS transform 改视觉尺寸，
    // 不再按实时 scale 重分配 canvas backing store，避免内存抖动。
  },

  onWxsPinchEnd(state = {}) {
    const toFinite = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    this._lastCanvasTouchEventAt = Date.now();
    this._isPinching = false;
    this._isDrawing = false;
    this._lastPos = null;
    this._pendingDrawPos = null;
    this._pendingDrawTime = 0;
    this._canvasRect = null;
    this._pendingPinch = null;
    if (this._pinchRafId) {
      this._cancelGestureFrame(this._pinchRafId);
      this._pinchRafId = null;
    }
    if (this._pinchResizeRafId) {
      this._cancelGestureFrame(this._pinchResizeRafId);
      this._pinchResizeRafId = null;
    }
    this._pendingWxsPinchRenderState = null;
    this._renderRealtimePinchResolution(state);
    this._endRenderGesture();

    const nextScale = toFinite(state.canvasScale, this.data.canvasScale);
    const updates = {
      canvasOffsetX: toFinite(state.canvasOffsetX, this.data.canvasOffsetX),
      canvasOffsetY: toFinite(state.canvasOffsetY, this.data.canvasOffsetY),
      canvasScale: nextScale,
      overlayScale: nextScale,
      currentZoomLabel: this._getZoomLabel(nextScale),
      isPinching: false,
      ...this._getGridOverlayMetrics(nextScale)
    };

    if (this.data.backgroundImage) {
      updates.backgroundOffsetX = toFinite(state.backgroundOffsetX, this.data.backgroundOffsetX);
      updates.backgroundOffsetY = toFinite(state.backgroundOffsetY, this.data.backgroundOffsetY);
      updates.backgroundScale = toFinite(state.backgroundScale, this.data.backgroundScale);
    }

    const remainingTouches = Math.max(0, Math.floor(toFinite(state.remainingTouches, 0)));

    if (remainingTouches === 0 && this._toolBeforePinch) {
      updates.tool = this._toolBeforePinch;
      this._toolBeforePinch = null;
    }

    this.setData(updates, () => {
      if (this._canvasRenderer) this._canvasRenderer.setLowQualityMode(false);
      this._updateAxisLabels();
      this._updateCanvasAreaRect();
      this._updateCanvasRect();
      this._pushViewportHistory(this._viewportHistoryBefore, 'viewport');
      this._viewportHistoryBefore = null;
      this._scheduleLocalRecoveryDraft();
    });
  },

  onWxsDragStart() {
    this._lastCanvasTouchEventAt = Date.now();
    this._isDragging = true;
    this._pendingDrawPos = null;
    this._viewportHistoryBefore = this._viewportHistoryBefore || this._createViewportMetaSnapshot();

    if (this._renderScheduler) {
      this._renderScheduler.startGesture();
    }
  },

  onWxsDragEnd(state = {}) {
    const toFinite = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    this._lastCanvasTouchEventAt = Date.now();
    this._isDragging = false;
    this._endRenderGesture();

    const updates = {};
    if (this.data.locked && this.data.backgroundImage) {
      updates.canvasOffsetX = toFinite(state.canvasOffsetX, this.data.canvasOffsetX);
      updates.canvasOffsetY = toFinite(state.canvasOffsetY, this.data.canvasOffsetY);
      updates.backgroundOffsetX = toFinite(state.backgroundOffsetX, this.data.backgroundOffsetX);
      updates.backgroundOffsetY = toFinite(state.backgroundOffsetY, this.data.backgroundOffsetY);
    } else if (this._getActiveTransformTarget() === 'background') {
      updates.backgroundOffsetX = toFinite(state.backgroundOffsetX, this.data.backgroundOffsetX);
      updates.backgroundOffsetY = toFinite(state.backgroundOffsetY, this.data.backgroundOffsetY);
    } else {
      updates.canvasOffsetX = toFinite(state.canvasOffsetX, this.data.canvasOffsetX);
      updates.canvasOffsetY = toFinite(state.canvasOffsetY, this.data.canvasOffsetY);
    }

    this.setData(updates, () => {
      this._updateCanvasAreaRect();
      this._updateCanvasRect();
      this._pushViewportHistory(this._viewportHistoryBefore, 'viewport');
      this._viewportHistoryBefore = null;
      this._scheduleLocalRecoveryDraft();
    });
  },

  _getTargetRenderDpr(scale, mode) {
    if (this._layoutRenderDpr) {
      return Math.max(1, Number(this._layoutRenderDpr) || 1);
    }

    const baseWidth = Math.max(1, Number(this.data.boardCanvasWidth || this.data.canvasWidth) || 1);
    const baseHeight = Math.max(1, Number(this.data.boardCanvasHeight || this.data.canvasHeight) || 1);
    const systemDpr = Math.max(1, this._dpr || this._getSystemPixelRatio());
    const maxDprByWidth = MAX_REALTIME_PHYSICAL_SIZE / baseWidth;
    const maxDprByHeight = MAX_REALTIME_PHYSICAL_SIZE / baseHeight;
    const targetDpr = Math.min(systemDpr * this._getInitialQualityScale(), maxDprByWidth, maxDprByHeight);

    return Math.max(1, targetDpr);
  },

  _syncCanvasResolution(force = false, options = {}) {
    if (!this._canvas || !this._ctx) return false;

    const width = Math.max(1, Number(this.data.boardCanvasWidth || this.data.canvasWidth) || 1);
    const height = Math.max(1, Number(this.data.boardCanvasHeight || this.data.canvasHeight) || 1);
    const targetDpr = this._getTargetRenderDpr();
    const resolutionKey = [width, height, targetDpr.toFixed(3)].join(':');

    if (!force && this._renderResolutionKey === resolutionKey) {
      this._renderDpr = targetDpr;
      return false;
    }

    resize2dCanvas({
      canvas: this._canvas,
      ctx: this._ctx,
      width,
      height,
      dpr: targetDpr
    });

    this._renderDpr = targetDpr;
    this._renderResolutionKey = resolutionKey;
    return true;
  },

  _clampGridSize(size) {
    const n = parseInt(size, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, n));
  },

  /**
   * 完美实现：缓存 canvas-area 的位置，用于坐标转换
   */
  _updateCanvasAreaRect() {
    wx.createSelectorQuery()
      .select('.canvas-area')
      .boundingClientRect()
      .exec((res) => {
        if (res && res[0]) {
          this._canvasAreaRect = res[0];
          
          // 完美版：同步更新到 data，供组件使用
          this.setData({
            canvasAreaWidth: res[0].width,
            canvasAreaHeight: res[0].height,
            canvasAreaLeft: res[0].left || 0,
            canvasAreaTop: res[0].top || 0,
            minCanvasScale: this._minScale || 0.5,
            maxCanvasScale: this._getMaxScale()
          });
          
        }
      });
  },

  _resolveCanvasAreaRect(callback) {
    if (this._canvasAreaRect && this._canvasAreaRect.width && this._canvasAreaRect.height) {
      callback(this._canvasAreaRect);
      return;
    }

    wx.createSelectorQuery()
      .select('.canvas-area')
      .boundingClientRect()
      .exec((res) => {
        const rect = res && res[0];
        if (!rect || !rect.width || !rect.height) {
          callback(null);
          return;
        }

        this._canvasAreaRect = rect;
        this.setData({
          canvasAreaWidth: rect.width,
          canvasAreaHeight: rect.height,
          canvasAreaLeft: rect.left || 0,
          canvasAreaTop: rect.top || 0,
          minCanvasScale: this._minScale || 0.5,
          maxCanvasScale: this._getMaxScale()
        });
        callback(rect);
      });
  },

  _createRecoveryStateObject() {
    this._ensurePixelStoreFromGrid();
    const pixelSnapshot = this._pixelStore ? this._pixelStore.createSnapshot() : null;

    return {
      gridData: null,
      pixelSnapshot: pixelSnapshot ? {
        gridSize: pixelSnapshot.gridSize,
        palette: pixelSnapshot.palette,
        indicesPacked: this._packPixelIndices(pixelSnapshot.indices)
      } : null,
      gridSize: this.data.gridSize,
      canvasOffsetX: this.data.canvasOffsetX,
      canvasOffsetY: this.data.canvasOffsetY,
      canvasScale: this.data.canvasScale,
      backgroundOffsetX: this.data.backgroundOffsetX,
      backgroundOffsetY: this.data.backgroundOffsetY,
      backgroundScale: this.data.backgroundScale,
      backgroundMirror: !!this.data.backgroundMirror,
      locked: !!this.data.locked,
      showBackground: !!this.data.showBackground,
      backgroundImage: this.data.backgroundImage || ''
    };
  },

  _snapshotState() {
    const state = this._createRecoveryStateObject();
    return JSON.stringify(state);
  },

  _packPixelIndices(indices) {
    if (!indices || !indices.length) return '';
    const chunkSize = 0x8000;
    let packed = '';
    for (let i = 0; i < indices.length; i += chunkSize) {
      const chunk = indices.subarray ? indices.subarray(i, i + chunkSize) : indices.slice(i, i + chunkSize);
      packed += String.fromCharCode.apply(null, chunk);
    }
    return packed;
  },

  _unpackPixelIndices(packed) {
    if (typeof packed !== 'string' || !packed.length) return new Uint16Array(0);
    const indices = new Uint16Array(packed.length);
    for (let i = 0; i < packed.length; i++) {
      indices[i] = packed.charCodeAt(i);
    }
    return indices;
  },

  _restoreState(snapshotInput) {
    if (!snapshotInput) return;
    let snapshot = snapshotInput;
    if (typeof snapshotInput === 'string') {
      try {
        snapshot = JSON.parse(snapshotInput);
      } catch (e) {
        return;
      }
    }
    if (!snapshot || (!Array.isArray(snapshot.gridData) && !snapshot.pixelSnapshot)) return;

    if (snapshot.pixelSnapshot && snapshot.pixelSnapshot.gridSize) {
      const rawIndices = snapshot.pixelSnapshot.indices;
      const indexArray = rawIndices && typeof rawIndices === 'object'
        ? Object.keys(rawIndices)
          .filter((key) => /^\d+$/.test(key))
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => rawIndices[key])
        : [];
      const typedSnapshot = {
        gridSize: snapshot.pixelSnapshot.gridSize,
        palette: Array.isArray(snapshot.pixelSnapshot.palette) ? snapshot.pixelSnapshot.palette : [''],
        indices: snapshot.pixelSnapshot.indicesPacked
          ? this._unpackPixelIndices(snapshot.pixelSnapshot.indicesPacked)
          : rawIndices instanceof Uint16Array
          ? rawIndices
          : new Uint16Array(Array.isArray(rawIndices) ? rawIndices : indexArray)
      };
      this._ensurePixelStoreFromGrid();
      this._pixelStore.restoreSnapshot(typedSnapshot);
    } else {
      this._gridData = snapshot.gridData;
      this._pixelStore = PixelStore.fromGridData(this._gridData);
    }
    this._rebuildColorStatsFromGrid();

    // 问题2修复：恢复 gridSize，如果尺寸改变则重新计算画布
    const needResizeCanvas = snapshot.gridSize != null && snapshot.gridSize !== this.data.gridSize;
    
    if (needResizeCanvas) {
      const layout = this._getSnappedCanvasLayout(snapshot.gridSize);
      const canvasSize = layout.canvasSize;
      this._layoutRenderDpr = layout.renderDpr;
      this._renderResolutionKey = '';
      this.setData({
        gridSize: snapshot.gridSize,
        canvasWidth: canvasSize,
        canvasHeight: canvasSize,
        coordinateCellSize: layout.coordinateCellSize,
        boardInset: layout.boardInset,
        boardCanvasWidth: layout.boardCanvasWidth,
        boardCanvasHeight: layout.boardCanvasHeight,
        gridCellSize: layout.cellSize,
        majorGridSizePx: layout.cellSize * 5,
        canvasOffsetX: snapshot.canvasOffsetX == null ? this.data.canvasOffsetX : snapshot.canvasOffsetX,
        canvasOffsetY: snapshot.canvasOffsetY == null ? this.data.canvasOffsetY : snapshot.canvasOffsetY,
        canvasScale: snapshot.canvasScale == null ? this.data.canvasScale : snapshot.canvasScale,
        overlayScale: snapshot.canvasScale == null ? this.data.overlayScale : snapshot.canvasScale,
        backgroundOffsetX: snapshot.backgroundOffsetX == null ? this.data.backgroundOffsetX : snapshot.backgroundOffsetX,
        backgroundOffsetY: snapshot.backgroundOffsetY == null ? this.data.backgroundOffsetY : snapshot.backgroundOffsetY,
        backgroundScale: snapshot.backgroundScale == null ? this.data.backgroundScale : snapshot.backgroundScale,
        backgroundMirror: snapshot.backgroundMirror == null ? this.data.backgroundMirror : snapshot.backgroundMirror,
        locked: snapshot.locked == null ? this.data.locked : snapshot.locked,
        showBackground: snapshot.showBackground == null ? this.data.showBackground : snapshot.showBackground,
        backgroundImage: snapshot.backgroundImage == null ? this.data.backgroundImage : snapshot.backgroundImage
      });
      this._updateAxisLabels();
    } else {
      this.setData({
        canvasOffsetX: snapshot.canvasOffsetX == null ? this.data.canvasOffsetX : snapshot.canvasOffsetX,
        canvasOffsetY: snapshot.canvasOffsetY == null ? this.data.canvasOffsetY : snapshot.canvasOffsetY,
        canvasScale: snapshot.canvasScale == null ? this.data.canvasScale : snapshot.canvasScale,
        overlayScale: snapshot.canvasScale == null ? this.data.overlayScale : snapshot.canvasScale,
        backgroundOffsetX: snapshot.backgroundOffsetX == null ? this.data.backgroundOffsetX : snapshot.backgroundOffsetX,
        backgroundOffsetY: snapshot.backgroundOffsetY == null ? this.data.backgroundOffsetY : snapshot.backgroundOffsetY,
        backgroundScale: snapshot.backgroundScale == null ? this.data.backgroundScale : snapshot.backgroundScale,
        backgroundMirror: snapshot.backgroundMirror == null ? this.data.backgroundMirror : snapshot.backgroundMirror,
        locked: snapshot.locked == null ? this.data.locked : snapshot.locked,
        showBackground: snapshot.showBackground == null ? this.data.showBackground : snapshot.showBackground,
        backgroundImage: snapshot.backgroundImage == null ? this.data.backgroundImage : snapshot.backgroundImage
      });
    }

    this._updateCanvasRect();
    this._drawFullGrid();
    this._updateUsedColors();
    this._updateHasPixels();
  },

  _normalizeColor(color) {
    // 透明仅由 null/undefined/空字符串 表示；白色是有效可绘制颜色
    if (color === null || color === undefined || color === '') return null;
    return String(color).toUpperCase();
  },

  _ensurePixelStoreFromGrid() {
    if (this._pixelStore && this._pixelStore.gridSize === this.data.gridSize) return;
    const fallbackGrid = Array.isArray(this._gridData) ? this._gridData : [];
    this._pixelStore = fallbackGrid.length
      ? PixelStore.fromGridData(fallbackGrid)
      : new PixelStore(this.data.gridSize || 0);
  },

  _getPixelColor(row, col) {
    this._ensurePixelStoreFromGrid();
    const color = this._pixelStore ? this._pixelStore.getPixelHex(row, col) : '';
    return color || null;
  },

  _getPixelColorByOffset(offset) {
    this._ensurePixelStoreFromGrid();
    const color = this._pixelStore ? this._pixelStore.getPixelHexByOffset(offset) : '';
    return color || null;
  },

  _setPixelColor(row, col, color) {
    this._ensurePixelStoreFromGrid();
    if (!this._pixelStore) return false;
    return this._pixelStore.setPixelHex(row, col, color);
  },

  _scheduleUsedColorsUpdate() {
    if (this._usedColorsTimer) clearTimeout(this._usedColorsTimer);
    this._usedColorsTimer = setTimeout(() => {
      this._usedColorsTimer = null;
      this._updateUsedColors();
    }, 300);
  },

  _bumpColorCount(color, delta) {
    const c = this._normalizeColor(color);
    if (c === null) return; // 透明色不计数
    const next = (this._colorUsageMap.get(c) || 0) + delta;
    if (next <= 0) this._colorUsageMap.delete(c);
    else this._colorUsageMap.set(c, next);
    this._nonWhiteCount = Math.max(0, this._nonWhiteCount + delta);
  },

  _rebuildColorStatsFromGrid() {
    this._ensurePixelStoreFromGrid();
    this._colorUsageMap = this._pixelStore ? this._pixelStore.getColorUsageMap() : new Map();
    this._nonWhiteCount = 0;
    this._colorUsageMap.forEach((count) => {
      this._nonWhiteCount += count;
    });
    if (this._canvasRenderer) this._canvasRenderer.invalidatePixelLayer();
  },

  _getOverlayColorCodeMap() {
    const colorsWithCode = this.data.colorsWithCode || [];
    const cacheKey = colorsWithCode
      .map((item) => `${item && item.hex ? String(item.hex).toUpperCase() : ''}:${item && item.code ? item.code : ''}`)
      .join('|');
    if (this._colorCodeMapCache && this._colorCodeMapCacheKey === cacheKey) {
      return this._colorCodeMapCache;
    }

    const colorCodeMap = {};
    colorsWithCode.forEach((item) => {
      if (item && item.hex && item.code) {
        colorCodeMap[item.hex.toUpperCase()] = item.code;
      }
    });
    this._colorCodeMapCacheKey = cacheKey;
    this._colorCodeMapCache = colorCodeMap;
    return colorCodeMap;
  },

  _getColorItemByHex(hex) {
    if (!hex) return null;
    const code = this._getOverlayColorCodeMap()[String(hex).toUpperCase()];
    return code ? { hex: String(hex).toUpperCase(), code } : null;
  },

  _getColorRgbList() {
    const colors = this.data.colors || [];
    const cacheKey = colors.map((color) => String(color || '').toUpperCase()).join('|');
    if (this._colorRgbCache && this._colorRgbCacheKey === cacheKey) {
      return this._colorRgbCache;
    }

    this._colorRgbCacheKey = cacheKey;
    this._colorRgbCache = colors
      .map((color) => {
        const rgb = this._hexToRGB(color);
        return rgb ? { color, rgb } : null;
      })
      .filter(Boolean);
    return this._colorRgbCache;
  },

  _getRenderState() {
    const pinchRenderState = this._pinchRenderState || {};
    return {
      canvasWidth: this.data.canvasWidth,
      canvasHeight: this.data.canvasHeight,
      boardCanvasWidth: this.data.boardCanvasWidth || this.data.canvasWidth,
      boardCanvasHeight: this.data.boardCanvasHeight || this.data.canvasHeight,
      boardInset: this.data.boardInset || 0,
      gridSize: this.data.gridSize,
      showGrid: true,
      renderCodes: true,
      canvasScale: pinchRenderState.canvasScale == null ? this.data.canvasScale : pinchRenderState.canvasScale,
      backgroundImage: this.data.backgroundImage,
      dpr: this._dpr,
      renderDpr: this._renderDpr
    };
  },

  _queueRenderChangedPixels(changedCells) {
    if (!changedCells || changedCells.size === 0) return;
    
    // 确保队列存在
    if (!this._pendingChangedCells) {
      this._pendingChangedCells = new Set();
    }
    
    // 合并到待渲染队列
    changedCells.forEach((k) => this._pendingChangedCells.add(k));
    
    // 如果已有待执行的渲染，直接返回（合并到同一批次）
    if (this._renderTimer) return;
    
    // 使用短延迟合并渲染（约一帧时间）
    this._renderTimer = setTimeout(() => {
      const cells = new Set(this._pendingChangedCells);
      this._pendingChangedCells.clear();
      this._renderTimer = null;
      this._renderChangedPixels(cells);
      this._scheduleLocalRecoveryDraft();
    }, 16);
  },

  onLoad(options) {
    const { storageKey, source } = options;
    const info = wx.getSystemInfoSync();
    this._rpxToPx = (Number(info.windowWidth) || 375) / 750;
    const statusBarHeight = info.statusBarHeight || 20;
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const capsuleHeight = menuButton.height || 32;
    const capsuleTop = menuButton.top - statusBarHeight || 6;
    const navBarHeight = capsuleHeight + capsuleTop * 2;
    
    // 完美版：初始化渲染调度器
    this._renderScheduler = getScheduler();
    this._canvasRenderer = new CanvasRenderer({
      getColorCodeMap: () => this._getOverlayColorCodeMap(),
      getState: () => this._getRenderState(),
      getPixelColor: (row, col) => this._getPixelColor(row, col),
      getPixelColorByOffset: (offset) => this._getPixelColorByOffset(offset)
    });
    this._colorBarManager = new ColorBarManager({
      getState: () => this.data
    });
    this._magnifierModule = new Magnifier({
      size: 100
    });
    this._toolEngine = new ToolEngine({
      getGridSize: () => this.data.gridSize,
      getPixel: (row, col) => this._getPixelColor(row, col),
      setPixel: (row, col, color) => this._setPixelColor(row, col, color),
      paintPixel: (row, col, paintOptions) => this._paintPixel(row, col, paintOptions)
    });
    
    this.setData({
      storageKey: storageKey || '',
      source: source || 'blank',
      statusBarHeight: statusBarHeight,
      capsuleHeight: capsuleHeight,
      capsuleTop: capsuleTop,
      navBarHeight: navBarHeight
    });
    
    // 加载品牌和色卡数据
    this.loadBrandsAndPalettes();
    
    // 初始化颜色行
    this._updateColorRows();
    
    if ((source === 'result' || source === 'ai-result' || source === 'preview') && storageKey) {
      this._loadDrawData(storageKey);
    } else if (options.draftId) {
      this._loadDraftForEdit(options.draftId);
    } else {
      this._initData();
      this._tryRestoreLocalDraft();
    }
  },

  loadBrandsAndPalettes() {
    request.get('/bead/brands').then((data) => {
      if (!data || typeof data !== 'object') throw new Error('empty brands');
      const brandNames = Object.keys(data);
      if (!brandNames.length) throw new Error('empty brands');

      const brandList = brandNames.map((name) => name.toUpperCase());
      const firstBrand = brandList[0];

      this.setData({
        brandList: brandList,
        brand: firstBrand,
        brandIndex: 0,
        _brandKitsMap: data
      });

      // 加载第一个品牌的默认色卡
      this.loadPaletteColors(firstBrand);
    }).catch(() => {
      // 失败时使用默认值
      console.error('加载品牌列表失败，使用默认值');
      this.setData({
        brandList: [],
        brand: 'MARD',
        brandIndex: 0,
        colors: DEFAULT_COLORS
      }, () => {
        this._updateColorRows();
      });
    });
  },

  loadPaletteColors(brandName) {
    // 先获取品牌ID
    request.get('/bead/brand-list').then((brandList) => {
      if (!brandList || !brandList.length) throw new Error('empty brand list');
      
      // 查找匹配的品牌
      const brand = brandList.find(b => b.name.toLowerCase() === brandName.toLowerCase());
      if (!brand) throw new Error('brand not found');
      
      // 保存品牌ID
      this._currentBrandId = brand.id;
      
      // 根据品牌ID获取套餐列表
      return request.get(`/bead/brands/${brand.id}/kits`);
    }).then((kits) => {
      if (!kits || !kits.length) throw new Error('empty kits');

      // 如果从编辑模式进入，根据 colorCount 选择匹配的色卡套餐
      let selectedKit = kits[0];
      const targetColorCount = this._editSourceColorCount;
      if (targetColorCount > 0) {
        const exactMatch = kits.find(k => (k.colorCount || 0) === targetColorCount);
        if (exactMatch) {
          selectedKit = exactMatch;
        } else {
          // 找最接近但不小于 targetColorCount 的套餐
          const sorted = [...kits].sort((a, b) => (a.colorCount || 0) - (b.colorCount || 0));
          const larger = sorted.find(k => (k.colorCount || 0) >= targetColorCount);
          if (larger) selectedKit = larger;
          else selectedKit = sorted[sorted.length - 1];
        }
      }

      // 保存套餐列表，选择匹配的套餐
      this.setData({
        kitList: kits,
        selectedKitId: selectedKit.id,
        selectedKitName: selectedKit.name
      });

      // 加载匹配套餐的色号
      return this.loadKitColors(selectedKit.id);
    }).catch((err) => {
      console.error('加载套餐列表失败:', err);
      // 失败时使用默认颜色
      this.setData({ colors: DEFAULT_COLORS });
      this._updateColorRows();
    });
  },

  loadKitColors(kitId) {
    return request.get(`/bead/kits/${kitId}/colors`).then((colorList) => {
      if (!colorList || !colorList.length) throw new Error('empty colors');
      
      // 保存完整的颜色数据（包含色号）
      const colorsWithCode = colorList.map(c => ({
        hex: c.hex,
        code: c.code || c.name || '',
        sortKey: c.code || c.name || ''
      }));
      
      // 按色号排序（A01, A02, ..., A10, A11, ...）
      colorsWithCode.sort((a, b) => {
        // 提取字母和数字部分
        const matchA = a.sortKey.match(/^([A-Z]+)(\d+)$/);
        const matchB = b.sortKey.match(/^([A-Z]+)(\d+)$/);
        
        if (matchA && matchB) {
          // 先按字母排序
          if (matchA[1] !== matchB[1]) {
            return matchA[1].localeCompare(matchB[1]);
          }
          // 再按数字排序
          return parseInt(matchA[2]) - parseInt(matchB[2]);
        }
        
        // 如果格式不匹配，按字符串排序
        return a.sortKey.localeCompare(b.sortKey);
      });
      
      const firstColor = colorsWithCode[0] || null;
      this.setData({
        colors: colorsWithCode.map(c => c.hex),
        colorsWithCode,
        currentColor: firstColor ? firstColor.hex : this.data.currentColor,
        currentCode: firstColor ? firstColor.code : this.data.currentCode
      });

      // 将套餐色号补充到 hexCodeMap 中
      if (!this._hexCodeMap) this._hexCodeMap = {};
      colorsWithCode.forEach(c => {
        if (c.hex && c.code && !this._hexCodeMap[c.hex.toUpperCase()]) {
          this._hexCodeMap[c.hex.toUpperCase()] = c.code;
        }
      });

      this._updateColorRows();
      this._updateUsedColors();
      if (this._canvasRenderer) this._canvasRenderer.invalidateCodeLayer();
      this._drawFullGrid();
    }).catch((err) => {
      console.error('加载套餐色号失败:', err);
      throw err;
    });
  },

  onSelectKit(e) {
    const kitId = e.currentTarget.dataset.kitId;
    const kitName = e.currentTarget.dataset.kitName;
    
    this.setData({ 
      selectedKitId: kitId,
      selectedKitName: kitName,
      paletteDropdownOpen: false,
      virtualColorsWithCode: [],
      virtualColorsOffsetTop: 0
    });
    
    // 重新加载该套餐的色号
    this.loadKitColors(kitId);
  },

  onReady() {
    // 标准做法：在 onReady 时获取并缓存容器尺寸
    wx.createSelectorQuery()
      .select('.canvas-area')
      .boundingClientRect()
      .exec((res) => {
        if (res && res[0]) {
          this._canvasAreaRect = res[0];
          // 如果画布已经初始化，立即居中
          if (this.data.canvasWidth > 0) {
            const centered = this._getCenteredCanvasOffset(
              this.data.canvasWidth,
              this.data.canvasHeight,
              this.data.canvasScale || 1,
              res[0]
            );
            
            this.setData({
              canvasOffsetX: centered.x,
              canvasOffsetY: centered.y,
              backgroundOffsetX: centered.x,
              backgroundOffsetY: centered.y
            });
          } else {
            console.warn('[onReady] 画布尚未初始化，canvasWidth =', this.data.canvasWidth);
          }
        }
      });
  },

  onHide() {
    this._flushLocalRecoveryDraft();
  },

  onUnload() {
    this._flushLocalRecoveryDraft();
    if (this._localSaveTimer) {
      clearTimeout(this._localSaveTimer);
      this._localSaveTimer = null;
    }
    if (this._usedColorsTimer) {
      clearTimeout(this._usedColorsTimer);
      this._usedColorsTimer = null;
    }
    if (this._settingsCloseTimer) {
      clearTimeout(this._settingsCloseTimer);
      this._settingsCloseTimer = null;
    }
    if (this._pinchResizeRafId) {
      this._cancelGestureFrame(this._pinchResizeRafId);
      this._pinchResizeRafId = null;
    }
    if (this._renderScheduler && typeof this._renderScheduler.destroy === 'function') {
      this._renderScheduler.destroy();
    }
  },

  _buildLocalRecoverySnapshot() {
    this._ensurePixelStoreFromGrid();
    if (!this._pixelStore || !this._pixelStore.gridSize) return null;
    return {
      ts: Date.now(),
      state: this._createRecoveryStateObject()
    };
  },

  _saveLocalRecoveryDraft() {
    if (this._isRestoringLocalDraft) return;
    // 手势中不保存（已在 _scheduleLocalRecoveryDraft 中过滤）
    try {
      const payload = this._buildLocalRecoverySnapshot();
      if (!payload) return;
      // 使用异步存储，避免阻塞主线程
      wx.setStorage({
        key: LOCAL_RECOVERY_KEY,
        data: payload,
        fail: (e) => {
          // 异步失败时回退到同步
          try { storage.set(LOCAL_RECOVERY_KEY, payload); } catch (e2) {}
        }
      });
    } catch (e) {
      console.warn('本地恢复缓存保存失败:', e);
    }
  },

  _scheduleLocalRecoveryDraft() {
    if (this._isRestoringLocalDraft) return;
    // 手势缩放/拖拽期间跳过自动保存，避免阻塞主线程
    if (this._isPinching) return;
    if (this._localSaveTimer) clearTimeout(this._localSaveTimer);
    this._localSaveTimer = setTimeout(() => {
      this._localSaveTimer = null;
      this._saveLocalRecoveryDraft();
    }, 800);
  },

  /**
   * 手势结束后补偿一次自动保存
   */
  _onGestureEndSave() {
    if (this._localSaveTimer) clearTimeout(this._localSaveTimer);
    this._localSaveTimer = setTimeout(() => {
      this._localSaveTimer = null;
      if (!this._isPinching) this._saveLocalRecoveryDraft();
    }, 500);
  },

  _flushLocalRecoveryDraft() {
    this._saveLocalRecoveryDraft();
  },

  _clearLocalRecoveryDraft() {
    try {
      storage.remove(LOCAL_RECOVERY_KEY);
    } catch (e) {
      console.warn('清理本地恢复缓存失败:', e);
    }
  },

  _tryRestoreLocalDraft() {
    let payload = null;
    try {
      payload = storage.get(LOCAL_RECOVERY_KEY, null);
    } catch (e) {
      payload = null;
    }
    if (!payload || !payload.state) return;

    wx.showModal({
      title: '发现未完成作品',
      content: '检测到本地缓存，是否恢复上次未完成内容？',
      confirmText: '恢复',
      cancelText: '忽略',
      success: (res) => {
        if (res.confirm) {
          this._isRestoringLocalDraft = true;
          this._restoreState(payload.state);
          this._isRestoringLocalDraft = false;
        } else {
          this._clearLocalRecoveryDraft();
        }
      }
    });
  },

  onCanvasReady(e) {
    const canvas2dComponent = this.selectComponent('#drawCanvas2d');
    if (!canvas2dComponent) {
      console.error('Canvas 组件未找到');
      return;
    }
    const context = canvas2dComponent.getContext();
    if (!context.ready) {
      console.error('Canvas context 未就绪');
      return;
    }
    this._canvas = context.canvas;
    this._ctx = context.ctx;
    this._dpr = context.dpr;

    if (this._magnifierModule) {
      this._magnifierModule.init(this._canvas, this._ctx);
    }
    
    this.setData({ canvasReady: true, canvas2dComponent: canvas2dComponent });
    this._updateCanvasRect();
    this._syncCanvasResolution(false, { mode: 'high' });
    
    this._ensurePixelStoreFromGrid();
    if (this._pixelStore) this._drawFullGrid();
    
    this._updateUsedColors();
  },

  onCanvasError(e) {
    console.error('Canvas 2D Error:', e.detail);
    wx.showToast({ title: 'Canvas初始化失败', icon: 'none' });
  },

  _updateCanvasRect() {
    // 使用实际画布包裹层的 rect，统一命中与渲染坐标系
    const query = wx.createSelectorQuery();
    query.select('.canvas-wrapper').boundingClientRect();
    query.exec((res) => {
      if (res && res[0]) {
        this._canvasRect = res[0];
      } else {
        console.error('无法获取 canvas wrapper rect');
      }
    });
  },

  _loadDrawData(storageKey) {
    try {
      const drawData = storage.getJSON(storageKey, null);
      if (!drawData) { wx.showToast({ title: '数据加载失败', icon: 'none' }); this._initData(); return; }
      const { gridSize, gridData, colorPalette, brand, backgroundState, colorCount, editSourceType, draftId, boxId, name } = drawData;

      // 验证 gridData 是否存在且为数组
      if (!gridData || !Array.isArray(gridData)) {
        console.error('加载绘图数据失败: gridData 无效', { gridData });
        wx.showToast({ title: '绘图数据格式错误', icon: 'none' });
        this._initData();
        return;
      }

      const layout = this._getSnappedCanvasLayout(gridSize);
      const canvasSize = layout.canvasSize;
      const cellSize = layout.cellSize;
      this._layoutRenderDpr = layout.renderDpr;
      this._renderResolutionKey = '';
      const hexGridData = gridData.map(row => row.map(idx => {
        if (idx === -1) return null;
        const color = colorPalette[idx];
        if (!color) return '#FFFFFF';
        const { r, g, b } = color;
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      }));
      const usedColors = new Set();
      hexGridData.forEach(row => { row.forEach(color => { if (color) usedColors.add(color); }); });
      const colors = Array.from(usedColors);
      if (!colors.includes('#FFFFFF')) colors.unshift('#FFFFFF');
    this._gridData = hexGridData;
    this._pixelStore = PixelStore.fromGridData(hexGridData);
      this._rebuildColorStatsFromGrid();
      this._originalGridData = gridData;
      this._originalColorPalette = colorPalette;
      this._cellSize = cellSize;
      
      // 构建 hex → 真实色号 映射表（用于展示已使用颜色的真实色号）
      const hexCodeMap = {};
      (colorPalette || []).forEach(c => {
        if (!c || !(c.id || c.name)) return;
        let hex = c.hex;
        if (!hex && typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
          hex = '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        }
        if (hex) {
          const upperHex = String(hex).toUpperCase();
          if (!hexCodeMap[upperHex]) {
            hexCodeMap[upperHex] = c.id || c.name;
          }
        }
      });
      this._hexCodeMap = hexCodeMap;
      this._editSourceColorCount = colorCount || 0;
      this._editSourceUsedColors = colors;

      // 恢复背景图层状态
      const bgState = backgroundState ? (typeof backgroundState === 'string' ? JSON.parse(backgroundState) : backgroundState) : null;
      
      const initialColor = colors[1] || colors[0] || '#FF6B35';
      this.setData({ 
        gridSize, 
        canvasWidth: canvasSize, 
        canvasHeight: canvasSize,
        coordinateCellSize: layout.coordinateCellSize,
        boardInset: layout.boardInset,
        boardCanvasWidth: layout.boardCanvasWidth,
        boardCanvasHeight: layout.boardCanvasHeight,
        gridCellSize: layout.cellSize,
        majorGridSizePx: layout.cellSize * 5,
        gridLineWidth: 1,
        majorLineWidth: 2,
        brand: brand || 'MARD', 
        sourceRecordType: editSourceType || '',
        editingDraftId: draftId || '',
        editingBoxId: boxId || '',
        editingName: name || '',
        colorPalette, 
        colors, 
        currentColor: initialColor,
        currentCode: this._getColorCode(initialColor),
        ...(bgState ? {
          backgroundImage: bgState.backgroundImage || '',
          backgroundImageWidth: bgState.backgroundImageWidth || 0,
          backgroundImageHeight: bgState.backgroundImageHeight || 0,
          backgroundOffsetX: bgState.backgroundOffsetX || 0,
          backgroundOffsetY: bgState.backgroundOffsetY || 0,
          backgroundScale: bgState.backgroundScale || 1,
          locked: bgState.locked || false,
          showBackground: true
        } : {})
      });
      
      // 更新颜色行和已使用颜色
      this._updateColorRows();
      this._updateUsedColors();
      this._updateAxisLabels();
      if (bgState && bgState.backgroundImage) {
        this._updateBackgroundImageInfo(bgState.backgroundImage);
      }
      
      storage.remove(storageKey);
    } catch (e) {
      console.error('加载绘图数据失败:', e);
      wx.showToast({ title: '数据加载失败', icon: 'none' });
      this._initData();
    }
  },

  _loadDraftForEdit(draftId) {
    this.setData({ loading: true, loadingText: '加载草稿...' });
    request.get('/draft/detail/' + encodeURIComponent(draftId)).then((draft) => {
      const mapped = this._parseMappedPixelData(draft && draft.mappedPixelData);
      const legacy = this._deriveLegacyFromMapped(mapped);
      if (!legacy.gridData.length || !legacy.colorPalette.length) {
        throw new Error('草稿数据为空');
      }
      const storageKey = 'draw_draft_edit_' + Date.now();
      storage.setJSON(storageKey, {
        gridSize: draft.gridSize || legacy.gridData.length,
        gridData: legacy.gridData,
        colorPalette: legacy.colorPalette,
        brand: draft.brand || 'MARD',
        colorCount: draft.colorCount || legacy.colorPalette.length,
        editSourceType: 'DRAFT',
        draftId: draft.id,
        boxId: draft.boxId || null,
        name: draft.name || ''
      });
      this.setData({ loading: false, source: 'draft' });
      this._loadDrawData(storageKey);
    }).catch((err) => {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '草稿加载失败', icon: 'none' });
      this._initData();
    });
  },

  _parseMappedPixelData(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  },

  _deriveLegacyFromMapped(mappedPixelData) {
    const stats = new Map();
    const order = [];
    (mappedPixelData || []).forEach((row) => {
      (row || []).forEach((cell) => {
        if (!cell || cell.isExternal) return;
        const hex = cell.hex || (typeof cell.r === 'number' ? '#' + [cell.r, cell.g, cell.b].map(v => Number(v || 0).toString(16).padStart(2, '0')).join('').toUpperCase() : '');
        const key = String(cell.id || '') + '|' + String(hex || '');
        if (!stats.has(key)) {
          stats.set(key, {
            id: cell.id || '',
            name: cell.name || '',
            hex,
            r: Number(cell.r),
            g: Number(cell.g),
            b: Number(cell.b),
            count: 0
          });
          order.push(key);
        }
        stats.get(key).count++;
      });
    });
    const colorPalette = order.map((k, index) => ({ index, ...stats.get(k) }));
    const indexMap = new Map(order.map((k, index) => [k, index]));
    const gridData = (mappedPixelData || []).map((row) => (row || []).map((cell) => {
      if (!cell || cell.isExternal) return -1;
      const hex = cell.hex || (typeof cell.r === 'number' ? '#' + [cell.r, cell.g, cell.b].map(v => Number(v || 0).toString(16).padStart(2, '0')).join('').toUpperCase() : '');
      const key = String(cell.id || '') + '|' + String(hex || '');
      return indexMap.has(key) ? indexMap.get(key) : -1;
    }));
    return { gridData, colorPalette };
  },

  _getAdaptiveCanvasSize(gridSize = this.data.gridSize) {
    return this._getSnappedCanvasLayout(gridSize).canvasSize;
  },

  _getRawAdaptiveCanvasSize(gridSize = this.data.gridSize) {
    const info = wx.getSystemInfoSync();
    // 完整可见优先：给顶部坐标轴和底部颜色栏留出更保守空间
    const safeByWidth = Math.max(160, info.windowWidth - 96);
    const safeByHeight = Math.max(160, info.windowHeight * 0.34);
    const preferred = Math.min(safeByWidth, safeByHeight);
    const safeGridSize = Math.max(1, parseInt(gridSize, 10) || this.data.gridSize || 1);
    const cellMultiplier = Math.max(1, Math.floor(preferred / safeGridSize));
    return cellMultiplier * safeGridSize;
  },

  _getSnappedCanvasLayout(gridSize = this.data.gridSize) {
    const safeGridSize = Math.max(1, parseInt(gridSize, 10) || this.data.gridSize || 1);
    const rawCanvasSize = this._getRawAdaptiveCanvasSize(safeGridSize);
    const rawCellSize = rawCanvasSize / safeGridSize;
    const systemDpr = Math.max(1, this._dpr || this._getSystemPixelRatio());
    const qualityScale = this._getInitialQualityScale(safeGridSize);

    // 画板四周坐标轴各占 1 个 cell，物理上一起纳入实时 canvas 预算。
    const maxDprByBoard = MAX_REALTIME_PHYSICAL_SIZE / Math.max(rawCellSize * (safeGridSize + 2), 1);
    const renderDpr = Math.max(1, Math.min(systemDpr * qualityScale, maxDprByBoard));
    const maxPhysicalCellSize = Math.max(1, Math.floor(MAX_REALTIME_PHYSICAL_SIZE / (safeGridSize + 2)));
    const physicalCellSize = Math.max(1, Math.min(maxPhysicalCellSize, Math.round(rawCellSize * renderDpr)));
    const cellSize = physicalCellSize / renderDpr;
    const canvasSize = cellSize * safeGridSize;
    const boardInset = cellSize;

    return {
      canvasSize,
      canvasWidth: canvasSize,
      canvasHeight: canvasSize,
      cellSize,
      coordinateCellSize: cellSize,
      boardInset,
      boardCanvasWidth: canvasSize + boardInset * 2,
      boardCanvasHeight: canvasSize + boardInset * 2,
      renderDpr,
      physicalCellSize
    };
  },

  _initData() {
    this._applyGridSize(this.data.gridSize, false);
  },

  _applyGridSize(newGridSize, keepContent = false) {
    const layout = this._getSnappedCanvasLayout(newGridSize);
    const canvasSize = layout.canvasSize;
    this._layoutRenderDpr = layout.renderDpr;
    this._cellSize = layout.cellSize;
    this._renderResolutionKey = '';

    // 完美版：记录切换前的相对位置
    let relativePosition = null;
    if (keepContent && this._canvasAreaRect && this.data.canvasWidth > 0) {
      const oldCanvasSize = this.data.canvasWidth;
      const oldScale = this.data.canvasScale;
      const oldOffsetX = this.data.canvasOffsetX;
      const oldOffsetY = this.data.canvasOffsetY;
      const workspace = this._getVisualWorkspaceMetrics(this._canvasAreaRect);
      
      // 计算画布中心点在视觉工作区中的相对位置（0-1）
      const canvasCenterX = oldOffsetX + (oldCanvasSize * oldScale) / 2;
      const canvasCenterY = oldOffsetY + (oldCanvasSize * oldScale) / 2;
      const relativeX = workspace ? (canvasCenterX - workspace.left) / workspace.width : canvasCenterX / this._canvasAreaRect.width;
      const relativeY = workspace ? (canvasCenterY - workspace.top) / workspace.height : canvasCenterY / this._canvasAreaRect.height;
      
      relativePosition = {
        relativeX,
        relativeY,
        scale: oldScale
      };
      
    }

    this._ensurePixelStoreFromGrid();
    this._pixelStore = keepContent && this._pixelStore
      ? this._pixelStore.resize(newGridSize, true)
      : new PixelStore(newGridSize);
    this._gridData = null;
    this._rebuildColorStatsFromGrid();
    
    // 问题4修复：尺寸变更时保存状态到撤销栈，但不清空撤销栈
    if (!this._history) this._history = new HistoryManager();
    if (keepContent) {
      // 清空重做栈（因为这是新的操作分支）
      this._history.clearRedo();
    } else {
      // 全新画布，清空所有历史
      this._history.clear();
    }

    // 完美版：根据是否保持内容，决定缩放和位置
    const newScale = relativePosition ? relativePosition.scale : 1;
    const newBackgroundScale = relativePosition ? relativePosition.scale : 1;

    // 标准做法：setData 完成后计算位置
    this.setData({
      gridSize: newGridSize,
      canvasWidth: canvasSize,
      canvasHeight: canvasSize,
      coordinateCellSize: layout.coordinateCellSize,
      boardInset: layout.boardInset,
      boardCanvasWidth: layout.boardCanvasWidth,
      boardCanvasHeight: layout.boardCanvasHeight,
      gridCellSize: layout.cellSize,
      majorGridSizePx: layout.cellSize * 5,
      gridLineWidth: 1,
      majorLineWidth: 2,
      ...(this._history ? this._history.getState() : { canUndo: false, canRedo: false }),
      canvasScale: newScale,
      backgroundScale: newBackgroundScale
    }, () => {
      const applyOffset = (areaRect) => {
        if (areaRect) {
          let newOffsetX, newOffsetY;

          if (relativePosition) {
            // 完美版：按相对位置重新定位
            const workspace = this._getVisualWorkspaceMetrics(areaRect);
            const newCanvasCenterX = workspace
              ? workspace.left + relativePosition.relativeX * workspace.width
              : relativePosition.relativeX * areaRect.width;
            const newCanvasCenterY = workspace
              ? workspace.top + relativePosition.relativeY * workspace.height
              : relativePosition.relativeY * areaRect.height;
            newOffsetX = newCanvasCenterX - (canvasSize * newScale) / 2;
            newOffsetY = newCanvasCenterY - (canvasSize * newScale) / 2;
          } else {
            const centered = this._getCenteredCanvasOffset(canvasSize, canvasSize, newScale, areaRect);
            newOffsetX = centered.x;
            newOffsetY = centered.y;
          }

          this.setData({
            canvasOffsetX: newOffsetX,
            canvasOffsetY: newOffsetY,
            backgroundOffsetX: newOffsetX,
            backgroundOffsetY: newOffsetY
          });
        } else {
          setTimeout(() => {
            this._resolveCanvasAreaRect((retryRect) => {
              if (retryRect) applyOffset(retryRect);
            });
          }, 80);
        }
      };

      this._resolveCanvasAreaRect(applyOffset);
    });

    this._updateAxisLabels();
    this._updateUsedColors();
    this._updateHasPixels();
    
    // 延迟更新 rect 和绘制，确保 DOM 已渲染
    setTimeout(() => {
      this._updateCanvasRect();
      this._updateCanvasAreaRect();
      this._drawFullGrid();
      if (keepContent) this._commitState('resize');
    }, 150);
  },

  _drawFullGrid(options = {}) {
    if (!this._ctx || !this.data.canvasReady) {
      return;
    }

    if (!this._isPinching && !options.skipResolutionSync) {
      this._syncCanvasResolution(false, { mode: 'high' });
    }

    if (this._canvasRenderer) {
      this._canvasRenderer.renderFull(this._ctx);
      return;
    }

    const hasBackground = !!this.data.backgroundImage;
    const colorCodeMap = this._getOverlayColorCodeMap();
    const effectiveShowGrid = true;

    drawBoard(this._ctx, {
      width: this.data.canvasWidth,
      height: this.data.canvasHeight,
      gridSize: this.data.gridSize,
      gridData: this._gridData,
      showGrid: effectiveShowGrid,
      dpr: this._renderDpr || this._dpr,
      hasBackground,
      viewScale: this.data.canvasScale,
      colorCodeMap,
      getCellColor: (row, col) => this._getPixelColor(row, col),
      boardInset: this.data.boardInset || 0
    });
  },

  _renderChangedPixels(changedCells) {
    if (!this._ctx || !this.data.canvasReady || !changedCells || changedCells.size === 0) return;

    if (this._canvasRenderer) {
      this._canvasRenderer.markDirtyBatch(changedCells);
      this._canvasRenderer.renderDirty(this._ctx);
      return;
    }

    const colorCodeMap = this._getOverlayColorCodeMap();
    const effectiveShowGrid = true;

    changedCells.forEach((key) => {
      const [rowStr, colStr] = key.split(',');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);

      drawPixel(this._ctx, {
        width: this.data.canvasWidth,
        gridSize: this.data.gridSize,
        row,
        col,
        color: this._getPixelColor(row, col),
        showGrid: effectiveShowGrid,
        dpr: this._renderDpr || this._dpr,
        hasBackground: !!this.data.backgroundImage,
        viewScale: this.data.canvasScale,
        colorCodeMap,
        getCellColor: (r, c) => this._getPixelColor(r, c),
        boardInset: this.data.boardInset || 0
      });
    });
  },

  _beginStrokeUndo() {
    // 开始一笔画，创建增量撤销记录
    if (!this._history) this._history = new HistoryManager();
    this._strokeUndoCells = this._history.beginStroke();
  },

  _endStrokeUndo() {
    if (!this._strokeUndoCells || this._strokeUndoCells.size === 0) {
      this._strokeUndoCells = null;
      return;
    }
    if (!this._history) this._history = new HistoryManager();
    this._history.endStroke(this._strokeUndoCells);
    this._strokeUndoCells = null;
    this._hasUnsavedChanges = true;
    this.setData(this._history.getState());
    this._scheduleLocalRecoveryDraft();
  },

  _saveState() {
    this._ensurePixelStoreFromGrid();
    if (!this._pixelStore || !this._pixelStore.gridSize) return;
    if (!this._history) this._history = new HistoryManager();

    this._pendingFullState = this._createFullStateSnapshot();
  },

  _createFullStateSnapshot() {
    this._ensurePixelStoreFromGrid();

    const pixelSnapshot = this._pixelStore ? this._pixelStore.createSnapshot() : null;
    const gridCopy = null;

    const meta = {
      gridSize: this.data.gridSize,
      canvasOffsetX: this.data.canvasOffsetX,
      canvasOffsetY: this.data.canvasOffsetY,
      canvasScale: this.data.canvasScale,
      backgroundOffsetX: this.data.backgroundOffsetX,
      backgroundOffsetY: this.data.backgroundOffsetY,
      backgroundScale: this.data.backgroundScale,
      backgroundMirror: !!this.data.backgroundMirror,
      locked: !!this.data.locked,
      showBackground: !!this.data.showBackground,
      backgroundImage: this.data.backgroundImage || ''
    };

    return { fullGridData: gridCopy, pixelSnapshot, meta };
  },

  _createViewportMetaSnapshot() {
    return {
      gridSize: this.data.gridSize,
      canvasOffsetX: this.data.canvasOffsetX,
      canvasOffsetY: this.data.canvasOffsetY,
      canvasScale: this.data.canvasScale,
      backgroundOffsetX: this.data.backgroundOffsetX,
      backgroundOffsetY: this.data.backgroundOffsetY,
      backgroundScale: this.data.backgroundScale,
      backgroundMirror: !!this.data.backgroundMirror,
      locked: !!this.data.locked,
      showBackground: !!this.data.showBackground,
      backgroundImage: this.data.backgroundImage || ''
    };
  },

  _hasViewportMetaChanged(before, after) {
    if (!before || !after) return false;
    const keys = [
      'canvasOffsetX', 'canvasOffsetY', 'canvasScale',
      'backgroundOffsetX', 'backgroundOffsetY', 'backgroundScale'
    ];

    return keys.some((key) => Math.abs((Number(before[key]) || 0) - (Number(after[key]) || 0)) > 0.5);
  },

  _pushViewportHistory(previousMeta, type = 'viewport') {
    if (!previousMeta) return;
    const nextMeta = this._createViewportMetaSnapshot();
    if (!this._hasViewportMetaChanged(previousMeta, nextMeta)) return;
    if (!this._history) this._history = new HistoryManager();

    this._history.push({
      type,
      meta: nextMeta,
      _previousMeta: previousMeta
    });
    this.setData(this._history.getState());
    this._scheduleLocalRecoveryDraft();
  },

  _commitState(type = 'full') {
    if (!this._pendingFullState) return;
    if (!this._history) this._history = new HistoryManager();

    const previousState = this._pendingFullState;
    const currentState = this._createFullStateSnapshot();
    this._pendingFullState = null;

    this._history.pushFullState(
      type,
      currentState,
      previousState
    );
    this._hasUnsavedChanges = true;
    this.setData(this._history.getState());
    this._scheduleLocalRecoveryDraft();
  },

  _discardPendingState() {
    this._pendingFullState = null;
  },

  onGestureEnd(state) {
    if (!state) return;

    const nextOffsetX = state.canvasOffsetX == null ? this.data.canvasOffsetX : state.canvasOffsetX;
    const nextOffsetY = state.canvasOffsetY == null ? this.data.canvasOffsetY : state.canvasOffsetY;
    const nextScale = state.canvasScale == null ? this.data.canvasScale : state.canvasScale;

    const changed =
      nextOffsetX !== this.data.canvasOffsetX ||
      nextOffsetY !== this.data.canvasOffsetY ||
      nextScale !== this.data.canvasScale ||
      this.data.isPinching;

    if (!changed) {
      if (this._canvasRenderer) this._canvasRenderer.setLowQualityMode(false);
      return;
    }

    this.setData({
      canvasOffsetX: nextOffsetX,
      canvasOffsetY: nextOffsetY,
      canvasScale: nextScale,
      overlayScale: nextScale,
      isPinching: false
    }, () => {
      if (this._canvasRenderer) this._canvasRenderer.setLowQualityMode(false);
      this._drawFullGrid();
      this._updateAxisLabels();
      this._scheduleLocalRecoveryDraft();
    });
  },

  _getCanvasAreaMetrics() {
    if (this._canvasAreaRect && this._canvasAreaRect.width && this._canvasAreaRect.height) {
      return this._canvasAreaRect;
    }
    const width = Number(this.data.canvasAreaWidth) || 0;
    const height = Number(this.data.canvasAreaHeight) || 0;
    if (!width || !height) return null;
    return { left: 0, top: 0, width, height };
  },

  _getVisualWorkspaceMetrics(area = null) {
    const base = area || this._getCanvasAreaMetrics();
    if (!base) return null;

    const leftInset = Math.min(base.width * 0.35, LEFT_TOOLBAR_SAFE_RPX * this._rpxToPx);
    const colorbarSafeRpx = Math.min(Number(this.data.colorbarHeight) || 340, BOTTOM_COLORBAR_VISUAL_SAFE_RPX);
    const bottomInset = Math.min(base.height * 0.45, colorbarSafeRpx * this._rpxToPx);
    const width = Math.max(1, base.width - leftInset);
    const height = Math.max(1, base.height - bottomInset);

    return {
      left: leftInset,
      top: 0,
      width,
      height,
      centerX: leftInset + width / 2,
      centerY: height / 2
    };
  },

  _getCenteredCanvasOffset(canvasWidth, canvasHeight, scale, area = null) {
    const workspace = this._getVisualWorkspaceMetrics(area);
    if (!workspace) {
      const base = area || this._getCanvasAreaMetrics();
      if (!base) return { x: 0, y: 0 };
      return {
        x: (base.width - canvasWidth * scale) / 2,
        y: (base.height - canvasHeight * scale) / 2
      };
    }

    return {
      x: workspace.centerX - (canvasWidth * scale) / 2,
      y: workspace.centerY - (canvasHeight * scale) / 2
    };
  },

  _setWorkspaceScale(nextScale, options = {}) {
    const area = this._getCanvasAreaMetrics();
    if (!area) return;

    const minScale = this._minScale || 0.5;
    const maxScale = this._getMaxScale();
    const targetScale = this._maybeSnapScaleToPixelGrid(
      Math.max(minScale, Math.min(maxScale, Number(nextScale) || 1)),
      { threshold: 0.08 }
    );
    const currentCanvasScale = Math.max(Number(this.data.canvasScale) || 1, 0.0001);
    const scaleRatio = targetScale / currentCanvasScale;
    const anchorX = options.anchorX == null ? (area.width / 2) : options.anchorX;
    const anchorY = options.anchorY == null ? (area.height / 2) : options.anchorY;

    let nextCanvasOffsetX;
    let nextCanvasOffsetY;
    if (options.centerCanvas) {
      const centered = this._getCenteredCanvasOffset(this.data.canvasWidth, this.data.canvasHeight, targetScale, area);
      nextCanvasOffsetX = centered.x;
      nextCanvasOffsetY = centered.y;
    } else {
      nextCanvasOffsetX = anchorX - (anchorX - this.data.canvasOffsetX) * scaleRatio;
      nextCanvasOffsetY = anchorY - (anchorY - this.data.canvasOffsetY) * scaleRatio;
    }

    const updates = {
      canvasScale: targetScale,
      currentZoomLabel: this._getZoomLabel(targetScale),
      canvasOffsetX: nextCanvasOffsetX,
      canvasOffsetY: nextCanvasOffsetY,
      overlayScale: targetScale,
      isPinching: false
    };

    if (this.data.backgroundImage) {
      const currentBackgroundScale = Math.max(Number(this.data.backgroundScale) || 1, 0.0001);
      const nextBackgroundScale = currentBackgroundScale * scaleRatio;
      updates.backgroundScale = nextBackgroundScale;
      updates.backgroundOffsetX = anchorX - (anchorX - this.data.backgroundOffsetX) * scaleRatio;
      updates.backgroundOffsetY = anchorY - (anchorY - this.data.backgroundOffsetY) * scaleRatio;
    }

    this.setData(updates, () => {
      this._redrawCanvasAtCurrentScale();
      this._updateAxisLabels();
      if (options.historyBefore) {
        this._pushViewportHistory(options.historyBefore, options.historyType || 'viewport');
      }
      this._scheduleLocalRecoveryDraft();
    });
  },

  _fitCanvasViewport(options = {}) {
    const area = this._getCanvasAreaMetrics();
    if (!area) return;
    const workspace = this._getVisualWorkspaceMetrics(area) || area;

    const horizontalPadding = 32;
    const verticalPadding = 32;
    const fitScale = Math.min(
      (workspace.width - horizontalPadding * 2) / this.data.canvasWidth,
      (workspace.height - verticalPadding * 2) / this.data.canvasHeight
    );

    this._setWorkspaceScale(fitScale, {
      centerCanvas: true,
      historyBefore: options.historyBefore,
      historyType: options.historyType
    });
  },

  _getNextZoomStep(direction) {
    const current = Math.max(Number(this.data.canvasScale) || 1, this._minScale || 0.5);
    const maxScale = this._getMaxScale();
    const steps = PIXEL_EDITOR_ZOOM_STEPS.filter((step) => step >= (this._minScale || 0.5) && step <= maxScale);

    if (!steps.length) return current;

    if (direction > 0) {
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] > current + 0.001) return steps[i];
      }
      return steps[steps.length - 1];
    }

    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i] < current - 0.001) return steps[i];
    }
    return steps[0];
  },

  _shouldRenderGridAtScale(scale) {
    return !!this.data.showGrid;
  },

  _getZoomLabel(scale) {
    const percent = Math.max(1, Math.round((Number(scale) || 1) * 100));
    return `${percent}%`;
  },

  _maybeSnapScaleToPixelGrid(scale, options = {}) {
    const cellSize = Number(this.data.gridCellSize) || 0;
    if (!cellSize) return scale;

    const minScale = this._minScale || 0.5;
    const maxScale = this._getMaxScale();
    const rawScale = Math.max(minScale, Math.min(maxScale, Number(scale) || 1));
    const visualCellSize = cellSize * rawScale;
    if (visualCellSize < 6) return rawScale;

    const nearestVisualCell = Math.max(1, Math.round(visualCellSize));
    const snappedScale = nearestVisualCell / cellSize;
    const threshold = options.threshold == null ? 0.12 : options.threshold;

    if (options.force || Math.abs(visualCellSize - nearestVisualCell) <= threshold) {
      return Math.max(minScale, Math.min(maxScale, snappedScale));
    }

    return rawScale;
  },

  onZoomIn() {
    this._setWorkspaceScale(this._getNextZoomStep(1), {
      historyBefore: this._createViewportMetaSnapshot(),
      historyType: 'viewport'
    });
  },

  onZoomOut() {
    this._setWorkspaceScale(this._getNextZoomStep(-1), {
      historyBefore: this._createViewportMetaSnapshot(),
      historyType: 'viewport'
    });
  },

  onZoomReset() {
    this._setWorkspaceScale(1, {
      centerCanvas: true,
      historyBefore: this._createViewportMetaSnapshot(),
      historyType: 'viewport'
    });
  },

  onZoomFit() {
    this._fitCanvasViewport({
      historyBefore: this._createViewportMetaSnapshot(),
      historyType: 'viewport'
    });
  },

  handleTouchStart(e) {
    if (e && e.detail && Array.isArray(e.detail.touches)) {
      this._lastCanvasTouchEventAt = Date.now();
    } else if (this._shouldIgnoreContainerTouchEvent(e)) {
      return;
    }
    // 完美版：标记手势开始
    if (this._renderScheduler) {
      this._renderScheduler.startGesture();
    }
    
    // 每次触摸开始时更新容器与实际画布位置
    this._updateCanvasAreaRect();
    this._updateCanvasRect();
    
    const touches = this._getEventTouches(e);
    const now = this._getEventTimestamp(e);
    
    // 双指缩放检测
    if (touches.length === 2) {
      this._maybeStartPinchFromTouches(touches, now);
      return;
    }
    
    const touch = touches[0];
    this._lastTouchTime = now;
    
    // 拖拽工具 - 单指拖动
    if (this.data.tool === 'drag') {
      this._isDragging = true;
      this._viewportHistoryBefore = this._createViewportMetaSnapshot();
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
      this._velocityX = 0;
      this._velocityY = 0;
      
      // 停止惯性动画
      if (this._animationFrame) {
        this._cancelGestureFrame(this._animationFrame);
        this._animationFrame = null;
      }
      return;
    }
    
    // 绘制工具
    const pos = this._getPixelPosition(touch.clientX, touch.clientY);
    if (!pos) return;
    
    // 吸色工具 - 显示放大镜（允许移动）
    if (this.data.tool === 'picker') {
      this._isDrawing = true;
      this._lastPickerPos = pos || null;
      this._cachedCompositeCanvas = null;
      this._compositeRect = null;
      this._createCompositeCanvas(touch.clientX, touch.clientY, (compositeCanvas) => {
        this._cachedCompositeCanvas = compositeCanvas;
        this._showMagnifier(touch.clientX, touch.clientY, pos);
      });
      wx.vibrateShort({ type: 'light' });
      return;
    }
    
    // 完美版：延迟绘制，防止双指误触
    this._pendingDrawPos = pos;
    this._pendingDrawTime = now;
    
    // 短延迟防止双指误触；移动到新格时会立即起笔
    setTimeout(() => {
      if (this._isPinching) {
        this._pendingDrawPos = null;
        return;
      }
      
      if (this._pendingDrawPos && this._pendingDrawPos === pos) {
        this._startPendingDrawStroke();
      }
    }, 60);
  },

  handleTouchMove(e) {
    if (e && e.detail && Array.isArray(e.detail.touches)) {
      this._lastCanvasTouchEventAt = Date.now();
    } else if (this._shouldIgnoreContainerTouchEvent(e)) {
      return;
    }

    const touches = this._getEventTouches(e);
    const now = this._getEventTimestamp(e);

    if (touches.length === 2 && !this._isPinching) {
      this._maybeStartPinchFromTouches(touches, now);
    }

    // 双指缩放/拖拽（同时支持缩放与平移）—— RAF 节流
    if (touches.length === 2 && this._isPinching) {
      const rawScaleChange = this._getDistance(touches[0], touches[1]) / this._touchStartDistance;
      const rawCenterX = (touches[0].clientX + touches[1].clientX) / 2;
      const rawCenterY = (touches[0].clientY + touches[1].clientY) / 2;
      const startCenterX = this._pinchStartCenterX || rawCenterX;
      const startCenterY = this._pinchStartCenterY || rawCenterY;
      const panDistance = Math.hypot(rawCenterX - startCenterX, rawCenterY - startCenterY);
      const scaleDistance = Math.abs(rawScaleChange - 1);

      if (!this._pinchConfirmed) {
        if (scaleDistance < PINCH_SCALE_DEADZONE && panDistance < PINCH_PAN_DEADZONE_PX) {
          return;
        }
        this._pinchConfirmed = true;
      }

      const prevScaleChange = this._smoothedPinchScaleChange || 1;
      const prevCenterX = this._smoothedPinchCenterX == null ? rawCenterX : this._smoothedPinchCenterX;
      const prevCenterY = this._smoothedPinchCenterY == null ? rawCenterY : this._smoothedPinchCenterY;
      const smooth = PINCH_SMOOTHING;
      this._smoothedPinchScaleChange = prevScaleChange + (rawScaleChange - prevScaleChange) * smooth;
      this._smoothedPinchCenterX = prevCenterX + (rawCenterX - prevCenterX) * smooth;
      this._smoothedPinchCenterY = prevCenterY + (rawCenterY - prevCenterY) * smooth;

      // 缓存最新 pinch 参数，下一帧统一执行 setData
      this._pendingPinch = {
        touches,
        scaleChange: this._smoothedPinchScaleChange,
        centerClientX: this._smoothedPinchCenterX,
        centerClientY: this._smoothedPinchCenterY
      };
      if (!this._pinchRafId) {
        this._pinchRafId = this._scheduleGestureFrame(() => {
          this._pinchRafId = null;
          const p = this._pendingPinch;
          if (!p) return;
          this._pendingPinch = null;
          this._applyPinchTransform(p.touches, p.scaleChange, p.centerClientX, p.centerClientY);
        });
      }
      return;
    }
    
    const touch = touches[0];
    const deltaTime = now - this._lastTouchTime;
    
    // 拖拽工具 —— 用 RAF 节流，避免每次 touchmove 都 setData
    if (this.data.tool === 'drag' && this._isDragging) {
      this._dragCurrentX = touch.clientX;
      this._dragCurrentY = touch.clientY;
      this._dragDeltaTime = deltaTime;

      if (!this._dragRafId) {
        this._dragRafId = this._scheduleGestureFrame(() => {
          this._dragRafId = null;
          const curX = this._dragCurrentX;
          const curY = this._dragCurrentY;
          if (curX == null || curY == null) return;
          const deltaX = curX - this._dragStartX;
          const deltaY = curY - this._dragStartY;
          const dt = this._dragDeltaTime || 16;

          if (dt > 0) {
            this._velocityX = deltaX / dt * 16;
            this._velocityY = deltaY / dt * 16;
          }

          this._applyDragDelta(deltaX, deltaY);

          this._dragStartX = curX;
          this._dragStartY = curY;
          this._lastTouchTime = now;
        });
      }
      return;
    }
    
    // 吸色工具 - 更新放大镜（不限制在画布内）
    if (this._isDrawing && this.data.tool === 'picker') {
      const pos = this._getPixelPosition(touch.clientX, touch.clientY);
      this._lastPickerPos = pos || null;
      this._showMagnifier(touch.clientX, touch.clientY, pos);
      return;
    }
    
    const pos = this._getPixelPosition(touch.clientX, touch.clientY);
    if (!pos) return;

    if (!this._isDrawing) {
      if (this._pendingDrawPos) {
        this._startPendingDrawStroke(pos);
      }
      return;
    }
    
    if (this._lastPos) {
      this._paintLine(this._lastPos.row, this._lastPos.col, pos.row, pos.col);
    } else {
      this._paintPixel(pos.row, pos.col);
    }
    this._lastPos = pos;
  },

  /**
   * 将双指变换计算抽成独立方法（由 RAF 节流触发）
   */
  _applyPinchTransform(touches, scaleChange, centerClientX, centerClientY) {
    const areaLeft = this._canvasAreaRect ? this._canvasAreaRect.left : 0;
    const areaTop = this._canvasAreaRect ? this._canvasAreaRect.top : 0;
    const centerX = centerClientX - areaLeft;
    const centerY = centerClientY - areaTop;

    const startCenterX = (this._pinchStartCenterX || centerClientX) - areaLeft;
    const startCenterY = (this._pinchStartCenterY || centerClientY) - areaTop;
    const panX = centerX - startCenterX;
    const panY = centerY - startCenterY;
    const anchorX = startCenterX;
    const anchorY = startCenterY;

    const minScale = this._minScale || 0.5;
    const maxScale = this._getMaxScale();

    // 锁定模式：背景与画布同步
    if (this.data.locked && this.data.backgroundImage) {
      const baseScale = this._touchStartScale || this.data.canvasScale;
      const baseBackgroundScale = this._touchStartBackgroundScale || this.data.backgroundScale;
      const lockRatio = this._lockScaleRatio || (baseScale > 0 ? (baseBackgroundScale / baseScale) : 1);

      let nextScale = baseScale * scaleChange;
      nextScale = Math.max(minScale, Math.min(maxScale, nextScale));
      const scaleChanged = Math.abs(nextScale - baseScale) > 0.0001;

      const nextBackgroundScale = Math.max(minScale, Math.min(maxScale, nextScale * lockRatio));

      const canvasScaleRatio = nextScale / baseScale;
      const bgScaleRatio = nextBackgroundScale / baseBackgroundScale;
      
      const baseCanvasOffsetX = this._touchStartCanvasOffsetX != null ? this._touchStartCanvasOffsetX : this.data.canvasOffsetX;
      const baseCanvasOffsetY = this._touchStartCanvasOffsetY != null ? this._touchStartCanvasOffsetY : this.data.canvasOffsetY;
      const zoomCanvasOffsetX = anchorX - (anchorX - baseCanvasOffsetX) * canvasScaleRatio;
      const zoomCanvasOffsetY = anchorY - (anchorY - baseCanvasOffsetY) * canvasScaleRatio;
      
      const baseBackgroundOffsetX = this._touchStartBackgroundOffsetX != null ? this._touchStartBackgroundOffsetX : this.data.backgroundOffsetX;
      const baseBackgroundOffsetY = this._touchStartBackgroundOffsetY != null ? this._touchStartBackgroundOffsetY : this.data.backgroundOffsetY;
      const zoomBackgroundOffsetX = anchorX - (anchorX - baseBackgroundOffsetX) * bgScaleRatio;
      const zoomBackgroundOffsetY = anchorY - (anchorY - baseBackgroundOffsetY) * bgScaleRatio;

      this.setData({
        canvasScale: nextScale,
        canvasOffsetX: scaleChanged ? zoomCanvasOffsetX + panX : baseCanvasOffsetX,
        canvasOffsetY: scaleChanged ? zoomCanvasOffsetY + panY : baseCanvasOffsetY,
        backgroundScale: nextBackgroundScale,
        backgroundOffsetX: scaleChanged ? zoomBackgroundOffsetX + panX : baseBackgroundOffsetX,
        backgroundOffsetY: scaleChanged ? zoomBackgroundOffsetY + panY : baseBackgroundOffsetY,
        isPinching: true
      });
      return;
    }

    const target = this._getActiveTransformTarget();

    if (target === 'background') {
      const baseScale = this._touchStartBackgroundScale || this.data.backgroundScale;
      let nextScale = baseScale * scaleChange;
      nextScale = Math.max(minScale, Math.min(maxScale, nextScale));
      const scaleChanged = Math.abs(nextScale - baseScale) > 0.0001;

      const scaleRatio = nextScale / baseScale;
      const baseOffsetX = this._touchStartBackgroundOffsetX != null ? this._touchStartBackgroundOffsetX : this.data.backgroundOffsetX;
      const baseOffsetY = this._touchStartBackgroundOffsetY != null ? this._touchStartBackgroundOffsetY : this.data.backgroundOffsetY;

      const zoomOffsetX = anchorX - (anchorX - baseOffsetX) * scaleRatio;
      const zoomOffsetY = anchorY - (anchorY - baseOffsetY) * scaleRatio;

      this.setData({
        backgroundScale: nextScale,
        backgroundOffsetX: scaleChanged ? zoomOffsetX + panX : baseOffsetX,
        backgroundOffsetY: scaleChanged ? zoomOffsetY + panY : baseOffsetY,
        isPinching: true
      });
    } else {
      const baseScale = this._touchStartScale || this.data.canvasScale;
      let nextScale = baseScale * scaleChange;
      nextScale = Math.max(minScale, Math.min(maxScale, nextScale));
      const scaleChanged = Math.abs(nextScale - baseScale) > 0.0001;

      const scaleRatio = nextScale / baseScale;
      const baseOffsetX = this._touchStartCanvasOffsetX != null ? this._touchStartCanvasOffsetX : this.data.canvasOffsetX;
      const baseOffsetY = this._touchStartCanvasOffsetY != null ? this._touchStartCanvasOffsetY : this.data.canvasOffsetY;

      const zoomOffsetX = anchorX - (anchorX - baseOffsetX) * scaleRatio;
      const zoomOffsetY = anchorY - (anchorY - baseOffsetY) * scaleRatio;

      this._setCanvasTransform({
        canvasScale: nextScale,
        canvasOffsetX: scaleChanged ? zoomOffsetX + panX : baseOffsetX,
        canvasOffsetY: scaleChanged ? zoomOffsetY + panY : baseOffsetY
      });
    }
  },

  handleTouchEnd(e) {
    if (e && e.detail && Array.isArray(e.detail.touches)) {
      this._lastCanvasTouchEventAt = Date.now();
    } else if (this._shouldIgnoreContainerTouchEvent(e)) {
      return;
    }

    const touches = this._getEventTouches(e);
    this._endRenderGesture();

    // 如果是双指缩放结束
    if (this._isPinching) {
      this._isPinching = false;
      if (this._canvasRenderer) this._canvasRenderer.setLowQualityMode(false);
      this._updateCanvasAreaRect();

      this.setData({
        isPinching: false,
        overlayScale: this.data.canvasScale,
        currentZoomLabel: this._getZoomLabel(this.data.canvasScale)
      });
      this._pushViewportHistory(this._viewportHistoryBefore, 'viewport');
      this._viewportHistoryBefore = null;
      
      // 问题3修复：双指操作结束后的工具切换逻辑优化
      // 如果还有手指在屏幕上，继续保持拖拽模式
      if (touches.length > 0) {
        // 不恢复工具，保持 drag
        
        // 如果是单指，切换到拖拽状态
        if (touches.length === 1) {
          const touch = touches[0];
          this._isDragging = true;
          this._viewportHistoryBefore = this._viewportHistoryBefore || this._createViewportMetaSnapshot();
          this._dragStartX = touch.clientX;
          this._dragStartY = touch.clientY;
        }
        return;
      }
      
      // 所有手指都离开了，恢复工具
      if (this._toolBeforePinch) {
        const restoreTool = this._toolBeforePinch;
        this._toolBeforePinch = null;
        this.setData({ tool: restoreTool });
      }
      return;
    }
    
    // 拖拽工具 - 不启动惯性动画
    if (this._isDragging && this.data.tool === 'drag') {
      this._flushPendingDragFrame();
      this._isDragging = false;
      this._updateCanvasAreaRect();
      this._pushViewportHistory(this._viewportHistoryBefore, 'viewport');
      this._viewportHistoryBefore = null;
      
      // 问题3修复：拖拽结束时，如果所有手指都离开且有保存的工具，恢复工具
      if (touches.length === 0 && this._toolBeforePinch) {
        const restoreTool = this._toolBeforePinch;
        this._toolBeforePinch = null;
        this.setData({ tool: restoreTool });
      }
      return;
    }
    
    // 吸色工具 - 选中颜色并隐藏放大镜
    if (this.data.tool === 'picker' && this.data.showMagnifier) {
      const pickedColor = this.data.magnifierColor;

      this.setData({ showMagnifier: false });
      
      // 清除快照缓存
      this._cachedCompositeCanvas = null;
      this._compositeRect = null;

      // 双通道取色：画布优先取 PixelStore；背景图/画布外取 magnifierColor
      let finalColor = null;
      const pickerPos = this._lastPickerPos;

      if (pickerPos && pickerPos.row != null && pickerPos.col != null) {
        const row = pickerPos.row;
        const col = pickerPos.col;
        const pixelColor = this._getPixelColor(row, col);
        if (pixelColor) {
          const c = String(pixelColor).toUpperCase();
          if (c && c !== '#FFFFFF') {
            finalColor = c;
          }
        }
      }

      if (!finalColor && pickedColor && pickedColor !== '#FFFFFF') {
        finalColor = pickedColor;
      }

      if (finalColor) {
        const nearestColor = this._findNearestColor(finalColor);
        const colorItem = this._getColorItemByHex(nearestColor);
        this.setData({
          currentColor: nearestColor,
          currentCode: colorItem ? colorItem.code : this.data.currentCode,
          tool: 'pen'
        });
        wx.vibrateShort({ type: 'light' });
        wx.showToast({ title: '已选取颜色', icon: 'success', duration: 1000 });
      }
      
      this._lastPickerPos = null;
      return;
    }
    
    if (!this._isDrawing && this._pendingDrawPos) {
      this._startPendingDrawStroke();
    }
    this._endStrokeUndo();
    this._isDrawing = false;
    this._lastPos = null;
  },

  _redrawCanvasAtCurrentScale() {
    if (!this._canvas || !this._ctx) return;

    const now = Date.now();
    if (this._lastHighQualityRedrawAt && now - this._lastHighQualityRedrawAt < 80) {
      if (this._pendingHighQualityRedrawTimer) return;
      this._pendingHighQualityRedrawTimer = setTimeout(() => {
        this._pendingHighQualityRedrawTimer = null;
        this._redrawCanvasAtCurrentScale();
      }, 80);
      return;
    }
    this._lastHighQualityRedrawAt = now;

    this._syncCanvasResolution(false, { mode: 'high' });
    this._drawFullGrid();
  },
  
  // 计算两点距离
  _getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },
  
  // 惯性滚动动画
  _startInertiaAnimation() {
    const friction = 0.95; // 摩擦系数
    const minVelocity = 0.5; // 最小速度阈值
    
    const animate = () => {
      // 应用摩擦力
      this._velocityX *= friction;
      this._velocityY *= friction;
      
      // 检查是否停止
      const speed = Math.sqrt(this._velocityX ** 2 + this._velocityY ** 2);
      if (speed < minVelocity) {
        this._animationFrame = null;
        return;
      }
      
      // 更新位置
      const target = this._getActiveTransformTarget();
      if (this.data.locked && this.data.backgroundImage) {
        this.setData({
          canvasOffsetX: this.data.canvasOffsetX + this._velocityX,
          canvasOffsetY: this.data.canvasOffsetY + this._velocityY,
          backgroundOffsetX: this.data.backgroundOffsetX + this._velocityX,
          backgroundOffsetY: this.data.backgroundOffsetY + this._velocityY
        });
      } else if (target === 'background') {
        this.setData({
          backgroundOffsetX: this.data.backgroundOffsetX + this._velocityX,
          backgroundOffsetY: this.data.backgroundOffsetY + this._velocityY
        });
      } else {
        this.setData({
          canvasOffsetX: this.data.canvasOffsetX + this._velocityX,
          canvasOffsetY: this.data.canvasOffsetY + this._velocityY
        });
      }
      
      // 继续动画（使用 setTimeout 代替 requestAnimationFrame）
      this._animationFrame = setTimeout(animate, 16); // 约 60fps
    };
    
    this._animationFrame = setTimeout(animate, 16);
  },

  _normalizeRect(rect) {
    if (!rect) return null;
    const left = typeof rect.left === 'number' ? rect.left : (typeof rect.x === 'number' ? rect.x : 0);
    const top = typeof rect.top === 'number' ? rect.top : (typeof rect.y === 'number' ? rect.y : 0);
    const width = typeof rect.width === 'number' ? rect.width : Math.max(0, (rect.right || 0) - left);
    const height = typeof rect.height === 'number' ? rect.height : Math.max(0, (rect.bottom || 0) - top);
    const right = typeof rect.right === 'number' ? rect.right : left + width;
    const bottom = typeof rect.bottom === 'number' ? rect.bottom : top + height;
    return { left, top, right, bottom, width, height };
  },

  _getPixelPosition(touchX, touchY) {
    // 标准实现：直接由当前 transform 同步反算，不依赖异步 selector 回调
    const areaRect = this._canvasAreaRect;
    if (!areaRect) {
      console.warn('[坐标转换] canvas-area rect 未初始化');
      return null;
    }

    const scale = this.data.canvasScale || 1;

    // canvasOffset 表示内容区左上角，外扩坐标格只影响整体 view 的 left/top，不参与绘制命中。
    // 双指结束后 WXS 会先把最终 offset/scale 同步回 data，所以这里以 data 为准，避免使用异步旧 rect。
    const screenLeft = areaRect.left + this.data.canvasOffsetX;
    const screenTop = areaRect.top + this.data.canvasOffsetY;
    const screenWidth = this.data.canvasWidth * scale;
    const screenHeight = this.data.canvasHeight * scale;

    const relX = touchX - screenLeft;
    const relY = touchY - screenTop;

    // 吸色工具不限制边界，其他工具限制
    const inBounds = relX >= 0 && relY >= 0 && relX <= screenWidth && relY <= screenHeight;
    
    if (!inBounds && this.data.tool !== 'picker') {
      return null;
    }

    // 转换为逻辑坐标
    const logicalX = relX / scale;
    const logicalY = relY / scale;

    const cellWidth = this.data.canvasWidth / this.data.gridSize;
    const cellHeight = this.data.canvasHeight / this.data.gridSize;

    const col = Math.floor(logicalX / cellWidth);
    const row = Math.floor(logicalY / cellHeight);

    // 吸色工具返回坐标（即使越界），其他工具检查范围
    if (this.data.tool === 'picker') {
      return { row, col, logicalX, logicalY, inBounds };
    }

    if (col >= 0 && col < this.data.gridSize && row >= 0 && row < this.data.gridSize) {
      return { row, col };
    }
    return null;
  },

  _showMagnifier(touchX, touchY, pos) {
    if (this._magnifierModule) {
      this._magnifierModule.update();
    }

    const offsetY = -120;
    this.setData({
      showMagnifier: true,
      magnifierX: touchX,
      magnifierY: touchY + offsetY,
      magnifierColor: '#FFFFFF'
    }, () => {
      this._captureMagnifierArea(touchX, touchY);
    });

    // 统一从临时合成图读取取色
    this._getColorFromComposite(touchX, touchY, (compositeColor) => {
      if (compositeColor) {
        this.setData({ magnifierColor: compositeColor });
      }
    });
  },

  _getColorFromComposite(touchX, touchY, callback) {
    // 从合成 Canvas 中读取颜色
    if (!this._compositeRect) {
      callback(null);
      return;
    }

    const compositeLeft = 0;  // containerRect 相对于自己，left 总是 0
    const compositeTop = typeof this._compositeRect.top === 'number' ? this._compositeRect.top : (typeof this._compositeRect.y === 'number' ? this._compositeRect.y : 0);
    const compositeWidth = this._compositeRect.width || 428;
    const compositeHeight = this._compositeRect.height || 834;
    
    const relX = touchX - compositeLeft;
    const relY = touchY - compositeTop;

    if (relX < 0 || relX > compositeWidth || 
        relY < 0 || relY > compositeHeight) {
      callback(null);
      return;
    }
    
    wx.createSelectorQuery()
      .select('#compositeCanvas')
      .node()
      .exec((res) => {
        if (!res || !res[0]) {
          callback(null);
          return;
        }
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        try {
          const imageData = ctx.getImageData(Math.floor(relX), Math.floor(relY), 1, 1);
          const data = imageData.data;
          const r = data[0];
          const g = data[1];
          const b = data[2];
          const color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
          callback(color);
        } catch (err) {
          console.error('从合成 Canvas 读取颜色失败:', err);
          callback(null);
        }
      });
  },

  _getCanvasVisibleRect() {
    if (!this._canvasRect) return null;
    const rect = this._canvasRect;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  },

  _getBackgroundVisibleRect() {
    // 背景图的可见区域需要查询
    // 暂时返回 null，后续通过 query 获取
    return null;
  },

  _captureMagnifierArea(touchX, touchY) {
    const magnifierSize = 100;
    const captureSize = 70;
    const renderSeq = (this._magnifierRenderSeq || 0) + 1;
    this._magnifierRenderSeq = renderSeq;

    if (!this._cachedCompositeCanvas || !this._compositeRect) {
      return;
    }

    this._drawMagnifierFromComposite(this._cachedCompositeCanvas, touchX, touchY, magnifierSize, captureSize, renderSeq);
  },

  _drawMagnifierFromComposite(compositeCanvas, touchX, touchY, magnifierSize, captureSize, renderSeq) {
    // 从合成 Canvas 中裁剪放大镜区域
    wx.createSelectorQuery()
      .select('#magnifierCanvas')
      .node()
      .exec((res) => {
        if (!res || !res[0] || renderSeq !== this._magnifierRenderSeq) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 1;
        
        canvas.width = magnifierSize * dpr;
        canvas.height = magnifierSize * dpr;
        ctx.scale(dpr, dpr);
        
        ctx.clearRect(0, 0, magnifierSize, magnifierSize);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 计算在合成 Canvas 中的位置
        const compositeRect = this._compositeRect;
        if (!compositeRect) return;

        const compositeLeft = typeof compositeRect.left === 'number' ? compositeRect.left : (typeof compositeRect.x === 'number' ? compositeRect.x : 0);
        const compositeTop = typeof compositeRect.top === 'number' ? compositeRect.top : (typeof compositeRect.y === 'number' ? compositeRect.y : 0);
        const compositeWidth = compositeRect.width || Math.max(0, (compositeRect.right || 0) - compositeLeft);
        const compositeHeight = compositeRect.height || Math.max(0, (compositeRect.bottom || 0) - compositeTop);
        
        const relX = touchX - compositeLeft;
        const relY = touchY - compositeTop;

        // 从合成 Canvas 中裁剪
        const scale = magnifierSize / captureSize;
        const halfCapture = captureSize / 2;
        const srcX = Math.max(0, relX - halfCapture);
        const srcY = Math.max(0, relY - halfCapture);
        const srcW = Math.min(captureSize, compositeWidth - srcX);
        const srcH = Math.min(captureSize, compositeHeight - srcY);
        
        try {
          ctx.drawImage(
            compositeCanvas,
            srcX, srcY, srcW, srcH,
            0, 0, srcW * scale, srcH * scale
          );
        } catch (err) {
          console.error('从合成 Canvas 裁剪失败:', err);
        }
        
        this._drawMagnifierGrid(ctx, magnifierSize);
      });
  },

  _createCompositeCanvas(touchX, touchY, callback) {
    wx.createSelectorQuery()
      .select('.canvas-area').boundingClientRect()
      .select('.canvas-wrapper').boundingClientRect()
      .select('.background-layer').boundingClientRect()
      .select('.background-image').boundingClientRect()
      .exec((res) => {
        const containerRect = this._normalizeRect(res && res[0] ? res[0] : null);
        const canvasWrapperRect = this._normalizeRect(res && res[1] ? res[1] : null);
        const bgWrapperRect = this._normalizeRect(res && res[2] ? res[2] : null);
        const bgImageRect = this._normalizeRect(res && res[3] ? res[3] : null);

        if (!containerRect) {
          console.error('无法获取 canvas-area');
          callback(null);
          return;
        }

        this._compositeRect = containerRect;

        wx.createSelectorQuery()
          .select('#compositeCanvas')
          .node()
          .exec((res2) => {
            if (!res2 || !res2[0]) {
              console.error('无法获取 compositeCanvas');
              callback(null);
              return;
            }

            const canvas = res2[0].node;
            const ctx = canvas.getContext('2d');
            const width = Math.max(1, Math.floor(containerRect.width));
            const height = Math.max(1, Math.floor(containerRect.height));
            canvas.width = width;
            canvas.height = height;

            
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const drawCanvasLayer = () => {
              if (this.data.showCanvas && canvasWrapperRect) {
                this._drawCanvasToComposite(ctx, containerRect, canvasWrapperRect);
              }
              callback(canvas);
            };

            if (this.data.backgroundImage && this.data.showBackground && (bgWrapperRect || bgImageRect)) {
              this._drawBackgroundToComposite(ctx, containerRect, bgWrapperRect, bgImageRect, drawCanvasLayer);
            } else {
              drawCanvasLayer();
            }
          });
      });
  },

  _drawBackgroundToComposite(ctx, containerRect, bgWrapperRect, bgImageRect, callback) {
    const draw = (img) => {
      if (img) {
        this._drawBackgroundImageToComposite(ctx, img, containerRect, bgWrapperRect || bgImageRect, bgImageRect);
      }
      callback();
    };

    if (this._magnifierBgImage) {
      draw(this._magnifierBgImage);
      return;
    }

    wx.createSelectorQuery()
      .select('#tempCanvas2d')
      .node()
      .exec((res) => {
        if (!res || !res[0]) {
          console.error('无法获取 tempCanvas2d');
          callback();
          return;
        }

        const tempCanvas = res[0].node;
        this._getMagnifierBackgroundImage(tempCanvas, draw);
      });
  },

  _drawBackgroundImageToComposite(ctx, img, containerRect, targetRect, bgImageRect) {
    if (!targetRect) return;

    const dx = targetRect.left - containerRect.left;
    const dy = targetRect.top - containerRect.top;
    const dw = targetRect.width;
    const dh = targetRect.height;

    if (dw <= 0 || dh <= 0) return;

    const imageWidth = this.data.backgroundImageWidth || img.width;
    const imageHeight = this.data.backgroundImageHeight || img.height;
    if (!imageWidth || !imageHeight) return;

    // 如果拿到了 image 实际 rect，优先按它直接拉伸绘制（最贴近真实布局）
    if (bgImageRect) {
      const ix = bgImageRect.left - containerRect.left;
      const iy = bgImageRect.top - containerRect.top;
      const iw = bgImageRect.width;
      const ih = bgImageRect.height;
      if (iw > 0 && ih > 0) {
        ctx.save();
        if (this.data.backgroundMirror) {
          ctx.translate(ix + iw, iy);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, imageWidth, imageHeight, 0, 0, iw, ih);
        } else {
          ctx.drawImage(img, 0, 0, imageWidth, imageHeight, ix, iy, iw, ih);
        }
        ctx.restore();
        return;
      }
    }

    // 回退：在 wrapper rect 内按 aspectFit
    const imgRatio = imageWidth / imageHeight;
    const boxRatio = dw / dh;
    let fitW;
    let fitH;
    if (imgRatio > boxRatio) {
      fitW = dw;
      fitH = dw / imgRatio;
    } else {
      fitH = dh;
      fitW = dh * imgRatio;
    }
    const fitX = dx + (dw - fitW) / 2;
    const fitY = dy + (dh - fitH) / 2;

    ctx.save();
    if (this.data.backgroundMirror) {
      ctx.translate(fitX + fitW, fitY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight, 0, 0, fitW, fitH);
    } else {
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight, fitX, fitY, fitW, fitH);
    }
    ctx.restore();
  },

  _drawCanvasToComposite(ctx, containerRect, canvasWrapperRect) {
    if (!this._canvas || !canvasWrapperRect) {
      console.error('_drawCanvasToComposite 失败:', { hasCanvas: !!this._canvas, hasRect: !!canvasWrapperRect });
      return;
    }

    const dx = canvasWrapperRect.left - containerRect.left;
    const dy = canvasWrapperRect.top - containerRect.top;
    const dw = canvasWrapperRect.width;
    const dh = canvasWrapperRect.height;

    const sourceCanvasWidth = this._canvas.width || this.data.canvasWidth;
    const sourceCanvasHeight = this._canvas.height || this.data.canvasHeight;

    if (dw <= 0 || dh <= 0 || sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) {
      console.error('合成画布尺寸无效:', { dw, dh, sourceCanvasWidth, sourceCanvasHeight });
      return;
    }

    const clipLeft = Math.max(0, -dx);
    const clipTop = Math.max(0, -dy);
    const clipRight = Math.max(0, dx + dw - containerRect.width);
    const clipBottom = Math.max(0, dy + dh - containerRect.height);

    const visibleDx = dx + clipLeft;
    const visibleDy = dy + clipTop;
    const visibleDw = dw - clipLeft - clipRight;
    const visibleDh = dh - clipTop - clipBottom;

    if (visibleDw <= 0 || visibleDh <= 0) {
      console.error('合成画布可见区域无效:', { visibleDw, visibleDh });
      return;
    }

    const srcX = (clipLeft / dw) * sourceCanvasWidth;
    const srcY = (clipTop / dh) * sourceCanvasHeight;
    const srcW = (visibleDw / dw) * sourceCanvasWidth;
    const srcH = (visibleDh / dh) * sourceCanvasHeight;

    try {
      ctx.drawImage(
        this._canvas,
        srcX, srcY, srcW, srcH,
        visibleDx, visibleDy, visibleDw, visibleDh
      );
    } catch (err) {
      console.error('绘制画布到合成图失败:', err);
    }
  },

  _getMagnifierBackgroundImage(canvas, callback) {
    if (!this.data.backgroundImage) {
      callback(null);
      return;
    }

    if (this._magnifierBgImage && this._magnifierBgSrc === this.data.backgroundImage) {
      callback(this._magnifierBgImage);
      return;
    }

    const img = canvas.createImage();
    img.onload = () => {
      this._magnifierBgImage = img;
      this._magnifierBgSrc = this.data.backgroundImage;
      if ((!this.data.backgroundImageWidth || !this.data.backgroundImageHeight) && img.width && img.height) {
        this.setData({
          backgroundImageWidth: img.width,
          backgroundImageHeight: img.height
        });
      }
      callback(img);
    };
    img.onerror = () => callback(null);
    img.src = this.data.backgroundImage;
  },

  _drawBackgroundToMagnifier(ctx, img, centerX, centerY, captureSize, magnifierSize) {
    try {
      const fit = this._getBackgroundAspectFitRect(img);
      if (!fit) return;

      const scale = magnifierSize / captureSize;
      const halfCapture = captureSize / 2;
      const captureLeft = centerX - halfCapture;
      const captureTop = centerY - halfCapture;
      const captureRight = centerX + halfCapture;
      const captureBottom = centerY + halfCapture;

      const interLeft = Math.max(captureLeft, fit.left);
      const interTop = Math.max(captureTop, fit.top);
      const interRight = Math.min(captureRight, fit.left + fit.width);
      const interBottom = Math.min(captureBottom, fit.top + fit.height);
      if (interRight <= interLeft || interBottom <= interTop) return;

      let sx = (interLeft - fit.left) / fit.width * fit.imageWidth;
      const sy = (interTop - fit.top) / fit.height * fit.imageHeight;
      const sw = (interRight - interLeft) / fit.width * fit.imageWidth;
      const sh = (interBottom - interTop) / fit.height * fit.imageHeight;
      if (this.data.backgroundMirror) {
        sx = fit.imageWidth - sx - sw;
      }
      const dx = (interLeft - captureLeft) * scale;
      const dy = (interTop - captureTop) * scale;
      const dw = (interRight - interLeft) * scale;
      const dh = (interBottom - interTop) * scale;
      
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    } catch (err) {
      console.error('绘制背景图到放大镜失败:', err);
    }
  },

  _getBackgroundAspectFitRect(img) {
    const canvasWidth = this.data.canvasWidth;
    const canvasHeight = this.data.canvasHeight;
    const imageWidth = this.data.backgroundImageWidth || img.width || canvasWidth;
    const imageHeight = this.data.backgroundImageHeight || img.height || canvasHeight;
    if (!imageWidth || !imageHeight || !canvasWidth || !canvasHeight) return null;

    const imageRatio = imageWidth / imageHeight;
    const canvasRatio = canvasWidth / canvasHeight;
    let width;
    let height;

    if (imageRatio > canvasRatio) {
      width = canvasWidth;
      height = canvasWidth / imageRatio;
    } else {
      height = canvasHeight;
      width = canvasHeight * imageRatio;
    }

    return {
      left: (canvasWidth - width) / 2,
      top: (canvasHeight - height) / 2,
      width,
      height,
      imageWidth,
      imageHeight
    };
  },

  _canvasPointToBackgroundImagePoint(canvasX, canvasY) {
    const fit = this._getBackgroundAspectFitRect(this._magnifierBgImage || {});
    if (!fit) return null;
    if (
      canvasX < fit.left ||
      canvasX > fit.left + fit.width ||
      canvasY < fit.top ||
      canvasY > fit.top + fit.height
    ) {
      return null;
    }

    const xRatio = (canvasX - fit.left) / fit.width;
    return {
      x: (this.data.backgroundMirror ? 1 - xRatio : xRatio) * fit.imageWidth,
      y: (canvasY - fit.top) / fit.height * fit.imageHeight,
      xRatio: this.data.backgroundMirror ? 1 - xRatio : xRatio,
      yRatio: (canvasY - fit.top) / fit.height
    };
  },

  _drawCanvasToMagnifier(ctx, centerX, centerY, captureSize, magnifierSize) {
    if (!this._canvas) return;
    
    try {
      const scale = magnifierSize / captureSize;
      const halfCapture = captureSize / 2;
      const canvasWidth = this.data.canvasWidth;
      const canvasHeight = this.data.canvasHeight;
      const boardInset = this.data.boardInset || 0;
      const contentSrcX = Math.max(0, Math.min(canvasWidth - 1, centerX - halfCapture));
      const contentSrcY = Math.max(0, Math.min(canvasHeight - 1, centerY - halfCapture));
      const srcX = boardInset + contentSrcX;
      const srcY = boardInset + contentSrcY;
      const srcW = Math.max(1, Math.min(captureSize, canvasWidth - contentSrcX));
      const srcH = Math.max(1, Math.min(captureSize, canvasHeight - contentSrcY));
      
      ctx.drawImage(
        this._canvas,
        srcX, srcY, srcW, srcH,
        0, 0, srcW * scale, srcH * scale
      );
    } catch (err) {
      console.error('绘制画布到放大镜失败:', err);
    }
  },

  _drawMagnifierGrid(ctx, size) {
    // 绘制放大镜中心的十字线
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.8)';
    ctx.lineWidth = 2;
    
    const center = size / 2;
    const crossSize = 10;
    
    // 水平线
    ctx.beginPath();
    ctx.moveTo(center - crossSize, center);
    ctx.lineTo(center + crossSize, center);
    ctx.stroke();
    
    // 垂直线
    ctx.beginPath();
    ctx.moveTo(center, center - crossSize);
    ctx.lineTo(center, center + crossSize);
    ctx.stroke();
    
    // 中心圆
    ctx.beginPath();
    ctx.arc(center, center, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FF9800';
    ctx.fill();
  },

  _getMagnifierData(centerRow, centerCol) {
    // 获取中心点周围 5x5 的像素数据
    const size = 5;
    const half = Math.floor(size / 2);
    const data = [];
    
    for (let dy = -half; dy <= half; dy++) {
      const row = [];
      for (let dx = -half; dx <= half; dx++) {
        const r = centerRow + dy;
        const c = centerCol + dx;
        if (r >= 0 && r < this.data.gridSize && c >= 0 && c < this.data.gridSize) {
          const cellColor = this._getPixelColor(r, c) || '#FFFFFF';
          row.push(cellColor);
        } else {
          row.push('#FFFFFF');
        }
      }
      data.push(row);
    }
    
    return data;
  },

  _getBackgroundColorForMagnifier(clientX, clientY, callback) {
    const query = wx.createSelectorQuery();
    query.select('.background-image').boundingClientRect();
    query.exec((res) => {
      if (!res || !res[0]) {
        callback(null);
        return;
      }
      
      const rect = res[0];
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top;
      if (relativeX < 0 || relativeX > rect.width || relativeY < 0 || relativeY > rect.height) {
        callback(null);
        return;
      }

      const canvasX = relativeX / rect.width * this.data.canvasWidth;
      const canvasY = relativeY / rect.height * this.data.canvasHeight;
      const imagePoint = this._canvasPointToBackgroundImagePoint(canvasX, canvasY);
      if (!imagePoint) {
        callback(null);
        return;
      }
      
      this._quickGetBackgroundColor(imagePoint.xRatio, imagePoint.yRatio, callback);
    });
  },

  _quickGetBackgroundColor(xRatio, yRatio, callback) {
    // 快速获取背景图颜色（用于放大镜实时显示）
    wx.createSelectorQuery()
      .select('#tempCanvas2d')
      .node()
      .exec((res) => {
        if (!res || !res[0]) {
          callback(null);
          return;
        }
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 使用小尺寸快速处理
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        
        const img = canvas.createImage();
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, size, size);
            const x = Math.floor(xRatio * size);
            const y = Math.floor(yRatio * size);
            const imageData = ctx.getImageData(x, y, 1, 1);
            const data = imageData.data;
            const r = data[0];
            const g = data[1];
            const b = data[2];
            const color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            callback(color);
          } catch (err) {
            callback(null);
          }
        };
        
        img.onerror = () => callback(null);
        img.src = this.data.backgroundImage;
      });
  },

  _paintPixel(row, col, options = {}) {
    if (this.data.activeLayer === 'background') {
      wx.showToast({ title: '背景图层无法绘制', icon: 'none' });
      return;
    }
    
    const { tool, currentColor, symmetry, gridSize, brushSize } = this.data;
    
    // 完美版：画笔和填充工具需要选择颜色，橡皮擦和吸色工具不需要
    if ((tool === 'pen' || tool === 'fill') && (!currentColor || currentColor === '')) {
      wx.showToast({ title: '请先选择色号', icon: 'none', duration: 1500 });
      return;
    }
    
    const { skipRender = false, skipStats = false, changedCells = null } = options;
    if (tool === 'picker') {
      const pickedColor = this._getPixelColor(row, col);
      if (pickedColor && pickedColor !== '#FFFFFF') {
        const colorItem = this._getColorItemByHex(pickedColor);
        this.setData({
          currentColor: pickedColor,
          currentCode: colorItem ? colorItem.code : this.data.currentCode,
          tool: 'pen'
        });
      }
      return;
    }
    if (tool === 'fill') {
      // 精细撤回：填充前保存状态
      this._saveState();
      const changed = this._floodFill(row, col, currentColor);
      if (!changed) {
        this._discardPendingState();
        return;
      }
      this._rebuildColorStatsFromGrid();
      this._drawFullGrid();
      this._scheduleUsedColorsUpdate();
      this._updateHasPixels();
      this._commitState('fill');
      return;
    }
    const color = tool === 'eraser' ? null : currentColor; // 完美版：橡皮擦使用透明色
    const changed = changedCells || new Set();
    const isEraser = tool === 'eraser';

    // 增量更新颜色统计 + 记录到撤销栈
    const updateCell = (r, c) => {
      const oldValue = this._getPixelColor(r, c);
      const oldColor = this._normalizeColor(oldValue);
      const newColor = this._normalizeColor(color);
      if (oldColor !== newColor) {
        this._bumpColorCount(oldColor, -1);
        this._bumpColorCount(newColor, 1);
        this._setPixelColor(r, c, color);
        changed.add(`${r},${c}`);
        // 记录到笔画撤销集合（old 保持原始值，new 为新值）
        if (this._strokeUndoCells) {
          const key = `${r},${c}`;
          if (this._strokeUndoCells.has(key)) {
            // 同一笔再次画到同一格，保留最早的 old
            this._strokeUndoCells.set(key, { old: this._strokeUndoCells.get(key).old, new: color });
          } else {
            this._strokeUndoCells.set(key, { old: oldValue, new: color });
          }
        }
      }
    };

    updateCell(row, col);

    // 对称只对画笔工具生效
    if (symmetry && tool === 'pen') {
      const symCol = gridSize - 1 - col;
      if (symCol >= 0 && symCol < gridSize) {
        updateCell(row, symCol);
      }
    }

    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const r = row + dy;
        const c = col + dx;
        if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
          updateCell(r, c);
          // 对称只对画笔工具生效，橡皮擦和填充不参与对称
          if (symmetry && tool === 'pen') {
            const symC = gridSize - 1 - c;
            if (symC >= 0 && symC < gridSize) {
              updateCell(r, symC);
            }
          }
        }
      }
    }

    if (!skipRender) {
      this._queueRenderChangedPixels(changed);
    }
    if (!skipStats) {
      this._scheduleUsedColorsUpdate();
      this._updateHasPixels();
    }
  },

  _paintLine(r0, c0, r1, c1) {
    const changedCells = this._toolEngine
      ? this._toolEngine.paintLine(r0, c0, r1, c1)
      : new Set();

    this._queueRenderChangedPixels(changedCells);
    this._scheduleUsedColorsUpdate();
    this._updateHasPixels();
  },

  _floodFill(startRow, startCol, newColor) {
    if (this._toolEngine) {
      return this._toolEngine.floodFill(startRow, startCol, newColor).changed;
    }

    const targetColor = this._getPixelColor(startRow, startCol);

    // 修复：正确处理透明色块（null/undefined）的填充
    // null 和 undefined 视为相同的透明色
    const isSameColor = (targetColor === newColor) ||
                        (targetColor == null && newColor == null);
    if (isSameColor) return false;

    const { gridSize } = this.data;
    const stack = [[startRow, startCol]];
    const visited = new Set();
    this._ensurePixelStoreFromGrid();

    // 辅助函数：判断两个颜色是否相同（考虑透明色）
    const colorEquals = (color1, color2) => {
      if (color1 === color2) return true;
      if (color1 == null && color2 == null) return true;
      return false;
    };

    while (stack.length > 0) {
      const [r, c] = stack.pop();
      const key = r + ',' + c;
      if (visited.has(key)) continue;
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) continue;

      // 修复：使用 colorEquals 判断颜色是否匹配
      if (!colorEquals(this._getPixelColor(r, c), targetColor)) continue;

      visited.add(key);
      this._setPixelColor(r, c, newColor);
      stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }

    return visited.size > 0;
  },

  onUndo() {
    if (!this._history) this._history = new HistoryManager();
    const record = this._history.undo();
    if (!record) return;

    this._applyHistoryRecord(record);
    this._rebuildColorStatsFromGrid();
    this._drawFullGrid();
    this._updateUsedColors();
    this._updateHasPixels();

    this.setData(this._history.getState());
    this._scheduleLocalRecoveryDraft();
  },

  onRedo() {
    if (!this._history) this._history = new HistoryManager();
    const record = this._history.redo();
    if (!record) return;

    this._applyHistoryRecord(record);
    this._rebuildColorStatsFromGrid();
    this._drawFullGrid();
    this._updateUsedColors();
    this._updateHasPixels();

    this.setData(this._history.getState());
    this._scheduleLocalRecoveryDraft();
  },

  /**
   * 应用历史记录到像素存储
   */
  _applyHistoryRecord(record) {
    if (!record) return;

    if (record.pixelSnapshot && record.pixelSnapshot.gridSize) {
      this._ensurePixelStoreFromGrid();
      this._pixelStore.restoreSnapshot(record.pixelSnapshot);
      this._gridData = null;
    } else if (record.fullGridData) {
      this._gridData = record.fullGridData.map(row => [...row]);
      this._pixelStore = PixelStore.fromGridData(this._gridData);
    }

    if (record.meta) {
      this._applyHistoryMeta(record.meta);
    }

    if (record._cells) {
      this._ensurePixelStoreFromGrid();
      for (const [key, val] of Object.entries(record._cells)) {
        const [r, c] = key.split(',').map(Number);
        this._setPixelColor(r, c, val.new);
      }
    }
  },

  _applyHistoryMeta(meta) {
    if (!meta || typeof meta !== 'object') return;

    const nextGridSize = meta.gridSize || this.data.gridSize;
    const nextScale = meta.canvasScale == null ? this.data.canvasScale : meta.canvasScale;
    const updates = {
      canvasOffsetX: meta.canvasOffsetX == null ? this.data.canvasOffsetX : meta.canvasOffsetX,
      canvasOffsetY: meta.canvasOffsetY == null ? this.data.canvasOffsetY : meta.canvasOffsetY,
      canvasScale: nextScale,
      overlayScale: nextScale,
      currentZoomLabel: this._getZoomLabel(nextScale),
      ...this._getGridOverlayMetrics(nextScale),
      backgroundOffsetX: meta.backgroundOffsetX == null ? this.data.backgroundOffsetX : meta.backgroundOffsetX,
      backgroundOffsetY: meta.backgroundOffsetY == null ? this.data.backgroundOffsetY : meta.backgroundOffsetY,
      backgroundScale: meta.backgroundScale == null ? this.data.backgroundScale : meta.backgroundScale,
      backgroundMirror: meta.backgroundMirror == null ? this.data.backgroundMirror : meta.backgroundMirror,
      locked: meta.locked == null ? this.data.locked : meta.locked,
      showBackground: meta.showBackground == null ? this.data.showBackground : meta.showBackground,
      backgroundImage: meta.backgroundImage == null ? this.data.backgroundImage : meta.backgroundImage
    };

    if (nextGridSize !== this.data.gridSize) {
      const layout = this._getSnappedCanvasLayout(nextGridSize);
      const canvasSize = layout.canvasSize;
      this._layoutRenderDpr = layout.renderDpr;
      this._renderResolutionKey = '';
      updates.gridSize = nextGridSize;
      updates.canvasWidth = canvasSize;
      updates.canvasHeight = canvasSize;
      updates.coordinateCellSize = layout.coordinateCellSize;
      updates.boardInset = layout.boardInset;
      updates.boardCanvasWidth = layout.boardCanvasWidth;
      updates.boardCanvasHeight = layout.boardCanvasHeight;
      updates.gridCellSize = layout.cellSize;
      updates.majorGridSizePx = layout.cellSize * 5;
      this._cellSize = layout.cellSize;
    }

    this.setData(updates);
    if (updates.gridSize) this._updateAxisLabels();
  },

  onGridSizeInput(e) {
    const value = parseInt(e.detail.value);
    if (value && value > 0 && value <= 100) {
      this.setData({ gridSize: value });
      this._updateAxisLabels();
    }
  },

  _updateBackgroundImageInfo(src) {
    if (!src) return;
    wx.getImageInfo({
      src,
      success: (info) => {
        if (this.data.backgroundImage !== src) return;
        this.setData({
          backgroundImageWidth: info.width || 0,
          backgroundImageHeight: info.height || 0
        });
      },
      fail: () => {
        this.setData({
          backgroundImageWidth: 0,
          backgroundImageHeight: 0
        });
      }
    });
  },

  onChooseBackground() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._saveState();
        this._magnifierBgImage = null;
        this._magnifierBgSrc = '';
        this._updateBackgroundImageInfo(res.tempFilePaths[0]);
        
        this.setData({ 
          backgroundImage: res.tempFilePaths[0],
          showBackground: true,
          backgroundMirror: false
        }, () => {
          // 重新绘制画布以应用透明背景
          this._drawFullGrid();
          this._commitState('background');
        });
        
        wx.showToast({ title: '背景图已上传', icon: 'success' });
      },
      fail: (err) => {
        console.error('背景图上传失败:', err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  onClearBackground() {
    this._saveState();
    this._magnifierBgImage = null;
    this._magnifierBgSrc = '';
    this.setData({ 
      backgroundImage: '',
      backgroundImageWidth: 0,
      backgroundImageHeight: 0,
      showBackground: false,
      locked: false,
      activeLayer: 'canvas'
    }, () => {
      this._drawFullGrid();
      this._commitState('background');
    });
    wx.showToast({ title: '背景图已清除', icon: 'success' });
  },

  _getColorCode(hex) {
    // 优先使用真实色号映射表（AI结果传入的色号或API加载的色号）
    if (this._hexCodeMap && this._hexCodeMap[String(hex).toUpperCase()]) {
      return this._hexCodeMap[String(hex).toUpperCase()];
    }
    // 回退：从 colorsWithCode 中查找（API加载的品牌色卡）
    const match = this._getColorItemByHex(hex);
    if (match && match.code) return match.code;
    // 最终回退：使用索引合成色号
    const index = this.data.colors.indexOf(hex);
    if (index >= 0) {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const letter = letters[Math.floor(index / 10)] || 'A';
      const num = (index % 10) + 1;
      return letter + num.toString().padStart(2, '0');
    }
    return 'C01';
  },

  onOpenColorDetail() {
    const count = this._countColorUsage(this.data.currentColor);
    this.setData({ showColorModal: true, colorCount: count });
  },

  onCloseColorModal() {
    this.setData({ showColorModal: false });
  },

  _countColorUsage(color) {
    if (!color) return 0;
    this._ensurePixelStoreFromGrid();
    if (!this._pixelStore) return 0;
    const normalized = String(color).toUpperCase();
    return this._pixelStore.getColorUsageMap().get(normalized) || 0;
  },

  onClear() {
    if (this.data.activeLayer === 'background') {
      wx.showToast({ title: '背景图层不支持清空', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空画板',
      content: '确定要清空整个画布吗？',
      success: (res) => {
        if (res.confirm) {
          this._saveState();
          this._ensurePixelStoreFromGrid();
          if (this._pixelStore) {
            this._pixelStore.clear();
          }
          this._rebuildColorStatsFromGrid();
          this._drawFullGrid();
          this._updateUsedColors();
          this._updateHasPixels();
          this.setData({ mirror: false }, () => {
            this._commitState('clear');
          });
        }
      }
    });
  },

  onSave() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this._startSaveDraft();
    });
  },

  onSaveToBox() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this._promptNameAndSave('box');
    });
  },

  _startSaveDraft() {
    const editingDraftId = this.data.editingDraftId;
    const editingBoxId = this.data.editingBoxId;
    const isEditingBoxSource = this.data.sourceRecordType === 'BOX' && editingBoxId;
    if (isEditingBoxSource) {
      this._promptNameAndSave('draft', 'new');
      return;
    }
    if (editingDraftId) {
      wx.showActionSheet({
        itemList: ['覆盖原草稿', '另存新草稿'],
        success: (res) => {
          if (res.tapIndex === 0) this._saveDraft('', 'overwrite');
          if (res.tapIndex === 1) this._promptNameAndSave('draft', 'new');
        }
      });
      return;
    }
    if (editingBoxId) {
      wx.showActionSheet({
        itemList: ['关联当前图纸', '另存新草稿'],
        success: (res) => {
          if (res.tapIndex === 0) this._saveDraft('', 'link-box');
          if (res.tapIndex === 1) this._promptNameAndSave('draft', 'new');
        }
      });
      return;
    }
    this._promptNameAndSave('draft', 'new');
  },

  _promptNameAndSave(type, saveMode) {
    const title = type === 'box' ? '保存到图纸箱' : '保存草稿';
    const defaultName = `拼豆图纸_${Date.now()}`;
    wx.showModal({
      title,
      editable: true,
      placeholderText: '请输入名称',
      content: '',
      success: (res) => {
        if (!res.confirm) return;
        const input = String((res.content || '')).trim();
        const name = input || defaultName;
        if (type === 'box') this._saveToBox(name);
        else this._saveDraft(name, saveMode);
      }
    });
  },

  _saveToBox(name) {
    this.setData({ loading: true, loadingText: '保存到图纸箱...' });
    const { gridSize, brand } = this.data;
    if (!this._hasDrawableContent()) {
      this.setData({ loading: false });
      wx.showToast({ title: '画板还没有内容', icon: 'none' });
      return;
    }
    const colorStats = this._buildColorStats();
    const colorPalette = colorStats.map((s, idx) => ({
      index: idx, id: s.id, name: s.name, hex: s.hex, r: s.r, g: s.g, b: s.b, count: s.count
    }));
    const { gridData, mappedPixelData } = this._buildPersistencePixelData(colorStats, colorPalette);

    request.post('/box/save', {
      name,
      sourceType: 'DRAW',
      brand: brand || 'MARD',
      colorCount: colorStats.length,
      gridSize: gridSize,
      mappedPixelData: JSON.stringify(mappedPixelData),
      sourceUrl: ''
    }).then((result) => {
      this.setData({ loading: false });
      wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
      if (result && result.capacityFull) {
        setTimeout(() => {
          wx.showToast({ title: result.capacityMessage || '图纸箱容量已满', icon: 'none', duration: 2200 });
        }, 900);
      }
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  _saveDraft(name, saveMode) {
    const editingDraftId = this.data.editingDraftId;
    this.setData({ loading: true, loadingText: '保存中...' });
    const { gridSize, brand, backgroundImage, backgroundImageWidth, backgroundImageHeight, backgroundOffsetX, backgroundOffsetY, backgroundScale, locked, editingBoxId } = this.data;
    const colorStats = this._buildColorStats();
    const colorPalette = colorStats.map((s, idx) => ({
      index: idx, id: s.id, name: s.name, hex: s.hex, r: s.r, g: s.g, b: s.b, count: s.count
    }));
    const { gridData, mappedPixelData } = this._buildPersistencePixelData(colorStats, colorPalette);

    // 保存背景图层状态
    const backgroundState = backgroundImage ? {
      backgroundImage,
      backgroundImageWidth,
      backgroundImageHeight,
      backgroundOffsetX,
      backgroundOffsetY,
      backgroundScale,
      locked
    } : null;

    const payload = {
      name: name || this.data.editingName || '拼豆图纸_' + Date.now(),
      sourceType: 'DRAW',
      brand: brand || 'MARD',
      colorCount: colorStats.length,
      gridSize: gridSize,
      mappedPixelData: JSON.stringify(mappedPixelData),
      backgroundState: backgroundState ? JSON.stringify(backgroundState) : null
    };
    if (editingDraftId && saveMode === 'overwrite') {
      payload.id = Number(editingDraftId);
      if (editingBoxId) payload.boxId = Number(editingBoxId);
    } else if (!editingDraftId && editingBoxId && saveMode === 'link-box') {
      payload.boxId = Number(editingBoxId);
    }
    request.post('/draft/save', payload).then((savedDraft) => {
      const draftData = (savedDraft && savedDraft.draft) ? savedDraft.draft : savedDraft;
      const savedId = savedDraft && savedDraft.id ? savedDraft.id : (draftData && draftData.id ? draftData.id : editingDraftId);
      this.setData({
        loading: false,
        editingDraftId: savedId || '',
        editingBoxId: saveMode === 'overwrite' ? (editingBoxId || '') : ((draftData && draftData.boxId) || ''),
        editingName: payload.name,
        source: 'draft'
      });
      this._hasUnsavedChanges = false;
      wx.showToast({ title: saveMode === 'overwrite' ? '已覆盖原草稿' : (saveMode === 'link-box' ? '已关联保存' : '已保存'), icon: 'success' });
      if (savedDraft && savedDraft.capacityFull) {
        setTimeout(() => {
          wx.showToast({ title: savedDraft.capacityMessage || '草稿箱容量已满', icon: 'none', duration: 2200 });
        }, 900);
      }
    }).catch((err) => {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  _hasDrawableContent() {
    this._ensurePixelStoreFromGrid();
    if (!this._pixelStore) return false;
    const usage = this._pixelStore.getColorUsageMap();
    return usage.size > 0;
  },

  _buildColorStats() {
    this._ensurePixelStoreFromGrid();
    const map = this._pixelStore ? this._pixelStore.getColorUsageMap() : new Map();
    const stats = [];

    map.forEach((count, hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const colorItem = this._getColorItemByHex(hex);
      const code = colorItem && colorItem.code ? colorItem.code : this._getColorCode(hex);
      stats.push({ id: code, name: code, hex, count, r, g, b });
    });

    return stats.sort((a, b) => b.count - a.count);
  },

  _buildPersistencePixelData(colorStats, colorPalette = null) {
    this._ensurePixelStoreFromGrid();
    const palette = colorPalette || (colorStats || []).map((s, idx) => ({
      index: idx,
      id: s.id,
      name: s.name,
      r: s.r,
      g: s.g,
      b: s.b,
      hex: s.hex,
      count: s.count
    }));
    const colorIndexMap = new Map();
    const mappedByIndex = palette.map((item, index) => {
      const r = Number(item.r ?? 255);
      const g = Number(item.g ?? 255);
      const b = Number(item.b ?? 255);
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      colorIndexMap.set(hex, index);
      const code = item.id || item.name || item.code || hex.replace('#', '');
      return { id: code, name: item.name || code, r, g, b, hex, isExternal: false };
    });
    const createTransparentCell = () => ({ id: 'ERASE', name: 'Transparent', r: 255, g: 255, b: 255, hex: '#FFFFFF', isExternal: true });

    const gridSize = this.data.gridSize;
    const gridData = Array.from({ length: gridSize }, () => Array(gridSize).fill(-1));
    const mappedPixelData = Array.from({ length: gridSize }, () => Array(gridSize));

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const offset = row * gridSize + col;
        const hex = this._pixelStore ? this._pixelStore.getPixelHexByOffset(offset) : null;
        if (!hex) {
          mappedPixelData[row][col] = createTransparentCell();
          continue;
        }
        const index = colorIndexMap.get(String(hex).toUpperCase());
        if (index == null) {
          mappedPixelData[row][col] = createTransparentCell();
          continue;
        }
        gridData[row][col] = index;
        mappedPixelData[row][col] = mappedByIndex[index] || createTransparentCell();
      }
    }

    return { gridData, mappedPixelData };
  },

  async onExport() {
    if (!this._hasDrawableContent()) {
      wx.showToast({ title: '画板还没有内容', icon: 'none' });
      return;
    }
    this.setData({ loading: true, loadingText: '生成中...' });
    try {
      const canvas2dComponent = this.data.canvas2dComponent;
      if (!canvas2dComponent) throw new Error('Canvas组件未就绪');
      const tempFilePath = await canvas2dComponent.exportTempFilePath({ fileType: 'png', quality: 1 });
      this.setData({ loading: false });
      wx.previewImage({ urls: [tempFilePath], current: tempFilePath });
    } catch (err) {
      console.error('导出失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  _updateUsedColors() {
    let usageMap = this._colorUsageMap;
    if (this._pixelStore) {
      usageMap = this._pixelStore.getColorUsageMap();
      this._colorUsageMap = usageMap;
      this._nonWhiteCount = 0;
      usageMap.forEach((count) => {
        this._nonWhiteCount += count;
      });
    }

    const usedColors = Array.from(usageMap.entries()).map(([hex, count]) => ({
      hex,
      count,
      code: this._getColorCode(hex)
    })).sort((a, b) => b.count - a.count);

    // 动态调整颜色栏高度
    const hasUsedColors = usedColors.length > 0;
    const compactHeight = hasUsedColors ? 400 : 340;
    
    // 只在收起状态时更新高度
    if (!this.data.colorbarExpanded) {
      this.setData({ 
        usedColors,
        colorbarHeight: compactHeight
      });
    } else {
      this.setData({ usedColors });
    }
  },

  _updateColorRows() {
    const colors = this.data.colors || DEFAULT_COLORS;
    const mid = Math.ceil(colors.length / 2);
    
    // 为每个颜色添加色码
    const colorsWithCode = colors.map(color => ({
      hex: color,
      code: this._getColorCode(color)
    }));
    const currentColor = this.data.currentColor;
    const currentStillExists = currentColor && colors.some(color => String(color).toUpperCase() === String(currentColor).toUpperCase());
    const firstColor = colorsWithCode[0] || null;
    const updates = {
      colorsRow1: colorsWithCode.slice(0, mid),
      colorsRow2: colorsWithCode.slice(mid),
      colorsWithCode
    };

    if (!currentStillExists && firstColor) {
      updates.currentColor = firstColor.hex;
      updates.currentCode = firstColor.code;
    }
    
    this.setData(updates, () => {
      const hasUsedColors = this.data.usedColors && this.data.usedColors.length > 0;
      const compactHeight = hasUsedColors ? 400 : 340;
      const targetHeight = this.data.colorbarExpanded ? 700 : compactHeight;
      this._refreshVirtualColors(0, targetHeight);
    });
  },

  _updateAxisLabels() {
    const gridSize = this.data.gridSize;
    const canvasWidth = this.data.canvasWidth || 0;
    const canvasHeight = this.data.canvasHeight || 0;
    const cellWidth = gridSize > 0 ? canvasWidth / gridSize : 0;
    const cellHeight = gridSize > 0 ? canvasHeight / gridSize : 0;
    const coordinateCellSize = cellWidth || cellHeight || 0;
    const boardInset = coordinateCellSize;
    const boardCanvasWidth = canvasWidth + boardInset * 2;
    const boardCanvasHeight = canvasHeight + boardInset * 2;
    const digitCount = String(gridSize).length;
    const coordinateLabelFontSize = Math.max(3, Math.min(
      11,
      coordinateCellSize * 0.48,
      coordinateCellSize / Math.max(1.15, digitCount * 0.68)
    ));

    this.setData({
      coordinateCellSize,
      coordinateLabelFontSize,
      boardInset,
      boardCanvasWidth,
      boardCanvasHeight
    });
  },

  _updateHasPixels() {
    const hasPixels = this._nonWhiteCount > 0;
    if (this._lastHasPixelsValue === hasPixels && this.data.hasPixels === hasPixels) return;
    this._lastHasPixelsValue = hasPixels;
    this.setData({ hasPixels });
  },

  onSetActiveLayer(e) {
    const layer = e.currentTarget.dataset.layer;
    if (layer === 'background' && !this.data.backgroundImage) {
      wx.showToast({ title: '请先上传背景图', icon: 'none' });
      return;
    }
    
    // 选中背景时，自动切换到拖拽工具
    if (layer === 'background') {
      this.setData({ 
        activeLayer: layer,
        tool: 'drag'
      });
    } else {
      this.setData({ activeLayer: layer });
    }
    
    // 显示当前操作层提示
    const layerName = layer === 'canvas' ? '画布层' : '背景图层';
    wx.showToast({ 
      title: `已切换到${layerName}`, 
      icon: 'none',
      duration: 1500
    });
  },

  _refreshVirtualColors(scrollTopPx, containerHeightRpx) {
    if (!this._colorBarManager) return;
    const itemHeightPx = 92 * this._rpxToPx;
    const virtualResult = this._colorBarManager.getVisibleColors(
      this.data.colorsWithCode || [],
      Math.max(0, scrollTopPx || 0),
      Math.max(0, (containerHeightRpx || 0) * this._rpxToPx),
      itemHeightPx,
      8
    );
    this.setData({
      virtualColorsWithCode: virtualResult.visibleColors,
      virtualColorsOffsetTop: virtualResult.offsetTop / this._rpxToPx,
      virtualColorsTotalHeight: virtualResult.totalHeight / this._rpxToPx
    });
  },

  _getCompactColorbarHeight() {
    const hasUsedColors = this.data.usedColors && this.data.usedColors.length > 0;
    return hasUsedColors ? 400 : 340;
  },

  _openSettingsPanel() {
    if (this._settingsCloseTimer) {
      clearTimeout(this._settingsCloseTimer);
      this._settingsCloseTimer = null;
    }
    this.setData({
      showSettings: true,
      settingsClosing: false
    });
  },

  _closeSettingsPanel() {
    if (!this.data.showSettings && !this.data.settingsClosing) return;
    if (this._settingsCloseTimer) clearTimeout(this._settingsCloseTimer);

    this.setData({
      showSettings: false,
      settingsClosing: true
    });

    this._settingsCloseTimer = setTimeout(() => {
      this._settingsCloseTimer = null;
      this.setData({ settingsClosing: false });
    }, 180);
  },

  _closeColorbar() {
    const compactHeight = this._getCompactColorbarHeight();
    this.setData({
      colorbarExpanded: false,
      colorbarHeight: compactHeight
    }, () => {
      this._refreshVirtualColors(0, compactHeight);
    });
  },

  onToggleSettings() {
    if (this.data.showSettings) {
      this._closeSettingsPanel();
    } else {
      this._openSettingsPanel();
    }
  },

  onCloseSettings() {
    this._closeSettingsPanel();
  },

  onCanvasAreaTap(e) {
    // 如果面板展开，点击画板区域关闭
    if (this.data.colorbarExpanded || this.data.showSettings || this.data.settingsClosing) {
      this.onCloseAllPanels();
      return false;
    }
  },

  onToggleColorbar() {
    const nextExpanded = !this.data.colorbarExpanded;
    const compactHeight = this._getCompactColorbarHeight();
    const nextHeight = nextExpanded ? 700 : compactHeight;
    this.setData({
      colorbarExpanded: nextExpanded,
      colorbarHeight: nextHeight
    }, () => {
      this._refreshVirtualColors(0, nextHeight);
    });
  },

  // 颜色栏滑动手势
  onColorbarTouchStart(e) {
    this._colorbarTouchStartY = e.touches[0].clientY;
    const compactHeight = this._getCompactColorbarHeight();
    this._colorbarStartHeight = this.data.colorbarExpanded ? 700 : compactHeight;
  },

  onColorbarTouchMove(e) {
    if (!this._colorbarTouchStartY) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = this._colorbarTouchStartY - currentY; // 向上为正（px）
    
    // 计算新的高度（rpx）
    let newHeight = this._colorbarStartHeight + deltaY / this._rpxToPx;
    
    // 限制高度范围
    const minHeight = this._getCompactColorbarHeight();
    const maxHeight = 700;
    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

    if (this._colorBarManager) {
      this._refreshVirtualColors(
        Math.max(0, newHeight - minHeight) * this._rpxToPx,
        newHeight
      );
    }
    
    // 实时更新高度
    this.setData({ 
      colorbarHeight: newHeight,
      colorbarExpanded: newHeight > 500 // 超过 500rpx 视为展开状态
    });
  },

  onColorbarTouchEnd(e) {
    // 松手后，根据当前高度决定最终状态
    const finalExpanded = this.data.colorbarHeight > 500;
    const compactHeight = this._getCompactColorbarHeight();
    this.setData({ 
      colorbarExpanded: finalExpanded,
      colorbarHeight: finalExpanded ? 700 : compactHeight
    }, () => {
      this._refreshVirtualColors(0, finalExpanded ? 700 : compactHeight);
    });
    
    this._colorbarTouchStartY = null;
    this._colorbarStartHeight = null;
  },

  onExpandedColorsScroll(e) {
    if (!this._colorBarManager) return;

    const scrollTop = e && e.detail ? (e.detail.scrollTop || 0) : 0;
    const containerHeightRpx = this.data.colorbarExpanded ? 700 : this.data.colorbarHeight;
    this._refreshVirtualColors(scrollTop, containerHeightRpx);
  },

  onCloseColorbar() {
    this._closeColorbar();
  },

  onCloseAllPanels() {
    if (this.data.colorbarExpanded) this._closeColorbar();
    if (this.data.showSettings || this.data.settingsClosing) this._closeSettingsPanel();
  },

  stopPropagation() {},

  onLongPressColor(e) {
    const color = e.currentTarget.dataset.color;
    
    // 震动反馈
    wx.vibrateShort({ type: 'medium' });
    
    // 获取色号
    const colorItem = this._getColorItemByHex(color);
    const code = colorItem ? colorItem.code : '';
    
    // 获取触摸位置
    const touch = e.touches[0];
    
    this.setData({
      isDraggingColor: true,
      disableColorScroll: true,
      draggingColor: color,
      draggingColorCode: code,
      dragX: touch.clientX,
      dragY: touch.clientY,
      dragTargetColor: ''
    });
  },

  onSelectColor(e) {
    const color = e.currentTarget.dataset.color;
    
    const colorItem = this._getColorItemByHex(color);
    const code = colorItem ? colorItem.code : '';
    
    this.setData({
      currentColor: color,
      currentCode: code
    });
  },

  onColorDragMove(e) {
    if (!this.data.isDraggingColor) return;
    
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    
    // 更新拖动位置
    this.setData({
      dragX: x,
      dragY: y
    });
    
    // 检测是否悬停在已使用色号上
    this._getColorAtPosition(x, y, (targetColor) => {
      if (!this.data.isDraggingColor || this.data.dragX !== x || this.data.dragY !== y) return;

      if (targetColor && targetColor !== this.data.dragTargetColor) {
        // 轻微震动提示
        wx.vibrateShort({ type: 'light' });
        this.setData({ dragTargetColor: targetColor });
      } else if (!targetColor && this.data.dragTargetColor) {
        this.setData({ dragTargetColor: '' });
      }
    });
  },

  onColorDragEnd(e) {
    if (!this.data.isDraggingColor) return;
    
    const { draggingColor, dragTargetColor, draggingColorCode } = this.data;
    
    // 重置拖动状态
    this.setData({
      isDraggingColor: false,
      disableColorScroll: false,
      draggingColor: '',
      draggingColorCode: '',
      dragTargetColor: ''
    });
    
    // 如果有目标色号，弹出确认框
    if (dragTargetColor && dragTargetColor !== draggingColor) {
      const targetItem = this.data.usedColors.find(c => c.hex === dragTargetColor);
      const targetCode = targetItem ? targetItem.code : dragTargetColor;
      
      this.setData({
        showReplaceModal: true,
        replaceSourceColor: dragTargetColor,
        replaceSourceCode: targetCode,
        replaceTargetColor: draggingColor,
        replaceTargetCode: draggingColorCode
      });
    }
  },

  _getColorAtPosition(x, y, callback) {
    // 获取已使用色号区域的位置
    const query = wx.createSelectorQuery().in(this);
    query.selectAll('.used-color-item').boundingClientRect();
    query.exec((res) => {
      if (!res || !res[0]) {
        if (typeof callback === 'function') callback('');
        return;
      }
      
      const items = res[0];
      for (let i = 0; i < items.length; i++) {
        const rect = items[i];
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          // 找到对应的颜色
          const color = this.data.usedColors[i];
          if (typeof callback === 'function') callback(color ? color.hex : '');
          return;
        }
      }
      if (typeof callback === 'function') callback('');
    });
  },

  _replaceColorInCanvas(oldColor, newColor) {
    this._saveState();
    
    this._ensurePixelStoreFromGrid();
    const replaceCount = this._pixelStore ? this._pixelStore.replaceColor(oldColor, newColor) : 0;

    if (replaceCount === 0) {
      this._discardPendingState();
      wx.showToast({ title: '没有可替换的色块', icon: 'none' });
      return;
    }
    
    this._rebuildColorStatsFromGrid();
    
    // 重绘画布
    this._drawFullGrid();
    
    // 更新已使用颜色
    this._updateUsedColors();
    this._commitState('replace');
    
    wx.showToast({ 
      title: `已替换 ${replaceCount} 个色块`, 
      icon: 'success',
      duration: 2000
    });
  },

  onReplaceColor(e) {
    const sourceColor = e.currentTarget.dataset.color;
    const targetColor = this.data.replaceTargetColor;
    
    if (!sourceColor || !targetColor) return;
    
    this._saveState();
    
    this._ensurePixelStoreFromGrid();
    const replaceCount = this._pixelStore ? this._pixelStore.replaceColor(sourceColor, targetColor) : 0;

    if (replaceCount === 0) {
      this._discardPendingState();
      this.setData({ showColorReplaceModal: false });
      wx.showToast({ title: '没有可替换的色块', icon: 'none' });
      return;
    }
    
    this._rebuildColorStatsFromGrid();
    this._drawFullGrid();
    this._updateUsedColors();
    this._commitState('replace');
    
    this.setData({ showColorReplaceModal: false });
    wx.showToast({ title: `已替换${replaceCount}个色块`, icon: 'success' });
  },

  onCloseColorReplaceModal() {
    this.setData({ showColorReplaceModal: false });
  },

  onConfirmReplaceColor() {
    const { replaceSourceColor, replaceTargetColor } = this.data;
    this.setData({ showReplaceModal: false });
    if (replaceSourceColor && replaceTargetColor) {
      this._replaceColorInCanvas(replaceSourceColor, replaceTargetColor);
    }
  },

  onCancelReplaceColor() {
    this.setData({ showReplaceModal: false });
  },

  onBack() {
    if (!this._hasUnsavedChanges) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.showModal({
      title: '退出编辑',
      content: '当前图纸有未保存修改，确定退出吗？',
      confirmText: '退出',
      cancelText: '继续编辑',
      success: (res) => {
        if (res.confirm) wx.navigateBack({ delta: 1 });
      }
    });
  },

  // ========== 设置面板相关方法 ==========
  
  onToggleSizeDropdown() {
    this.setData({ 
      sizeDropdownOpen: !this.data.sizeDropdownOpen,
      brandDropdownOpen: false,
      paletteDropdownOpen: false
    });
  },

  onToggleBrandDropdown() {
    this.setData({ 
      brandDropdownOpen: !this.data.brandDropdownOpen,
      sizeDropdownOpen: false,
      paletteDropdownOpen: false
    });
  },

  onTogglePaletteDropdown() {
    this.setData({ 
      paletteDropdownOpen: !this.data.paletteDropdownOpen,
      sizeDropdownOpen: false,
      brandDropdownOpen: false
    });
  },

  onSelectPresetSize(e) {
    const rawSize = e.currentTarget.dataset.size;
    const size = this._clampGridSize(rawSize);
    if (!size) return;

    this.setData({ 
      sizeDropdownOpen: false,
      isPresetSize: true,
      customSize: ''
    });
    
    // 如果尺寸改变，直接应用新尺寸
    if (size !== this.data.gridSize) {
      this._saveState();
      this._applyGridSize(size, true);
    }
  },

  onCustomSizeInput(e) {
    const value = e.detail.value;
    this.setData({ customSize: value });
  },

  onCustomSizeConfirm(e) {
    const rawValue = this.data.customSize;
    const parsed = parseInt(rawValue, 10);
    
    if (Number.isNaN(parsed)) {
      wx.showToast({ 
        title: `请输入${MIN_GRID_SIZE}-${MAX_GRID_SIZE}之间的数字`, 
        icon: 'none' 
      });
      return;
    }

    const value = this._clampGridSize(parsed);
    if (value !== parsed) {
      wx.showToast({ title: SIZE_LIMIT_TIP, icon: 'none' });
    }
    
    // 标记为自定义尺寸
    this.setData({ isPresetSize: false, customSize: String(value) });
    
    // 直接应用自定义尺寸
    if (value !== this.data.gridSize) {
      this._saveState();
      this._applyGridSize(value, true);
    }
  },

  onSelectBrand(e) {
    const brand = e.currentTarget.dataset.brand;
    this.setData({ 
      brand: brand,
      brandDropdownOpen: false 
    });
    
    // 重新加载该品牌的色卡
    this.loadPaletteColors(brand);
  },

  // ========== 工具栏相关方法 ==========
  
  onSelectTool(e) {
    const tool = e.currentTarget.dataset.tool;
    
    // 如果在背景图层，只允许拖拽工具
    if (this.data.activeLayer === 'background' && tool !== 'drag') {
      wx.showToast({ title: '背景图层只能使用拖拽工具', icon: 'none' });
      return;
    }
    
    this.setData({ tool: tool });
    
    // 切换到非画笔工具时，关闭对称功能
    if (tool !== 'pen' && this.data.symmetry) {
      this.setData({ symmetry: false });
    }
  },

  onToggleSymmetry() {
    // 只有画笔工具且在画布图层才能使用对称
    if (this.data.tool !== 'pen') {
      wx.showToast({ title: '对称功能仅在画笔工具下可用', icon: 'none' });
      return;
    }
    
    if (this.data.activeLayer === 'background') {
      wx.showToast({ title: '背景图层不支持对称', icon: 'none' });
      return;
    }
    
    this.setData({ symmetry: !this.data.symmetry });
  },

  onToggleMirror() {
    // 锁定模式：画布和背景一起镜像
    if (this.data.locked && this.data.backgroundImage) {
      if (!this.data.hasPixels) {
        wx.showToast({ title: '画布无笔迹时不可镜像', icon: 'none' });
        return;
      }
      
      this._saveState();
      
      this._ensurePixelStoreFromGrid();
      if (this._pixelStore) {
        this._pixelStore.mirrorHorizontal();
        if (this._canvasRenderer) this._canvasRenderer.invalidatePixelLayer();
      }
      this._drawFullGrid();
      this._updateUsedColors();
      this._updateHasPixels();
      
      // 背景也一起镜像
      this.setData({ 
        mirror: !this.data.mirror,
        backgroundMirror: !this.data.backgroundMirror
      }, () => {
        this._commitState('mirror');
      });

      wx.showToast({ title: '画布和背景已一起镜像', icon: 'success', duration: 1500 });
      return;
    }
    
    // 画布图层：需要有笔迹才能镜像
    if (this.data.activeLayer === 'canvas' && !this.data.hasPixels) {
      wx.showToast({ title: '画布无笔迹时不可镜像', icon: 'none' });
      return;
    }
    
    // 背景图层：需要有背景图才能镜像
    if (this.data.activeLayer === 'background' && !this.data.backgroundImage) {
      wx.showToast({ title: '无背景图时不可镜像', icon: 'none' });
      return;
    }
    
    this._saveState();
    
    if (this.data.activeLayer === 'canvas') {
      this._ensurePixelStoreFromGrid();
      if (this._pixelStore) {
        this._pixelStore.mirrorHorizontal();
        if (this._canvasRenderer) this._canvasRenderer.invalidatePixelLayer();
      }
      this._drawFullGrid();
      this._updateUsedColors();
      this._updateHasPixels();
      
      this.setData({ mirror: !this.data.mirror }, () => {
        this._commitState('mirror');
      });
    } else {
      // 背景图层镜像：翻转背景图
      this.setData({ backgroundMirror: !this.data.backgroundMirror }, () => {
        this._commitState('mirror');
      });
    }
  },

  onToggleLock() {
    if (!this.data.backgroundImage) {
      wx.showToast({ title: '无背景图时不可锁定', icon: 'none' });
      return;
    }
    
    // 问题3修复：锁定/解锁时不改变任何位置，只改变锁定状态
    const willLock = !this.data.locked;
    
    // 只改变锁定状态，不修改任何位置参数
    this.setData({ locked: willLock });
    
    const lockStatus = willLock ? '已锁定' : '已解锁';
    wx.showToast({ 
      title: lockStatus, 
      icon: 'none',
      duration: 1500
    });
  },

  // ========== 背景图吸色功能 ==========
  
  _pickColorFromBackground(clientX, clientY) {
    const query = wx.createSelectorQuery();
    query.select('.background-image').boundingClientRect();
    query.exec((res) => {
      if (!res || !res[0]) {
        wx.showToast({ title: '无法获取背景图', icon: 'none' });
        return;
      }
      
      const rect = res[0];
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top;
      if (relativeX < 0 || relativeX > rect.width || relativeY < 0 || relativeY > rect.height) return;

      const canvasX = relativeX / rect.width * this.data.canvasWidth;
      const canvasY = relativeY / rect.height * this.data.canvasHeight;
      const imagePoint = this._canvasPointToBackgroundImagePoint(canvasX, canvasY);
      if (!imagePoint) return;
      
      this._getBackgroundPixelColorCanvas2D(imagePoint.xRatio, imagePoint.yRatio);
    });
  },

  _getBackgroundPixelColorCanvas2D(xRatio, yRatio) {
    // 创建临时 Canvas 2D 来读取背景图
    wx.createSelectorQuery()
      .select('#tempCanvas2d')
      .node()
      .exec((res) => {
        if (!res || !res[0]) {
          // 如果 Canvas 2D 不可用，使用颜色匹配估算
          this._estimateBackgroundColor();
          return;
        }
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 1;
        
        // 设置 Canvas 尺寸
        const size = 100;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        
        // 创建图片对象
        const img = canvas.createImage();
        img.onload = () => {
          // 绘制图片
          ctx.drawImage(img, 0, 0, size, size);
          
          // 读取像素
          const x = Math.floor(xRatio * size);
          const y = Math.floor(yRatio * size);
          
          try {
            const imageData = ctx.getImageData(x, y, 1, 1);
            const data = imageData.data;
            const r = data[0];
            const g = data[1];
            const b = data[2];
            
            // 转换为 Hex
            const pickedColor = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            
            // 匹配相近色
            const nearestColor = this._findNearestColor(pickedColor);
            const colorItem = this._getColorItemByHex(nearestColor);
            this.setData({
              currentColor: nearestColor,
              currentCode: colorItem ? colorItem.code : this.data.currentCode,
              tool: 'pen'
            });
            
            wx.vibrateShort({ type: 'light' });
            wx.showToast({ title: '已从背景图选取颜色', icon: 'success', duration: 1000 });
          } catch (err) {
            console.error('读取像素失败:', err);
            this._estimateBackgroundColor();
          }
        };
        
        img.onerror = () => {
          console.error('图片加载失败');
          this._estimateBackgroundColor();
        };
        
        img.src = this.data.backgroundImage;
      });
  },

  _estimateBackgroundColor() {
    // 如果无法读取背景图像素，从当前颜色栏中选择一个颜色
    const colors = this.data.colors;
    if (colors && colors.length > 0) {
      // 选择一个中间的颜色
      const midIndex = Math.floor(colors.length / 2);
      const color = colors[midIndex];
      const colorItem = this._getColorItemByHex(color);
      this.setData({
        currentColor: color,
        currentCode: colorItem ? colorItem.code : this.data.currentCode,
        tool: 'pen'
      });
      
      wx.vibrateShort({ type: 'light' });
      wx.showToast({ title: '已选取颜色', icon: 'success', duration: 1000 });
    }
  },

  _findNearestColor(targetColor) {
    const colorRgbList = this._getColorRgbList();
    if (!colorRgbList.length) return '#FF6B35';
    
    let minDistance = Infinity;
    let nearestColor = colorRgbList[0].color;
    
    const targetRGB = this._hexToRGB(targetColor);
    if (!targetRGB) return nearestColor;
    
    colorRgbList.forEach(({ color, rgb }) => {
      const dr = rgb.r - targetRGB.r;
      const dg = rgb.g - targetRGB.g;
      const db = rgb.b - targetRGB.b;
      const distance = dr * dr + dg * dg + db * db;
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestColor = color;
      }
    });
    
    return nearestColor;
  },

  _hexToRGB(hex) {
    if (!hex || typeof hex !== 'string') return null;
    // 移除 # 号
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length < 6) return null;
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
});
