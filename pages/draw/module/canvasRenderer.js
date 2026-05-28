const {
  drawBoard,
  drawPixel,
  drawGridLineRects,
  drawCodeLayer,
  drawCheckerboard,
  drawCheckerCell,
  drawCoordinateFrame
} = require('../../../utils/canvas2d/renderers/boardRenderer');

class CanvasRenderer {
  constructor(options = {}) {
    this._getColorCodeMap = options.getColorCodeMap || (() => ({}));
    this._getState = options.getState || (() => ({}));
    this._getPixelColor = options.getPixelColor || null;
    this._getPixelColorByOffset = options.getPixelColorByOffset || null;
    this._dirtyCells = new Set();
    this._codeLayerDirty = true;
    this._isLowQualityMode = false;
    this._gridCache = null;
    this._gridCacheKey = '';
    this._codeCache = null;
    this._codeCacheKey = '';
    this._pixelCache = null;
    this._pixelCacheKey = '';
    this._pixelLayerDirty = true;
    this._renderGridLayer = true;
  }

  markDirty(row, col) {
    this._dirtyCells.add(`${row},${col}`);
    this._codeLayerDirty = true;
  }

  markDirtyBatch(cells) {
    if (!cells) return;
    cells.forEach((key) => this._dirtyCells.add(key));
    if (cells.size > 0) this._codeLayerDirty = true;
  }

  invalidateCodeLayer() {
    this._codeLayerDirty = true;
  }

  invalidatePixelLayer() {
    this._pixelLayerDirty = true;
    this._codeLayerDirty = true;
  }

  setLowQualityMode(enabled) {
    this._isLowQualityMode = !!enabled;
    if (this._isLowQualityMode) {
      this.clearCaches();
    }
  }

  setGridLayerVisible(visible) {
    this._renderGridLayer = visible !== false;
  }

  clearCaches() {
    this._gridCache = null;
    this._gridCacheKey = '';
    this._codeCache = null;
    this._codeCacheKey = '';
    this._pixelCache = null;
    this._pixelCacheKey = '';
    this._pixelLayerDirty = true;
    this._codeLayerDirty = true;
  }

  _createCanvas(width, height) {
    if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
      return wx.createOffscreenCanvas({ type: '2d', width, height });
    }
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    return null;
  }

  _getRenderDpr(state) {
    return Math.max(Number(state.renderDpr || state.dpr || 1) || 1, 1);
  }

  _prepareCacheCanvas(canvas, width, height, dpr) {
    const backingWidth = Math.max(1, Math.ceil(width * dpr));
    const backingHeight = Math.max(1, Math.ceil(height * dpr));
    canvas.width = backingWidth;
    canvas.height = backingHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      ctx.scale(dpr, dpr);
    }

    return ctx;
  }

  _drawCacheImage(ctx, cache, state, smooth = false) {
    if (!ctx || !cache) return;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    const prevQuality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = !!smooth;
    if (smooth) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cache, 0, 0, state.boardCanvasWidth || state.canvasWidth, state.boardCanvasHeight || state.canvasHeight);
    ctx.imageSmoothingEnabled = prevSmoothing;
    ctx.imageSmoothingQuality = prevQuality;
  }

  _getCellColor(row, col, gridSize) {
    if (this._getPixelColorByOffset && gridSize) {
      return this._getPixelColorByOffset(row * gridSize + col);
    }
    return this._getPixelColor ? this._getPixelColor(row, col) : null;
  }

  _shouldRenderCodeLayer(state) {
    if (state.renderCodes === false) return false;
    const width = Number(state.canvasWidth) || 0;
    const gridSize = Number(state.gridSize) || 0;
    if (!width || !gridSize) return false;
    const cellSize = width / gridSize;
    const visualCell = cellSize * Math.max(Number(state.canvasScale) || 1, 1);
    return visualCell >= 6;
  }

  _getGridCache(ctx, state) {
    const width = Number(state.canvasWidth) || 0;
    const height = Number(state.canvasHeight) || 0;
    const boardWidth = Number(state.boardCanvasWidth) || width;
    const boardHeight = Number(state.boardCanvasHeight) || height;
    const boardInset = Number(state.boardInset) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const viewScale = Number(state.canvasScale) || 1;
    const dpr = this._getRenderDpr(state);
    const cellSize = gridSize ? width / gridSize : 0;

    if (!state.showGrid || !width || !height || !gridSize) return null;

    const cacheKey = [width, height, boardWidth, boardHeight, boardInset, gridSize, viewScale.toFixed(4), dpr.toFixed(4)].join(':');
    if (this._gridCache && this._gridCacheKey === cacheKey) {
      return this._gridCache;
    }

    const canvas = this._createCanvas(boardWidth, boardHeight);
    if (!canvas) return null;

    const gridCtx = this._prepareCacheCanvas(canvas, boardWidth, boardHeight, dpr);
    if (!gridCtx) return null;

    gridCtx.clearRect(0, 0, boardWidth, boardHeight);
    gridCtx.save();
    gridCtx.translate(boardInset, boardInset);
    drawGridLineRects(gridCtx, width, height, gridSize, cellSize, viewScale, dpr);
    gridCtx.restore();
    this._gridCache = canvas;
    this._gridCacheKey = cacheKey;
    return canvas;
  }

  _getCodeCache(ctx, state) {
    const width = Number(state.canvasWidth) || 0;
    const height = Number(state.canvasHeight) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const viewScale = Number(state.canvasScale) || 1;
    const dpr = this._getRenderDpr(state);
    if (!this._shouldRenderCodeLayer(state)) return null;

    const colorCodeMap = this._getColorCodeMap();
    const colorCodeKey = JSON.stringify(colorCodeMap || {});
    const boardWidth = Number(state.boardCanvasWidth) || width;
    const boardHeight = Number(state.boardCanvasHeight) || height;
    const boardInset = Number(state.boardInset) || 0;
    const cacheKey = [width, height, boardWidth, boardHeight, boardInset, gridSize, viewScale.toFixed(4), dpr.toFixed(4), colorCodeKey].join(':');

    if (!width || !height || !gridSize || !colorCodeMap) return null;
    if (!this._codeLayerDirty && this._codeCache && this._codeCacheKey === cacheKey) {
      return this._codeCache;
    }

    const canvas = this._createCanvas(boardWidth, boardHeight);
    if (!canvas) return null;

    const codeCtx = this._prepareCacheCanvas(canvas, boardWidth, boardHeight, dpr);
    if (!codeCtx) return null;

    codeCtx.clearRect(0, 0, boardWidth, boardHeight);
    codeCtx.save();
    codeCtx.translate(boardInset, boardInset);
    drawCodeLayer(codeCtx, {
      width,
      gridSize,
      viewScale,
      colorCodeMap,
      getCellColor: (row, col) => this._getCellColor(row, col, gridSize)
    });
    codeCtx.restore();

    this._codeCache = canvas;
    this._codeCacheKey = cacheKey;
    this._codeLayerDirty = false;
    return canvas;
  }

  _getPixelCache(state) {
    const width = Number(state.canvasWidth) || 0;
    const height = Number(state.canvasHeight) || 0;
    const boardWidth = Number(state.boardCanvasWidth) || width;
    const boardHeight = Number(state.boardCanvasHeight) || height;
    const gridSize = Number(state.gridSize) || 0;
    const hasBackground = !!state.backgroundImage;
    const dpr = this._getRenderDpr(state);
    const viewScale = Number(state.canvasScale) || 1;
    const cacheKey = [width, height, boardWidth, boardHeight, gridSize, hasBackground ? 1 : 0, viewScale.toFixed(4), dpr.toFixed(4)].join(':');

    if (!width || !height || !gridSize) return null;

    if (!this._pixelCache || this._pixelCacheKey !== cacheKey) {
      const canvas = this._createCanvas(width, height);
      if (!canvas) return null;
      this._pixelCache = canvas;
      this._pixelCacheKey = cacheKey;
      this._pixelLayerDirty = true;
    }

    if (this._pixelLayerDirty) {
      this._rebuildPixelCache(state);
    }

    return this._pixelCache;
  }

  _rebuildPixelCache(state) {
    if (!this._pixelCache) return;

    const width = Number(state.canvasWidth) || 0;
    const height = Number(state.canvasHeight) || 0;
    const boardWidth = Number(state.boardCanvasWidth) || width;
    const boardHeight = Number(state.boardCanvasHeight) || height;
    const boardInset = Number(state.boardInset) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const dpr = this._getRenderDpr(state);
    const ctx = this._prepareCacheCanvas(this._pixelCache, boardWidth, boardHeight, dpr);
    if (!ctx || !width || !height || !gridSize) return;

    const cellSize = width / gridSize;
    ctx.clearRect(0, 0, boardWidth, boardHeight);
    drawCoordinateFrame(ctx, {
      width,
      height,
      gridSize,
      inset: boardInset,
      viewScale: state.canvasScale || 1,
      dpr,
      showLabels: true
    });
    if (!state.backgroundImage) {
      drawCheckerboard(ctx, width, height, gridSize, boardInset, boardInset);
    }

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const color = this._getCellColor(row, col, gridSize);
        if (color === null || color === undefined || (state.backgroundImage && color === '#FFFFFF')) continue;
        ctx.fillStyle = color;
        ctx.fillRect(boardInset + col * cellSize, boardInset + row * cellSize, cellSize, cellSize);
      }
    }

    this._pixelLayerDirty = false;
  }

  _updatePixelCacheCells(state, cells) {
    const cache = this._getPixelCache(state);
    if (!cache || !cells || !cells.size) return false;

    const ctx = cache.getContext('2d');
    const width = Number(state.canvasWidth) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const boardInset = Number(state.boardInset) || 0;
    if (!ctx || !width || !gridSize) return false;

    const cellSize = width / gridSize;
    cells.forEach((key) => {
      const [rowStr, colStr] = key.split(',');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      if (Number.isNaN(row) || Number.isNaN(col)) return;

      const x = boardInset + col * cellSize;
      const y = boardInset + row * cellSize;
      ctx.clearRect(x, y, cellSize, cellSize);
      if (!state.backgroundImage) {
        drawCheckerCell(ctx, x, y, cellSize);
      }

      const color = this._getCellColor(row, col, gridSize);
      if (color === null || color === undefined || (state.backgroundImage && color === '#FFFFFF')) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellSize, cellSize);
    });

    return true;
  }

  _renderLowQuality(ctx, gridData = null, state) {
    const { canvasWidth, canvasHeight, gridSize } = state;
    if (!canvasWidth || !canvasHeight || !gridSize || (!this._getPixelColor && !Array.isArray(gridData))) return;
    const boardWidth = Number(state.boardCanvasWidth) || canvasWidth;
    const boardHeight = Number(state.boardCanvasHeight) || canvasHeight;
    const boardInset = Number(state.boardInset) || 0;

    let startRow = 0;
    let endRow = gridSize;
    let startCol = 0;
    let endCol = gridSize;

    const cellSize = canvasWidth / gridSize;
    ctx.clearRect(0, 0, boardWidth, boardHeight);
    drawCoordinateFrame(ctx, {
      width: canvasWidth,
      height: canvasHeight,
      gridSize,
      inset: boardInset,
      viewScale: state.canvasScale || 1,
      dpr: state.renderDpr || state.dpr || 1,
      showLabels: true
    });

    if (!state.backgroundImage) {
      drawCheckerboard(ctx, canvasWidth, canvasHeight, gridSize, boardInset, boardInset);
    }

    for (let row = startRow; row < endRow; row += 2) {
      for (let col = startCol; col < endCol; col += 2) {
        let dominant = null;
        for (let dr = 0; dr < 2; dr++) {
          for (let dc = 0; dc < 2; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= endRow || c >= endCol) continue;
            const color = this._getPixelColor ? this._getCellColor(r, c, gridSize) : (gridData[r] ? gridData[r][c] : null);
            if (color !== null && color !== undefined && color !== '' && (!state.backgroundImage || color !== '#FFFFFF')) {
              dominant = color;
              break;
            }
          }
          if (dominant) break;
        }

        if (dominant) {
          ctx.fillStyle = dominant;
          ctx.fillRect(boardInset + col * cellSize, boardInset + row * cellSize, cellSize * 2, cellSize * 2);
        }
      }
    }
  }

  renderFull(ctx, gridData = null) {
    const state = this._getState() || {};
    if (this._isLowQualityMode) {
      this._renderLowQuality(ctx, gridData, state);
      this._dirtyCells.clear();
      return;
    }

    const pixelCache = this._getPixelCache(state);
    if (pixelCache) {
      ctx.clearRect(0, 0, state.boardCanvasWidth || state.canvasWidth, state.boardCanvasHeight || state.canvasHeight);
      this._drawCacheImage(ctx, pixelCache, state);
    } else {
      drawBoard(ctx, {
        width: state.canvasWidth,
        height: state.canvasHeight,
        gridSize: state.gridSize,
        gridData,
        showGrid: state.showGrid,
        dpr: state.renderDpr || state.dpr || 1,
        hasBackground: !!state.backgroundImage,
        viewScale: state.canvasScale || 1,
        colorCodeMap: this._getColorCodeMap(),
        getCellColor: this._getPixelColor,
        skipGridLayer: true,
        skipCodeLayer: true,
        boardInset: state.boardInset || 0
      });
    }

    if (this._shouldRenderCodeLayer(state)) {
      const codeCache = this._getCodeCache(ctx, state);
      if (codeCache) {
        this._drawCacheImage(ctx, codeCache, state, false);
      } else {
        const boardInset = Number(state.boardInset) || 0;
        ctx.save();
        ctx.translate(boardInset, boardInset);
        drawCodeLayer(ctx, {
          width: state.canvasWidth,
          gridSize: state.gridSize,
          viewScale: state.canvasScale || 1,
          colorCodeMap: this._getColorCodeMap(),
          getCellColor: (row, col) => this._getCellColor(row, col, state.gridSize)
        });
        ctx.restore();
      }
    }

    const gridCache = this._getGridCache(ctx, state);
    if (gridCache) {
      this._drawCacheImage(ctx, gridCache, state, false);
    } else if (state.showGrid) {
      const cellSize = state.gridSize ? state.canvasWidth / state.gridSize : 0;
      if (cellSize) {
        const boardInset = Number(state.boardInset) || 0;
        ctx.save();
        ctx.translate(boardInset, boardInset);
        drawGridLineRects(ctx, state.canvasWidth, state.canvasHeight, state.gridSize, cellSize, state.canvasScale || 1, state.renderDpr || state.dpr || 1);
        ctx.restore();
      }
    }

    this._dirtyCells.clear();
  }

  renderLayered(layers = {}, gridData = null) {
    const state = this._getState() || {};
    if (state.viewportMode) {
      this._renderViewportLayered(layers, gridData, state);
      return;
    }

    const pixelCtx = layers.pixelCtx || null;
    const textCtx = layers.textCtx || null;
    const gridCtx = layers.gridCtx || null;
    const boardWidth = state.boardCanvasWidth || state.canvasWidth;
    const boardHeight = state.boardCanvasHeight || state.canvasHeight;

    if (pixelCtx) {
      if (this._isLowQualityMode) {
        this._renderLowQuality(pixelCtx, gridData, state);
      } else {
        const pixelCache = this._getPixelCache(state);
        pixelCtx.clearRect(0, 0, boardWidth, boardHeight);
        if (pixelCache) {
          this._drawCacheImage(pixelCtx, pixelCache, state);
        } else {
          drawBoard(pixelCtx, {
            width: state.canvasWidth,
            height: state.canvasHeight,
            gridSize: state.gridSize,
            gridData,
            showGrid: false,
            dpr: state.renderDpr || state.dpr || 1,
            hasBackground: !!state.backgroundImage,
            viewScale: state.canvasScale || 1,
            colorCodeMap: this._getColorCodeMap(),
            getCellColor: this._getPixelColor,
            skipGridLayer: true,
            skipCodeLayer: true,
            boardInset: state.boardInset || 0
          });
        }
      }
    }

    if (textCtx) {
      textCtx.clearRect(0, 0, boardWidth, boardHeight);
      if (this._shouldRenderCodeLayer(state)) {
        const codeCache = this._getCodeCache(textCtx, state);
        if (codeCache) {
          this._drawCacheImage(textCtx, codeCache, state, false);
        } else {
          const boardInset = Number(state.boardInset) || 0;
          textCtx.save();
          textCtx.translate(boardInset, boardInset);
          drawCodeLayer(textCtx, {
            width: state.canvasWidth,
            gridSize: state.gridSize,
            viewScale: state.canvasScale || 1,
            colorCodeMap: this._getColorCodeMap(),
            getCellColor: (row, col) => this._getCellColor(row, col, state.gridSize)
          });
          textCtx.restore();
        }
      }
    }

    if (gridCtx) {
      gridCtx.clearRect(0, 0, boardWidth, boardHeight);
      if (state.showGrid && this._renderGridLayer) {
        const gridCache = this._getGridCache(gridCtx, state);
        if (gridCache) {
          this._drawCacheImage(gridCtx, gridCache, state, false);
        } else {
          const cellSize = state.gridSize ? state.canvasWidth / state.gridSize : 0;
          if (cellSize) {
            const boardInset = Number(state.boardInset) || 0;
            gridCtx.save();
            gridCtx.translate(boardInset, boardInset);
            drawGridLineRects(gridCtx, state.canvasWidth, state.canvasHeight, state.gridSize, cellSize, state.canvasScale || 1, state.renderDpr || state.dpr || 1);
            gridCtx.restore();
          }
        }
      }
    }

    this._dirtyCells.clear();
  }

  _withViewportTransform(ctx, state, draw) {
    if (!ctx || typeof draw !== 'function') return;
    const scale = Math.max(Number(state.canvasScale) || 1, 0.0001);
    const boardInset = Number(state.boardInset) || 0;
    const offsetX = Number(state.canvasOffsetX) || 0;
    const offsetY = Number(state.canvasOffsetY) || 0;
    ctx.save();
    ctx.translate(offsetX - boardInset * scale, offsetY - boardInset * scale);
    ctx.scale(scale, scale);
    draw();
    ctx.restore();
  }

  _getSurfaceSize(state) {
    return {
      width: Math.max(1, Number(state.surfaceWidth || state.boardCanvasWidth || state.canvasWidth) || 1),
      height: Math.max(1, Number(state.surfaceHeight || state.boardCanvasHeight || state.canvasHeight) || 1)
    };
  }

  _getVisibleCellRange(state) {
    const gridSize = Math.max(1, Number(state.gridSize) || 1);
    const canvasWidth = Math.max(1, Number(state.canvasWidth) || 1);
    const cellSize = canvasWidth / gridSize;
    const scale = Math.max(Number(state.canvasScale) || 1, 0.0001);
    const boardInset = Number(state.boardInset) || 0;
    const offsetX = Number(state.canvasOffsetX) || 0;
    const offsetY = Number(state.canvasOffsetY) || 0;
    const surface = this._getSurfaceSize(state);
    const layerLeft = offsetX - boardInset * scale;
    const layerTop = offsetY - boardInset * scale;
    const bufferPx = state.isPinching ? Math.max(surface.width, surface.height) * 0.5 : cellSize * scale * 4;
    const contentLeft = (0 - layerLeft - bufferPx) / scale - boardInset;
    const contentTop = (0 - layerTop - bufferPx) / scale - boardInset;
    const contentRight = (surface.width - layerLeft + bufferPx) / scale - boardInset;
    const contentBottom = (surface.height - layerTop + bufferPx) / scale - boardInset;

    return {
      startCol: Math.max(0, Math.floor(contentLeft / cellSize)),
      endCol: Math.min(gridSize - 1, Math.ceil(contentRight / cellSize)),
      startRow: Math.max(0, Math.floor(contentTop / cellSize)),
      endRow: Math.min(gridSize - 1, Math.ceil(contentBottom / cellSize))
    };
  }

  _drawViewportCodeLayer(ctx, state) {
    const width = Number(state.canvasWidth) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const colorCodeMap = this._getColorCodeMap();
    if (!ctx || !width || !gridSize || !colorCodeMap) return;

    const cellSize = width / gridSize;
    const viewScale = Number(state.canvasScale) || 1;
    const codes = Object.keys(colorCodeMap).map((key) => String(colorCodeMap[key] || ''));
    const maxCodeLength = codes.reduce((max, code) => Math.max(max, code.length), 1);
    const range = this._getVisibleCellRange(state);
    const codeCfg = this._getViewportCodeConfig(cellSize, viewScale, maxCodeLength);
    if (!codeCfg.show) return;

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const color = this._getCellColor(row, col, gridSize);
        if (!color || color === '#FFFFFF') continue;
        const code = colorCodeMap[String(color).toUpperCase()];
        if (!code) continue;
        ctx.fillStyle = this._getCodeTextColor(color);
        ctx.font = `600 ${codeCfg.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(code, col * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
      }
    }
  }

  _getViewportCodeConfig(cellSize, viewScale, maxCodeLength) {
    const scale = Math.max(Number(viewScale) || 1, 0.1);
    const visualCell = cellSize * scale;
    const show = visualCell >= 6;
    const targetVisualFontSize = visualCell < 12 ? 7 : 12;
    const maxByCell = visualCell * 0.58;
    const maxByLength = visualCell / Math.max(1.2, maxCodeLength * 0.62);
    const visualFontSize = Math.max(4.5, Math.min(targetVisualFontSize, maxByCell, maxByLength));
    const fontSize = Math.max(1, Math.round((visualFontSize / scale) * 4) / 4);
    return { show, fontSize };
  }

  _getCodeTextColor(hexColor) {
    if (!hexColor || typeof hexColor !== 'string' || hexColor.length < 7) return '#222222';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#222222' : '#FFFFFF';
  }

  _renderViewportPixelLayer(ctx, gridData, state) {
    if (!ctx) return;
    const surface = this._getSurfaceSize(state);
    const width = Number(state.canvasWidth) || 0;
    const height = Number(state.canvasHeight) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const boardInset = Number(state.boardInset) || 0;
    if (!width || !height || !gridSize) return;

    ctx.clearRect(0, 0, surface.width, surface.height);
    this._withViewportTransform(ctx, state, () => {
      drawCoordinateFrame(ctx, {
        width,
        height,
        gridSize,
        inset: boardInset,
        viewScale: state.canvasScale || 1,
        dpr: state.renderDpr || state.dpr || 1,
        showLabels: true
      });
      if (!state.backgroundImage) {
        drawCheckerboard(ctx, width, height, gridSize, boardInset, boardInset);
      }

      const cellSize = width / gridSize;
      const range = this._getVisibleCellRange(state);
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          const color = this._getCellColor(row, col, gridSize);
          if (color === null || color === undefined || (state.backgroundImage && color === '#FFFFFF')) continue;
          ctx.fillStyle = color;
          ctx.fillRect(boardInset + col * cellSize, boardInset + row * cellSize, cellSize, cellSize);
        }
      }
    });
  }

  _renderViewportTextLayer(ctx, state) {
    if (!ctx) return;
    const surface = this._getSurfaceSize(state);
    const width = Number(state.canvasWidth) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const boardInset = Number(state.boardInset) || 0;
    ctx.clearRect(0, 0, surface.width, surface.height);
    if (!width || !gridSize || !this._shouldRenderCodeLayer(state)) return;

    this._withViewportTransform(ctx, state, () => {
      ctx.save();
      ctx.translate(boardInset, boardInset);
      this._drawViewportCodeLayer(ctx, state);
      ctx.restore();
    });
  }

  _renderViewportGridLayer(ctx, state) {
    if (!ctx) return;
    const surface = this._getSurfaceSize(state);
    const width = Number(state.canvasWidth) || 0;
    const height = Number(state.canvasHeight) || 0;
    const gridSize = Number(state.gridSize) || 0;
    const boardInset = Number(state.boardInset) || 0;
    ctx.clearRect(0, 0, surface.width, surface.height);
    if (!state.showGrid || !this._renderGridLayer || !width || !height || !gridSize) return;

    this._withViewportTransform(ctx, state, () => {
      const cellSize = width / gridSize;
      ctx.save();
      ctx.translate(boardInset, boardInset);
      drawGridLineRects(ctx, width, height, gridSize, cellSize, state.canvasScale || 1, state.renderDpr || state.dpr || 1);
      ctx.restore();
    });
  }

  _renderViewportLayered(layers, gridData, state) {
    this._renderViewportPixelLayer(layers.pixelCtx || null, gridData, state);
    this._renderViewportTextLayer(layers.textCtx || null, state);
    this._renderViewportGridLayer(layers.gridCtx || null, state);
    this._dirtyCells.clear();
  }

  renderDirty(ctx, gridData = null) {
    const state = this._getState() || {};
    if (!this._dirtyCells.size) return;

    this._updatePixelCacheCells(state, this._dirtyCells);

    this._dirtyCells.forEach((key) => {
      const [rowStr, colStr] = key.split(',');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      if (Number.isNaN(row) || Number.isNaN(col)) return;

      const color = this._getPixelColor ? this._getPixelColor(row, col) : (gridData[row] ? gridData[row][col] : null);
      drawPixel(ctx, {
        width: state.canvasWidth,
        gridSize: state.gridSize,
        row,
        col,
        color,
        showGrid: false,
        dpr: state.renderDpr || state.dpr || 1,
        hasBackground: !!state.backgroundImage,
        viewScale: state.canvasScale || 1,
        colorCodeMap: this._getColorCodeMap(),
        getCellColor: (r, c) => this._getCellColor(r, c, state.gridSize),
        boardInset: state.boardInset || 0
      });
    });

    const gridCache = this._getGridCache(ctx, state);
    if (gridCache) {
      this._drawCacheImage(ctx, gridCache, state, false);
    }

    this._dirtyCells.clear();
  }
}

module.exports = CanvasRenderer;
