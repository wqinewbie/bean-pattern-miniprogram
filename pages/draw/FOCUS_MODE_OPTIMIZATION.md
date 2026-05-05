# Focus Mode (拖拽模式) 优化方案

## 问题分析

原有的 focus-mode（拖拽工具）存在以下问题：

1. **坐标转换错误**：在有偏移和缩放时，`_getPixelPosition` 计算不准确
2. **缺少缩放功能**：只能拖拽，无法放大缩小查看细节
3. **体验不流畅**：没有惯性滚动，拖拽手感生硬
4. **多指操作冲突**：双指操作时会触发绘制

## 优化方案

### 1. 双指缩放（Pinch Zoom）

**功能**：
- 支持双指捏合缩放画布
- 缩放范围：0.5x ~ 3x
- 缩放中心：双指触摸的中心点
- 平滑过渡，无跳跃

**实现要点**：
```javascript
// 检测双指触摸
if (touches.length === 2) {
  const distance = Math.sqrt(dx² + dy²);
  const scaleChange = currentDistance / startDistance;
  newScale = startScale * scaleChange;
}
```

### 2. 惯性滚动（Inertia Scrolling）

**功能**：
- 拖拽结束后继续滑动
- 自然的减速效果
- 可随时打断

**实现要点**：
```javascript
// 记录速度
velocity = delta / deltaTime * 16;

// 应用摩擦力
velocity *= 0.95;

// 使用 requestAnimationFrame 实现平滑动画
```

### 3. 精确的坐标转换

**修复前**：
```javascript
// 错误：直接从 rect 减去偏移
const relX = (touchX - rect.left - offsetX) / scale;
```

**修复后**：
```javascript
// 正确：先计算相对位置，再应用变换
const relX = touchX - rect.left;
const transformedX = (relX - offsetX) / scale;
```

### 4. 智能手势识别

**优先级**：
1. 双指缩放（最高优先级）
2. 拖拽工具的单指拖动
3. 绘制工具的绘制操作

**状态管理**：
- `_isPinching`: 正在缩放
- `_isDragging`: 正在拖拽
- `_isDrawing`: 正在绘制

## 使用方法

### 方式一：手动应用补丁

1. 打开 `draw.js` 文件
2. 找到 `_originalColorPalette: null,` 这一行
3. 在其后添加新的私有变量：

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

4. 替换以下方法（参考 `touch-handler-patch.js`）：
   - `handleTouchStart`
   - `handleTouchMove`
   - `handleTouchEnd`
   - `_getPixelPosition`

5. 添加新方法：
   - `_getDistance`
   - `_startInertiaAnimation`
   - `resetCanvasView`（可选）

6. 在 `onUnload` 中添加清理代码

### 方式二：使用脚本自动应用

```bash
# 运行应用脚本（需要创建）
node apply-touch-patch.js
```

## 新增功能

### 1. 重置视图按钮

在工具栏添加一个"重置"按钮，调用 `resetCanvasView()` 方法：

```xml
<!-- draw.wxml -->
<view class="tool-icon" bindtap="resetCanvasView">
  <text class="icon">⊙</text>
  <text class="label">重置</text>
</view>
```

### 2. 缩放比例显示

在界面上显示当前缩放比例：

```xml
<!-- draw.wxml -->
<view class="zoom-indicator">{{canvasScale.toFixed(1)}}x</view>
```

```css
/* draw.wxss */
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
}
```

## 操作指南

### 拖拽模式

1. 点击工具栏的"拖拽"按钮（✋图标）
2. 单指拖动画布
3. 松手后会有惯性滚动效果

### 缩放操作

1. 在任何工具模式下都可以使用
2. 双指捏合：缩小画布
3. 双指分开：放大画布
4. 缩放范围：0.5x ~ 3x

### 重置视图

1. 点击"重置"按钮
2. 画布恢复到初始位置和缩放

## 性能优化

### 1. 节流处理

```javascript
// 限制 setData 频率
let lastUpdateTime = 0;
const throttleInterval = 16; // 约 60fps

if (now - lastUpdateTime > throttleInterval) {
  this.setData({ ... });
  lastUpdateTime = now;
}
```

### 2. 使用 CSS Transform

画布的偏移和缩放使用 CSS `transform`，性能优于修改 `left/top`：

```css
.canvas-wrapper {
  transform: translate({{canvasOffsetX}}px, {{canvasOffsetY}}px) 
             scale({{canvasScale}});
  transition: transform 0.1s ease-out;
}
```

### 3. 取消不必要的动画

在开始新的交互时，立即取消惯性动画：

```javascript
if (this._animationFrame) {
  cancelAnimationFrame(this._animationFrame);
  this._animationFrame = null;
}
```

## 兼容性说明

- **微信小程序**：完全支持
- **支付宝小程序**：需要测试 `requestAnimationFrame`
- **H5**：完全支持
- **iOS**：完全支持
- **Android**：完全支持

## 测试建议

### 测试场景

1. **基础拖拽**
   - 单指拖动画布
   - 检查偏移是否正确
   - 检查惯性滚动是否流畅

2. **双指缩放**
   - 双指捏合缩小
   - 双指分开放大
   - 检查缩放中心是否正确

3. **绘制精度**
   - 在不同缩放级别下绘制
   - 检查像素位置是否准确
   - 检查对称模式是否正常

4. **工具切换**
   - 在拖拽和绘制工具间切换
   - 检查状态是否正确重置

5. **边界情况**
   - 快速拖拽
   - 快速缩放
   - 同时多个手指操作

### 性能测试

- 监控 FPS（应保持在 50+ fps）
- 检查内存占用
- 长时间使用是否卡顿

## 已知问题

1. **极端缩放**：在 3x 缩放时，大尺寸画布（128x128）可能出现性能问题
   - 解决方案：限制大画布的最大缩放为 2x

2. **快速切换**：快速在工具间切换可能导致状态混乱
   - 解决方案：在切换工具时重置所有触摸状态

## 后续优化方向

1. **双击缩放**：双击快速放大/缩小到固定比例
2. **边界限制**：限制拖拽范围，防止画布完全移出视野
3. **缩放动画**：切换工具时平滑过渡到合适的缩放级别
4. **手势提示**：首次使用时显示操作提示
5. **快捷操作**：长按空白处快速切换到拖拽模式

## 总结

本次优化主要解决了以下问题：

✅ 修复了坐标转换错误，绘制更精确  
✅ 添加了双指缩放功能，可以查看细节  
✅ 实现了惯性滚动，交互更流畅  
✅ 优化了手势识别，避免操作冲突  
✅ 提升了整体性能和用户体验  

建议在应用补丁后进行充分测试，确保在各种场景下都能正常工作。
