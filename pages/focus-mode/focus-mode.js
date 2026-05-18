// 沉浸式拼豆页面 - Canvas 2D 版本（Figma 样式移植）
const request = require('../../utils/request');
const { drawImmersiveGrid, getTextColor } = require('../../utils/canvas2d/renderers/immersiveRenderer');
const storage = require('../../utils/storage');

Page({
  data: {
    // 基础信息
    gridSize: 32,
    canvasSize: 320,
    
    // 网格数据
    gridData: [],
    palette: [],
    
    // UI 状态
    tab: 'color',
    highlightId: '',
    contrast: 50,
    completedMap: {},
    
    // 列表数据
    rowList: [],
    colList: [],
    remainingByColor: {},
    
    // Canvas 状态
    canvasReady: false,
    loading: true,
    
    // 缩放和拖拽
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  },

  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _hRun: [],
  _vRun: [],
  _longPressTimer: null,
  
  // 触摸相关
  _isPinching: false,
  _isDragging: false,
  _touchStartDistance: 0,
  _touchStartScale: 1,
  _dragStartX: 0,
  _dragStartY: 0,
  _startOffsetX: 0,
  _startOffsetY: 0,
  _maxScale: 3,
  _lastTapTime: 0,
  _lastTapX: 0,
  _lastTapY: 0,

  onLoad(options) {
    const info = wx.getSystemInfoSync();

    // 计算画布尺寸
    const maxSize = Math.min(info.windowWidth - 48, 600);
    const canvasSize = Math.floor(maxSize);

    this.setData({ canvasSize });
    
    // 加载数据
    this._loadData(options);
  },

  onUnload() {
    this._saveProgress();
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
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
        
        this._initWithData(data);
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
    
    // 转换为网格数据
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
    
    // 构建调色板
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
      // 数据加载完成后，如果 Canvas 已就绪，立即渲染
      if (this.data.canvasReady) {
        this._renderCanvas();
      }
    });
  },

  // ========== Canvas 2D 相关 ==========
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
      // Canvas 就绪后，如果数据已加载，立即渲染
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
    
    const { canvasSize, gridSize, gridData, highlightId, completedMap, contrast, tab } = this.data;
    
    let mode = 'colorId';
    if (tab === 'row') mode = 'horizontal';
    else if (tab === 'col') mode = 'vertical';
    
    drawImmersiveGrid(this._ctx, {
      width: canvasSize,
      height: canvasSize,
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
      // 标记该色号完成
      if (newMap[value]) {
        delete newMap[value];
      } else {
        newMap[value] = true;
      }
    } else if (type === 'row') {
      // 标记该行所有色号完成
      const y = parseInt(value, 10);
      const ids = new Set();
      gridData[y].forEach(cell => {
        if (cell) ids.add(cell.id);
      });
      ids.forEach(id => {
        newMap[id] = true;
      });
    } else if (type === 'col') {
      // 标记该列所有色号完成
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

  // ========== 保存进度 ==========
  _saveProgress() {
    const { completedMap } = this.data;
    const boxId = this._boxId;
    
    if (!boxId) return;
    
    request.post('/box/progress', {
      boxId: boxId,
      progressData: JSON.stringify({ completedMap })
    }).catch(() => {});
  },

  // ========== 触摸事件（双指缩放和拖拽） ==========
  handleTouchStart(e) {
    const touches = e.touches;
    
    // 双指缩放
    if (touches.length === 2) {
      this._isPinching = true;
      this._isDragging = false;
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      this._touchStartDistance = this._getDistance(touch1, touch2);
      this._touchStartScale = this.data.scale;
      return;
    }
    
    // 单指：先做双击检测，再进入拖拽
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
    
    // 双指缩放
    if (touches.length === 2 && this._isPinching) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const currentDistance = this._getDistance(touch1, touch2);
      
      // 计算缩放比例
      const scaleChange = currentDistance / this._touchStartDistance;
      let newScale = this._touchStartScale * scaleChange;
      
      // 限制缩放范围
      newScale = Math.max(this._minScale, Math.min(this._maxScale, newScale));

      const clamped = this._clampOffset(this.data.offsetX, this.data.offsetY, newScale);
      this.setData({
        scale: newScale,
        offsetX: clamped.offsetX,
        offsetY: clamped.offsetY
      });
      return;
    }
    
    // 单指拖拽
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
    this._isPinching = false;
    this._isDragging = false;
  },

  _getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  _clampOffset(offsetX, offsetY, scale) {
    const canvasSize = this.data.canvasSize || 0;
    const extra = Math.max(0, (canvasSize * scale - canvasSize) / 2);
    const maxOffset = extra + 24;

    return {
      offsetX: Math.max(-maxOffset, Math.min(maxOffset, offsetX)),
      offsetY: Math.max(-maxOffset, Math.min(maxOffset, offsetY))
    };
  },

  _resetViewport() {
    this.setData({
      scale: 1,
      offsetX: 0,
      offsetY: 0
    });
  }
});
