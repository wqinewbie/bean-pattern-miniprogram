class PixelStore {
  static MAX_COLOR_INDEX = 0xFFFF;

  constructor(gridSize, palette = []) {
    this.gridSize = gridSize;
    this.palette = [''];
    this.colorToIndex = new Map([['', 0]]);
    this.indices = new Uint16Array(gridSize * gridSize);
    this.colorUsage = new Map();

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
    if (this.palette.length > PixelStore.MAX_COLOR_INDEX) {
      throw new Error('PixelStore palette exceeds Uint16 index capacity');
    }

    const idx = this.palette.length;
    this.palette.push(normalized);
    this.colorToIndex.set(normalized, idx);
    return idx;
  }

  _bumpUsageByIndex(index, delta) {
    if (!index || !delta) return;
    const hex = this.palette[index];
    if (!hex) return;
    const next = (this.colorUsage.get(hex) || 0) + delta;
    if (next <= 0) this.colorUsage.delete(hex);
    else this.colorUsage.set(hex, next);
  }

  setPixelHex(row, col, hex) {
    const offset = this._toOffset(row, col);
    if (offset < 0) return false;

    const normalized = PixelStore.normalizeHex(hex);
    const nextIndex = normalized ? this._ensureColorIndex(normalized) : 0;
    const prev = this.indices[offset];
    if (prev === nextIndex) return false;
    this._bumpUsageByIndex(prev, -1);
    this.indices[offset] = nextIndex;
    this._bumpUsageByIndex(nextIndex, 1);
    return true;
  }

  setPixelByOffset(offset, hex) {
    if (offset < 0 || offset >= this.indices.length) return false;

    const normalized = PixelStore.normalizeHex(hex);
    const nextIndex = normalized ? this._ensureColorIndex(normalized) : 0;
    const prev = this.indices[offset];
    if (prev === nextIndex) return false;
    this._bumpUsageByIndex(prev, -1);
    this.indices[offset] = nextIndex;
    this._bumpUsageByIndex(nextIndex, 1);
    return true;
  }

  getPixelHex(row, col) {
    const offset = this._toOffset(row, col);
    if (offset < 0) return '';
    const colorIndex = this.indices[offset];
    return this.palette[colorIndex] || '';
  }

  getPixelHexByOffset(offset) {
    if (offset < 0 || offset >= this.indices.length) return '';
    return this.palette[this.indices[offset]] || '';
  }

  clear() {
    this.indices.fill(0);
    this.colorUsage.clear();
  }

  mirrorHorizontal() {
    const size = this.gridSize;
    for (let row = 0; row < size; row++) {
      const rowOffset = row * size;
      for (let col = 0; col < Math.floor(size / 2); col++) {
        const left = rowOffset + col;
        const right = rowOffset + size - 1 - col;
        const temp = this.indices[left];
        this.indices[left] = this.indices[right];
        this.indices[right] = temp;
      }
    }
  }

  replaceColor(oldHex, newHex) {
    const normalizedOld = PixelStore.normalizeHex(oldHex);
    if (!this.colorToIndex.has(normalizedOld)) return 0;
    const oldIndex = this.colorToIndex.get(normalizedOld);
    const nextIndex = this._ensureColorIndex(newHex);
    if (oldIndex === nextIndex) return 0;

    let count = 0;
    for (let i = 0; i < this.indices.length; i++) {
      if (this.indices[i] === oldIndex) {
        this.indices[i] = nextIndex;
        count++;
      }
    }
    if (count > 0) {
      this._bumpUsageByIndex(oldIndex, -count);
      this._bumpUsageByIndex(nextIndex, count);
    }
    return count;
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
    this._rebuildUsage();
  }

  _rebuildUsage() {
    this.colorUsage = new Map();
    for (let i = 0; i < this.indices.length; i++) {
      const index = this.indices[i];
      if (!index) continue;
      const hex = this.palette[index];
      if (!hex) continue;
      this.colorUsage.set(hex, (this.colorUsage.get(hex) || 0) + 1);
    }
  }

  getColorUsageMap() {
    return new Map(this.colorUsage);
  }
}

module.exports = PixelStore;
