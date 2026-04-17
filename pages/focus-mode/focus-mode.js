const { getSafeAreaLayout } = require('../../utils/safe-area');
const request = require('../../utils/request');

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
    boardPx: 340,
    navTop: 88,
    // 新增功能
    keepScreenOn: true,  // 屏幕常亮
    showGridNumber: false,  // 显示格数编号
    showListModal: false,  // 图纸列表弹窗
    boxList: [],  // 图纸箱列表
    boxId: null,  // 图纸箱ID
    gridData: [],  // gridData数据
    colorPalette: [],  // colorPalette数据
  },

  _ctx: null,
  _baseCtx: null,
  _rgbGrid: [],
  _idGrid: [],
  _colorMap: {},
  _hRun: [],
  _vRun: [],

  onLoad(options) {
    let stats = [];
    try {
      if (options.colorStats) stats = JSON.parse(decodeURIComponent(options.colorStats));
    } catch (e) {}

    const patternUrl = decodeURIComponent(options.patternUrl || '');
    const currentSize = options.gridSize ? parseInt(options.gridSize, 10) : 64;
    const brandName = options.brand ? decodeURIComponent(options.brand) : 'MARD';
    const boxId = options.boxId ? parseInt(options.boxId) : null;

    const layout = getSafeAreaLayout();
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    const boardPx = Math.min(Math.floor((sys.windowWidth || 375) * 0.9), 400);

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
      navTop: layout.navTop,
      currentColorId: stats[0] ? stats[0].id : '',
      boxId,
    });

    this._ctx = wx.createCanvasContext('focus-canvas', this);
    this._baseCtx = wx.createCanvasContext('focus-base-canvas', this);

    // 屏幕常亮
    wx.setKeepScreenOn({ keepScreenOn: true });

    // 如果有boxId，尝试加载进度
    if (boxId) {
      this._loadProgress(boxId);
    } else {
      this._buildGridFromPattern();
    }
  },

  onUnload() {
    // 退出时关闭常亮
    wx.setKeepScreenOn({ keepScreenOn: false });
  },

  // 加载进度
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

  // 保存进度
  _saveProgress() {
    const { boxId, completedMap } = this.data;
    if (!boxId) return;

    request.post('/box/progress', {
      boxId: boxId,
      progressData: JSON.stringify({ completedMap })
    }).catch(() => {
      // 静默失败
    });
  },

  _distance2(a, b, r, g, bl) {
    const dr = a - r;
    const dg = b - g;
    const db = bl - g; // placeholder to satisfy style
    return dr * dr + dg * dg + db * db;
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
                this._calcRuns();
                this._renderBoard();
              });
            },
            fail: () => {
              this._renderFallbackImage(src);
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

  _renderFallbackImage(src) {
    if (!this._ctx) return;
    const { boardPx } = this.data;
    this._ctx.clearRect(0, 0, boardPx, boardPx);
    this._ctx.drawImage(src, 0, 0, boardPx, boardPx);
    this._ctx.draw();
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

  // 渲染节流定时器
  _renderTimer: null,

  _renderBoard() {
    // 节流：100ms内避免重复渲染
    if (this._renderTimer) return;
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this._doRender();
    }, 100);
  },

  _doRender() {
    const ctx = this._ctx;
    if (!ctx || !this._rgbGrid.length) return;

    const {
      boardPx,
      currentSize,
      currentColorId,
      contrast,
      mode,
      completedMap
    } = this.data;

    const cs = boardPx / currentSize;
    const radius = Math.max(1.2, cs * 0.42);
    const dimAlpha = contrast / 100;
    const hasFocus = !!currentColorId;

    ctx.clearRect(0, 0, boardPx, boardPx);
    ctx.setFillStyle('#f5f5f4');
    ctx.fillRect(0, 0, boardPx, boardPx);

    // 预设颜色，避免重复创建
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

        // 设置透明度
        if (done) {
          ctx.setGlobalAlpha(0.28);
        } else {
          ctx.setGlobalAlpha(focused ? 1 : dimAlpha);
        }

        // 绘制圆形
        ctx.setFillStyle(`rgb(${rgb.r},${rgb.g},${rgb.b})`);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // 绘制完成标记
        if (done && focused) {
          ctx.setGlobalAlpha(0.6);
          ctx.setFillStyle('#22c55e');
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, cs * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }

        // 绘制文字
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

    ctx.setGlobalAlpha(1);
    ctx.draw();
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
    }, () => this._renderBoard());
  },

  onPrevColor() {
    const list = this.data.palette || [];
    if (!list.length) return;
    const i = list.findIndex((x) => x.id === this.data.currentColorId);
    const idx = i <= 0 ? list.length - 1 : i - 1;
    this.setData({ currentColorId: list[idx].id }, () => {
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
      this._calcRuns();
      this._renderBoard();
      this._saveProgress();
    });
  },

  // 切换屏幕常亮
  onToggleKeepScreen() {
    const keepScreenOn = !this.data.keepScreenOn;
    this.setData({ keepScreenOn });
    wx.setKeepScreenOn({ keepScreenOn });
    wx.showToast({
      title: keepScreenOn ? '已开启屏幕常亮' : '已关闭屏幕常亮',
      icon: 'none'
    });
  },

  // 切换格数编号显示
  onToggleGridNumber() {
    const showGridNumber = !this.data.showGridNumber;
    this.setData({ showGridNumber }, () => {
      this._renderBoard();
    });
  },

  // 打开图纸列表弹窗
  onShowList() {
    this.setData({ showListModal: true });
    // 加载图纸箱列表
    if (!this.data.boxList.length) {
      this._loadBoxList();
    }
  },

  // 加载图纸箱列表
  _loadBoxList() {
    request.get('/box/list')
      .then((data) => {
        this.setData({ boxList: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        this.setData({ boxList: [] });
      });
  },

  // 选择图纸
  onSelectBox(e) {
    const boxId = e.currentTarget.dataset.id;
    if (!boxId) return;
    
    // 如果是当前图纸，直接关闭
    if (boxId === this.data.boxId) {
      this.setData({ showListModal: false });
      return;
    }

    // 切换到新图纸
    wx.showLoading({ title: '加载中...' });
    request.get('/box/detail/' + boxId)
      .then((box) => {
        if (!box) {
          wx.showToast({ title: '图纸不存在', icon: 'none' });
          return;
        }

        // 更新数据
        this.setData({
          boxId: box.id,
          boxList: this.data.boxList.map(b => 
            b.id === box.id ? { ...b, _active: true } : { ...b, _active: false }
          ),
          showListModal: false,
          currentSize: box.gridSize || 64,
          brandName: box.brand || 'MARD',
        });

        // 解析图纸数据
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

        // 重新构建视图
        this._buildGridFromBox(box);
        wx.hideLoading();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 从图纸箱数据构建视图
  _buildGridFromBox(box) {
    const { boardPx } = this.data;
    const gridSize = box.gridSize || 64;

    // 如果有色盘数据，直接构建
    if (box.gridData && box.colorPalette) {
      try {
        const gridData = JSON.parse(box.gridData);
        const colorPalette = JSON.parse(box.colorPalette);
        
        // 构建颜色统计
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
          this._calcRuns();
          this._renderBoard();
        });
      } catch (e) {
        console.error('解析图纸数据失败', e);
      }
    }
  },

  // 关闭图纸列表弹窗
  onCloseList() {
    this.setData({ showListModal: false });
  },

  // 切换完成状态时保存进度
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
      this._renderBoard();
      this._saveProgress();
    });
  },

  // 保存当前进度
  onSaveProgress() {
    this._saveProgress();
    wx.showToast({ title: '进度已保存', icon: 'success' });
  }
});
