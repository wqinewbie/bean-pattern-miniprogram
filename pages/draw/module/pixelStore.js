class PixelStore {
  constructor(gridSize, palette = []) {
    this.gridSize = gridSize;
    this.palette = [''];
    this.colorToIndex = new Map([['', 0]]);
    this.indices = new Uint16Array(gridSize * gridSize);

    if (Array.isArray(palette) && palette.length) {
      palette.forEach((hex) => this._ensureColorIndex(hex));
    }
  }

  static normalizeHex(hex) {
    if (hex === null || hex === undefined || hex === '') return '';
    return String(hex).toUpperCase();
  }

  static fromGridData(gridData) {
    const size = Array.isArray(gridData) ? gridData.length : 0;
    const store = new PixelStore(size);
    if (!size) return store;

    for (let r = 0; r < size; r++) {
      const row = gridData[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < size && c < row.length; c++) {
        store.setPixelHex(r, c, row[c]);
      }
    }

    return store;
  }

  toGridData() {
    const grid = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(null));
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const hex = this.getPixelHex(r, c);
        grid[r][c] = hex || null;
      }
    }
    return grid;
  }

  resize(newSize, keepCenter = true) {
    const next = new PixelStore(newSize, this.palette.slice(1));
    const oldSize = this.gridSize;

    if (!oldSize) return next;

    if (keepCenter && newSize >= oldSize) {
      const offset = Math.floor((newSize - oldSize) / 2);
      for (let r = 0; r < oldSize; r++) {
        for (let c = 0; c < oldSize; c++) {
          const hex = this.getPixelHex(r, c);
          if (!hex) continue;
          next.setPixelHex(r + offset, c + offset, hex);
        }
      }
      return next;
    }

    if (keepCenter && newSize < oldSize) {
      const offset = Math.floor((oldSize - newSize) / 2);
      for (let r = 0; r < newSize; r++) {
        for (let c = 0; c < newSize; c++) {
          const hex = this.getPixelHex(r + offset, c + offset);
          if (!hex) continue;
          next.setPixelHex(r, c, hex);
        }
      }
      return next;
    }

    const copySize = Math.min(oldSize, newSize);
    for (let r = 0; r < copySize; r++) {
      for (let c = 0; c < copySize; c++) {
        const hex = this.getPixelHex(r, c);
        if (!hex) continue;
        next.setPixelHex(r, c, hex);
      }
    }

    return next;
  }

  _toOffset(row, col) {
    if (row < 0 || col < 0 || row >= this.gridSize || col >= this.gridSize) return -1;
    return row * this.gridSize + col;
  }

  _ensureColorIndex(hex) {
    const normalized = PixelStore.normalizeHex(hex);
    if (!normalized) return 0;
    const existing = this.colorToIndex.get(normalized);
    if (existing != null) return existing;

    const idx = this.palette.length;
    this.palette.push(normalized);
    this.colorToIndex.set(normalized, idx);
    return idx;
  }

  setPixelHex(row, col, hex) {
    const offset = this._toOffset(row, col);
    if (offset < 0) return false;

    const normalized = PixelStore.normalizeHex(hex);
    const nextIndex = normalized ? this._ensureColorIndex(normalized) : 0;
    const prev = this.indices[offset];
    if (prev === nextIndex) return false;
    this.indices[offset] = nextIndex;
    return true;
  }

  getPixelHex(row, col) {
    const offset = this._toOffset(row, col);
    if (offset < 0) return '';
    const colorIndex = this.indices[offset];
    return this.palette[colorIndex] || '';
  }

  createSnapshot() {
    return {
      gridSize: this.gridSize,
      palette: this.palette.slice(),
      indices: this.indices.slice()
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.indices || !snapshot.palette || !snapshot.gridSize) return;
    this.gridSize = snapshot.gridSize;
    this.palette = snapshot.palette.slice();
    this.colorToIndex = new Map();
    this.palette.forEach((hex, idx) => {
      this.colorToIndex.set(PixelStore.normalizeHex(hex), idx);
    });
    this.indices = new Uint16Array(snapshot.indices);
  }

  getColorUsageMap() {
    const usage = new Map();
    for (let i = 0; i < this.indices.length; i++) {
      const index = this.indices[i];
      if (!index) continue;
      const hex = this.palette[index];
      if (!hex) continue;
      usage.set(hex, (usage.get(hex) || 0) + 1);
    }
    return usage;
  }
}

module.exports = PixelStore;
