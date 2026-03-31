Page({
  data: {
    activeTool: 'brush',
    currentColor: '#000000',
    brushSize: 1,
    symmetry: false,
    canUndo: false,
    canRedo: false,
    gridSize: 32,
    activeTab: 'draw',
    colors: [
      '#000000', '#FFFFFF', '#FF0000', '#FF6B6B', '#FFA500',
      '#FFFF00', '#00CC44', '#00FFFF', '#0066FF', '#0000FF',
      '#8800FF', '#FF00FF', '#FF9800', '#795548', '#9E9E9E',
      '#FFCCBC', '#F8BBD0', '#E1BEE7', '#BBDEFB', '#C8E6C9'
    ],
    canvasSize: 320,
  },

  // 像素网格数据：gridSize x gridSize 的二维数组，存颜色
  _grid: [],
  _undoStack: [],
  _redoStack: [],
  _ctx: null,
  _cellSize: 10,
  _isDrawing: false,

  onLoad() {
    const gridSize = this.data.gridSize;
    // 获取系统信息计算画布尺寸
    wx.getSystemInfo({
      success: (res) => {
        const canvasSize = Math.min(res.windowWidth - 48, res.windowHeight * 0.45);
        const cellSize = Math.floor(canvasSize / gridSize);
        const actualSize = cellSize * gridSize;
        this._cellSize = cellSize;
        this.setData({ canvasSize: actualSize });
        this._initGrid(gridSize);
        this._initCanvas(actualSize);
      }
    });
  },

  _initGrid(size) {
    this._grid = Array.from({ length: size }, () => Array(size).fill('#FFFFFF'));
  },

  _initCanvas(size) {
    const ctx = wx.createCanvasContext('draw-canvas');
    this._ctx = ctx;
    this._render();
  },

  _render() {
    const ctx = this._ctx;
    const cs = this._cellSize;
    const grid = this._grid;
    const size = this.data.gridSize;
    ctx.clearRect(0, 0, size * cs, size * cs);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = grid[y][x];
        ctx.fillRect(x * cs, y * cs, cs, cs);
        ctx.strokeStyle = 'rgba(200,200,200,0.5)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x * cs, y * cs, cs, cs);
      }
    }
    ctx.draw();
  },

  _getCell(touchX, touchY) {
    const cs = this._cellSize;
    const size = this.data.gridSize;
    // 获取 canvas 在页面的位置
    const canvasSize = this.data.canvasSize;
    const offsetX = (wx.getSystemInfoSync().windowWidth - canvasSize) / 2;
    const offsetY = this._canvasTop || 0;
    const x = Math.floor((touchX - offsetX) / cs);
    const y = Math.floor((touchY - offsetY) / cs);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  },

  _paintCell(x, y) {
    const { activeTool, currentColor, symmetry, gridSize } = this.data;
    const color = activeTool === 'eraser' ? '#FFFFFF' : currentColor;
    if (this._grid[y][x] === color) return;
    this._grid[y][x] = color;
    if (symmetry) {
      this._grid[y][gridSize - 1 - x] = color;
    }
  },

  _saveUndo() {
    this._undoStack.push(JSON.stringify(this._grid));
    if (this._undoStack.length > 30) this._undoStack.shift();
    this._redoStack = [];
    this.setData({ canUndo: true, canRedo: false });
  },

  onTouchStart(e) {
    const touch = e.touches[0];
    this._isDrawing = true;
    this._saveUndo();
    // 记录 canvas 顶部位置
    const query = wx.createSelectorQuery();
    query.select('.draw-canvas').boundingClientRect((rect) => {
      if (rect) this._canvasTop = rect.top;
      const cell = this._getCell(touch.clientX, touch.clientY);
      if (cell) {
        this._paintCell(cell.x, cell.y);
        this._render();
      }
    }).exec();
  },

  onTouchMove(e) {
    if (!this._isDrawing) return;
    const touch = e.touches[0];
    const cell = this._getCell(touch.clientX, touch.clientY);
    if (cell) {
      this._paintCell(cell.x, cell.y);
      this._render();
    }
  },

  onTouchEnd() {
    this._isDrawing = false;
  },

  onToolTap(e) {
    this.setData({ activeTool: e.currentTarget.dataset.tool });
  },

  onColorTap(e) {
    this.setData({ currentColor: e.currentTarget.dataset.color });
    if (this.data.activeTool === 'eraser') {
      this.setData({ activeTool: 'brush' });
    }
  },

  onSizeMinus() {
    const s = Math.max(1, this.data.brushSize - 1);
    this.setData({ brushSize: s });
  },

  onSizePlus() {
    const s = Math.min(5, this.data.brushSize + 1);
    this.setData({ brushSize: s });
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
      title: '确认清空', content: '将清除所有绘制内容',
      success: (res) => {
        if (res.confirm) {
          this._saveUndo();
          this._initGrid(this.data.gridSize);
          this._render();
        }
      }
    });
  },

  onReset() {
    this._render();
  },

  onFlip() {
    this._saveUndo();
    const size = this.data.gridSize;
    for (let y = 0; y < size; y++) {
      this._grid[y].reverse();
    }
    this._render();
  },

  onFinish() {
    wx.showToast({ title: '画板保存功能即将上线', icon: 'none' });
  },

  onPreview() {
    wx.showToast({ title: '预览功能即将上线', icon: 'none' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  onSearch() {
    wx.showToast({ title: '搜索功能开发中', icon: 'none' });
  },

  onFinish() {
    wx.showModal({
      title: '完成作品',
      content: '确认完成此作品？将保存到我的图纸',
      success: (res) => {
        if (res.confirm) {
          this.saveDrawing('finish');
        }
      }
    });
  },

  onDraft() {
    this.saveDrawing('draft');
  },

  onPreview() {
    wx.showToast({ title: '预览功能开发中', icon: 'none' });
  },

  onGrid() {
    wx.showToast({ title: '网格显示切换', icon: 'none' });
  },

  onCenter() {
    wx.showToast({ title: '画布居中', icon: 'none' });
  },

  onGrab() {
    wx.showToast({ title: '抓手工具激活', icon: 'none' });
  },

  saveDrawing(type) {
    const title = type === 'finish' ? '作品已保存' : '草稿已保存';
    wx.showToast({ title, icon: 'success' });
    // TODO: 调用后端保存接口
  },
});
