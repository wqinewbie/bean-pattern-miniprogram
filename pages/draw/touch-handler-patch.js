// 拖拽和缩放优化补丁
// 使用方法：将这些方法替换到 draw.js 中对应的位置

// 1. 在 Page 对象的私有变量部分添加（_originalColorPalette 之后）：
/*
  // 拖拽和缩放优化
  _touchStartDistance: 0,
  _touchStartScale: 1,
  _isPinching: false,
  _lastTouchTime: 0,
  _velocityX: 0,
  _velocityY: 0,
  _animationFrame: null,
  _minScale: 0.5,
  _maxScale: 3,
  _pinchCenterX: 0,
  _pinchCenterY: 0,
*/

// 2. 替换 handleTouchStart 方法：
const handleTouchStart = function(e) {
  if (!this._canvasRect) this._updateCanvasRect();
  
  const touches = e.touches;
  const now = Date.now();
  
  // 双指缩放检测
  if (touches.length === 2) {
    this._isPinching = true;
    this._isDrawing = false;
    this._isDragging = false;
    
    const touch1 = touches[0];
    const touch2 = touches[1];
    this._touchStartDistance = this._getDistance(touch1, touch2);
    this._touchStartScale = this.data.canvasScale;
    
    // 记录缩放中心点
    this._pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
    this._pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
    return;
  }
  
  const touch = touches[0];
  this._lastTouchTime = now;
  
  // 拖拽工具 - 单指拖动
  if (this.data.tool === 'drag') {
    this._isDragging = true;
    this._dragStartX = touch.clientX;
    this._dragStartY = touch.clientY;
    this._velocityX = 0;
    this._velocityY = 0;
    
    // 停止惯性动画
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
    return;
  }
  
  // 绘制工具
  const pos = this._getPixelPosition(touch.clientX, touch.clientY);
  if (!pos) return;
  this._isDrawing = true;
  this._lastPos = pos;
  this._saveState();
  this._paintPixel(pos.row, pos.col);
};

// 3. 替换 handleTouchMove 方法：
const handleTouchMove = function(e) {
  const touches = e.touches;
  const now = Date.now();
  
  // 双指缩放
  if (touches.length === 2 && this._isPinching) {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const currentDistance = this._getDistance(touch1, touch2);
    
    // 计算缩放比例
    const scaleChange = currentDistance / this._touchStartDistance;
    let newScale = this._touchStartScale * scaleChange;
    
    // 限制缩放范围
    const minScale = this._minScale || 0.5;
    const maxScale = this._maxScale || 3;
    newScale = Math.max(minScale, Math.min(maxScale, newScale));
    
    // 计算新的缩放中心
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    // 调整偏移量，使缩放围绕触摸中心进行
    const rect = this._canvasRect;
    if (rect) {
      const oldScale = this.data.canvasScale;
      const scaleRatio = newScale / oldScale;
      
      // 计算相对于画布中心的偏移调整
      const canvasCenterX = rect.left + rect.width / 2;
      const canvasCenterY = rect.top + rect.height / 2;
      
      const offsetX = this.data.canvasOffsetX - (centerX - canvasCenterX) * (scaleRatio - 1);
      const offsetY = this.data.canvasOffsetY - (centerY - canvasCenterY) * (scaleRatio - 1);
      
      this.setData({
        canvasScale: newScale,
        canvasOffsetX: offsetX,
        canvasOffsetY: offsetY
      });
    } else {
      this.setData({ canvasScale: newScale });
    }
    return;
  }
  
  const touch = touches[0];
  const deltaTime = now - this._lastTouchTime;
  
  // 拖拽工具
  if (this.data.tool === 'drag' && this._isDragging) {
    const deltaX = touch.clientX - this._dragStartX;
    const deltaY = touch.clientY - this._dragStartY;
    
    // 计算速度（用于惯性滚动）
    if (deltaTime > 0) {
      this._velocityX = deltaX / deltaTime * 16; // 转换为每帧速度
      this._velocityY = deltaY / deltaTime * 16;
    }
    
    this.setData({
      canvasOffsetX: this.data.canvasOffsetX + deltaX,
      canvasOffsetY: this.data.canvasOffsetY + deltaY
    });
    
    this._dragStartX = touch.clientX;
    this._dragStartY = touch.clientY;
    this._lastTouchTime = now;
    return;
  }
  
  // 绘制工具
  if (!this._isDrawing) return;
  const pos = this._getPixelPosition(touch.clientX, touch.clientY);
  if (!pos) return;
  if (this._lastPos) {
    this._paintLine(this._lastPos.row, this._lastPos.col, pos.row, pos.col);
  } else {
    this._paintPixel(pos.row, pos.col);
  }
  this._lastPos = pos;
};

// 4. 替换 handleTouchEnd 方法：
const handleTouchEnd = function(e) {
  // 如果是双指缩放结束
  if (this._isPinching) {
    this._isPinching = false;
    // 如果还有一个手指，切换到拖拽模式
    if (e.touches.length === 1 && this.data.tool === 'drag') {
      const touch = e.touches[0];
      this._isDragging = true;
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
    }
    return;
  }
  
  // 拖拽工具 - 添加惯性滚动
  if (this._isDragging && this.data.tool === 'drag') {
    this._isDragging = false;
    
    // 如果有足够的速度，启动惯性动画
    const speed = Math.sqrt(this._velocityX ** 2 + this._velocityY ** 2);
    if (speed > 1) {
      this._startInertiaAnimation();
    }
    return;
  }
  
  this._isDrawing = false;
  this._lastPos = null;
};

// 5. 添加新的辅助方法（在 handleTouchEnd 之后）：

// 计算两点距离
const _getDistance = function(touch1, touch2) {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

// 惯性滚动动画
const _startInertiaAnimation = function() {
  const friction = 0.95; // 摩擦系数
  const minVelocity = 0.5; // 最小速度阈值
  
  const animate = () => {
    // 应用摩擦力
    this._velocityX *= friction;
    this._velocityY *= friction;
    
    // 检查是否停止
    const speed = Math.sqrt(this._velocityX ** 2 + this._velocityY ** 2);
    if (speed < minVelocity) {
      this._animationFrame = null;
      return;
    }
    
    // 更新位置
    this.setData({
      canvasOffsetX: this.data.canvasOffsetX + this._velocityX,
      canvasOffsetY: this.data.canvasOffsetY + this._velocityY
    });
    
    // 继续动画
    this._animationFrame = requestAnimationFrame(animate);
  };
  
  this._animationFrame = requestAnimationFrame(animate);
};

// 6. 优化 _getPixelPosition 方法（修复坐标转换）：
const _getPixelPosition = function(touchX, touchY) {
  if (!this._canvasRect) return null;
  const rect = this._canvasRect;
  
  // 考虑画布偏移和缩放
  const offsetX = this.data.canvasOffsetX || 0;
  const offsetY = this.data.canvasOffsetY || 0;
  const scale = this.data.canvasScale || 1;
  
  // 修正：先计算相对于画布容器的位置，再应用变换
  const relX = touchX - rect.left;
  const relY = touchY - rect.top;
  
  // 反向应用变换：先减去偏移，再除以缩放
  const transformedX = (relX - offsetX) / scale;
  const transformedY = (relY - offsetY) / scale;
  
  // 计算网格坐标
  const col = Math.floor((transformedX / rect.width) * this.data.gridSize);
  const row = Math.floor((transformedY / rect.height) * this.data.gridSize);
  
  if (col >= 0 && col < this.data.gridSize && row >= 0 && row < this.data.gridSize) {
    return { row, col };
  }
  return null;
};

// 7. 添加重置视图方法（在工具栏中可以调用）：
const resetCanvasView = function() {
  // 停止所有动画
  if (this._animationFrame) {
    cancelAnimationFrame(this._animationFrame);
    this._animationFrame = null;
  }
  
  // 重置为初始状态
  this.setData({
    canvasOffsetX: 0,
    canvasOffsetY: 0,
    canvasScale: 1
  });
  
  wx.showToast({ title: '视图已重置', icon: 'success', duration: 1500 });
};

// 8. 在 onUnload 中清理动画（添加到现有的 onUnload 或创建新的）：
const onUnload = function() {
  if (this._animationFrame) {
    cancelAnimationFrame(this._animationFrame);
    this._animationFrame = null;
  }
};

module.exports = {
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  _getDistance,
  _startInertiaAnimation,
  _getPixelPosition,
  resetCanvasView,
  onUnload
};
