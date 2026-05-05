# Draw 页面遮罩模式恢复记录

## 恢复时间
2026-05-01

## 问题
- 原始文件在编辑过程中被意外关闭/还原
- 文件内容损坏，包含混乱的代码片段

## 恢复操作

### 1. 备份损坏文件
- 创建 draw.wxml.broken 备份

### 2. 重建 draw.wxml
- 使用 PowerShell Set-Content 重建文件
- 实现简化版遮罩模式布局
- 包含：顶部导航、左侧工具栏、画布区域、底部颜色栏

### 3. 更新 draw.js
- 添加 data 字段：showLeftToolbar, colorbarExpanded, navBarTop, safeRightInset, capsuleHeight
- 添加方法：onToggleLeftToolbar, onCloseLeftToolbar, onToggleColorbar, onCloseColorbar
- 修改 onSelectTool：选择工具后自动关闭工具栏
- 修改 onSelectColor：选择颜色后自动关闭颜色栏

## 遮罩模式功能

### 核心特性
1. **全屏画布**：工具栏隐藏时，画布占满整个屏幕
2. **浮动触发按钮**：
   - 左上角：工具栏触发按钮（🛠 图标）
   - 右下角：颜色栏触发按钮（🎨 图标）
3. **Canvas 透明度控制**：打开工具栏时，Canvas 透明度降至 0.3，解决层级问题
4. **自动关闭**：选择工具/颜色后自动关闭对应面板

### Canvas 层级问题解决方案
- **问题**：Canvas 2D 在某些平台上会"永远在最上层"，z-index 无法控制
- **解决**：通过动态调整 Canvas 的 opacity 来实现视觉上的遮罩效果
- **效果**：打开工具栏时 Canvas 变暗（30%），关闭时恢复正常（100%）

## 文件状态
- ✅ draw.wxml - 已重建（简化版）
- ✅ draw.js - 已更新
- ⚠️ draw.wxss - 需要检查是否包含遮罩样式
- 📦 draw.wxml.broken - 损坏文件备份

## 下一步
1. 检查 draw.wxss 是否包含所有必要的遮罩样式
2. 测试功能是否正常
3. 如需完整版（包含设置面板等），需要进一步扩展

## 注意事项
- 当前版本是简化版，只包含基本工具栏和颜色栏
- 完整版的设置面板、坐标轴等功能需要额外添加
- Canvas 使用旧版 API（canvas-id），如需 Canvas 2D 需要替换为 bead-canvas2d 组件
