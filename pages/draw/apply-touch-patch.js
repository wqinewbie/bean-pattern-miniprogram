/**
 * 自动应用 Focus Mode 优化补丁
 * 使用方法：node apply-touch-patch.js
 */

const fs = require('fs');
const path = require('path');

const DRAW_JS_PATH = path.join(__dirname, 'draw.js');
const BACKUP_PATH = path.join(__dirname, 'draw.js.backup');

console.log('🚀 开始应用 Focus Mode 优化补丁...\n');

// 1. 读取原文件
let content = fs.readFileSync(DRAW_JS_PATH, 'utf8');
console.log('✅ 已读取 draw.js');

// 2. 添加私有变量
const privateVarsPattern = /(_originalColorPalette: null,)/;
const newPrivateVars = `$1
  
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
  _pinchCenterY: 0,`;

if (content.match(privateVarsPattern) && !content.includes('_isPinching')) {
  content = content.replace(privateVarsPattern, newPrivateVars);
  console.log('✅ 已添加私有变量');
} else if (content.includes('_isPinching')) {
  console.log('⚠️  私有变量已存在，跳过');
} else {
  console.log('❌ 未找到插入点，请手动添加私有变量');
}

// 3. 替换 handleTouchStart
const touchStartPattern = /handleTouchStart\(e\) \{[\s\S]*?(?=\n  },?\n\n  handleTouchMove)/;
const newTouchStart = `handleTouchStart(e) {
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
  }`;

if (content.match(touchStartPattern)) {
  content = content.replace(touchStartPattern, newTouchStart);
  console.log('✅ 已替换 handleTouchStart');
} else {
  console.log('❌ 未找到 handleTouchStart，请手动替换');
}

// 4. 替换 handleTouchMove
const touchMovePattern = /handleTouchMove\(e\) \{[\s\S]*?(?=\n  },?\n\n  handleTouchEnd)/;
const newTouchMove = `handleTouchMove(e) {
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
  }`;

if (content.match(touchMovePattern)) {
  content = content.replace(touchMovePattern, newTouchMove);
  console.log('✅ 已替换 handleTouchMove');
} else {
  console.log('❌ 未找到 handleTouchMove，请手动替换');
}

// 5. 替换 handleTouchEnd
const touchEndPattern = /handleTouchEnd\(\) \{[\s\S]*?(?=\n  },?\n\n  _getPixelPosition)/;
const newTouchEnd = `handleTouchEnd(e) {
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
  }`;

if (content.match(touchEndPattern)) {
  content = content.replace(touchEndPattern, newTouchEnd);
  console.log('✅ 已替换 handleTouchEnd');
} else {
  console.log('❌ 未找到 handleTouchEnd，请手动替换');
}

// 6. 替换 _getPixelPosition
const pixelPosPattern = /_getPixelPosition\(touchX, touchY\) \{[\s\S]*?(?=\n  },?\n\n  _paintPixel)/;
const newPixelPos = `_getPixelPosition(touchX, touchY) {
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
  }`;

if (content.match(pixelPosPattern)) {
  content = content.replace(pixelPosPattern, newPixelPos);
  console.log('✅ 已替换 _getPixelPosition');
} else {
  console.log('❌ 未找到 _getPixelPosition，请手动替换');
}

// 7. 添加新方法
const newMethods = `
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
  
  // 重置画布视图
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
`;

// 在 onBack 方法之前插入
const insertPoint = /(\n  onBack\(\) \{)/;
if (content.match(insertPoint) && !content.includes('_getDistance(touch1, touch2)')) {
  content = content.replace(insertPoint, newMethods + '$1');
  console.log('✅ 已添加新方法');
} else if (content.includes('_getDistance(touch1, touch2)')) {
  console.log('⚠️  新方法已存在，跳过');
} else {
  console.log('❌ 未找到插入点，请手动添加新方法');
}

// 8. 添加 onUnload 清理
if (!content.includes('onUnload()')) {
  const unloadMethod = `
  onUnload() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
  },
`;
  content = content.replace(insertPoint, unloadMethod + '$1');
  console.log('✅ 已添加 onUnload 清理');
} else {
  console.log('⚠️  onUnload 已存在，请手动添加清理代码');
}

// 9. 写入文件
fs.writeFileSync(DRAW_JS_PATH, content, 'utf8');
console.log('\n✅ 补丁应用完成！');
console.log(`📁 备份文件：${BACKUP_PATH}`);
console.log('\n📝 后续步骤：');
console.log('1. 检查 draw.js 文件是否正确');
console.log('2. 运行小程序测试功能');
console.log('3. 如有问题，可从备份恢复');
console.log('\n💡 提示：建议添加"重置视图"按钮到工具栏');
