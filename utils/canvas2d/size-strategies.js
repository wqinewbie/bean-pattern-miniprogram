/**
 * Canvas 2D 尺寸策略
 *
 * 集中管理预览和导出的尺寸计算，避免散落在各页面中。
 *
 * 重要：previewSize 返回的是逻辑像素（CSS 像素），
 * bead-canvas2d 组件的 resize2dCanvas 内部会自动乘以 DPR
 * 得到高清物理 buffer，调用方不需要再乘 DPR。
 */

var MIN_PREVIEW_SIZE = 300;
var MAX_EXPORT_SIZE = 2048;
var MAX_PATTERN_BOARD = 2048;
var PATTERN_CELL_FACTOR = 30;

/**
 * 效果图 / 色号图预览尺寸（逻辑像素，用于屏幕内渲染）
 * 直接取视口宽度，保证下限。
 * resize2dCanvas 内部会乘 DPR 得到高清 buffer。
 */
function previewSize(viewportWidth) {
  return Math.max(MIN_PREVIEW_SIZE, Math.floor(Number(viewportWidth) || MIN_PREVIEW_SIZE));
}

/**
 * 色号图 boardSize（绘制网格的逻辑尺寸）
 */
function patternBoardSize(gridSize) {
  return Math.min(Math.max(1, Number(gridSize) || 64) * PATTERN_CELL_FACTOR, MAX_PATTERN_BOARD);
}

/**
 * 效果图导出尺寸（高清保存 / 预览图生成）
 */
function resultExportSize(viewportWidth) {
  var base = Math.max(1024, Math.floor((Number(viewportWidth) || 1024) * 2));
  return Math.min(base, MAX_EXPORT_SIZE);
}

/**
 * 色号图导出尺寸（固定最大值）
 */
function patternExportSize() {
  return MAX_EXPORT_SIZE;
}

/**
 * 预览点击大图导出尺寸
 */
function previewExportSize(viewportWidth) {
  return previewSize(viewportWidth);
}

module.exports = {
  MIN_PREVIEW_SIZE: MIN_PREVIEW_SIZE,
  MAX_EXPORT_SIZE: MAX_EXPORT_SIZE,
  MAX_PATTERN_BOARD: MAX_PATTERN_BOARD,
  previewSize: previewSize,
  patternBoardSize: patternBoardSize,
  resultExportSize: resultExportSize,
  patternExportSize: patternExportSize,
  previewExportSize: previewExportSize
};
