const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { API_BASE_URL } = require('../../utils/config');

Page({
  data: {
    activeTool: 'brush',
    currentColor: '#000000',
    brushSize: 1,
    symmetry: false,
    canUndo: false,
    canRedo: false,
    gridSize: 64,
    gridSizeOptions: [24, 36, 50, 64, 78, 104],
    gridSizeIndex: 3,
    paletteItems: [
      { hex: '#000000', code: 'K01' },
      { hex: '#FFFFFF', code: 'W01' }
    ],
    colors: [
      '#000000', '#FFFFFF'
    ],
    canvasSize: 320,
    showGrid: true,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    brandList: ['MARD'],
    brandIndex: 0,
    colorCountOptions: [{ value: 0, label: '全部色号' }],
    colorCountIndex: 0,
    colorCountValue: 0,
    paletteLoading: false,
    currentColorCode: 'K01',
    currentColorName: '黑色',
    showColorDetail: false,
    colorUsageCount: 0,
  },

  _grid: [],
  _undoStack: [],
  _redoStack: [],
  _ctx: null,
  _exportCtx: null,
  _cellSize: 8,
  _isDrawing: false,
  _canvasRect: null,
  _isPanning: false,
  _startPanX: 0,
  _startPanY: 0,
  _startOffsetX: 0,
  _startOffsetY: 0,
  _pinchStartDistance: 0,
  _pinchStartScale: 1,
  _renderTimer: null,
  _lastPaintKey: '',

  onLoad() {
    this._applyGridSize(this.data.gridSize);
    this._loadDefaultBrand();
  },

  _initGrid(size) {
    this._grid = Array.from({ length: size }, () => Array(size).fill('#FFFFFF'));
  },

  _initCanvas() {
    this._ctx = wx.createCanvasContext('draw-canvas', this);
    this._exportCtx = wx.createCanvasContext('export-canvas', this);
    this._refreshCanvasRect();
    this._render();
  },

  _applyGridSize(gridSize) {
    const info = wx.getSystemInfoSync();
    const canvasSize = Math.min(info.windowWidth - 32, Math.floor(info.windowHeight * 0.5));
    const cellSize = Math.max(4, Math.floor(canvasSize / gridSize));
    const actualSize = cellSize * gridSize;
    this._cellSize = cellSize;
    this.setData({ canvasSize: actualSize, gridSize }, () => {
      this._initGrid(gridSize);
      if (!this._ctx) this._initCanvas();
      else this._render();
    });
  },

  _loadPaletteColors(brand, colorCount) {
    this.setData({ paletteLoading: true });
    request.get('/api/bead/colors?brand=' + encodeURIComponent(brand) + '&colorCount=' + (colorCount || 0))
      .then((list) => {
        const items = (Array.isArray(list) ? list : []).map((c, idx) => {
          const hex = '#' + [c.r, c.g, c.b].map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
          return { hex, code: c.id || ('C' + (idx + 1)), name: c.name || '' };
        });
        const paletteItems = items.length ? items : [{ hex: '#000000', code: 'K01', name: '黑色' }, { hex: '#FFFFFF', code: 'W01', name: '白色' }];
        const colors = paletteItems.map(i => i.hex);
        const currentColor = colors.includes(this.data.currentColor) ? this.data.currentColor : colors[0];
        const picked = paletteItems.find(i => i.hex === currentColor) || paletteItems[0];
        this.setData({
          paletteItems,
          colors,
          currentColor,
          currentColorCode: picked.code,
          currentColorName: picked.name || picked.code,
          paletteLoading: false
        });
      })
      .catch(() => {
        this.setData({ paletteLoading: false });
      });
  },

  _loadDefaultBrand() {
    request.get('/api/bead/brands')
      .then((data) => {
        const dict = data && typeof data === 'object' ? data : {};
        const list = Object.keys(dict);
        const finalList = list && list.length ? list : ['MARD'];
        const first = finalList[0];
        const kits = dict[first] || [];
        const colorCountOptions = [{ value: 0, label: '全部色号' }, ...kits.map(k => ({ value: k, label: k + '色' }))];
        this._brandName = first;
        this._brandsData = dict;
        this.setData({
          brandList: finalList,
          brandIndex: 0,
          colorCountOptions,
          colorCountIndex: 0,
          colorCountValue: 0,
        });
        this._loadPaletteColors(first, 0);
      })
      .catch(() => {
        this._brandName = 'MARD';
        this._brandsData = { MARD: [24, 48, 72, 96] };
        this.setData({
          brandList: ['MARD'],
          brandIndex: 0,
          colorCountOptions: [
            { value: 0, label: '全部色号' },
            { value: 24, label: '24色' },
            { value: 48, label: '48色' },
            { value: 72, label: '72色' },
            { value: 96, label: '96色' }
          ],
          colorCountIndex: 0,
          colorCountValue: 0,
        });
        this._loadPaletteColors('MARD', 0);
      });
  },

  _refreshCanvasRect() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.draw-canvas').boundingClientRect((rect) => {
      this._canvasRect = rect || null;
    }).exec();
  },

  _render() {
    if (this._renderTimer) return;
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      const ctx = this._ctx;
      if (!ctx) return;

      const cs = this._cellSize;
      const size = this.data.gridSize;

      ctx.clearRect(0, 0, size * cs, size * cs);

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          ctx.setFillStyle(this._grid[y][x]);
          ctx.fillRect(x * cs, y * cs, cs, cs);

          if (this.data.showGrid) {
            ctx.setStrokeStyle('rgba(210,210,210,0.5)');
            ctx.setLineWidth(0.5);
            ctx.strokeRect(x * cs, y * cs, cs, cs);
          }
        }
      }

      ctx.draw();
    }, 16);
  },

  _saveUndo() {
    this._undoStack.push(JSON.stringify(this._grid));
    if (this._undoStack.length > 40) this._undoStack.shift();
    this._redoStack = [];
    this.setData({ canUndo: true, canRedo: false });
  },

  _getCell(pageX, pageY) {
    const rect = this._canvasRect;
    if (!rect) return null;

    const px = pageX - rect.left;
    const py = pageY - rect.top;

    const cx = (px - rect.width / 2 - this.data.offsetX) / this.data.scale + rect.width / 2;
    const cy = (py - rect.height / 2 - this.data.offsetY) / this.data.scale + rect.height / 2;

    const x = Math.floor(cx / this._cellSize);
    const y = Math.floor(cy / this._cellSize);
    const size = this.data.gridSize;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  },

  _paintCell(x, y) {
    const { activeTool, currentColor, symmetry, gridSize } = this.data;
    let changed = false;
    if (activeTool === 'picker') {
      const c = this._grid[y][x];
      this.setData({ currentColor: c, activeTool: 'brush' });
      return false;
    }

    if (activeTool === 'fill') {
      return this._floodFill(x, y, currentColor);
    }

    const color = activeTool === 'eraser' ? '#FFFFFF' : currentColor;
    const half = Math.floor(this.data.brushSize / 2);

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= gridSize || py >= gridSize) continue;
        if (this._grid[py][px] !== color) {
          this._grid[py][px] = color;
          changed = true;
        }

        if (symmetry) {
          const sx = gridSize - 1 - px;
          if (this._grid[py][sx] !== color) {
            this._grid[py][sx] = color;
            changed = true;
          }
        }
      }
    }
    return changed;
  },

  _floodFill(x, y, newColor) {
    const size = this.data.gridSize;
    const target = this._grid[y][x];
    if (target === newColor) return false;

    const q = [[x, y]];
    const visited = new Set();
    let changed = false;

    while (q.length) {
      const [cx, cy] = q.shift();
      const key = cx + ',' + cy;
      if (visited.has(key)) continue;
      visited.add(key);

      if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
      if (this._grid[cy][cx] !== target) continue;

      this._grid[cy][cx] = newColor;
      changed = true;
      q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return changed;
  },

  _distance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  onTouchStart(e) {
    const touches = e.touches || [];
    if (!touches.length) return;
    this._refreshCanvasRect();

    if (touches.length >= 2) {
      this._isPanning = true;
      this._isDrawing = false;
      this._pinchStartDistance = this._distance(touches[0], touches[1]);
      this._pinchStartScale = this.data.scale;
      this._startPanX = (touches[0].clientX + touches[1].clientX) / 2;
      this._startPanY = (touches[0].clientY + touches[1].clientY) / 2;
      this._startOffsetX = this.data.offsetX;
      this._startOffsetY = this.data.offsetY;
      return;
    }

    const t = touches[0];
    if (this.data.activeTool === 'grab') {
      this._isPanning = true;
      this._startPanX = t.clientX;
      this._startPanY = t.clientY;
      this._startOffsetX = this.data.offsetX;
      this._startOffsetY = this.data.offsetY;
      return;
    }

    this._isDrawing = true;
    this._lastPaintKey = '';
    this._saveUndo();
    const cell = this._getCell(t.clientX, t.clientY);
    if (!cell) return;
    const changed = this._paintCell(cell.x, cell.y);
    this._lastPaintKey = cell.x + ',' + cell.y;
    if (changed) this._render();
  },

  onTouchMove(e) {
    const touches = e.touches || [];
    if (!touches.length) return;

    if (this._isPanning) {
      if (touches.length >= 2) {
        const curDist = this._distance(touches[0], touches[1]);
        const ratio = this._pinchStartDistance ? (curDist / this._pinchStartDistance) : 1;
        const nextScale = Math.min(4, Math.max(0.5, this._pinchStartScale * ratio));

        const cx = (touches[0].clientX + touches[1].clientX) / 2;
        const cy = (touches[0].clientY + touches[1].clientY) / 2;
        this.setData({
          scale: nextScale,
          offsetX: this._startOffsetX + (cx - this._startPanX),
          offsetY: this._startOffsetY + (cy - this._startPanY),
        });
      } else {
        const t = touches[0];
        this.setData({
          offsetX: this._startOffsetX + (t.clientX - this._startPanX),
          offsetY: this._startOffsetY + (t.clientY - this._startPanY),
        });
      }
      return;
    }

    if (!this._isDrawing) return;
    if (this.data.activeTool === 'fill' || this.data.activeTool === 'picker') return;

    const t = touches[0];
    const cell = this._getCell(t.clientX, t.clientY);
    if (!cell) return;
    const key = cell.x + ',' + cell.y;
    if (key === this._lastPaintKey) return;
    const changed = this._paintCell(cell.x, cell.y);
    this._lastPaintKey = key;
    if (changed) this._render();
  },

  onTouchEnd() {
    this._isDrawing = false;
    this._isPanning = false;
    this._pinchStartDistance = 0;
    this._lastPaintKey = '';
  },

  onToolTap(e) {
    this.setData({ activeTool: e.currentTarget.dataset.tool });
  },

  onColorTap(e) {
    const color = e.currentTarget.dataset.color;
    const picked = (this.data.paletteItems || []).find(i => i.hex === color);
    this.setData({
      currentColor: color,
      currentColorCode: picked ? picked.code : '',
      currentColorName: picked ? (picked.name || picked.code) : ''
    });
    if (this.data.activeTool === 'eraser') {
      this.setData({ activeTool: 'brush' });
    }
  },

  onBrandChange(e) {
    const idx = parseInt(e.detail.value, 10) || 0;
    const name = this.data.brandList[idx] || 'MARD';
    const kits = (this._brandsData && this._brandsData[name]) ? this._brandsData[name] : [];
    const colorCountOptions = [{ value: 0, label: '全部色号' }, ...kits.map(k => ({ value: k, label: k + '色' }))];
    this._brandName = name;
    this.setData({
      brandIndex: idx,
      colorCountOptions,
      colorCountIndex: 0,
      colorCountValue: 0,
    });
    this._loadPaletteColors(name, 0);
  },

  onColorCountChange(e) {
    const idx = parseInt(e.detail.value, 10) || 0;
    const opt = this.data.colorCountOptions[idx] || { value: 0 };
    const colorCountValue = parseInt(opt.value, 10) || 0;
    this.setData({ colorCountIndex: idx, colorCountValue });
    const brand = this.data.brandList[this.data.brandIndex] || this._brandName || 'MARD';
    this._loadPaletteColors(brand, colorCountValue);
  },

  _hexToRgb(hex) {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  },

  _countColorUsage(hex) {
    const target = (hex || '').toUpperCase();
    let count = 0;
    const size = this.data.gridSize;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((this._grid[y][x] || '').toUpperCase() === target) count++;
      }
    }
    return count;
  },

  onOpenCurrentColorDetail() {
    const count = this._countColorUsage(this.data.currentColor);
    this.setData({ showColorDetail: true, colorUsageCount: count });
  },

  onCloseColorDetail() {
    this.setData({ showColorDetail: false });
  },

  onSaveToPatternBox() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;

      const stats = this._buildColorStats();
      if (!stats.length) {
        wx.showToast({ title: '画板还没有内容', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '保存中...' });
      const sid = wx.getStorageSync('sessionId') || '';
      const brand = this.data.brandList[this.data.brandIndex] || this._brandName || 'MARD';

      this._buildBeadCodeMap(stats).then((codeMap) => {
        this._exportImage('result', codeMap, (resultUrl) => {
          this._exportImage('pattern', codeMap, (patternUrl) => {
            Promise.all([
              this._uploadFile(resultUrl, sid),
              this._uploadFile(patternUrl, sid)
            ]).then(([ru, pu]) => {
              return request.post('/api/bead/pattern-local', {
                imageUrl: ru,
                resultUrl: ru,
                patternUrl: pu,
                colorStats: JSON.stringify(stats)
              });
            }).then((data) => {
              const taskId = data && data.taskId ? String(data.taskId) : '-1';
              if (!taskId || taskId === '-1') {
                wx.hideLoading();
                this.setData({ showColorDetail: false });
                wx.showToast({ title: '请先登录后保存', icon: 'none' });
                return;
              }
              return request.post('/api/my-pattern/save/' + taskId).then(() => {
                wx.hideLoading();
                this.setData({ showColorDetail: false });
                wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
              });
            }).catch(() => {
              wx.hideLoading();
              wx.showToast({ title: '保存失败', icon: 'none' });
            });
          });
        });
      });
    });
  },

  _uploadFile(filePath, sessionId) {
    return new Promise((resolve, reject) => {
      if (!filePath || filePath.startsWith('http')) {
        resolve(filePath || '');
        return;
      }
      wx.uploadFile({
        url: API_BASE_URL + '/api/image/upload',
        filePath,
        name: 'file',
        header: { 'X-Session-Id': sessionId },
        success: (res) => {
          try {
            const body = JSON.parse(res.data || '{}');
            if (res.statusCode === 200 && body.code === 0) {
              resolve(body.data.imageUrl || body.data.originalUrl || '');
              return;
            }
          } catch (e) {}
          reject(new Error('upload fail'));
        },
        fail: reject,
      });
    });
  },

  onSizeMinus() {
    this.setData({ brushSize: Math.max(1, this.data.brushSize - 1) });
  },

  onGridSizeChange(e) {
    const idx = parseInt(e.detail.value, 10) || 0;
    const nextSize = this.data.gridSizeOptions[idx] || 64;
    this.setData({ gridSizeIndex: idx, offsetX: 0, offsetY: 0, scale: 1 });
    this._undoStack = [];
    this._redoStack = [];
    this.setData({ canUndo: false, canRedo: false });
    this._applyGridSize(nextSize);
  },

  onSizePlus() {
    this.setData({ brushSize: Math.min(7, this.data.brushSize + 1) });
  },

  onSymmetry() {
    this.setData({ symmetry: !this.data.symmetry });
  },

  onUndo() {
    if (!this._undoStack.length) return;
    this._redoStack.push(JSON.stringify(this._grid));
    this._grid = JSON.parse(this._undoStack.pop());
    this.setData({ canUndo: this._undoStack.length > 0, canRedo: true });
    this._render();
  },

  onRedo() {
    if (!this._redoStack.length) return;
    this._undoStack.push(JSON.stringify(this._grid));
    this._grid = JSON.parse(this._redoStack.pop());
    this.setData({ canUndo: true, canRedo: this._redoStack.length > 0 });
    this._render();
  },

  onClear() {
    wx.showModal({
      title: '确认清空',
      content: '将清除所有绘制内容',
      success: (res) => {
        if (!res.confirm) return;
        this._saveUndo();
        this._initGrid(this.data.gridSize);
        this._render();
      }
    });
  },

  onFlip() {
    this._saveUndo();
    for (let y = 0; y < this.data.gridSize; y++) {
      this._grid[y].reverse();
    }
    this._render();
  },

  onGrid() {
    this.setData({ showGrid: !this.data.showGrid });
    this._render();
  },

  onCenter() {
    this.setData({ offsetX: 0, offsetY: 0, scale: 1 });
    wx.showToast({ title: '已复位', icon: 'none' });
  },

  onResetZoom() {
    this.setData({ offsetX: 0, offsetY: 0, scale: 1 });
  },

  onGrab() {
    const next = this.data.activeTool === 'grab' ? 'brush' : 'grab';
    this.setData({ activeTool: next });
  },

  _buildColorStats() {
    const map = new Map();
    const size = this.data.gridSize;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = this._grid[y][x];
        if (c === '#FFFFFF') continue;
        const key = c.toUpperCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
    }

    const stats = [];
    map.forEach((count, hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      stats.push({
        id: hex.replace('#', ''),
        name: hex,
        count,
        r, g, b,
      });
    });

    stats.sort((a, b) => b.count - a.count);
    return stats;
  },

  _exportImage(mode, codeMap, callback) {
    const ctx = this._exportCtx;
    if (!ctx) return;

    const size = this.data.gridSize;
    const pixel = 16;
    const outSize = size * pixel;

    ctx.setFillStyle('#FFFFFF');
    ctx.fillRect(0, 0, outSize, outSize);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const color = this._grid[y][x];
        ctx.setFillStyle(color);
        ctx.fillRect(x * pixel, y * pixel, pixel, pixel);

        if (mode === 'pattern') {
          ctx.setStrokeStyle('rgba(170,170,170,0.65)');
          ctx.setLineWidth(1);
          ctx.strokeRect(x * pixel, y * pixel, pixel, pixel);

          if (color !== '#FFFFFF') {
            const key = color.toUpperCase();
            const label = (codeMap && codeMap[key]) ? codeMap[key] : color.replace('#', '').slice(0, 2).toUpperCase();
            ctx.setFillStyle('#222222');
            ctx.setFontSize(Math.max(8, Math.floor(pixel * 0.55)));
            ctx.setTextAlign('center');
            ctx.setTextBaseline('middle');
            ctx.fillText(label, x * pixel + pixel / 2, y * pixel + pixel / 2);
          }
        }
      }
    }

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'export-canvas',
        x: 0,
        y: 0,
        width: outSize,
        height: outSize,
        destWidth: outSize,
        destHeight: outSize,
        success: (res) => callback && callback(res.tempFilePath),
        fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
      }, this);
    });
  },

  _buildBeadCodeMap(stats) {
    const brand = this.data.brandList[this.data.brandIndex] || this._brandName || 'MARD';
    const colorCount = this.data.colorCountValue || 0;
    if (!stats || !stats.length) return Promise.resolve({});

    const grid = [stats.map((s) => [s.r, s.g, s.b])];
    return request.post('/api/bead/match-colors', {
      brand,
      algo: 'standard',
      colorCount,
      grid,
    }).then((matched) => {
      const map = {};
      const row = matched && matched[0] ? matched[0] : [];
      stats.forEach((s, i) => {
        const m = row[i] || {};
        map[('#' + s.id).toUpperCase()] = m.id || s.id;
      });
      return map;
    }).catch(() => {
      return {};
    });
  },

  onPreview() {
    const stats = this._buildColorStats();
    if (!stats.length) {
      wx.showToast({ title: '画板还没有内容', icon: 'none' });
      return;
    }

    this._buildBeadCodeMap(stats).then((codeMap) => {
      this._exportImage('result', codeMap, (resultUrl) => {
        this._exportImage('pattern', codeMap, (patternUrl) => {
          const brandName = this.data.brandList[this.data.brandIndex] || this._brandName || 'MARD';
          const qs = [
            'taskId=-1',
            'originalUrl=' + encodeURIComponent(resultUrl),
            'resultUrl=' + encodeURIComponent(resultUrl),
            'patternUrl=' + encodeURIComponent(patternUrl),
            'colorStats=' + encodeURIComponent(JSON.stringify(stats)),
            'gridSize=' + this.data.gridSize,
            'brand=' + encodeURIComponent(brandName)
          ].join('&');

          wx.navigateTo({ url: '/pages/result/result?' + qs });
        });
      });
    });
  },

  onFinish() {
    wx.showModal({
      title: '完成作品',
      content: '确认完成并预览图纸？',
      success: (res) => {
        if (res.confirm) this.onPreview();
      }
    });
  },

  onDraft() {
    wx.showToast({ title: '草稿已保存（本地）', icon: 'success' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onOpenToolMenu() {
    wx.showActionSheet({
      itemList: ['存图纸箱', '预览', '清空画板', '复位视图'],
      success: (res) => {
        const i = res.tapIndex;
        if (i === 0) this.onSaveToPatternBox();
        if (i === 1) this.onPreview();
        if (i === 2) this.onClear();
        if (i === 3) this.onCenter();
      }
    });
  },

  onSearch() {
    wx.showToast({ title: '搜索功能开发中', icon: 'none' });
  }
});
