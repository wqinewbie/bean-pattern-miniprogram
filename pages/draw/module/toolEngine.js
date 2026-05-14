class ToolEngine {
  constructor(options = {}) {
    this._getGridSize = options.getGridSize || (() => 0);
    this._getPixel = options.getPixel || (() => null);
    this._setPixel = options.setPixel || (() => false);
    this._paintPixel = options.paintPixel || (() => {});
  }

  paintLine(r0, c0, r1, c1, options = {}) {
    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dc - dr;
    const changedCells = options.changedCells || new Set();

    while (true) {
      this._paintPixel(r0, c0, {
        ...options,
        skipRender: true,
        skipStats: true,
        changedCells
      });
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

    return changedCells;
  }

  floodFill(startRow, startCol, newColor) {
    const gridSize = this._getGridSize();
    const targetColor = this._getPixel(startRow, startCol);
    if (this._colorEquals(targetColor, newColor)) {
      return { changed: false, changedCells: new Set() };
    }

    const stack = [[startRow, startCol]];
    const visited = new Set();
    const changedCells = new Set();

    while (stack.length > 0) {
      const [row, col] = stack.pop();
      if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) continue;

      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      if (!this._colorEquals(this._getPixel(row, col), targetColor)) continue;

      visited.add(key);
      if (this._setPixel(row, col, newColor)) {
        changedCells.add(key);
      }
      stack.push([row + 1, col], [row - 1, col], [row, col + 1], [row, col - 1]);
    }

    return { changed: changedCells.size > 0, changedCells };
  }

  _colorEquals(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    return false;
  }
}

module.exports = ToolEngine;
