const { getSafeAreaLayout } = require('../../utils/safe-area');
const request = require('../../utils/request');
const floodFill = require('../../utils/floodFill');

Page({
  data: {
    patternUrl: '',
    brandName: 'MARD',
    currentSize: 64,
    colorStats: [],
    palette: [],
    currentColorId: '',
    currentIndex: 0,
    currentColor: null,
    panelExpanded: true,
    contrast: 50,
    mode: 'colorId',
    completedMap: {},
    doneCount: 0,
    boardPx: 352,
    navTop: 88,
    keepScreenOn: true,
    showGridNumber: false,
    showListModal: false,
    boxList: [],
    boxId: null,
    // 新增：支持 mappedPixelData 格式
    mappedPixelData: null,
    // 缩放相关
    scale: 1,
    canvasSize: 352,
    canvasLeft: 0,
    canvasTop: 0,
    isRendering: false,
    // 区域追踪相关
    regions: [],           // 当前颜色的所有连通区域
    currentRegion: null,   // 当前推荐的区域
    guidanceMode: 'nearest', // 引导模式：nearest/largest/edge
    recommendedCell: null,  // 推荐格子位置
  },

  _ctx: null,
  _baseCtx: null,
  _rgbGrid: [],
  _idGrid: [],
  _colorMap: {},
  _hRun: [],
  _vRun: [],

  onLoad(options) {
    // 尝试从 storageKey 加载新格式数据
    const storageKey = options.storageKey;
    
    if (storageKey) {
      this._loadFromStorage(storageKey, options);
    } else {
      // 兼容旧格式
      this._loadLegacyFormat(options);
    }
  },

  _loadFromStorage(storageKey, options) {
    try {
      const data = wx.getStorageSync(storageKey);
      if (data && data.mappedPixelData) {
        console.log('=== 使用新格式数据 ===');
        this._initWithMappedData(data, options);
        return;
      }
    } catch (e) {
      console.error('加载数据失败:', e);
    }
    
    // 降级到旧格式
    this._loadLegacyFormat(options);
  },

  _initWithMappedData(data, options) {
    const layout = getSafeAreaLayout();
    const gridSize = data.gridSize || 64;
    const cellSize = 5.5;
    const boardPx = Math.floor(gridSize * cellSize);

    // 构建调色板和颜色统计
    const colorStats = data.colorStats || [];
    const palette = colorStats.map(c => ({
      id: c.id,
      name: c.name || '',
      r: c.r,
      g: c.g,
      b: c.b,
      hex: c.hex,
      count: c.count || 0
    }));

    // 构建颜色映射
    const colorMap = {};
    palette.forEach(c => {
      colorMap[c.id] = c;
    });

    // 构建 RGB 网格和 ID 网格
    const mappedPixelData = data.mappedPixelData;
    const rgbGrid = [];
    const idGrid = [];

    for (let y = 0; y < gridSize; y++) {
      const rgbRow = [];
      const idRow = [];
      for (let x = 0; x < gridSize; x++) {
        const cell = mappedPixelData[y] && mappedPixelData[y][x];
        if (cell) {
          rgbRow.push({ r: cell.r, g: cell.g, b: cell.b });
          idRow.push(cell.id);
        } else {
          rgbRow.push(null);
          idRow.push('');
        }
      }
      rgbGrid.push(rgbRow);
      idGrid.push(idRow);
    }

    this._rgbGrid = rgbGrid;
    this._idGrid = idGrid;
    this._colorMap = colorMap;

    this.setData({
      patternUrl: data.originalUrl || '',
      brandName: data.brand || 'MARD',
      currentSize: gridSize,
      boardPx,
      canvasSize: boardPx,
      navTop: layout.navTop,
      colorStats,
      palette,
      currentColorId: palette[0] ? palette[0].id : '',
      mappedPixelData,
      completedMap: data.completedMap || {},
      boxId: data.id || null,
      scale: 1,
      canvasLeft: 0,
      canvasTop: 0,
    });

    this._ctx = wx.createCanvasContext('focus-canvas', this);
    this._baseCtx = wx.createCanvasContext('focus-base-canvas', this);
    wx.setKeepScreenOn({ keepScreenOn: true });

    // 计算连通区域
    this._updateRegions();

    wx.nextTick(() => {
      this._calcRuns();
      this._renderBoard();
    });
  },

  _loadLegacyFormat(options) {
    let stats = [];
    try {
      if (options.colorStats) stats = JSON.parse(decodeURIComponent(options.colorStats));
    } catch (e) {}

    const patternUrl = decodeURIComponent(options.patternUrl || '');
    const currentSize = options.gridSize ? parseInt(options.gridSize, 10) : 64;
    const brandName = options.brand ? decodeURIComponent(options.brand) : 'MARD';
    const boxId = options.boxId ? parseInt(options.boxId) : null;

    const layout = getSafeAreaLayout();
    const cellSize = 5.5;
    const boardPx = Math.floor(currentSize * cellSize);

    const colorMap = {};
    (stats || []).forEach((c) => {
      colorMap[c.id] = {
        id: c.id,
        name: c.name || '',
        r: Number(c.r) || 0,
        g: Number(c.g) || 0,
        b: Number(c.b) || 0,
        count: Number(c.count) || 0,
      };
    });
    this._colorMap = colorMap;

    this.setData({
      patternUrl,
      brandName,
      currentSize,
      colorStats: stats,
      boardPx,
      canvasSize: boardPx,
      navTop: layout.navTop,
      currentColorId: stats[0] ? stats[0].id : '',
      boxId,
      scale: 1,
    });

    this._ctx = wx.createCanvasContext('focus-canvas', this);
    this._baseCtx = wx.createCanvasContext('focus-base-canvas', this);
    wx.setKeepScreenOn({ keepScreenOn: true });

    if (boxId) {
      this._loadProgress(boxId);
    } else {
      this._buildGridFromPattern();
    }
  },

  onUnload() {
    wx.setKeepScreenOn({ keepScreenOn: false });
    // 保存进度
    this._saveProgress();
  },

  _loadProgress(boxId) {
    request.get('/box/detail/' + boxId)
      .then((data) => {
        if (data && data.progressData) {
          try {
            const progress = JSON.parse(data.progressData);
            this.setData({
              completedMap: progress.completedMap || {},
              doneCount: Object.keys(progress.completedMap || {}).length,
            });
          } catch (e) {}
        }
        this._buildGridFromPattern();
      })
      .catch(() => {
        this._buildGridFromPattern();
      });
  },

  _saveProgress() {
    const { boxId, completedMap, mappedPixelData } = this.data;
    if (!boxId) return;
    
    // 如果有新格式数据，更新存储
    if (mappedPixelData) {
      try {
        const patternId = boxId;
        const key = 'bead_pattern_' + patternId;
        const data = wx.getStorageSync(key);
        if (data) {
          data.completedMap = completedMap;
          data.updatedAt = new Date().toISOString();
          wx.setStorageSync(key, data);
        }
      } catch (e) {}
    }
    
    // 同时保存到服务器
    request.post('/box/progress', {
      boxId: boxId,
      progressData: JSON.stringify({ completedMap })
    }).catch(() => {});
  },

  _matchColorId(r, g, b) {
    const palette = this.data.colorStats || [];
    if (!palette.length) return '';
    let best = palette[0];
    let bestD = Number.MAX_SAFE_INTEGER;
    palette.forEach((c) => {
      const dr = r - (Number(c.r) || 0);
      const dg = g - (Number(c.g) || 0);
      const db = b - (Number(c.b) || 0);
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    });
    return best ? best.id : '';
  },

  _buildGridFromPattern() {
    const { patternUrl, currentSize, boardPx } = this.data;
    if (!patternUrl) return;

    wx.getImageInfo({
      src: patternUrl,
      success: (info) => {
        const src = info.path || patternUrl;
        this._baseCtx.drawImage(src, 0, 0, boardPx, boardPx);
        this._baseCtx.draw(false, () => {
          wx.canvasGetImageData({
            canvasId: 'focus-base-canvas',
            x: 0,
            y: 0,
            width: boardPx,
            height: boardPx,
            success: (img) => {
              const data = img.data;
              const cs = boardPx / currentSize;
              const rgbGrid = Array.from({ length: currentSize }, () => Array(currentSize).fill(null));
              const idGrid = Array.from({ length: currentSize }, () => Array(currentSize).fill(''));
              const counts = {};

              for (let y = 0; y < currentSize; y++) {
                for (let x = 0; x < currentSize; x++) {
                  const sx = Math.min(boardPx - 1, Math.floor(x * cs + cs / 2));
                  const sy = Math.min(boardPx - 1, Math.floor(y * cs + cs / 2));
                  const i = (sy * boardPx + sx) * 4;
                  const a = data[i + 3];
                  if (a < 8) continue;

                  const r = data[i];
                  const g = data[i + 1];
                  const b = data[i + 2];
                  rgbGrid[y][x] = { r, g, b };

                  const id = this._matchColorId(r, g, b);
                  idGrid[y][x] = id;
                  if (id) counts[id] = (counts[id] || 0) + 1;
                }
              }

              this._rgbGrid = rgbGrid;
              this._idGrid = idGrid;

              const palette = (this.data.colorStats || [])
                .filter((c) => counts[c.id] > 0)
                .map((c) => ({ ...c, count: counts[c.id] }))
                .sort((a, b) => b.count - a.count);

              const nextId = this.data.currentColorId || (palette[0] ? palette[0].id : '');
              this.setData({ palette, currentColorId: nextId }, () => {
                this._updateRegions();
                this._calcRuns();
                this._renderBoard();
              });
            },
            fail: () => {
              this._renderBoard();
            }
          }, this);
        });
      },
      fail: () => {
        this._rgbGrid = [];
        this._idGrid = [];
      }
    });
  },

  // 更新连通区域
  _updateRegions() {
    const { currentColorId, currentSize } = this.data;
    if (!currentColorId) {
      this.setData({ regions: [], currentRegion: null, recommendedCell: null });
      return;
    }

    // 使用 mappedPixelData 或 idGrid
    let grid;
    if (this.data.mappedPixelData) {
      grid = this.data.mappedPixelData;
    } else if (this._idGrid.length) {
      // 转换为简单格式
      grid = this._idGrid.map(row => row.map(id => ({ id, isExternal: false })));
    } else {
      return;
    }

    // 获取所有连通区域
    const regions = floodFill.getAllConnectedRegions(grid, currentColorId);
    
    // 根据引导模式排序
    let sortedRegions = regions;
    const centerPoint = { row: Math.floor(currentSize / 2), col: Math.floor(currentSize / 2) };
    
    switch (this.data.guidanceMode) {
      case 'largest':
        sortedRegions = floodFill.sortRegionsBySize(regions);
        break;
      case 'edge':
        sortedRegions = floodFill.sortRegionsByEdge(regions, currentSize);
        break;
      case 'nearest':
      default:
        sortedRegions = floodFill.sortRegionsByDistance(regions, centerPoint);
        break;
    }

    // 找到第一个未完成的区域
    const completedMap = this.data.completedMap || {};
    let currentRegion = null;
    let recommendedCell = null;

    for (const region of sortedRegions) {
      if (!floodFill.isRegionCompleted(region, new Set(Object.keys(completedMap)))) {
        currentRegion = region;
        const center = floodFill.getRegionCenter(region);
        recommendedCell = center;
        break;
      }
    }

    this.setData({ regions: sortedRegions, currentRegion, recommendedCell });
  },

  // 切换引导模式
  onGuidanceModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ guidanceMode: mode }, () => {
      this._updateRegions();
      this._renderBoard();
    });
  },

  _calcRuns() {
    const n = this.data.currentSize;
    const id = this.data.currentColorId;
    const h = Array.from({ length: n }, () => Array(n).fill(0));
    const v = Array.from({ length: n }, () => Array(n).fill(0));

    if (!id || !this._idGrid.length) {
      this._hRun = h;
      this._vRun = v;
      return;
    }

    for (let y = 0; y < n; y++) {
      let run = 0;
      for (let x = 0; x < n; x++) {
        if (this._idGrid[y][x] === id) {
          run += 1;
          h[y][x] = run;
        } else {
          run = 0;
        }
      }
    }

    for (let x = 0; x < n; x++) {
      let run = 0;
      for (let y = 0; y < n; y++) {
        if (this._idGrid[y][x] === id) {
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

  _renderTimer: null,
  _lastRenderParams: '',

  _renderBoard() {
    const { currentColorId, contrast, mode, completedMap, canvasSize } = this.data;
    const params = `${currentColorId}|${contrast}|${mode}|${canvasSize}|${JSON.stringify(completedMap)}`;
    
    if (this._lastRenderParams === params) return;
    this._lastRenderParams = params;

    this._doRender();
  },

  _doRender(callback) {
    const ctx = this._ctx;
    if (!ctx || !this._rgbGrid.length) {
      this.setData({ isRendering: false });
      callback && callback();
      return;
    }

    const {
      canvasSize,
      currentSize,
      currentColorId,
      contrast,
      mode,
      completedMap,
      recommendedCell
    } = this.data;

    const size = canvasSize;
    const cs = size / currentSize;
    const radius = Math.max(1.2, cs * 0.42);
    const dimAlpha = contrast / 100;
    const hasFocus = !!currentColorId;

    ctx.clearRect(0, 0, size, size);
    ctx.setFillStyle('#f5f5f4');
    ctx.fillRect(0, 0, size, size);

    const fontSize = Math.max(5, Math.min(10, Math.floor(cs * 0.58)));

    for (let y = 0; y < currentSize; y++) {
      for (let x = 0; x < currentSize; x++) {
        const rgb = this._rgbGrid[y][x];
        if (!rgb) continue;

        const id = this._idGrid[y][x];
        const focused = !hasFocus || id === currentColorId;
        const done = !!completedMap[id];
        const cx = x * cs + cs / 2;
        const cy = y * cs + cs / 2;

        if (done) {
          ctx.setGlobalAlpha(0.28);
        } else {
          ctx.setGlobalAlpha(focused ? 1 : dimAlpha);
        }

        ctx.setFillStyle(`rgb(${rgb.r},${rgb.g},${rgb.b})`);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        if (done && focused) {
          ctx.setGlobalAlpha(0.6);
          ctx.setFillStyle('#22c55e');
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, cs * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }

        let text = '';
        if (id && focused) {
          if (mode === 'colorId') {
            text = id;
          } else if (id === currentColorId) {
            text = mode === 'horizontal' ? String(this._hRun[y][x] || '') : String(this._vRun[y][x] || '');
          }
        }

        if (text) {
          const isLight = (rgb.r + rgb.g + rgb.b) > 560;
          ctx.setGlobalAlpha(1);
          ctx.setFillStyle(isLight ? '#1f2937' : '#ffffff');
          ctx.setFontSize(fontSize);
          ctx.setTextAlign('center');
          ctx.setTextBaseline('middle');
          ctx.fillText(text, cx, cy);
        }
      }
    }

    // 绘制推荐格子高亮
    if (recommendedCell && currentColorId) {
      const rx = recommendedCell.col * cs + cs / 2;
      const ry = recommendedCell.row * cs + cs / 2;
      
      ctx.setGlobalAlpha(0.8);
      ctx.setStrokeStyle('#FF9800');
      ctx.setLineWidth(2);
      ctx.beginPath();
      ctx.arc(rx, ry, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      
      // 绘制脉冲动画效果
      ctx.setStrokeStyle('rgba(255, 152, 0, 0.4)');
      ctx.setLineWidth(1);
      ctx.beginPath();
      ctx.arc(rx, ry, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setGlobalAlpha(1);
    ctx.draw();

    setTimeout(() => {
      this.setData({ isRendering: false });
      callback && callback();
    }, 50);
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onTogglePanel() {
    this.setData({ panelExpanded: !this.data.panelExpanded });
  },

  onContrastChange(e) {
    const val = parseInt(e.detail.value, 10);
    this.setData({ contrast: val }, () => this._renderBoard());
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode }, () => this._renderBoard());
  },

  onPickColor(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.currentColorId === id ? '' : id;
    this.setData({ currentColorId: next }, () => {
      this._updateRegions();
      this._calcRuns();
      this._renderBoard();
    });
  },

  onToggleDone(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const map = { ...this.data.completedMap };
    if (map[id]) delete map[id];
    else map[id] = true;
    this.setData({
      completedMap: map,
      doneCount: Object.keys(map).length,
    }, () => {
      this._updateRegions();
      this._renderBoard();
      this._saveProgress();
    });
  },

  onPrevColor() {
    const list = this.data.palette || [];
    if (!list.length) return;
    const i = list.findIndex((x) => x.id === this.data.currentColorId);
    const idx = i <= 0 ? list.length - 1 : i - 1;
    this.setData({ currentColorId: list[idx].id }, () => {
      this._updateRegions();
      this._calcRuns();
      this._renderBoard();
    });
  },

  onNextColor() {
    const list = this.data.palette || [];
    if (!list.length) return;
    const i = list.findIndex((x) => x.id === this.data.currentColorId);
    const idx = i >= list.length - 1 ? 0 : i + 1;
    this.setData({ currentColorId: list[idx].id }, () => {
      this._updateRegions();
      this._calcRuns();
      this._renderBoard();
    });
  },

  onResetAll() {
    const first = this.data.palette[0] ? this.data.palette[0].id : '';
    this.setData({
      currentColorId: first,
      mode: 'colorId',
      contrast: 50,
      completedMap: {},
      doneCount: 0,
    }, () => {
      this._updateRegions();
      this._calcRuns();
      this._renderBoard();
      this._saveProgress();
    });
  },

  onToggleKeepScreen() {
    const keepScreenOn = !this.data.keepScreenOn;
    this.setData({ keepScreenOn });
    wx.setKeepScreenOn({ keepScreenOn });
    wx.showToast({
      title: keepScreenOn ? '已开启屏幕常亮' : '已关闭屏幕常亮',
      icon: 'none'
    });
  },

  // ============ 缩放相关 ============
  _minScale: 0.5,
  _maxScale: 2,

  onZoomIn() {
    const newScale = Math.min(this.data.scale + 0.25, this._maxScale);
    const newSize = Math.floor(this.data.boardPx * newScale);
    if (newScale === this.data.scale) return;
    
    const canvasLeft = (this.data.boardPx - newSize) / 2;
    const canvasTop = (this.data.boardPx - newSize) / 2;
    
    this.setData({ 
      scale: newScale, 
      canvasSize: newSize,
      canvasLeft,
      canvasTop,
      isRendering: true 
    }, () => {
      this._renderBoard();
      setTimeout(() => this.setData({ isRendering: false }), 50);
    });
  },

  onZoomOut() {
    const newScale = Math.max(this.data.scale - 0.25, this._minScale);
    const newSize = Math.floor(this.data.boardPx * newScale);
    if (newScale === this.data.scale) return;
    
    const canvasLeft = (this.data.boardPx - newSize) / 2;
    const canvasTop = (this.data.boardPx - newSize) / 2;
    
    this.setData({ 
      scale: newScale, 
      canvasSize: newSize,
      canvasLeft,
      canvasTop,
      isRendering: true 
    }, () => {
      this._renderBoard();
      setTimeout(() => this.setData({ isRendering: false }), 50);
    });
  },

  onZoomReset() {
    this.setData({ 
      scale: 1, 
      canvasSize: this.data.boardPx,
      canvasLeft: 0,
      canvasTop: 0,
      isRendering: true 
    }, () => {
      this._renderBoard();
      setTimeout(() => this.setData({ isRendering: false }), 50);
    });
  },

  // ============ 滑动相关 ============
  _touchStartX: 0,
  _touchStartY: 0,
  _panStartLeft: 0,
  _panStartTop: 0,

  onBoardTouchStart(e) {
    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._panStartLeft = this.data.canvasLeft;
    this._panStartTop = this.data.canvasTop;
  },

  onBoardTouchMove(e) {
    const touch = e.touches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;

    const { canvasSize, boardPx } = this.data;
    const maxLeft = 0;
    const minLeft = boardPx - canvasSize;
    const maxTop = 0;
    const minTop = boardPx - canvasSize;
    
    let newLeft = this._panStartLeft + dx;
    let newTop = this._panStartTop + dy;
    newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
    newTop = Math.max(minTop, Math.min(maxTop, newTop));

    this.setData({ canvasLeft: newLeft, canvasTop: newTop });
  },

  onBoardTouchEnd(e) {},

  // ============ 图纸列表弹窗 ============
  onShowList() {
    this.setData({ showListModal: true });
    if (!this.data.boxList.length) {
      this._loadBoxList();
    }
  },

  _loadBoxList() {
    request.get('/box/list')
      .then((data) => {
        this.setData({ boxList: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        this.setData({ boxList: [] });
      });
  },

  onSelectBox(e) {
    const boxId = e.currentTarget.dataset.id;
    if (!boxId) return;
    
    if (boxId === this.data.boxId) {
      this.setData({ showListModal: false });
      return;
    }

    wx.showLoading({ title: '加载中...' });
    request.get('/box/detail/' + boxId)
      .then((box) => {
        if (!box) {
          wx.showToast({ title: '图纸不存在', icon: 'none' });
          return;
        }

        const newSize = box.gridSize || 64;
        const cellSize = 5.5;
        const newBoardPx = Math.floor(newSize * cellSize);

        this.setData({
          boxId: box.id,
          boxList: this.data.boxList.map(b => 
            b.id === box.id ? { ...b, _active: true } : { ...b, _active: false }
          ),
          showListModal: false,
          currentSize: newSize,
          brandName: box.brand || 'MARD',
          boardPx: newBoardPx,
          canvasSize: newBoardPx,
          canvasLeft: 0,
          canvasTop: 0,
          scale: 1,
        });

        if (box.gridData) {
          try {
            const gridData = JSON.parse(box.gridData);
            this._idGrid = gridData;
          } catch (e) {}
        }
        if (box.colorPalette) {
          try {
            const colorPalette = JSON.parse(box.colorPalette);
            this.setData({ colorPalette });
          } catch (e) {}
        }

        this._buildGridFromBox(box);
        wx.hideLoading();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  _buildGridFromBox(box) {
    const gridSize = box.gridSize || 64;

    if (box.gridData && box.colorPalette) {
      try {
        const gridData = JSON.parse(box.gridData);
        const colorPalette = JSON.parse(box.colorPalette);

        const counts = {};
        gridData.forEach(row => {
          row.forEach(id => {
            if (id !== null && id !== undefined) {
              counts[id] = (counts[id] || 0) + 1;
            }
          });
        });

        const palette = colorPalette
          .filter(c => counts[c.id] > 0)
          .map(c => ({ ...c, count: counts[c.id] }))
          .sort((a, b) => b.count - a.count);

        this.setData({ palette: palette || [], currentSize: gridSize }, () => {
          this._updateRegions();
          this._calcRuns();
          this._renderBoard();
        });
      } catch (e) {}
    }
  },

  onCloseList() {
    this.setData({ showListModal: false });
  },

  onSaveProgress() {
    this._saveProgress();
    wx.showToast({ title: '进度已保存', icon: 'success' });
  }
});
