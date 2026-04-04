const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    patternUrl: '',
    colorStats: [],
    currentIndex: 0,
    currentColor: null,
    completedMap: {},
    doneCount: 0,
    currentSize: 64,
    brandName: 'MARD',
    brightness: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    canvasSizePx: 340,
    topSafePx: 20,
    topBarHeightPx: 44,
  },

  _grid: [],
  _ctx: null,
  _baseCtx: null,
  _cellSize: 4,
  _isPanning: false,
  _panStartX: 0,
  _panStartY: 0,
  _panStartOffsetX: 0,
  _panStartOffsetY: 0,
  _pinchStartDistance: 0,
  _pinchStartScale: 1,
  onLoad(options) {
    let stats = [];
    try {
      if (options.colorStats) stats = JSON.parse(decodeURIComponent(options.colorStats));
    } catch (e) {}

    const patternUrl = decodeURIComponent(options.patternUrl || '');
    const currentSize = options.gridSize ? parseInt(options.gridSize) : 64;
    const brandName = options.brand ? decodeURIComponent(options.brand) : 'MARD';

    const layout = getSafeAreaLayout();
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    const canvasSizePx = Math.min((sys.windowWidth || 375) - 24, 360);
    const topSafePx = layout.statusBarHeight;
    const topBarHeightPx = layout.navHeight - layout.statusBarHeight;
    this.setData({ topSafePx, topBarHeightPx, canvasSizePx });
    this._cellSize = canvasSizePx / currentSize;
    this._ctx = wx.createCanvasContext('focus-canvas', this);
    this._baseCtx = wx.createCanvasContext('focus-base-canvas', this);

    this.setData({
      patternUrl,
      colorStats: stats,
      currentSize,
      brandName,
      currentColor: stats[0] || null
    }, () => {
      this._colorHexMap = {};
      (stats || []).forEach((c) => {
        const h = this._hex(c.r, c.g, c.b);
        this._colorHexMap[h] = c;
      });
      this._buildGridFromPattern();
    });
  },

  _distance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  _buildGridFromPattern() {
    const { patternUrl, currentSize } = this.data;
    if (!patternUrl) return;

    wx.getImageInfo({
      src: patternUrl,
      success: (info) => {
        const localPath = info.path || patternUrl;
        const drawSize = this.data.canvasSizePx;
        this._baseCtx.drawImage(localPath, 0, 0, drawSize, drawSize);
        this._baseCtx.draw(false, () => {
          wx.canvasGetImageData({
            canvasId: 'focus-base-canvas',
            x: 0,
            y: 0,
            width: drawSize,
            height: drawSize,
            success: (img) => {
              const data = img.data;
              const gs = currentSize;
              const cs = this._cellSize;
              const grid = Array.from({ length: gs }, () => Array(gs).fill(null));

              for (let y = 0; y < gs; y++) {
                for (let x = 0; x < gs; x++) {
                  const sx = Math.min(drawSize - 1, Math.floor(x * cs + cs / 2));
                  const sy = Math.min(drawSize - 1, Math.floor(y * cs + cs / 2));
                  const i = (sy * drawSize + sx) * 4;
                  const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                  if (a < 10) continue;
                  grid[y][x] = { r, g, b };
                }
              }

              this._grid = grid;
              this._renderFocus();
            },
            fail: () => {
              this._renderImageFallback(localPath);
            }
          }, this);
        });
      },
      fail: () => {
        this._grid = Array.from({ length: currentSize }, () => Array(currentSize).fill(null));
        this._renderFocus();
      }
    });
  },

  _renderImageFallback(localPath) {
    const ctx = this._ctx;
    if (!ctx) return;
    const size = this.data.canvasSizePx;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(localPath, 0, 0, size, size);
    ctx.draw();
  },

  _hex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  },

  _renderFocus() {
    const ctx = this._ctx;
    if (!ctx || !this._grid.length) return;

    const { currentSize, brightness, currentColor, completedMap } = this.data;
    const cs = this._cellSize;

    ctx.clearRect(0, 0, this.data.canvasSizePx, this.data.canvasSizePx);
    ctx.setFillStyle(brightness === 1 ? '#121212' : '#0A0A0A');
    ctx.fillRect(0, 0, this.data.canvasSizePx, this.data.canvasSizePx);

    const currentId = currentColor ? currentColor.id : '';
    const activeAlpha = brightness === 1 ? 1 : 0.7;
    const dimAlpha = brightness === 1 ? 0.25 : 0.12;
    const doneAlpha = brightness === 1 ? 0.12 : 0.06;

    for (let y = 0; y < currentSize; y++) {
      for (let x = 0; x < currentSize; x++) {
        const cell = this._grid[y] && this._grid[y][x];
        if (!cell) continue;

        const hex = this._hex(cell.r, cell.g, cell.b);
        const match = this._findByHex(hex);
        const id = match ? match.id : '';
        const isHighlighted = id && id === currentId;
        const isCompleted = id && completedMap[id];

        if (isCompleted) ctx.setGlobalAlpha(doneAlpha);
        else if (isHighlighted) ctx.setGlobalAlpha(activeAlpha);
        else ctx.setGlobalAlpha(dimAlpha);

        ctx.setFillStyle(`rgb(${cell.r},${cell.g},${cell.b})`);
        ctx.fillRect(x * cs, y * cs, cs, cs);

        if (isHighlighted && !isCompleted) {
          ctx.setGlobalAlpha(1);
          ctx.setStrokeStyle('rgba(255,255,255,0.95)');
          ctx.setLineWidth(1.2);
          ctx.strokeRect(x * cs + 0.5, y * cs + 0.5, cs - 1, cs - 1);

          ctx.beginPath();
          ctx.moveTo(x * cs + cs / 2, y * cs + 2);
          ctx.lineTo(x * cs + cs / 2, (y + 1) * cs - 2);
          ctx.moveTo(x * cs + 2, y * cs + cs / 2);
          ctx.lineTo((x + 1) * cs - 2, y * cs + cs / 2);
          ctx.setStrokeStyle('rgba(255,255,255,0.85)');
          ctx.setLineWidth(1);
          ctx.stroke();
        }

        ctx.setGlobalAlpha(1);
      }
    }

    ctx.setStrokeStyle('rgba(255,255,255,0.08)');
    ctx.setLineWidth(0.5);
    for (let i = 0; i <= currentSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cs, 0);
      ctx.lineTo(i * cs, currentSize * cs);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cs);
      ctx.lineTo(currentSize * cs, i * cs);
      ctx.stroke();
    }

    ctx.draw();
  },

  _findByHex(hex) {
    const up = hex.toUpperCase();
    return (this._colorHexMap && this._colorHexMap[up]) ? this._colorHexMap[up] : null;
  },

  onToggleBrightness() {
    const brightness = this.data.brightness === 1 ? 0.5 : 1;
    this.setData({ brightness }, () => this._renderFocus());
    wx.showToast({ title: brightness === 1 ? '亮度正常' : '低亮模式', icon: 'none', duration: 1000 });
  },

  onResetView() {
    this._isPanning = false;
    this._pinchStartDistance = 0;
    this.setData({ scale: 1, offsetX: 0, offsetY: 0 });
    wx.showToast({ title: '视图已重置', icon: 'none', duration: 1000 });
  },

  onPrev() {
    const { currentIndex, colorStats } = this.data;
    if (!colorStats.length) return;
    const idx = currentIndex <= 0 ? colorStats.length - 1 : currentIndex - 1;
    this.setData({ currentIndex: idx, currentColor: colorStats[idx] }, () => this._renderFocus());
  },

  onNext() {
    const { currentIndex, colorStats } = this.data;
    if (!colorStats.length) return;
    const idx = currentIndex >= colorStats.length - 1 ? 0 : currentIndex + 1;
    this.setData({ currentIndex: idx, currentColor: colorStats[idx] }, () => this._renderFocus());
  },

  onPick(e) {
    const idx = parseInt(e.currentTarget.dataset.index, 10);
    const color = this.data.colorStats[idx];
    this.setData({ currentIndex: idx, currentColor: color }, () => this._renderFocus());
  },

  onToggleDone() {
    const { currentColor, completedMap } = this.data;
    if (!currentColor) return;
    const map = { ...completedMap };
    if (map[currentColor.id]) delete map[currentColor.id];
    else map[currentColor.id] = true;
    this.setData({
      completedMap: map,
      doneCount: Object.keys(map).length
    }, () => this._renderFocus());
  },

  onCanvasTouchStart(e) {
    const touches = e.touches || [];
    if (!touches.length) return;

    if (touches.length >= 2) {
      this._isPanning = true;
      this._pinchStartDistance = this._distance(touches[0], touches[1]);
      this._pinchStartScale = this.data.scale;
      this._panStartX = (touches[0].clientX + touches[1].clientX) / 2;
      this._panStartY = (touches[0].clientY + touches[1].clientY) / 2;
      this._panStartOffsetX = this.data.offsetX;
      this._panStartOffsetY = this.data.offsetY;
      return;
    }

    this._isPanning = true;
    this._panStartX = touches[0].clientX;
    this._panStartY = touches[0].clientY;
    this._panStartOffsetX = this.data.offsetX;
    this._panStartOffsetY = this.data.offsetY;
  },

  _clampOffset(scale, ox, oy) {
    const canvas = this.data.canvasSizePx;
    const extra = Math.max(0, (scale - 1) * canvas / 2);
    const maxOffset = extra + 80;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, ox)),
      y: Math.max(-maxOffset, Math.min(maxOffset, oy)),
    };
  },

  onCanvasTouchMove(e) {
    if (!this._isPanning) return;
    const touches = e.touches || [];
    if (!touches.length) return;

    if (touches.length >= 2) {
      const curDist = this._distance(touches[0], touches[1]);
      const ratio = this._pinchStartDistance ? (curDist / this._pinchStartDistance) : 1;
      const scale = Math.min(4, Math.max(0.6, this._pinchStartScale * ratio));
      const cx = (touches[0].clientX + touches[1].clientX) / 2;
      const cy = (touches[0].clientY + touches[1].clientY) / 2;
      const ox = this._panStartOffsetX + (cx - this._panStartX);
      const oy = this._panStartOffsetY + (cy - this._panStartY);
      const p = this._clampOffset(scale, ox, oy);
      this.setData({ scale, offsetX: p.x, offsetY: p.y });
      return;
    }

    const t = touches[0];
    const ox = this._panStartOffsetX + (t.clientX - this._panStartX);
    const oy = this._panStartOffsetY + (t.clientY - this._panStartY);
    const p = this._clampOffset(this.data.scale, ox, oy);
    this.setData({ offsetX: p.x, offsetY: p.y });
  },

  onCanvasTouchEnd() {
    this._isPanning = false;
    this._pinchStartDistance = 0;
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
