const { drawBoard, drawPixel } = require('../../../utils/canvas2d/renderers/boardRenderer');

class CanvasRenderer {
  constructor(options = {}) {
    this._renderScheduler = options.renderScheduler || null;
    this._getColorCodeMap = options.getColorCodeMap || (() => ({}));
    this._getViewport = options.getViewport || (() => null);
    this._getState = options.getState || (() => ({}));
    this._dirtyCells = new Set();
    this._codeLayerDirty = true;
    this._isLowQualityMode = false;
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

  setLowQualityMode(enabled) {
    this._isLowQualityMode = !!enabled;
  }

  _renderLowQuality(ctx, gridData, state) {
    const { canvasWidth, canvasHeight, gridSize } = state;
    if (!canvasWidth || !canvasHeight || !gridSize || !Array.isArray(gridData)) return;

    let startRow = 0;
    let endRow = gridSize;
    let startCol = 0;
    let endCol = gridSize;

    const viewport = this._getViewport ? this._getViewport() : null;
    if (this._renderScheduler && viewport) {
      const visibleRange = this._renderScheduler.getVisibleRange(viewport, gridSize);
      if (visibleRange && !visibleRange.isFullView) {
        startRow = Math.max(0, visibleRange.minRow);
        endRow = Math.min(gridSize, visibleRange.maxRow + 1);
        startCol = Math.max(0, visibleRange.minCol);
        endCol = Math.min(gridSize, visibleRange.maxCol + 1);
      }
    }

    const cellSize = canvasWidth / gridSize;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!state.backgroundImage) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    for (let row = startRow; row < endRow; row += 2) {
      for (let col = startCol; col < endCol; col += 2) {
        let dominant = null;
        for (let dr = 0; dr < 2; dr++) {
          for (let dc = 0; dc < 2; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= endRow || c >= endCol) continue;
            const color = gridData[r] ? gridData[r][c] : null;
            if (color !== null && color !== undefined && color !== '') {
              dominant = color;
              break;
            }
          }
          if (dominant) break;
        }

        ctx.fillStyle = dominant || '#FFFFFF';
        ctx.fillRect(col * cellSize, row * cellSize, cellSize * 2, cellSize * 2);
      }
    }
  }

  renderFull(ctx, gridData) {
    const state = this._getState() || {};
    const viewport = this._getViewport ? this._getViewport() : null;

    if (this._isLowQualityMode) {
      this._renderLowQuality(ctx, gridData, state);
      this._dirtyCells.clear();
      return;
    }

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
      visibleRange: this._renderScheduler && viewport
        ? this._renderScheduler.getVisibleRange(viewport, state.gridSize)
        : null
    });

    this._dirtyCells.clear();
    this._codeLayerDirty = false;
  }

  renderDirty(ctx, gridData) {
    const state = this._getState() || {};
    if (!this._dirtyCells.size) return;

    this._dirtyCells.forEach((key) => {
      const [rowStr, colStr] = key.split(',');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      if (Number.isNaN(row) || Number.isNaN(col)) return;

      drawPixel(ctx, {
        width: state.canvasWidth,
        gridSize: state.gridSize,
        row,
        col,
        color: gridData[row] ? gridData[row][col] : null,
        showGrid: state.showGrid,
        dpr: state.renderDpr || state.dpr || 1,
        hasBackground: !!state.backgroundImage,
        viewScale: state.canvasScale || 1,
        colorCodeMap: this._getColorCodeMap()
      });
    });

    this._dirtyCells.clear();
  }
}

module.exports = CanvasRenderer;
