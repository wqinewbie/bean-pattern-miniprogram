// 沉浸式拼豆页面 - Canvas 2D 版本
const request = require('../../utils/request');
const { drawImmersiveGrid, getTextColor } = require('../../utils/canvas2d/renderers/immersiveRenderer');
const storage = require('../../utils/storage');

Page({
  data: {
    gridSize: 32,
    canvasSize: 320,
    displaySize: 320,
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
    loading: true,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    panelExpanded: false,
    panelHeight: 360,
  },
  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _hRun: [],
  _vRun: [],
  _longPressTimer: null,
  
  // 瑙︽懜鐩稿叧
  _isPinching: false,
  _isDragging: false,
  _touchStartDistance: 0,
  _touchStartScale: 1,
  _touchStartCenterX: 0,
  _touchStartCenterY: 0,
  _dragStartX: 0,
  _dragStartY: 0,
  _startOffsetX: 0,
  _startOffsetY: 0,
  _maxScale: 3,
  _minScale: 1,
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

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    this._rpxToPx = info.windowWidth / 750;
    this._windowWidth = info.windowWidth;
    this._windowHeight = info.windowHeight;

    // 璁＄畻鐢诲竷灏哄
    const navReserve = 96;
    const maxByHeight = Math.max(220, info.windowHeight - navReserve - 48);
    const maxSize = Math.min(info.windowWidth - 48, maxByHeight, 600);
    const canvasSize = Math.floor(maxSize);

    this.setData({
      canvasSize,
      displaySize: canvasSize,
      panelHeight: this._getCompactPanelHeight()
    });
    
    // 鍔犺浇鏁版嵁
    this._loadData(options);
  },

  onUnload() {
    this._saveProgress();
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    if (this._renderResizeTimer) {
      clearTimeout(this._renderResizeTimer);
      this._renderResizeTimer = null;
    }
  },

  // ========== 鏁版嵁鍔犺浇 ==========
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
    
    this.setData({
      gridSize,
      gridData,
      palette,
      completedMap,
      highlightId: palette[0] ? palette[0].id : '',
      loading: false
    }, () => {
      this._calcRuns();
      this._updateLists();
      // 鏁版嵁鍔犺浇瀹屾垚鍚庯紝濡傛灉 Canvas 宸插氨缁紝绔嬪嵆娓叉煋
      if (this.data.canvasReady) {
        this._renderCanvas();
      }
    });
  },

  // ========== Canvas 2D 鐩稿叧 ==========
  onCanvasReady(e) {
    console.log('Canvas 2D Ready', e.detail);
    const canvas2dComponent = this.selectComponent('#immersiveCanvas');
    if (!canvas2dComponent) return;
    
    const context = canvas2dComponent.getContext();
    if (!context.ready) return;
    
    this._canvas = context.canvas;
    this._ctx = context.ctx;
    this._dpr = context.dpr;
    
    this.setData({ canvasReady: true }, () => {
      this._resizeCanvasToDisplaySize(this.data.displaySize, true);
      // Canvas 灏辩华鍚庯紝濡傛灉鏁版嵁宸插姞杞斤紝绔嬪嵆娓叉煋
      if (this.data.gridData && this.data.gridData.length > 0) {
        this._renderCanvas();
      }
    });
  },

  onCanvasError(e) {
    console.error('Canvas 2D Error:', e.detail);
    wx.showToast({ title: 'Canvas初始化失败', icon: 'none' });
  },

  _renderCanvas() {
    if (!this._ctx || !this.data.canvasReady) {
      console.log('Canvas not ready, skip render');
      return;
    }
    
    if (!this.data.gridData || this.data.gridData.length === 0) {
      console.log('Grid data not ready, skip render');
      return;
    }
    
    const { displaySize, gridSize, gridData, highlightId, completedMap, contrast, tab } = this.data;
    
    let mode = 'colorId';
    if (tab === 'row') mode = 'horizontal';
    else if (tab === 'col') mode = 'vertical';
    
    drawImmersiveGrid(this._ctx, {
      width: displaySize,
      height: displaySize,
      gridSize,
      gridData,
      highlightId,
      completedMap,
      contrast,
      mode,
      hRun: this._hRun,
      vRun: this._vRun,
      recommendedCell: null,
      dpr: this._dpr
    });
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

  _resizeCanvasToDisplaySize(size, immediate) {
    if (!this.data.canvasReady) return;
    const canvas2dComponent = this.selectComponent('#immersiveCanvas');
    if (!canvas2dComponent) return;

    const applyResize = () => {
      if (canvas2dComponent.resizeSync) {
        canvas2dComponent.resizeSync(size, size);
      } else if (canvas2dComponent.resize) {
        canvas2dComponent.resize(size, size);
      }
      const context = canvas2dComponent.getContext && canvas2dComponent.getContext();
      if (context && context.ready) {
        this._canvas = context.canvas;
        this._ctx = context.ctx;
        this._dpr = context.dpr;
      }
      this._renderCanvas();
    };

    if (immediate) {
      if (this._renderResizeTimer) {
        clearTimeout(this._renderResizeTimer);
        this._renderResizeTimer = null;
      }
      applyResize();
      return;
    }

    if (this._renderResizeTimer) clearTimeout(this._renderResizeTimer);
    this._renderResizeTimer = setTimeout(() => {
      this._renderResizeTimer = null;
      applyResize();
    }, 16);
  },

  _setViewport(scale, offsetX, offsetY, immediateRender) {
    const displaySize = Math.max(1, Math.round((this.data.canvasSize || 1) * scale));
    this.setData({
      scale,
      displaySize,
      offsetX,
      offsetY
    }, () => {
      this._resizeCanvasToDisplaySize(displaySize, immediateRender);
    });
  },

  // ========== 璁＄畻妯珫璁℃暟 ==========
  _calcRuns() {
    const { gridSize, highlightId, gridData } = this.data;
    const h = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    const v = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    
    if (!highlightId || !gridData.length) {
      this._hRun = h;
      this._vRun = v;
      return;
    }
    
    // 妯悜璁℃暟
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
    
    // 绔栧悜璁℃暟
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

  // ========== 鏇存柊鍒楄〃鏁版嵁 ==========
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

  // ========== 浜や簰浜嬩欢 ==========
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
            highlightId: this.data.palette[0] ? this.data.palette[0].id : '',
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

  // ========== 淇濆瓨杩涘害 ==========
  _getCompactPanelHeight() {
    return 360;
  },

  _getExpandedPanelHeight() {
    return 760;
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
    this._panelTouchStartY = e.touches[0].clientY;
    this._panelStartHeight = this.data.panelHeight;
    this._panelMoved = false;
  },

  onPanelTouchMove(e) {
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

  // ========== 瑙︽懜浜嬩欢锛堝弻鎸囩缉鏀惧拰鎷栨嫿锛?==========
  handleTouchStart(e) {
    const touches = e.touches;
    
    // 鍙屾寚缂╂斁
    if (touches.length === 2) {
      this._isPinching = true;
      this._isDragging = false;
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      this._touchStartDistance = this._getDistance(touch1, touch2);
      this._touchStartScale = this.data.scale;
      const center = this._getTouchCenter(touch1, touch2);
      this._touchStartCenterX = center.clientX;
      this._touchStartCenterY = center.clientY;
      this._startOffsetX = this.data.offsetX;
      this._startOffsetY = this.data.offsetY;
      return;
    }
    
    if (touches.length === 1) {
      const touch = touches[0];
      const now = Date.now();
      const dt = now - (this._lastTapTime || 0);
      const dx = (touch.clientX || 0) - (this._lastTapX || 0);
      const dy = (touch.clientY || 0) - (this._lastTapY || 0);
      const move2 = dx * dx + dy * dy;

      if (dt > 0 && dt <= 300 && move2 <= 30 * 30) {
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
      this._startOffsetX = this.data.offsetX;
      this._startOffsetY = this.data.offsetY;
    }
  },

  handleTouchMove(e) {
    const touches = e.touches;
    
    // 鍙屾寚缂╂斁
    if (touches.length === 2 && this._isPinching) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const currentDistance = this._getDistance(touch1, touch2);
      if (!this._touchStartDistance) return;
      
      // 璁＄畻缂╂斁姣斾緥
      const scaleChange = currentDistance / this._touchStartDistance;
      let newScale = this._touchStartScale * scaleChange;
      
      // 闄愬埗缂╂斁鑼冨洿
      newScale = Math.max(this._minScale, Math.min(this._maxScale, newScale));

      const currentCenter = this._getTouchCenter(touch1, touch2);
      const startScale = this._touchStartScale || 1;
      const scaleRatio = newScale / startScale;
      const nextOffsetX = currentCenter.clientX - this._touchStartCenterX + this._startOffsetX * scaleRatio;
      const nextOffsetY = currentCenter.clientY - this._touchStartCenterY + this._startOffsetY * scaleRatio;
      const clamped = this._clampOffset(nextOffsetX, nextOffsetY, newScale);
      this._setViewport(newScale, clamped.offsetX, clamped.offsetY, false);
      return;
    }
    
    // 鍗曟寚鎷栨嫿
    if (touches.length === 1 && this._isDragging) {
      const deltaX = touches[0].clientX - this._dragStartX;
      const deltaY = touches[0].clientY - this._dragStartY;
      const nextOffsetX = this._startOffsetX + deltaX;
      const nextOffsetY = this._startOffsetY + deltaY;
      const clamped = this._clampOffset(nextOffsetX, nextOffsetY, this.data.scale);
      
      this.setData({
        offsetX: clamped.offsetX,
        offsetY: clamped.offsetY
      });
    }
  },

  handleTouchEnd(e) {
    if (this._isPinching) {
      const displaySize = Math.max(1, Math.round((this.data.canvasSize || 1) * this.data.scale));
      this._resizeCanvasToDisplaySize(displaySize, true);
    }
    this._isPinching = false;
    this._isDragging = false;
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

  _clampOffset(offsetX, offsetY, scale) {
    const displaySize = Math.max(1, (this.data.canvasSize || 0) * scale);
    const viewportWidth = this._windowWidth || wx.getSystemInfoSync().windowWidth;
    const viewportHeight = Math.max(1, (this._windowHeight || wx.getSystemInfoSync().windowHeight) - 96);
    const maxOffsetX = Math.max(24, (viewportWidth + displaySize) / 2 - 48);
    const maxOffsetY = Math.max(24, (viewportHeight + displaySize) / 2 - 48);

    return {
      offsetX: Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX)),
      offsetY: Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY))
    };
  },

  _resetViewport() {
    this._setViewport(1, 0, 0, true);
  }
});
