// 拼豆画板 - 参考 perlerBeadsApplet 实现
const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');

// 默认颜色
const DEFAULT_COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF6B35', '#FF69B4', '#00CED1', '#9370DB', '#FFA500', '#008B8B',
  '#DC143C', '#32CD32', '#4169E1', '#FFD700', '#808080', '#2F4F4F',
  '#FF6B6B', '#90EE90', '#87CEEB', '#DDA0DD', '#F0E68C', '#E6E6FA'
];

Page({
  data: {
    gridSize: 32,
    canvasWidth: 320,
    canvasHeight: 320,
    tool: 'pen',
    brushSize: 1,
    showGrid: true,
    symmetry: false,
    currentColor: '#FF6B35',
    currentCode: 'C01',
    colors: DEFAULT_COLORS,
    showColorModal: false,
    colorCount: 0,
    loading: false,
    loadingText: '处理中...',
    canUndo: false,
    canRedo: false,
    zoomPercent: 100,
  },

  _ctx: null,
  _canvas: null,
  _offscreenCanvas: null,
  _offscreenCtx: null,
  _gridData: null,
  _cellSize: 10,
  _undoStack: [],
  _redoStack: [],
  _isDrawing: false,
  _lastPos: null,

  onLoad(options) {
    this._initData();
  },

  onReady() {
    this._initCanvas();
  },

  // 初始化数据
  _initData() {
    const info = wx.getSystemInfoSync();
    const size = Math.min(info.windowWidth - 80, info.windowHeight * 0.4);
    const canvasSize = Math.floor(size / this.data.gridSize) * this.data.gridSize;
    this._cellSize = canvasSize / this.data.gridSize;
    this._gridData = Array.from({ length: this.data.gridSize }, 
      () => Array(this.data.gridSize).fill('#FFFFFF'));
    this.setData({ 
      canvasWidth: canvasSize, 
      canvasHeight: canvasSize 
    });
  },

  // 初始化Canvas - 参考perlerBeadsApplet
  _initCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#drawCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio || 1;
          
          // 设置Canvas实际像素大小
          canvas.width = this.data.canvasWidth * dpr;
          canvas.height = this.data.canvasHeight * dpr;
          ctx.scale(dpr, dpr);
          
          this._canvas = canvas;
          this._ctx = ctx;
          
          // 初始化离屏Canvas
          this._initOffscreenCanvas();
          
          // 绘制初始网格
          this._drawFullGrid();
        }
      });
  },

  // 离屏Canvas - 参考perlerBeadsApplet
  _initOffscreenCanvas() {
    try {
      this._offscreenCanvas = wx.createOffscreenCanvas({
        type: '2d',
        width: this.data.canvasWidth,
        height: this.data.canvasHeight
      });
      this._offscreenCtx = this._offscreenCanvas.getContext('2d');
    } catch (e) {
      console.log('OffscreenCanvas not supported');
    }
  },

  // 绘制完整网格 - 参考perlerBeadsApplet
  _drawFullGrid() {
    const ctx = this._ctx;
    if (!ctx) return;
    
    const { canvasWidth, canvasHeight, gridSize, showGrid } = this.data;
    const cellSize = this._cellSize;
    
    // 清空画布
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // 绘制像素数据
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const color = this._gridData[y][x];
        if (color !== '#FFFFFF') {
          ctx.fillStyle = color;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
    
    // 绘制网格线
    if (showGrid && cellSize >= 6) {
      ctx.strokeStyle = 'rgba(180, 180, 200, 0.6)';
      ctx.lineWidth = 1;
      
      for (let i = 0; i <= gridSize; i++) {
        const pos = i * cellSize;
        // 竖线
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, canvasHeight);
        ctx.stroke();
        // 横线
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(canvasWidth, pos);
        ctx.stroke();
      }
    }
    
    ctx.draw();
  },

  // 保存撤销状态
  _saveState() {
    const state = JSON.stringify(this._gridData);
    this._undoStack.push(state);
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
    this.setData({ canUndo: true, canRedo: false });
  },

  // 触摸开始
  handleTouchStart(e) {
    const touch = e.touches[0];
    const pos = this._getPixelPosition(touch.clientX, touch.clientY);
    if (!pos) return;
    
    this._isDrawing = true;
    this._lastPos = pos;
    this._saveState();
    this._paintPixel(pos.row, pos.col);
  },

  // 触摸移动
  handleTouchMove(e) {
    if (!this._isDrawing) return;
    
    const touch = e.touches[0];
    const pos = this._getPixelPosition(touch.clientX, touch.clientY);
    if (!pos) return;
    
    // 使用Bresenham画线
    if (this._lastPos) {
      this._paintLine(this._lastPos.row, this._lastPos.col, pos.row, pos.col);
    } else {
      this._paintPixel(pos.row, pos.col);
    }
    this._lastPos = pos;
  },

  // 触摸结束
  handleTouchEnd() {
    this._isDrawing = false;
    this._lastPos = null;
  },

  // 获取像素位置 - 参考perlerBeadsApplet
  _getPixelPosition(touchX, touchY) {
    const query = wx.createSelectorQuery().in(this);
    let rect = null;
    
    query.select('#drawCanvas').boundingClientRect((res) => {
      rect = res;
    }).exec();
    
    // 同步获取（在小程序中需要这样处理）
    const syncQuery = wx.createSelectorQuery().in(this);
    syncQuery.select('#drawCanvas').boundingClientRect().exec((res) => {
      if (res && res[0]) {
        this._canvasRect = res[0];
      }
    });
    
    // 使用缓存的rect
    const canvasRect = this._canvasRect;
    if (!canvasRect) return null;
    
    const { canvasWidth, canvasHeight, gridSize } = this.data;
    const minSize = Math.min(canvasWidth, canvasHeight);
    const centerX = (canvasWidth - minSize) / 2;
    const centerY = (canvasHeight - minSize) / 2;
    
    const left = centerX;
    const top = centerY;
    
    const col = Math.floor((touchX - left) / this._cellSize);
    const row = Math.floor((touchY - top) / this._cellSize);
    
    if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
      return { row, col };
    }
    return null;
  },

  // 绘制单个像素
  _paintPixel(row, col) {
    const { tool, currentColor, symmetry, gridSize } = this.data;
    
    if (tool === 'picker') {
      const pickedColor = this._gridData[row][col];
      if (pickedColor !== '#FFFFFF') {
        this.setData({ currentColor: pickedColor, tool: 'pen' });
      }
      return;
    }
    
    if (tool === 'fill') {
      this._floodFill(row, col, currentColor);
      this._drawFullGrid();
      return;
    }
    
    const color = tool === 'eraser' ? '#FFFFFF' : currentColor;
    this._gridData[row][col] = color;
    
    // 对称绘制
    if (symmetry) {
      const symCol = gridSize - 1 - col;
      if (symCol >= 0 && symCol < gridSize) {
        this._gridData[row][symCol] = color;
      }
    }
    
    // 笔刷大小
    const { brushSize } = this.data;
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const r = row + dy;
        const c = col + dx;
        if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
          this._gridData[r][c] = color;
          if (symmetry) {
            const symC = gridSize - 1 - c;
            if (symC >= 0 && symC < gridSize) {
              this._gridData[r][symC] = color;
            }
          }
        }
      }
    }
    
    this._drawFullGrid();
  },

  // Bresenham画线算法
  _paintLine(r0, c0, r1, c1) {
    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dc - dr;
    
    while (true) {
      this._paintPixel(r0, c0);
      if (r0 === r1 && c0 === c1) break;
      const e2 = 2 * err;
      if (e2 > -dr) {
        err -= dr;
        c0 += sc;
      }
      if (e2 < dc) {
        err += dc;
        r0 += sr;
      }
    }
  },

  // 洪水填充
  _floodFill(startRow, startCol, newColor) {
    const targetColor = this._gridData[startRow][startCol];
    if (targetColor === newColor) return;
    
    const { gridSize } = this.data;
    const stack = [[startRow, startCol]];
    const visited = new Set();
    
    while (stack.length > 0) {
      const [r, c] = stack.pop();
      const key = `${r},${c}`;
      
      if (visited.has(key)) continue;
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) continue;
      if (this._gridData[r][c] !== targetColor) continue;
      
      visited.add(key);
      this._gridData[r][c] = newColor;
      
      stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }
  },

  // 撤销
  onUndo() {
    if (this._undoStack.length === 0) return;
    this._redoStack.push(JSON.stringify(this._gridData));
    this._gridData = JSON.parse(this._undoStack.pop());
    this.setData({ canUndo: this._undoStack.length > 0, canRedo: true });
    this._drawFullGrid();
  },

  // 重做
  onRedo() {
    if (this._redoStack.length === 0) return;
    this._undoStack.push(JSON.stringify(this._gridData));
    this._gridData = JSON.parse(this._redoStack.pop());
    this.setData({ canUndo: true, canRedo: this._redoStack.length > 0 });
    this._drawFullGrid();
  },

  // 选择工具
  onSelectTool(e) {
    const tool = e.currentTarget.dataset.tool;
    if (tool === 'undo') { this.onUndo(); return; }
    if (tool === 'redo') { this.onRedo(); return; }
    this.setData({ tool });
  },

  // 选择笔刷大小
  onBrushSize(e) {
    const size = parseInt(e.currentTarget.dataset.size, 10);
    this.setData({ brushSize: size });
  },

  // 切换网格
  onToggleGrid() {
    this.setData({ showGrid: !this.data.showGrid });
    this._drawFullGrid();
  },

  // 切换对称
  onToggleSymmetry() {
    this.setData({ symmetry: !this.data.symmetry });
  },

  // 选择颜色
  onSelectColor(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ currentColor: color, currentCode: this._getColorCode(color) });
  },

  // 获取颜色代码
  _getColorCode(hex) {
    const index = this.data.colors.indexOf(hex);
    if (index >= 0) {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const letter = letters[Math.floor(index / 10)] || 'A';
      const num = (index % 10) + 1;
      return `${letter}${num.toString().padStart(2, '0')}`;
    }
    return 'C01';
  },

  // 打开颜色详情
  onOpenColorDetail() {
    const count = this._countColorUsage(this.data.currentColor);
    this.setData({ showColorModal: true, colorCount: count });
  },

  // 关闭颜色详情
  onCloseColorModal() {
    this.setData({ showColorModal: false });
  },

  // 统计颜色使用
  _countColorUsage(color) {
    let count = 0;
    for (let y = 0; y < this.data.gridSize; y++) {
      for (let x = 0; x < this.data.gridSize; x++) {
        if (this._gridData[y][x].toUpperCase() === color.toUpperCase()) count++;
      }
    }
    return count;
  },

  // 清空
  onClear() {
    wx.showModal({
      title: '清空画板',
      content: '确定要清空整个画布吗？',
      success: (res) => {
        if (res.confirm) {
          this._saveState();
          this._gridData = Array.from({ length: this.data.gridSize }, 
            () => Array(this.data.gridSize).fill('#FFFFFF'));
          this._drawFullGrid();
        }
      }
    });
  },

  // 保存
  onSave() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this._saveDraft();
    });
  },

  // 保存草稿
  _saveDraft() {
    this.setData({ loading: true, loadingText: '保存中...' });
    
    const colorStats = this._buildColorStats();
    const colorPalette = colorStats.map((s, idx) => ({
      index: idx,
      id: s.id,
      name: s.name,
      r: s.r,
      g: s.g,
      b: s.b,
      count: s.count
    }));
    
    const gridData = this._gridData.map(row => 
      row.map(hex => {
        const idx = colorStats.findIndex(s => 
          '#' + [s.r, s.g, s.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() === hex.toUpperCase()
        );
        return idx >= 0 ? idx : 0;
      })
    );
    
    request.post('/draft/save', {
      sourceType: 'DRAW',
      brand: 'MARD',
      colorCount: colorStats.length,
      gridSize: this.data.gridSize,
      gridData: JSON.stringify(gridData),
      colorPalette: JSON.stringify(colorPalette)
    })
    .then(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    })
    .catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  // 构建颜色统计
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

  // 导出图纸
  onExport() {
    const stats = this._buildColorStats();
    if (stats.length === 0) {
      wx.showToast({ title: '画板还没有内容', icon: 'none' });
      return;
    }
    
    this.setData({ loading: true, loadingText: '生成中...' });
    
    const exportSize = this.data.gridSize * 16;
    
    wx.canvasToTempFilePath({
      canvasId: 'drawCanvas',
      x: 0,
      y: 0,
      width: this.data.canvasWidth,
      height: this.data.canvasHeight,
      destWidth: exportSize,
      destHeight: exportSize,
      fileType: 'png',
      success: (res) => {
        this.setData({ loading: false });
        wx.previewImage({
          urls: [res.tempFilePath],
          current: res.tempFilePath
        });
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    }, this);
  },

  // 返回
  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
