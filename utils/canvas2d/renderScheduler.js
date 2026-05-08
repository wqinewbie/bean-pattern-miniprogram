/**
 * 渲染调度器 - 完美版
 * 
 * 核心职责：
 * 1. 区分手势中/手势后渲染模式
 * 2. 自动节流合并渲染请求
 * 3. 动态 DPR 管理
 * 4. 可视区域裁剪计算
 */

const GESTURE_DEBOUNCE = 120; // 手势结束后延迟重绘时间(ms)
const MAX_PHYSICAL_SIZE = 4096; // Canvas 物理像素上限
const MIN_DPR = 1;
const MAX_DPR = 12;

class RenderScheduler {
  constructor() {
    this._isGesturing = false;
    this._gestureEndTimer = null;
    this._pendingRenderRequest = null;
    this._lastRenderMode = 'high'; // 'low' | 'high'
    this._frameId = null;
  }

  /**
   * 标记手势开始
   */
  startGesture() {
    this._isGesturing = true;
    if (this._gestureEndTimer) {
      clearTimeout(this._gestureEndTimer);
      this._gestureEndTimer = null;
    }
  }

  /**
   * 标记手势结束
   * @param {Function} onGestureEnd - 手势结束后的回调
   */
  endGesture(onGestureEnd) {
    this._isGesturing = false;
    
    // 延迟触发高精重绘
    if (this._gestureEndTimer) {
      clearTimeout(this._gestureEndTimer);
    }
    
    this._gestureEndTimer = setTimeout(() => {
      this._gestureEndTimer = null;
      if (onGestureEnd) {
        onGestureEnd();
      }
    }, GESTURE_DEBOUNCE);
  }

  /**
   * 请求渲染（自动节流）
   * @param {Function} renderFn - 渲染函数
   * @param {Object} options - 渲染选项
   */
  requestRender(renderFn, options = {}) {
    const { force = false } = options;
    
    // 强制渲染立即执行
    if (force) {
      if (this._frameId) {
        cancelAnimationFrame(this._frameId);
        this._frameId = null;
      }
      renderFn(this._getRenderMode());
      return;
    }

    // 合并渲染请求到下一帧
    if (this._frameId) return;
    
    this._frameId = requestAnimationFrame(() => {
      this._frameId = null;
      renderFn(this._getRenderMode());
    });
  }

  /**
   * 获取当前渲染模式
   */
  _getRenderMode() {
    return this._isGesturing ? 'low' : 'high';
  }

  /**
   * 计算自适应 DPR
   * @param {number} baseWidth - 逻辑宽度
   * @param {number} baseHeight - 逻辑高度
   * @param {number} scale - 当前缩放比例
   * @param {number} systemDpr - 系统 DPR
   * @param {string} mode - 渲染模式 'low' | 'high'
   */
  getAdaptiveDpr(baseWidth, baseHeight, scale, systemDpr, mode = 'high') {
    const qualityFactor = mode === 'high' ? 1.25 : 1.0;
    const safeWidth = Math.max(1, Number(baseWidth) || 1);
    const safeHeight = Math.max(1, Number(baseHeight) || 1);
    const safeScale = Math.max(1, Number(scale) || 1);
    const safeSystemDpr = Math.max(MIN_DPR, Number(systemDpr) || MIN_DPR);
    const targetDpr = safeSystemDpr * safeScale * qualityFactor;
    
    // 父级使用 CSS transform 放大画板，因此 backing store 需要随 scale 增大。
    // 上限只按逻辑画布尺寸裁剪，避免 scale 越大 DPR 反而越低。
    const maxDprByWidth = MAX_PHYSICAL_SIZE / safeWidth;
    const maxDprByHeight = MAX_PHYSICAL_SIZE / safeHeight;
    
    const finalDpr = Math.min(
      targetDpr,
      maxDprByWidth,
      maxDprByHeight,
      MAX_DPR
    );
    
    return Math.max(MIN_DPR, finalDpr);
  }

  /**
   * 计算可视区域（用于裁剪渲染）
   * @param {Object} viewport - 视口信息
   * @param {number} gridSize - 网格尺寸
   */
  getVisibleRange(viewport, gridSize) {
    const {
      canvasWidth,
      canvasHeight,
      canvasOffsetX,
      canvasOffsetY,
      canvasScale,
      areaWidth,
      areaHeight
    } = viewport;

    const cellSize = canvasWidth / gridSize;
    const scaledCellSize = cellSize * canvasScale;

    // 计算可见区域在画布逻辑坐标中的范围
    const visibleLeft = Math.max(0, -canvasOffsetX);
    const visibleTop = Math.max(0, -canvasOffsetY);
    const visibleRight = Math.min(
      canvasWidth * canvasScale,
      areaWidth - canvasOffsetX
    );
    const visibleBottom = Math.min(
      canvasHeight * canvasScale,
      areaHeight - canvasOffsetY
    );

    // 转换为格子索引（扩展1格避免边缘闪烁）
    const minCol = Math.max(0, Math.floor(visibleLeft / scaledCellSize) - 1);
    const minRow = Math.max(0, Math.floor(visibleTop / scaledCellSize) - 1);
    const maxCol = Math.min(gridSize - 1, Math.ceil(visibleRight / scaledCellSize) + 1);
    const maxRow = Math.min(gridSize - 1, Math.ceil(visibleBottom / scaledCellSize) + 1);

    return {
      minRow,
      maxRow,
      minCol,
      maxCol,
      isFullView: minRow === 0 && maxRow === gridSize - 1 && minCol === 0 && maxCol === gridSize - 1
    };
  }

  /**
   * 销毁调度器
   */
  destroy() {
    if (this._gestureEndTimer) {
      clearTimeout(this._gestureEndTimer);
      this._gestureEndTimer = null;
    }
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
  }
}

// 导出单例
let schedulerInstance = null;

function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new RenderScheduler();
  }
  return schedulerInstance;
}

module.exports = {
  getScheduler,
  RenderScheduler
};
