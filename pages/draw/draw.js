// 拼豆画板 - Canvas 2D 版本
const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { drawBoard, drawPixel } = require('../../utils/canvas2d/renderers/boardRenderer');

// 默认颜色
const DEFAULT_COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF6B35', '#FF69B4', '#00CED1', '#9370DB', '#FFA500', '#008B8B',
  '#DC143C', '#32CD32', '#4169E1', '#FFD700', '#808080', '#2F4F4F',
  '#FF6B6B', '#90EE90', '#87CEEB', '#DDA0DD', '#F0E68C', '#E6E6FA'
];
const MAX_GRID_SIZE = 200;
const MIN_GRID_SIZE = 16;
const BASE_PRESET_SIZES = [24, 36, 50, 52, 64, 78, 104, 200];

Page({
  data: {
    gridSize: 52,
    canvasWidth: 320,
    canvasHeight: 320,
    gridCellSize: 320 / 52,
    majorGridSizePx: 320 / 52 * 5,
    gridLineWidth: 1,
    majorLineWidth: 2,
    gridLineWidthPx: 0.7,
    majorLineWidthPx: 1.2,
    gridLines: [],
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
    brandList: ['MARD', 'Hama', 'Perler', 'Artkal'],
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
    colorbarExpanded: false,
    colorbarHeight: 340,
    usedColors: [],
    colorsRow1: [],
    colorsRow2: [],
    canvasReady: false,
    canvas2dComponent: null,
    canvasOffsetX: 30,
    canvasOffsetY: -80,
    canvasScale: 1,
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1,
    stageOffsetX: 0,
    stageOffsetY: 0,
    stageScale: 1,
    topAxisLabels: [],
    bottomAxisLabels: [],
    leftAxisLabels: [],
    rightAxisLabels: [],
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
    overlayGridData: [],
    overlayColorCodeMap: {}
  },

  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _gridData: null,
  _cellSize: 10,
  _undoStack: [],
  _redoStack: [],
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
  
  // 拖拽和缩放优化
  _touchStartDistance: 0,
  _touchStartScale: 1,
  _isPinching: false,
  _lastTouchTime: 0,
  _velocityX: 0,
  _velocityY: 0,
  _animationFrame: null,
  _minScale: 0.5,
  _maxScale: 40,
  _compositeRect: null,
  _cachedCompositeCanvas: null,
  _isCompositing: false,

  _getActiveTransformTarget() {
    if (this.data.activeLayer === 'background' && !this.data.locked && this.data.backgroundImage) {
      return 'background';
    }
    return 'canvas';
  },

  _getGridOverlayMetrics(viewScale) {
    const scale = Math.max(Number(viewScale) || 1, 1);
    const cellSize = Number(this.data.gridCellSize) || (this.data.canvasWidth / this.data.gridSize);
    const visualCellSize = cellSize * scale;
    const screenThin = Math.max(0.55, Math.min(1.1, visualCellSize * 0.018));
    const screenThick = Math.max(0.9, Math.min(1.9, visualCellSize * 0.032));
    return {
      gridLineWidth: Math.max(screenThin / scale, 0.02),
      majorLineWidth: Math.max(screenThick / scale, 0.04)
    };
  },

  _buildGridLines(gridSize, canvasSize) {
    const cellSize = canvasSize / gridSize;
    const lines = [];
    for (let i = 0; i <= gridSize; i++) {
      const isMajor = i % 5 === 0;
      lines.push({
        index: i,
        pos: i === gridSize ? canvasSize : i * cellSize,
        screenPos: 0,
        major: isMajor,
        type: isMajor ? 'major' : 'minor'
      });
    }
    return lines;
  },

  _updateGridOverlayPosition() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.canvas-wrapper').boundingClientRect();
    query.exec((res) => {
      if (!res || !res[0]) return;
      
      const rect = res[0];
      const scale = this.data.canvasScale;
      
      // canvas-wrapper 有 1rpx 边框 + box-shadow，实际偏移更大
      const borderOffset = 6;
      
      const gridLines = this.data.gridLines.map(line => ({
        ...line,
        screenPos: line.pos * scale
      }));

      this.setData({
        gridOverlayLeft: rect.left + borderOffset,
        gridOverlayTop: rect.top + borderOffset,
        gridOverlayWidth: rect.width - borderOffset * 2,
        gridOverlayHeight: rect.height - borderOffset * 2,
        gridLines: gridLines
      });
    });
  },

  _updateGridLineWidths(scale) {
    // 固定线宽，不再随缩放变化
  },

  _getCanvasVisualScale(nextCanvasScale, nextStageScale) {
    const canvasScale = nextCanvasScale == null ? this.data.canvasScale : nextCanvasScale;
    const stageScale = nextStageScale == null ? this.data.stageScale : nextStageScale;
    return this.data.locked && this.data.backgroundImage ? canvasScale * stageScale : canvasScale;
  },

  _clampGridSize(size) {
    const n = parseInt(size, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, n));
  },

  _snapshotState() {
    // 问题2修复：快照中包含 gridSize，支持撤回尺寸变更
    return JSON.stringify({
      gridData: this._gridData,
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
      backgroundImage: this.data.backgroundImage || '',
      stageOffsetX: this.data.stageOffsetX || 0,
      stageOffsetY: this.data.stageOffsetY || 0,
      stageScale: this.data.stageScale || 1
    });
  },

  _restoreState(snapshotText) {
    if (!snapshotText) return;
    let snapshot = null;
    try {
      snapshot = JSON.parse(snapshotText);
    } catch (e) {
      return;
    }
    if (!snapshot || !Array.isArray(snapshot.gridData)) return;

    this._gridData = snapshot.gridData;
    this._rebuildColorStatsFromGrid();

    // 问题2修复：恢复 gridSize，如果尺寸改变则重新计算画布
    const needResizeCanvas = snapshot.gridSize != null && snapshot.gridSize !== this.data.gridSize;
    
    if (needResizeCanvas) {
      const canvasSize = this._getAdaptiveCanvasSize();
      this.setData({
        gridSize: snapshot.gridSize,
        canvasWidth: canvasSize,
        canvasHeight: canvasSize,
        gridCellSize: canvasSize / snapshot.gridSize,
        majorGridSizePx: canvasSize / snapshot.gridSize * 5,
        gridLines: this._buildGridLines(snapshot.gridSize, canvasSize),
        canvasOffsetX: snapshot.canvasOffsetX == null ? this.data.canvasOffsetX : snapshot.canvasOffsetX,
        canvasOffsetY: snapshot.canvasOffsetY == null ? this.data.canvasOffsetY : snapshot.canvasOffsetY,
        canvasScale: snapshot.canvasScale == null ? this.data.canvasScale : snapshot.canvasScale,
        backgroundOffsetX: snapshot.backgroundOffsetX == null ? this.data.backgroundOffsetX : snapshot.backgroundOffsetX,
        backgroundOffsetY: snapshot.backgroundOffsetY == null ? this.data.backgroundOffsetY : snapshot.backgroundOffsetY,
        backgroundScale: snapshot.backgroundScale == null ? this.data.backgroundScale : snapshot.backgroundScale,
        backgroundMirror: snapshot.backgroundMirror == null ? this.data.backgroundMirror : snapshot.backgroundMirror,
        locked: snapshot.locked == null ? this.data.locked : snapshot.locked,
        showBackground: snapshot.showBackground == null ? this.data.showBackground : snapshot.showBackground,
        backgroundImage: snapshot.backgroundImage == null ? this.data.backgroundImage : snapshot.backgroundImage,
        stageOffsetX: snapshot.stageOffsetX == null ? this.data.stageOffsetX : snapshot.stageOffsetX,
        stageOffsetY: snapshot.stageOffsetY == null ? this.data.stageOffsetY : snapshot.stageOffsetY,
        stageScale: snapshot.stageScale == null ? this.data.stageScale : snapshot.stageScale
      });
      this._updateAxisLabels();
    } else {
      this.setData({
        canvasOffsetX: snapshot.canvasOffsetX == null ? this.data.canvasOffsetX : snapshot.canvasOffsetX,
        canvasOffsetY: snapshot.canvasOffsetY == null ? this.data.canvasOffsetY : snapshot.canvasOffsetY,
        canvasScale: snapshot.canvasScale == null ? this.data.canvasScale : snapshot.canvasScale,
        backgroundOffsetX: snapshot.backgroundOffsetX == null ? this.data.backgroundOffsetX : snapshot.backgroundOffsetX,
        backgroundOffsetY: snapshot.backgroundOffsetY == null ? this.data.backgroundOffsetY : snapshot.backgroundOffsetY,
        backgroundScale: snapshot.backgroundScale == null ? this.data.backgroundScale : snapshot.backgroundScale,
        backgroundMirror: snapshot.backgroundMirror == null ? this.data.backgroundMirror : snapshot.backgroundMirror,
        locked: snapshot.locked == null ? this.data.locked : snapshot.locked,
        showBackground: snapshot.showBackground == null ? this.data.showBackground : snapshot.showBackground,
        backgroundImage: snapshot.backgroundImage == null ? this.data.backgroundImage : snapshot.backgroundImage,
        stageOffsetX: snapshot.stageOffsetX == null ? this.data.stageOffsetX : snapshot.stageOffsetX,
        stageOffsetY: snapshot.stageOffsetY == null ? this.data.stageOffsetY : snapshot.stageOffsetY,
        stageScale: snapshot.stageScale == null ? this.data.stageScale : snapshot.stageScale
      });
    }

    // 更新 canvasRect，因为位置和缩放可能改变了
    this._updateCanvasRect();
    
    this._drawFullGrid();
    this._updateUsedColors();
    this._updateHasPixels();
  },

  _setCanvasTransform(updates) {
    const nextCanvasScale = updates.canvasScale == null ? this.data.canvasScale : updates.canvasScale;
    const nextStageScale = updates.stageScale == null ? this.data.stageScale : updates.stageScale;
    const visualScale = this._getCanvasVisualScale(nextCanvasScale, nextStageScale);
    this.setData({
      ...updates,
      ...this._getGridOverlayMetrics(visualScale)
    });
  },

  _normalizeColor(color) {
    if (!color) return '#FFFFFF';
    return String(color).toUpperCase();
  },

  _bumpColorCount(color, delta) {
    const c = this._normalizeColor(color);
    if (c === '#FFFFFF') return;
    const next = (this._colorUsageMap.get(c) || 0) + delta;
    if (next <= 0) this._colorUsageMap.delete(c);
    else this._colorUsageMap.set(c, next);
    this._nonWhiteCount = Math.max(0, this._nonWhiteCount + delta);
  },

  _rebuildColorStatsFromGrid() {
    this._colorUsageMap = new Map();
    this._nonWhiteCount = 0;
    if (!this._gridData || !Array.isArray(this._gridData) || this._gridData.length === 0) return;

    const gridSize = this._gridData.length; // 使用实际的 gridData 长度
    for (let y = 0; y < gridSize; y++) {
      if (!this._gridData[y] || !Array.isArray(this._gridData[y])) continue; // 检查行是否存在
      for (let x = 0; x < this._gridData[y].length; x++) {
        const color = this._normalizeColor(this._gridData[y][x]);
        if (color !== '#FFFFFF') {
          this._colorUsageMap.set(color, (this._colorUsageMap.get(color) || 0) + 1);
          this._nonWhiteCount++;
        }
      }
    }
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
    }, 16);
  },

  onLoad(options) {
    const { storageKey, source } = options;
    const info = wx.getSystemInfoSync();
    const statusBarHeight = info.statusBarHeight || 20;
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const capsuleHeight = menuButton.height || 32;
    const capsuleTop = menuButton.top - statusBarHeight || 6;
    const navBarHeight = capsuleHeight + capsuleTop * 2;
    
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
    
    if (source === 'result' && storageKey) {
      this._loadDrawData(storageKey);
    } else {
      this._initData();
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
        brandList: ['MARD', 'Hama', 'Perler', 'Artkal'],
        brand: 'MARD',
        brandIndex: 0,
        colors: DEFAULT_COLORS
      });
      this._updateColorRows();
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
      
      // 保存套餐列表，选择第一个套餐（最小色卡）
      this.setData({ 
        kitList: kits,
        selectedKitId: kits[0].id,
        selectedKitName: kits[0].name
      });
      
      // 加载第一个套餐的色号
      return this.loadKitColors(kits[0].id);
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
      
      // 转换为 hex 格式
      const colors = colorList.map(c => c.hex);
      
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
      
      // 初始化时不设置当前颜色，等用户点击后再设置
      this.setData({ 
        colors: colorsWithCode.map(c => c.hex),
        colorsWithCode
      });
      
      this._updateColorRows();
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
      paletteDropdownOpen: false 
    });
    
    // 重新加载该套餐的色号
    this.loadKitColors(kitId);
  },

  onReady() {},

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
    
    this.setData({ canvasReady: true, canvas2dComponent: canvas2dComponent });
    this._updateCanvasRect();
    
    // 立即绘制
    if (this._gridData) {
      this._drawFullGrid();
    }
    
    this._updateUsedColors();
  },

  onCanvasError(e) {
    console.error('Canvas 2D Error:', e.detail);
    wx.showToast({ title: 'Canvas初始化失败', icon: 'none' });
  },

  _updateCanvasRect() {
    // 使用 canvas-touch-layer 的 rect，因为触摸事件在这个层上
    const query = wx.createSelectorQuery();
    query.select('.canvas-touch-layer').boundingClientRect();
    query.exec((res) => {
      if (res && res[0]) {
        this._canvasRect = res[0];
      } else {
        console.error('无法获取 touch layer rect');
      }
    });
  },

  _loadDrawData(storageKey) {
    try {
      const drawData = wx.getStorageSync(storageKey);
      if (!drawData) { wx.showToast({ title: '数据加载失败', icon: 'none' }); this._initData(); return; }
      const { gridSize, gridData, colorPalette, brand, backgroundState } = drawData;
      const canvasSize = this._getAdaptiveCanvasSize();
      const cellSize = canvasSize / gridSize;
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
      this._rebuildColorStatsFromGrid();
      this._originalGridData = gridData;
      this._originalColorPalette = colorPalette;
      this._cellSize = cellSize;
      
      // 恢复背景图层状态
      const bgState = backgroundState ? (typeof backgroundState === 'string' ? JSON.parse(backgroundState) : backgroundState) : null;
      
      this.setData({ 
        gridSize, 
        canvasWidth: canvasSize, 
        canvasHeight: canvasSize,
        gridCellSize: canvasSize / gridSize,
        majorGridSizePx: canvasSize / gridSize * 5,
        gridLineWidth: 1,
        majorLineWidth: 2,
        gridLines: this._buildGridLines(gridSize, canvasSize),
        brand: brand || 'MARD', 
        colorPalette, 
        colors, 
        currentColor: colors[1] || colors[0] || '#FF6B35',
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
      
      wx.removeStorageSync(storageKey);
    } catch (e) {
      console.error('加载绘图数据失败:', e);
      wx.showToast({ title: '数据加载失败', icon: 'none' });
      this._initData();
    }
  },

  _getAdaptiveCanvasSize() {
    const info = wx.getSystemInfoSync();
    // 完整可见优先：给顶部坐标轴和底部颜色栏留出更保守空间
    const safeByWidth = Math.max(160, info.windowWidth - 96);
    const safeByHeight = Math.max(160, info.windowHeight * 0.34);
    const preferred = Math.min(safeByWidth, safeByHeight);
    return Math.floor(preferred);
  },

  _initData() {
    this._applyGridSize(this.data.gridSize, false);
  },

  _applyGridSize(newGridSize, keepContent = false) {
    const canvasSize = this._getAdaptiveCanvasSize();
    this._cellSize = canvasSize / newGridSize;

    let newGridData = Array.from({ length: newGridSize }, () => Array(newGridSize).fill('#FFFFFF'));

    if (keepContent && this._gridData && Array.isArray(this._gridData)) {
      // 使用实际的 gridData 长度，防止越界
      const oldSize = Math.min(this.data.gridSize, this._gridData.length);
      
      if (newGridSize >= oldSize) {
        // 尺寸变大：内容居中，四周扩展
        const offset = Math.floor((newGridSize - oldSize) / 2);
        for (let y = 0; y < oldSize; y++) {
          // 添加安全检查：确保行存在且是数组
          if (this._gridData[y] && Array.isArray(this._gridData[y])) {
            for (let x = 0; x < oldSize; x++) {
              // 确保列索引在范围内
              if (x < this._gridData[y].length) {
                newGridData[y + offset][x + offset] = this._gridData[y][x];
              }
            }
          }
        }
      } else {
        // 尺寸变小：从中心裁剪
        const offset = Math.floor((oldSize - newGridSize) / 2);
        for (let y = 0; y < newGridSize; y++) {
          for (let x = 0; x < newGridSize; x++) {
            const srcY = y + offset;
            const srcX = x + offset;
            // 添加完整的边界检查
            if (srcY >= 0 && srcY < this._gridData.length && 
                this._gridData[srcY] && Array.isArray(this._gridData[srcY]) &&
                srcX >= 0 && srcX < this._gridData[srcY].length) {
              newGridData[y][x] = this._gridData[srcY][srcX];
            }
          }
        }
      }
    }

    this._gridData = newGridData;
    this._rebuildColorStatsFromGrid();
    
    // 问题4修复：尺寸变更时保存状态到撤销栈，但不清空撤销栈
    if (keepContent) {
      // 清空重做栈（因为这是新的操作分支）
      this._redoStack = [];
    } else {
      // 全新画布，清空所有历史
      this._undoStack = [];
      this._redoStack = [];
    }

    // 计算居中位置（无限画布模式）
    // 往左上移动：X 负值向左，Y 负值向上
    const centerX = -115;   // 完全居中
    const centerY = -200; // 稍微偏上

    this.setData({
      gridSize: newGridSize,
      canvasWidth: canvasSize,
      canvasHeight: canvasSize,
      gridCellSize: canvasSize / newGridSize,
      majorGridSizePx: canvasSize / newGridSize * 5,
      gridLineWidth: 1,
      majorLineWidth: 2,
      gridLines: this._buildGridLines(newGridSize, canvasSize),
      canUndo: this._undoStack.length > 0,
      canRedo: this._redoStack.length > 0,
      canvasOffsetX: centerX,
      canvasOffsetY: centerY,
      canvasScale: 1,
      backgroundOffsetX: centerX,
      backgroundOffsetY: centerY,
      backgroundScale: 1
    });

    this._updateAxisLabels();
    this._updateUsedColors();
    this._updateHasPixels();
    
    // 延迟更新 canvasRect，确保 DOM 已渲染
    setTimeout(() => {
      this._updateCanvasRect();
      this._drawFullGrid();
    }, 100);
  },

  _drawFullGrid() {
    if (!this._ctx || !this.data.canvasReady) {
      return;
    }
    
    const hasBackground = !!this.data.backgroundImage;
    
    // 构建色码映射表
    const colorCodeMap = {};
    (this.data.colorsWithCode || []).forEach((item) => {
      if (item && item.hex && item.code) {
        colorCodeMap[item.hex.toUpperCase()] = item.code;
      }
    });
    
    console.log('[主Canvas] 构建色码映射表:', {
      colorsWithCodeLength: (this.data.colorsWithCode || []).length,
      colorCodeMapSize: Object.keys(colorCodeMap).length,
      sampleKeys: Object.keys(colorCodeMap).slice(0, 5),
      sampleValues: Object.values(colorCodeMap).slice(0, 5),
      currentColor: this.data.currentColor,
      currentCode: this.data.currentCode
    });
    
    // 更新 data，供色号组件使用
    this.setData({
      overlayGridData: this._gridData,
      overlayColorCodeMap: colorCodeMap
    }, () => {
      // 数据更新后，主动触发一次色号层重绘
      const codeOverlay = this.selectComponent('#codeOverlay');
      if (codeOverlay) codeOverlay.redraw();
    });
    
    // 方案B：网格由独立的 grid-overlay 组件绘制，主 Canvas 只绘制色块
    console.log('[主Canvas] 绘制色块（不含网格和色号）:', {
      showGrid: false,
      hasBackground: hasBackground,
      colorCodeMapSize: Object.keys(colorCodeMap).length
    });
    
    drawBoard(this._ctx, {
      width: this.data.canvasWidth,
      height: this.data.canvasHeight,
      gridSize: this.data.gridSize,
      gridData: this._gridData,
      showGrid: false,  // 主 Canvas 不绘制网格
      dpr: this._renderDpr || this._dpr,
      hasBackground: hasBackground,
      viewScale: this.data.canvasScale,
      colorCodeMap: null  // 主 Canvas 不绘制色号
    });
    
    console.log('[主Canvas] 绘制完成，网格和色号由独立组件显示');
  },

  _renderChangedPixels(changedCells) {
    if (!this._ctx || !this.data.canvasReady || !changedCells || changedCells.size === 0) return;

    changedCells.forEach((key) => {
      const [rowStr, colStr] = key.split(',');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);

      drawPixel(this._ctx, {
        width: this.data.canvasWidth,
        gridSize: this.data.gridSize,
        row,
        col,
        color: this._gridData[row][col],
        showGrid: false,
        dpr: this._renderDpr || this._dpr,
        hasBackground: !!this.data.backgroundImage,
        viewScale: this.data.canvasScale,
        colorCodeMap: null
      });
    });

    // 独立色号层重绘（避免主 canvas 绘制色号导致不稳定/模糊）
    const codeOverlay = this.selectComponent('#codeOverlay');
    if (codeOverlay) {
      codeOverlay.redraw();
    }
  },

  _saveState() {
    const state = this._snapshotState();
    this._undoStack.push(state);
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
    this.setData({ canUndo: true, canRedo: false });
  },

  handleTouchStart(e) {
    if (!this._canvasRect) this._updateCanvasRect();
    
    const touches = e.touches;
    const now = Date.now();
    
    // 双指缩放检测
    if (touches.length === 2) {
      this._isPinching = true;
      this._isDrawing = false;
      this._isDragging = false;
      
      // 问题6修复：保存双指操作前的工具状态
      if (!this._toolBeforePinch) {
        this._toolBeforePinch = this.data.tool;
      }
      
      // 自动切换到拖拽工具
      if (this.data.tool !== 'drag') {
        this.setData({ tool: 'drag' });
      }
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      this._touchStartDistance = this._getDistance(touch1, touch2);
      this._touchStartScale = this.data.canvasScale;
      this._touchStartBackgroundScale = this.data.backgroundScale;
      this._touchStartStageScale = this.data.stageScale;
      
      // 记录缩放中心点
      this._pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
      this._pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
      
      // 锁定状态下，记录初始的相对位置差
      if (this.data.locked && this.data.backgroundImage) {
        this._lockedOffsetDeltaX = this.data.canvasOffsetX - this.data.backgroundOffsetX;
        this._lockedOffsetDeltaY = this.data.canvasOffsetY - this.data.backgroundOffsetY;
      }
      
      return;
    }
    
    const touch = touches[0];
    this._lastTouchTime = now;
    
    // 拖拽工具 - 单指拖动
    if (this.data.tool === 'drag') {
      this._isDragging = true;
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
      this._velocityX = 0;
      this._velocityY = 0;
      
      // 停止惯性动画
      if (this._animationFrame) {
        clearTimeout(this._animationFrame);
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
      this._cachedCompositeCanvas = null;
      this._compositeRect = null;
      this._createCompositeCanvas(touch.clientX, touch.clientY, (compositeCanvas) => {
        this._cachedCompositeCanvas = compositeCanvas;
        this._showMagnifier(touch.clientX, touch.clientY, pos);
      });
      wx.vibrateShort({ type: 'light' });
      return;
    }
    
    this._isDrawing = true;
    this._lastPos = pos;
    this._saveState();
    this._paintPixel(pos.row, pos.col);
  },

  handleTouchMove(e) {
    const touches = e.touches;
    const now = Date.now();
    
    // 双指操作
    if (touches.length === 2 && this._isPinching) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const currentDistance = this._getDistance(touch1, touch2);
      const scaleChange = currentDistance / this._touchStartDistance;
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      const deltaCenterX = centerX - this._pinchCenterX;
      const deltaCenterY = centerY - this._pinchCenterY;
      const minScale = this._minScale || 0.5;
      const maxScale = this._maxScale || 5;

      if (this.data.locked && this.data.backgroundImage) {
        // 锁定模式：使用父容器 stage 统一缩放（同一个中心点）
        let nextStageScale = this._touchStartStageScale * scaleChange;
        nextStageScale = Math.max(minScale, Math.min(maxScale, nextStageScale));

        const rect = this._canvasRect;
        if (rect) {
          const scaleRatio = nextStageScale / this.data.stageScale;
          const canvasCenterX = rect.left + rect.width / 2;
          const canvasCenterY = rect.top + rect.height / 2;

          const nextStageOffsetX = this.data.stageOffsetX - (centerX - canvasCenterX) * (scaleRatio - 1) + deltaCenterX;
          const nextStageOffsetY = this.data.stageOffsetY - (centerY - canvasCenterY) * (scaleRatio - 1) + deltaCenterY;

          this.setData({
            stageScale: nextStageScale,
            stageOffsetX: nextStageOffsetX,
            stageOffsetY: nextStageOffsetY
          });
        } else {
          this.setData({ stageScale: nextStageScale });
        }

        this._pinchCenterX = centerX;
        this._pinchCenterY = centerY;
        return;
      }

      let newScale = this._touchStartScale * scaleChange;
      newScale = Math.max(minScale, Math.min(maxScale, newScale));
      const rect = this._canvasRect;
      if (rect) {
        const target = this._getActiveTransformTarget();
        const oldScale = target === 'background' ? this.data.backgroundScale : this.data.canvasScale;
        const scaleRatio = newScale / oldScale;
        const canvasCenterX = rect.left + rect.width / 2;
        const canvasCenterY = rect.top + rect.height / 2;

        if (target === 'background') {
          const offsetX = this.data.backgroundOffsetX - (centerX - canvasCenterX) * (scaleRatio - 1) + deltaCenterX;
          const offsetY = this.data.backgroundOffsetY - (centerY - canvasCenterY) * (scaleRatio - 1) + deltaCenterY;
          this.setData({
            backgroundScale: newScale,
            backgroundOffsetX: offsetX,
            backgroundOffsetY: offsetY
          });
        } else {
          const offsetX = this.data.canvasOffsetX - (centerX - canvasCenterX) * (scaleRatio - 1) + deltaCenterX;
          const offsetY = this.data.canvasOffsetY - (centerY - canvasCenterY) * (scaleRatio - 1) + deltaCenterY;
          this._setCanvasTransform({
            canvasScale: newScale,
            canvasOffsetX: offsetX,
            canvasOffsetY: offsetY
          });
        }
      } else {
        const target = this._getActiveTransformTarget();
        if (target === 'background') {
          this.setData({ backgroundScale: newScale });
        } else {
          this._setCanvasTransform({ canvasScale: newScale });
        }
      }
      this._pinchCenterX = centerX;
      this._pinchCenterY = centerY;
      return;
    }
    
    const touch = touches[0];
    const deltaTime = now - this._lastTouchTime;
    
    // 拖拽工具
    if (this.data.tool === 'drag' && this._isDragging) {
      const deltaX = touch.clientX - this._dragStartX;
      const deltaY = touch.clientY - this._dragStartY;
      
      // 计算速度（用于惯性滚动）
      if (deltaTime > 0) {
        this._velocityX = deltaX / deltaTime * 16; // 转换为每帧速度
        this._velocityY = deltaY / deltaTime * 16;
      }

      const target = this._getActiveTransformTarget();
      if (this.data.locked && this.data.backgroundImage) {
        this.setData({
          stageOffsetX: this.data.stageOffsetX + deltaX,
          stageOffsetY: this.data.stageOffsetY + deltaY
        });
      } else if (target === 'background') {
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
      
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
      this._lastTouchTime = now;
      return;
    }
    
    // 绘制工具
    if (!this._isDrawing) return;
    
    // 吸色工具 - 更新放大镜（不限制在画布内）
    if (this.data.tool === 'picker') {
      const pos = this._getPixelPosition(touch.clientX, touch.clientY);
      this._showMagnifier(touch.clientX, touch.clientY, pos);
      return;
    }
    
    const pos = this._getPixelPosition(touch.clientX, touch.clientY);
    if (!pos) return;
    
    if (this._lastPos) {
      this._paintLine(this._lastPos.row, this._lastPos.col, pos.row, pos.col);
    } else {
      this._paintPixel(pos.row, pos.col);
    }
    this._lastPos = pos;
  },

  handleTouchEnd(e) {
    // 如果是双指缩放结束
    if (this._isPinching) {
      this._isPinching = false;
      this._updateCanvasRect();

      // 缩放结束后，重新绘制以提高清晰度
      this._redrawCanvasAtCurrentScale();
      
      // 通知网格组件重绘
      const gridOverlay = this.selectComponent('#gridOverlay');
      if (gridOverlay) {
        console.log('[缩放结束] 通知网格组件重绘');
        gridOverlay.redraw();
      }
      
      // 通知色号组件重绘
      const codeOverlay = this.selectComponent('#codeOverlay');
      if (codeOverlay) {
        console.log('[缩放结束] 通知色号组件重绘');
        codeOverlay.redraw();
      }
      
      // 问题3修复：双指操作结束后的工具切换逻辑优化
      // 如果还有手指在屏幕上，继续保持拖拽模式
      if (e.touches.length > 0) {
        console.log('[工具切换] 还有', e.touches.length, '个手指，继续拖拽模式');
        // 不恢复工具，保持 drag
        
        // 如果是单指，切换到拖拽状态
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          this._isDragging = true;
          this._dragStartX = touch.clientX;
          this._dragStartY = touch.clientY;
        }
        return;
      }
      
      // 所有手指都离开了，恢复工具
      if (this._toolBeforePinch) {
        console.log('[工具切换] 所有手指离开，恢复工具:', this._toolBeforePinch);
        const restoreTool = this._toolBeforePinch;
        this._toolBeforePinch = null;
        this.setData({ tool: restoreTool });
      }
      return;
    }
    
    // 拖拽工具 - 不启动惯性动画
    if (this._isDragging && this.data.tool === 'drag') {
      this._isDragging = false;
      this._updateCanvasRect();
      
      // 问题3修复：拖拽结束时，如果所有手指都离开且有保存的工具，恢复工具
      if (e.touches.length === 0 && this._toolBeforePinch) {
        console.log('[工具切换] 拖拽结束，恢复工具:', this._toolBeforePinch);
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

      if (pickedColor && pickedColor !== '#FFFFFF') {
        const nearestColor = this._findNearestColor(pickedColor);
        this.setData({ currentColor: nearestColor, tool: 'pen' });
        const colorItem = this.data.colorsWithCode.find(c => c.hex === nearestColor);
        if (colorItem) this.setData({ currentCode: colorItem.code });
        wx.vibrateShort({ type: 'light' });
        wx.showToast({ title: '已选取颜色', icon: 'success', duration: 1000 });
      }
      
      return;
    }
    
    this._isDrawing = false;
    this._lastPos = null;
  },

  _redrawCanvasAtCurrentScale() {
    // 根据当前缩放比例调整 Canvas 分辨率
    const scale = this.data.canvasScale;
    if (!this._canvas || !this._ctx) return;
    
    // 计算新的物理分辨率
    const baseWidth = this.data.canvasWidth;
    const baseHeight = this.data.canvasHeight;
    const dpr = this._dpr || 1;
    
    // 动态调整分辨率：保持在合理范围内，避免小程序 Canvas 超限
    const effectiveDpr = Math.min(dpr * 2, dpr * 4);
    this._renderDpr = effectiveDpr;
    
    // 调整 Canvas 物理尺寸
    this._canvas.width = Math.floor(baseWidth * effectiveDpr);
    this._canvas.height = Math.floor(baseHeight * effectiveDpr);
    
    // 重置 transform 并缩放
    this._ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._ctx.scale(effectiveDpr, effectiveDpr);
    
    // 重新绘制
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
    if (!this._canvasRect) return null;
    const rect = this._canvasRect;

    const relX = touchX - rect.left;
    const relY = touchY - rect.top;

    const cellWidth = rect.width / this.data.gridSize;
    const cellHeight = rect.height / this.data.gridSize;

    const col = Math.floor(relX / cellWidth);
    const row = Math.floor(relY / cellHeight);

    if (col >= 0 && col < this.data.gridSize && row >= 0 && row < this.data.gridSize) {
      return { row, col };
    }
    return null;
  },

  _showMagnifier(touchX, touchY, pos) {
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
      .select('.background-layer-wrapper').boundingClientRect()
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

        console.log('[MAG_DEBUG] composite source rects', {
          containerRect,
          canvasWrapperRect,
          bgWrapperRect,
          bgImageRect,
          canvasScale: this.data.canvasScale,
          backgroundScale: this.data.backgroundScale,
          canvasOffsetX: this.data.canvasOffsetX,
          canvasOffsetY: this.data.canvasOffsetY,
          backgroundOffsetX: this.data.backgroundOffsetX,
          backgroundOffsetY: this.data.backgroundOffsetY,
          locked: this.data.locked
        });

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
    if (!this._canvas || !canvasWrapperRect) return;

    const dx = canvasWrapperRect.left - containerRect.left;
    const dy = canvasWrapperRect.top - containerRect.top;
    const dw = canvasWrapperRect.width;
    const dh = canvasWrapperRect.height;

    const sourceCanvasWidth = this._canvas.width || this.data.canvasWidth;
    const sourceCanvasHeight = this._canvas.height || this.data.canvasHeight;

    if (dw <= 0 || dh <= 0 || sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) return;

    const clipLeft = Math.max(0, -dx);
    const clipTop = Math.max(0, -dy);
    const clipRight = Math.max(0, dx + dw - containerRect.width);
    const clipBottom = Math.max(0, dy + dh - containerRect.height);

    const visibleDx = dx + clipLeft;
    const visibleDy = dy + clipTop;
    const visibleDw = dw - clipLeft - clipRight;
    const visibleDh = dh - clipTop - clipBottom;

    if (visibleDw <= 0 || visibleDh <= 0) return;

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
      const srcX = Math.max(0, Math.min(canvasWidth - 1, centerX - halfCapture));
      const srcY = Math.max(0, Math.min(canvasHeight - 1, centerY - halfCapture));
      const srcW = Math.max(1, Math.min(captureSize, canvasWidth - srcX));
      const srcH = Math.max(1, Math.min(captureSize, canvasHeight - srcY));
      
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
          const cellColor = this._gridData[r] ? this._gridData[r][c] : '#FFFFFF';
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
    const { skipRender = false, skipStats = false, changedCells = null } = options;
    if (tool === 'picker') {
      const pickedColor = this._gridData[row] ? this._gridData[row][col] : null;
      if (pickedColor && pickedColor !== '#FFFFFF') {
        this.setData({ currentColor: pickedColor, tool: 'pen' });
      }
      return;
    }
    if (tool === 'fill') {
      this._floodFill(row, col, currentColor);
      this._rebuildColorStatsFromGrid();
      this._drawFullGrid();
      this._updateUsedColors();
      this._updateHasPixels();
      return;
    }
    const color = tool === 'eraser' ? '#FFFFFF' : currentColor;
    const changed = changedCells || new Set();
    const isEraser = tool === 'eraser';

    // 增量更新颜色统计
    const updateCell = (r, c) => {
      const oldColor = this._normalizeColor(this._gridData[r][c]);
      const newColor = this._normalizeColor(color);
      if (oldColor !== newColor) {
        this._bumpColorCount(oldColor, -1);
        this._bumpColorCount(newColor, 1);
        this._gridData[r][c] = color;
        changed.add(`${r},${c}`);
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
      this._updateUsedColors();
      this._updateHasPixels();
    }
  },

  _paintLine(r0, c0, r1, c1) {
    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dc - dr;
    const changedCells = new Set();

    while (true) {
      this._paintPixel(r0, c0, { skipRender: true, skipStats: true, changedCells });
      if (r0 === r1 && c0 === c1) break;
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c0 += sc; }
      if (e2 < dc) { err += dc; r0 += sr; }
    }

    this._queueRenderChangedPixels(changedCells);
    this._updateUsedColors();
    this._updateHasPixels();
  },

  _floodFill(startRow, startCol, newColor) {
    const targetColor = this._gridData[startRow] ? this._gridData[startRow][startCol] : null;
    if (targetColor === null || targetColor === newColor) return;
    const { gridSize } = this.data;
    const stack = [[startRow, startCol]];
    const visited = new Set();
    while (stack.length > 0) {
      const [r, c] = stack.pop();
      const key = r + ',' + c;
      if (visited.has(key)) continue;
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) continue;
      if (this._gridData[r][c] !== targetColor) continue;
      visited.add(key);
      this._gridData[r][c] = newColor;
      stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }
  },

  onUndo() {
    if (this._undoStack.length === 0) return;
    this._redoStack.push(this._snapshotState());
    this._restoreState(this._undoStack.pop());
    this.setData({ canUndo: this._undoStack.length > 0, canRedo: true });
  },

  onRedo() {
    if (this._redoStack.length === 0) return;
    this._undoStack.push(this._snapshotState());
    this._restoreState(this._redoStack.pop());
    this.setData({ canUndo: true, canRedo: this._redoStack.length > 0 });
  },

  onSelectTool(e) {
    const tool = e.currentTarget.dataset.tool;
    
    // 背景图层时，只允许拖拽工具
    if (this.data.activeLayer === 'background' && tool !== 'drag') {
      wx.showToast({ title: '背景图层仅支持拖拽', icon: 'none' });
      return;
    }
    
    this.setData({ tool });
    
    // 切换到拖拽工具时，显示提示
    if (tool === 'drag') {
      wx.showToast({ title: '拖拽模式：移动画布', icon: 'none', duration: 1500 });
    }
    
    if (this.data.showLeftToolbar) this.setData({ showLeftToolbar: false });
  },

  onToggleSymmetry() {
    if (this.data.activeLayer === 'background') {
      wx.showToast({ title: '背景图层不支持对称', icon: 'none' });
      return;
    }
    if (this.data.tool !== 'pen') {
      wx.showToast({ title: '仅画笔工具支持对称', icon: 'none' });
      return;
    }
    this.setData({ symmetry: !this.data.symmetry });
  },

  onToggleMirror() {
    if (this.data.activeLayer === 'background') {
      // 镜像背景图（左右翻转）
      if (!this.data.backgroundImage) {
        wx.showToast({ title: '请先上传背景图', icon: 'none' });
        return;
      }
      const backgroundMirror = !this.data.backgroundMirror;
      this.setData({ backgroundMirror });
      wx.showToast({ title: '已镜像背景', icon: 'success', duration: 1500 });
      return;
    }
    
    // 镜像画板
    if (!this.data.hasPixels) {
      wx.showToast({ title: '画布无笔迹时不可镜像', icon: 'none' });
      return;
    }
    
    this._saveState();
    
    // 左右翻转gridData
    const gridSize = this.data.gridSize;
    const newGridData = Array.from({ length: gridSize }, () => Array(gridSize).fill('#FFFFFF'));
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        newGridData[y][gridSize - 1 - x] = this._gridData[y][x];
      }
    }
    
    this._gridData = newGridData;
    this._rebuildColorStatsFromGrid();
    this._drawFullGrid();
    this._updateUsedColors();
    
    wx.showToast({ title: '已镜像翻转', icon: 'success', duration: 1500 });
  },

  onToggleLock() {
    if (!this.data.backgroundImage) {
      wx.showToast({ title: '请先上传背景图', icon: 'none' });
      return;
    }
    
    // 问题5修复：锁定/解锁时不改变画布和背景的位置
    const locked = !this.data.locked;

    if (locked) {
      // 锁定：仅设置锁定状态，不改变任何位置
      this.setData({
        locked: true
      });
    } else {
      // 解锁：仅取消锁定状态，不改变任何位置
      this.setData({
        locked: false
      });
    }
    
    wx.showToast({ 
      title: locked ? '已锁定：背景跟随画布' : '已解锁：可独立移动', 
      icon: 'none',
      duration: 1500
    });
  },

  onSetActiveLayer(e) {
    const layer = e.currentTarget.dataset.layer;
    if (layer === 'background' && !this.data.backgroundImage) {
      wx.showToast({ title: '请先上传背景图', icon: 'none' });
      return;
    }
    
    console.log('[图层切换调试] 切换前:', {
      activeLayer: this.data.activeLayer,
      tool: this.data.tool,
      symmetry: this.data.symmetry
    });
    
    // 问题5修复：切换图层时正确处理工具和对称状态
    if (layer === 'background') {
      // 切换到背景图层：自动切换到拖拽工具，关闭对称
      this.setData({ 
        activeLayer: layer, 
        tool: 'drag',
        symmetry: false  // 背景图层不支持对称，强制关闭
      });
      wx.showToast({ title: '背景图层：拖拽模式', icon: 'none', duration: 1500 });
    } else {
      // 切换回画布图层：如果当前是拖拽工具，切换回画笔
      const newTool = this.data.tool === 'drag' ? 'pen' : this.data.tool;
      this.setData({ 
        activeLayer: layer, 
        tool: newTool
      });
    }
    
    console.log('[图层切换调试] 切换后:', {
      activeLayer: this.data.activeLayer,
      tool: this.data.tool,
      symmetry: this.data.symmetry
    });
  },

  onToggleCanvas() {
    this.setData({ showCanvas: !this.data.showCanvas });
  },

  onToggleBackground() {
    this.setData({ showBackground: !this.data.showBackground });
  },

  onBrandChange(e) {
    const index = e.detail.value;
    const brand = this.data.brandList[index];
    this.setData({ brand, brandIndex: index });
  },

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
      isPresetSize: true,
      customSize: '',
      sizeDropdownOpen: false 
    });

    if (size !== this.data.gridSize) {
      // 问题4修复：尺寸变更前保存当前状态
      this._saveState();
      this._applyGridSize(size, true);
    }
  },

  onSelectBrand(e) {
    const brand = e.currentTarget.dataset.brand;
    const index = this.data.brandList.indexOf(brand);
    this.setData({ 
      brand, 
      brandIndex: index,
      brandDropdownOpen: false 
    });
    
    // 重新加载该品牌的色卡颜色
    this.loadPaletteColors(brand);
  },

  onCustomSizeInput(e) {
    const value = e.detail.value;
    this.setData({ customSize: value });
  },

  onCustomSizeConfirm(e) {
    const rawValue = e && e.detail ? e.detail.value : this.data.customSize;
    const parsed = parseInt(rawValue, 10);

    if (Number.isNaN(parsed)) {
      wx.showToast({ title: `请输入${MIN_GRID_SIZE}~${MAX_GRID_SIZE}之间的数字`, icon: 'none' });
      return;
    }

    const size = this._clampGridSize(parsed);
    const clamped = size !== parsed;
    if (clamped) {
      wx.showToast({ title: `尺寸已限制为${MAX_GRID_SIZE}`, icon: 'none' });
    }

    this.setData({ 
      isPresetSize: false,
      sizeDropdownOpen: false,
      customSize: String(size)
    });

    if (size !== this.data.gridSize) {
      // 问题4修复：尺寸变更前保存当前状态
      this._saveState();
      this._applyGridSize(size, true);
    }
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
    });
    wx.showToast({ title: '背景图已清除', icon: 'success' });
  },

  onCanvasAreaTap() {
    // 点击画布区域时，关闭左侧设置面板
    if (this.data.showSettings) {
      this.setData({ showSettings: false });
    }
  },

  _updateAxisLabels() {
    const gridSize = this.data.gridSize;
    const canvasWidth = this.data.canvasWidth || 0;
    const canvasHeight = this.data.canvasHeight || 0;
    const cellWidth = gridSize > 0 ? canvasWidth / gridSize : 0;
    const cellHeight = gridSize > 0 ? canvasHeight / gridSize : 0;
    const horizontalLabels = [];
    const verticalLabels = [];

    // 与网格粗线严格对齐：i * cellSize
    for (let i = 5; i <= gridSize; i += 5) {
      horizontalLabels.push({ label: i, positionPx: i * cellWidth });
      verticalLabels.push({ label: i, positionPx: i * cellHeight });
    }

    this.setData({
      topAxisLabels: horizontalLabels,
      bottomAxisLabels: horizontalLabels,
      leftAxisLabels: verticalLabels,
      rightAxisLabels: verticalLabels
    });
  },

  _updateHasPixels() {
    let hasPixels = false;
    for (let y = 0; y < this.data.gridSize; y++) {
      for (let x = 0; x < this.data.gridSize; x++) {
        if (this._gridData[y][x] !== '#FFFFFF') {
          hasPixels = true;
          break;
        }
      }
      if (hasPixels) break;
    }
    this.setData({ hasPixels });
  },

  onSelectColor(e) {
    const color = e.currentTarget.dataset.color;
    // 问题2修复：选择颜色时不触发任何布局更新，避免抖动
    this.setData({ 
      currentColor: color, 
      currentCode: this._getColorCode(color)
    });
    // 展开时不自动缩回，只有手动下拉或点击画板区域才缩回
  },

  _getColorCode(hex) {
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
    let count = 0;
    for (let y = 0; y < this.data.gridSize; y++) {
      for (let x = 0; x < this.data.gridSize; x++) {
        if (this._gridData[y][x].toUpperCase() === color.toUpperCase()) count++;
      }
    }
    return count;
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
          this._gridData = Array.from({ length: this.data.gridSize }, () => Array(this.data.gridSize).fill('#FFFFFF'));
          this._rebuildColorStatsFromGrid();
          this._drawFullGrid();
          this._updateUsedColors();
          this._updateHasPixels();
          this.setData({ mirror: false });
        }
      }
    });
  },

  onSave() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this._saveDraft();
    });
  },

  onSaveToBox() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this._saveToBox();
    });
  },

  _saveToBox() {
    this.setData({ loading: true, loadingText: '保存到图纸箱...' });
    const { gridSize, brand } = this.data;
    const colorStats = this._buildColorStats();
    if (colorStats.length === 0) {
      this.setData({ loading: false });
      wx.showToast({ title: '画板还没有内容', icon: 'none' });
      return;
    }
    const colorPalette = colorStats.map((s, idx) => ({
      index: idx, id: s.id, name: s.name, r: s.r, g: s.g, b: s.b, count: s.count
    }));
    const gridData = this._gridData.map(row => row.map(hex => {
      const idx = colorStats.findIndex(s => '#' + [s.r, s.g, s.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() === hex.toUpperCase());
      return idx >= 0 ? idx : 0;
    }));
    request.post('/box/save', {
      sourceType: 'DRAW',
      brand: brand || 'MARD',
      colorCount: colorStats.length,
      gridSize: gridSize,
      gridData: JSON.stringify(gridData),
      colorPalette: JSON.stringify(colorPalette)
    }).then(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  _saveDraft() {
    this.setData({ loading: true, loadingText: '保存中...' });
    const { gridSize, brand, source, backgroundImage, backgroundImageWidth, backgroundImageHeight, backgroundOffsetX, backgroundOffsetY, backgroundScale, locked } = this.data;
    const colorStats = this._buildColorStats();
    const colorPalette = colorStats.map((s, idx) => ({
      index: idx, id: s.id, name: s.name, r: s.r, g: s.g, b: s.b, count: s.count
    }));
    const gridData = this._gridData.map(row => row.map(hex => {
      const idx = colorStats.findIndex(s => '#' + [s.r, s.g, s.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() === hex.toUpperCase());
      return idx >= 0 ? idx : 0;
    }));
    
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
    
    if (source === 'result') {
      request.post('/draft/save', {
        sourceType: 'EDIT', brand: brand || 'MARD', colorCount: colorStats.length,
        gridSize: gridSize, gridData: JSON.stringify(gridData), colorPalette: JSON.stringify(colorPalette),
        backgroundState: backgroundState ? JSON.stringify(backgroundState) : null
      }).then(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '已保存', icon: 'success' });
        const editResult = { updated: true, gridData, colorPalette, gridSize, brand: brand || 'MARD',
          colorCount: colorStats.length, totalBeads: colorStats.reduce((a, c) => a + c.count, 0) };
        const resultStorageKey = 'editResult_' + Date.now();
        wx.setStorageSync(resultStorageKey, editResult);
        setTimeout(() => {
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.route === 'pages/result/result') {
            prevPage.setData({ _editResultKey: resultStorageKey });
            wx.navigateBack({ delta: 1 });
          } else {
            wx.navigateBack({ delta: 1 });
          }
        }, 1000);
      }).catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
    } else {
      request.post('/draft/save', {
        sourceType: 'DRAW', brand: brand || 'MARD', colorCount: colorStats.length,
        gridSize: gridSize, gridData: JSON.stringify(gridData), colorPalette: JSON.stringify(colorPalette),
        backgroundState: backgroundState ? JSON.stringify(backgroundState) : null
      }).then(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '已保存', icon: 'success' });
      }).catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
    }
  },

  _buildColorStats() {
    const map = new Map();
    for (let y = 0; y < this.data.gridSize; y++) {
      for (let x = 0; x < this.data.gridSize; x++) {
        const hex = this._gridData[y][x];
        if (hex === '#FFFFFF') continue;
        map.set(hex, (map.get(hex) || 0) + 1);
      }
    }
    const stats = [];
    map.forEach((count, hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      stats.push({ id: hex.replace('#', ''), name: hex, count, r, g, b });
    });
    return stats.sort((a, b) => b.count - a.count);
  },

  async onExport() {
    const stats = this._buildColorStats();
    if (stats.length === 0) {
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
    const usedColors = Array.from(this._colorUsageMap.entries()).map(([hex, count]) => ({
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
    
    this.setData({
      colorsRow1: colorsWithCode.slice(0, mid),
      colorsRow2: colorsWithCode.slice(mid),
      colorsWithCode: colorsWithCode
    });
  },

  _updateHasPixels() {
    this.setData({ hasPixels: this._nonWhiteCount > 0 });
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

  onToggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  onCloseSettings() {
    this.setData({ showSettings: false });
  },

  onCanvasAreaTap(e) {
    // 如果面板展开，点击画板区域关闭
    if (this.data.colorbarExpanded || this.data.showSettings) {
      const hasUsedColors = this.data.usedColors && this.data.usedColors.length > 0;
      const compactHeight = hasUsedColors ? 400 : 340;
      this.setData({ 
        colorbarExpanded: false,
        colorbarHeight: compactHeight,
        showSettings: false
      });
      return false;
    }
  },

  onToggleLeftToolbar() {},

  onCloseLeftToolbar() {},

  onToggleColorbar() {
    this.setData({ colorbarExpanded: !this.data.colorbarExpanded });
  },

  // 颜色栏滑动手势
  onColorbarTouchStart(e) {
    this._colorbarTouchStartY = e.touches[0].clientY;
    const hasUsedColors = this.data.usedColors && this.data.usedColors.length > 0;
    const compactHeight = hasUsedColors ? 400 : 340;
    this._colorbarStartHeight = this.data.colorbarExpanded ? 700 : compactHeight;
  },

  onColorbarTouchMove(e) {
    if (!this._colorbarTouchStartY) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = this._colorbarTouchStartY - currentY; // 向上为正
    
    // 计算新的高度
    let newHeight = this._colorbarStartHeight + deltaY * 2; // 2 是 rpx 到 px 的转换系数
    
    // 限制高度范围
    const hasUsedColors = this.data.usedColors && this.data.usedColors.length > 0;
    const minHeight = hasUsedColors ? 400 : 340;
    const maxHeight = 700;
    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
    
    // 实时更新高度
    this.setData({ 
      colorbarHeight: newHeight,
      colorbarExpanded: newHeight > 500 // 超过 500rpx 视为展开状态
    });
  },

  onColorbarTouchEnd(e) {
    // 松手后，根据当前高度决定最终状态
    const finalExpanded = this.data.colorbarHeight > 500;
    const hasUsedColors = this.data.usedColors && this.data.usedColors.length > 0;
    const compactHeight = hasUsedColors ? 400 : 340;
    this.setData({ 
      colorbarExpanded: finalExpanded,
      colorbarHeight: finalExpanded ? 700 : compactHeight
    });
    
    this._colorbarTouchStartY = null;
    this._colorbarStartHeight = null;
  },

  onCloseColorbar() {
    this.setData({ colorbarExpanded: false });
  },

  onCloseAllPanels() {},

  stopPropagation() {},

  onLongPressColor(e) {
    const color = e.currentTarget.dataset.color;
    
    // 震动反馈
    wx.vibrateShort({ type: 'medium' });
    
    // 获取色号
    const colorItem = this.data.colorsWithCode.find(c => c.hex === color);
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
    
    // 查找对应的色号
    const colorItem = this.data.colorsWithCode.find(c => c.hex === color);
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
    const targetColor = this._getColorAtPosition(x, y);
    if (targetColor && targetColor !== this.data.dragTargetColor) {
      // 轻微震动提示
      wx.vibrateShort({ type: 'light' });
      this.setData({ dragTargetColor: targetColor });
    } else if (!targetColor && this.data.dragTargetColor) {
      this.setData({ dragTargetColor: '' });
    }
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

  _getColorAtPosition(x, y) {
    // 获取已使用色号区域的位置
    const query = wx.createSelectorQuery();
    query.selectAll('.used-color-item').boundingClientRect();
    query.exec((res) => {
      if (!res || !res[0]) return null;
      
      const items = res[0];
      for (let i = 0; i < items.length; i++) {
        const rect = items[i];
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          // 找到对应的颜色
          const color = this.data.usedColors[i];
          if (color) {
            this.setData({ dragTargetColor: color.hex });
          }
          return;
        }
      }
      this.setData({ dragTargetColor: '' });
    });
    
    return this.data.dragTargetColor;
  },

  _replaceColorInCanvas(oldColor, newColor) {
    this._saveState();
    
    let replaceCount = 0;
    const gridSize = this.data.gridSize;
    
    // 遍历画布，替换所有匹配的颜色
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (this._gridData[y][x].toUpperCase() === oldColor.toUpperCase()) {
          this._gridData[y][x] = newColor;
          replaceCount++;
        }
      }
    }
    
    // 重建颜色统计
    this._rebuildColorStatsFromGrid();
    
    // 重绘画布
    this._drawFullGrid();
    
    // 更新已使用颜色
    this._updateUsedColors();
    
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
    
    // 替换所有匹配的颜色
    let replaceCount = 0;
    for (let y = 0; y < this.data.gridSize; y++) {
      for (let x = 0; x < this.data.gridSize; x++) {
        if (this._gridData[y][x].toUpperCase() === sourceColor.toUpperCase()) {
          this._gridData[y][x] = targetColor;
          replaceCount++;
        }
      }
    }
    
    this._drawFullGrid();
    this._rebuildColorStatsFromGrid();
    this._updateUsedColors();
    
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
    wx.navigateBack({ delta: 1 });
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
      wx.showToast({ title: `尺寸已限制为${MAX_GRID_SIZE}`, icon: 'none' });
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
      
      // 画布镜像：左右翻转 gridData
      const gridSize = this.data.gridSize;
      const newGridData = Array.from({ length: gridSize }, () => Array(gridSize).fill('#FFFFFF'));
      
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          newGridData[y][gridSize - 1 - x] = this._gridData[y][x];
        }
      }
      
      this._gridData = newGridData;
      this._drawFullGrid();
      this._updateUsedColors();
      
      // 背景也一起镜像
      this.setData({ 
        mirror: !this.data.mirror,
        backgroundMirror: !this.data.backgroundMirror
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
      // 画布镜像：左右翻转 gridData
      const gridSize = this.data.gridSize;
      const newGridData = Array.from({ length: gridSize }, () => Array(gridSize).fill('#FFFFFF'));
      
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          newGridData[y][gridSize - 1 - x] = this._gridData[y][x];
        }
      }
      
      this._gridData = newGridData;
      this._drawFullGrid();
      this._updateUsedColors();
      
      this.setData({ mirror: !this.data.mirror });
    } else {
      // 背景图层镜像：翻转背景图
      this.setData({ backgroundMirror: !this.data.backgroundMirror });
    }
  },

  onToggleLock() {
    if (!this.data.backgroundImage) {
      wx.showToast({ title: '无背景图时不可锁定', icon: 'none' });
      return;
    }
    
    // 问题3修复：锁定/解锁时不改变任何位置，只改变锁定状态
    const willLock = !this.data.locked;
    
    console.log('[锁定调试] 锁定前状态:', {
      locked: this.data.locked,
      canvasOffsetX: this.data.canvasOffsetX,
      canvasOffsetY: this.data.canvasOffsetY,
      canvasScale: this.data.canvasScale,
      backgroundOffsetX: this.data.backgroundOffsetX,
      backgroundOffsetY: this.data.backgroundOffsetY,
      backgroundScale: this.data.backgroundScale,
      stageOffsetX: this.data.stageOffsetX,
      stageOffsetY: this.data.stageOffsetY,
      stageScale: this.data.stageScale
    });
    
    // 只改变锁定状态，不修改任何位置参数
    this.setData({ locked: willLock });
    
    console.log('[锁定调试] 锁定后状态:', {
      locked: this.data.locked,
      canvasOffsetX: this.data.canvasOffsetX,
      canvasOffsetY: this.data.canvasOffsetY,
      canvasScale: this.data.canvasScale,
      backgroundOffsetX: this.data.backgroundOffsetX,
      backgroundOffsetY: this.data.backgroundOffsetY,
      backgroundScale: this.data.backgroundScale,
      stageOffsetX: this.data.stageOffsetX,
      stageOffsetY: this.data.stageOffsetY,
      stageScale: this.data.stageScale
    });
    
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
            
            this.setData({ 
              currentColor: nearestColor,
              tool: 'pen'
            });
            
            const colorItem = this.data.colorsWithCode.find(c => c.hex === nearestColor);
            if (colorItem) this.setData({ currentCode: colorItem.code });
            
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
      
      this.setData({ 
        currentColor: color,
        tool: 'pen'
      });
      
      const colorItem = this.data.colorsWithCode.find(c => c.hex === color);
      if (colorItem) this.setData({ currentCode: colorItem.code });
      
      wx.vibrateShort({ type: 'light' });
      wx.showToast({ title: '已选取颜色', icon: 'success', duration: 1000 });
    }
  },

  _findNearestColor(targetColor) {
    const colors = this.data.colors;
    if (!colors || colors.length === 0) return '#FF6B35';
    
    let minDistance = Infinity;
    let nearestColor = colors[0];
    
    const targetRGB = this._hexToRGB(targetColor);
    
    colors.forEach(color => {
      const rgb = this._hexToRGB(color);
      // 使用欧几里得距离计算颜色相似度
      const distance = Math.sqrt(
        Math.pow(rgb.r - targetRGB.r, 2) +
        Math.pow(rgb.g - targetRGB.g, 2) +
        Math.pow(rgb.b - targetRGB.b, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestColor = color;
      }
    });
    
    return nearestColor;
  },

  _hexToRGB(hex) {
    // 移除 # 号
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return { r, g, b };
  }
});
