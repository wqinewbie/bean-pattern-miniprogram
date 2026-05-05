# Focus Mode 优化 - 快速应用指南

## 核心问题

原有的拖拽模式存在以下问题：
1. ❌ 坐标计算错误 - 有偏移/缩放时绘制位置不准
2. ❌ 缺少缩放功能 - 无法放大查看细节
3. ❌ 体验不流畅 - 没有惯性滚动

## 优化内容

✅ 修复坐标转换算法  
✅ 添加双指缩放（0.5x ~ 3x）  
✅ 添加惯性滚动效果  
✅ 优化手势识别逻辑  

## 手动应用步骤

### 步骤 1：添加私有变量

在 `draw.js` 中找到这一行：
```javascript
_originalColorPalette: null,
```

在其后添加：
```javascript
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
```

### 步骤 2：修复坐标转换

找到 `_getPixelPosition` 方法，将这部分：
```javascript
// 旧代码
const relX = (touchX - rect.left - offsetX) / scale;
const relY = (touchY - rect.top - offsetY) / scale;
```

替换为：
```javascript
// 新代码
const relX = touchX - rect.left;
const relY = touchY - rect.top;

const transformedX = (relX - offsetX) / scale;
const transformedY = (relY - offsetY) / scale;

const col = Math.floor((transformedX / rect.width) * this.data.gridSize);
const row = Math.floor((transformedY / rect.height) * this.data.gridSize);
```

### 步骤 3：优化触摸处理

#### 3.1 修改 handleTouchStart

在方法开头添加双指检测：
```javascript
handleTouchStart(e) {
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
    
    this._pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
    this._pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
    return;
  }
  
  const touch = touches[0];
  this._lastTouchTime = now;
  
  // 拖拽工具
  if (this.data.tool === 'drag') {
    this._isDragging = true;
    this._dragStartX = touch.clientX;
    this._dragStartY = touch.clientY;
    this._velocityX = 0;
    this._velocityY = 0;
    
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
    return;
  }
  
  // 原有的绘制逻辑...
}
```

#### 3.2 修改 handleTouchMove

在方法开头添加缩放处理：
```javascript
handleTouchMove(e) {
  const touches = e.touches;
  const now = Date.now();
  
  // 双指缩放
  if (touches.length === 2 && this._isPinching) {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const currentDistance = this._getDistance(touch1, touch2);
    
    const scaleChange = currentDistance / this._touchStartDistance;
    let newScale = this._touchStartScale * scaleChange;
    
    newScale = Math.max(0.5, Math.min(3, newScale));
    
    this.setData({ canvasScale: newScale });
    return;
  }
  
  const touch = touches[0];
  const deltaTime = now - this._lastTouchTime;
  
  // 拖拽工具 - 添加速度计算
  if (this.data.tool === 'drag' && this._isDragging) {
    const deltaX = touch.clientX - this._dragStartX;
    const deltaY = touch.clientY - this._dragStartY;
    
    if (deltaTime > 0) {
      this._velocityX = deltaX / deltaTime * 16;
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
  
  // 原有的绘制逻辑...
}
```

#### 3.3 修改 handleTouchEnd

替换整个方法：
```javascript
handleTouchEnd(e) {
  if (this._isPinching) {
    this._isPinching = false;
    if (e.touches.length === 1 && this.data.tool === 'drag') {
      const touch = e.touches[0];
      this._isDragging = true;
      this._dragStartX = touch.clientX;
      this._dragStartY = touch.clientY;
    }
    return;
  }
  
  if (this._isDragging && this.data.tool === 'drag') {
    this._isDragging = false;
    
    const speed = Math.sqrt(this._velocityX ** 2 + this._velocityY ** 2);
    if (speed > 1) {
      this._startInertiaAnimation();
    }
    return;
  }
  
  this._isDrawing = false;
  this._lastPos = null;
}
```

### 步骤 4：添加辅助方法

在 `onBack()` 方法之前添加：

```javascript
// 计算两点距离
_getDistance(touch1, touch2) {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
},

// 惯性滚动动画
_startInertiaAnimation() {
  const friction = 0.95;
  const minVelocity = 0.5;
  
  const animate = () => {
    this._velocityX *= friction;
    this._velocityY *= friction;
    
    const speed = Math.sqrt(this._velocityX ** 2 + this._velocityY ** 2);
    if (speed < minVelocity) {
      this._animationFrame = null;
      return;
    }
    
    this.setData({
      canvasOffsetX: this.data.canvasOffsetX + this._velocityX,
      canvasOffsetY: this.data.canvasOffsetY + this._velocityY
    });
    
    this._animationFrame = requestAnimationFrame(animate);
  };
  
  this._animationFrame = requestAnimationFrame(animate);
},

// 重置视图
resetCanvasView() {
  if (this._animationFrame) {
    cancelAnimationFrame(this._animationFrame);
    this._animationFrame = null;
  }
  
  this.setData({
    canvasOffsetX: 0,
    canvasOffsetY: 0,
    canvasScale: 1
  });
  
  wx.showToast({ title: '视图已重置', icon: 'success', duration: 1500 });
},
```

### 步骤 5：添加清理代码

在 `onBack()` 方法之前添加：
```javascript
onUnload() {
  if (this._animationFrame) {
    cancelAnimationFrame(this._animationFrame);
    this._animationFrame = null;
  }
},
```

## 可选：添加重置按钮

### 在 draw.wxml 中添加

在工具栏的合适位置添加：
```xml
<!-- 重置视图 -->
<view class="tool-icon" bindtap="resetCanvasView">
  <text class="icon">⊙</text>
  <text class="label">重置</text>
</view>
```

### 添加缩放指示器

在画布区域添加：
```xml
<view class="zoom-indicator">{{canvasScale.toFixed(1)}}x</view>
```

在 draw.wxss 中添加样式：
```css
.zoom-indicator {
  position: absolute;
  bottom: 400rpx;
  right: 32rpx;
  padding: 8rpx 16rpx;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 16rpx;
  font-size: 20rpx;
  font-weight: 700;
  z-index: 30;
  pointer-events: none;
}
```

## 测试清单

完成修改后，请测试以下功能：

- [ ] 单指拖拽画布
- [ ] 拖拽结束后的惯性滚动
- [ ] 双指缩放（捏合/分开）
- [ ] 在不同缩放级别下绘制
- [ ] 绘制位置是否准确
- [ ] 工具切换是否正常
- [ ] 重置视图功能

## 常见问题

**Q: 绘制位置还是不准确？**  
A: 检查 `_getPixelPosition` 中的坐标转换是否正确应用了偏移和缩放。

**Q: 缩放时画布跳动？**  
A: 确保 `canvasScale` 的初始值为 1，并且 CSS 中使用了 `transform: scale()`。

**Q: 惯性滚动太快或太慢？**  
A: 调整 `friction` 值（0.95），值越小减速越快。

**Q: 双指操作时触发了绘制？**  
A: 确保在 `handleTouchStart` 中正确检测了 `touches.length === 2`。

## 完整文件参考

详细的代码实现请参考：
- `touch-handler-patch.js` - 完整的方法实现
- `FOCUS_MODE_OPTIMIZATION.md` - 详细的优化说明

## 回滚方法

如果出现问题，可以从备份恢复：
```bash
Copy-Item draw.js.backup draw.js
```

---

**预计修改时间**：15-20 分钟  
**难度**：⭐⭐⭐ 中等  
**建议**：先在测试环境验证，确认无误后再应用到生产环境
