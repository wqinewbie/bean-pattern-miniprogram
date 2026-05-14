class ColorBarManager {
  constructor(options = {}) {
    this._getState = options.getState || (() => ({}));
  }

  getVisibleColors(allColors, scrollTop, containerHeight, itemHeight, columns = 1) {
    if (!Array.isArray(allColors) || !allColors.length) {
      return { visibleColors: [], totalHeight: 0, offsetTop: 0 };
    }

    var safeItemHeight = itemHeight > 0 ? itemHeight : 1;
    var safeColumns = Math.max(1, columns || 1);
    var rowCount = Math.ceil(allColors.length / safeColumns);
    var startRow = Math.floor((scrollTop || 0) / safeItemHeight);
    var visibleRows = Math.ceil((containerHeight || 0) / safeItemHeight) + 2;
    var start = Math.max(0, startRow - 1);
    var end = Math.min(rowCount, start + visibleRows);

    return {
      visibleColors: allColors.slice(start * safeColumns, end * safeColumns),
      totalHeight: rowCount * safeItemHeight,
      offsetTop: start * safeItemHeight
    };
  }
}

module.exports = ColorBarManager;
