class ColorBarManager {
  constructor(options = {}) {
    this._getState = options.getState || (() => ({}));
  }

  getVisibleColors(allColors, scrollTop, containerHeight, itemHeight) {
    if (!Array.isArray(allColors) || !allColors.length) {
      return { visibleColors: [], totalHeight: 0, offsetTop: 0 };
    }

    var safeItemHeight = itemHeight > 0 ? itemHeight : 1;
    var startIdx = Math.floor((scrollTop || 0) / safeItemHeight);
    var visibleCount = Math.ceil((containerHeight || 0) / safeItemHeight) + 2;
    var start = Math.max(0, startIdx - 1);
    var end = Math.min(allColors.length, start + visibleCount);

    return {
      visibleColors: allColors.slice(start, end),
      totalHeight: allColors.length * safeItemHeight,
      offsetTop: start * safeItemHeight
    };
  }
}

module.exports = ColorBarManager;
