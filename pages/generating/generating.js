const request = require('../../utils/request');

Page({
  data: {
    isTimeout: false,
    loadingText: '正在处理...',
    // AI 模式参数
    prompt: '',
    style: '',
    size: 24,
    // 图片模式参数
    imageUrl: '',
    gridSize: 64,
    brand: 'MARD',
    colorCount: 0,
    algo: 'standard',
    mode: 'image', // 'ai' 或 'image'
  },

  _timer: null,
  _timeoutTimer: null,

  onLoad(options) {
    const mode = options.mode || 'image';
    this.setData({ mode });

    if (mode === 'ai') {
      // AI 文字生成模式
      const prompt = decodeURIComponent(options.prompt || '');
      const style = decodeURIComponent(options.style || '');
      const size = parseInt(options.size) || 24;
      this.setData({ prompt, style, size });
      this.startAiGenerate(prompt, style, size);
    } else {
      // 图片生成模式
      const imageUrl = decodeURIComponent(options.imageUrl || '');
      const gridSize = parseInt(options.gridSize) || 64;
      const brand = decodeURIComponent(options.brand || 'MARD');
      const colorCount = parseInt(options.colorCount) || 0;
      const algo = options.algo || 'standard';
      this.setData({ imageUrl, gridSize, brand, colorCount, algo });
      this.startImageGenerate(imageUrl, gridSize, brand, colorCount, algo);
    }
  },

  onUnload() {
    clearTimeout(this._timer);
    clearTimeout(this._timeoutTimer);
  },

  // ========== AI 文字生成模式 ==========
  startAiGenerate(prompt, style, size) {
    this.setData({ loadingText: 'AI 正在施展魔法...' });

    // 30秒超时提示
    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 30000);

    request.post('/bead/pattern-ai-text', {
      prompt, style, size
    })
      .then((data) => {
        clearTimeout(this._timeoutTimer);
        wx.redirectTo({
          url: '/pages/result/result?resultUrl=' + encodeURIComponent(data.resultUrl || '') +
               '&patternUrl=' + encodeURIComponent(data.patternUrl || '') +
               '&colorStats=' + encodeURIComponent(data.colorStats || '')
        });
      })
      .catch((err) => {
        clearTimeout(this._timeoutTimer);
        if (err && err.message === 'PROFILE_INCOMPLETE') {
          wx.navigateBack({ delta: 1 });
          return;
        }
        wx.showModal({
          title: 'AI生成失败',
          content: (err && err.message) ? err.message : '请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack({ delta: 1 })
        });
      });
  },

  // ========== 图片生成模式 ==========
  startImageGenerate(imageUrl, gridSize, brand, colorCount, algo) {
    this.setData({ loadingText: '上传图片...' });

    const sessionId = wx.getStorageSync('sessionId') || '';

    // 60秒超时提示
    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 60000);

    // 1. 上传图片
    this.uploadFile(imageUrl, sessionId)
      .then((imageUrlResult) => {
        this.setData({ loadingText: '生成效果图...' });
        // 2. 生成效果图数据
        return request.post('/bead/generate-result', {
          imageUrl: imageUrlResult,
          gridSize: gridSize
        }).then((result) => ({ ...result, imageUrl: imageUrlResult }));
      })
      .then(({ rgbData, gridSize: resultSize, imageUrl: originalUrl }) => {
        this.setData({ loadingText: '生成色号图...' });
        // 3. 生成色号图数据
        return request.post('/bead/generate-pattern', {
          rgbData: rgbData,
          brand: brand,
          colorCount: colorCount,
          algo: algo
        }).then((pattern) => ({ ...pattern, rgbData, originalUrl, resultSize }));
      })
      .then(({ gridData, colorPalette, effectRgbData, gridSize: resultGridSize, originalUrl, historyId }) => {
        this.setData({ loadingText: '正在渲染...' });
        // 使用 gridData 的实际大小渲染
        const actualGridSize = gridData.length || resultGridSize;
        
        // 4. 在这里完成 Canvas 渲染
        return this.renderCanvases(gridData, colorPalette, effectRgbData, actualGridSize)
          .then((rendered) => {
            clearTimeout(this._timeoutTimer);
            
            // 5. 保存数据到本地存储（因为数据量大，URL 会超限）
            const resultData = {
              originalUrl: originalUrl,
              gridSize: actualGridSize,
              gridData: gridData,
              colorPalette: colorPalette,
              rgbData: effectRgbData || [],
              sourceType: 'LOCAL',
              brand: brand,
              historyId: historyId,
              renderedPatternUrl: rendered.patternUrl || '',
              renderedResultUrl: rendered.resultUrl || ''
            };
            const storageKey = 'pendingResult_' + Date.now();
            wx.setStorageSync(storageKey, resultData);
            
            console.log('=== 数据已保存到本地存储 ===');
            console.log('storageKey:', storageKey);
            console.log('renderedPatternUrl:', rendered.patternUrl);
            console.log('renderedResultUrl:', rendered.resultUrl);
            
            // 6. 跳转到结果页
            wx.redirectTo({
              url: '/pages/result/result?storageKey=' + storageKey
            });
          });
      })
      .catch((err) => {
        clearTimeout(this._timeoutTimer);
        if (err && err.message === 'PROFILE_INCOMPLETE') {
          wx.navigateBack({ delta: 1 });
          return;
        }
        wx.showModal({
          title: '生成失败',
          content: (err && err.message) ? err.message : '请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack({ delta: 1 })
        });
      });
  },

  uploadFile(filePath, sessionId) {
    const API_BASE_URL = require('../../utils/config').API_BASE_URL;
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: API_BASE_URL + '/api/image/upload',
        filePath: filePath,
        name: 'file',
        header: { 'X-Session-Id': sessionId },
        success: (res) => {
          const raw = res && res.data ? String(res.data) : '';
          try {
            const body = JSON.parse(raw || '{}');
            if (res.statusCode === 200 && body.code === 0) {
              resolve(body.data.imageUrl || body.data.originalUrl);
              return;
            }
            const message = (body && body.message) ? body.message : ('HTTP ' + res.statusCode);
            reject(new Error('[upload] ' + message));
          } catch (e) {
            reject(new Error('[upload] HTTP ' + res.statusCode));
          }
        },
        fail: (err) => {
          reject(new Error('[upload] ' + ((err && err.errMsg) || '上传失败')));
        }
      });
    });
  },

  onGoMyPatterns() {
    wx.redirectTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onKeepWaiting() {
    this.setData({ isTimeout: false });
  },

  // 渲染效果图和色号图，返回渲染后的图片路径
  renderCanvases(gridData, colorPalette, rgbData, gridSize) {
    return new Promise((resolve) => {
      console.log('=== renderCanvases 开始 ===');
      console.log('gridSize:', gridSize);
      console.log('gridData.length:', gridData ? gridData.length : 0);
      console.log('colorPalette.length:', colorPalette ? colorPalette.length : 0);
      console.log('rgbData.length:', rgbData ? rgbData.length : 0);
      
      const canvasWidth = 300; // 预览尺寸
      
      // 1. 渲染色号图
      const renderPattern = () => {
        return new Promise((resolvePattern) => {
          const patternCtx = wx.createCanvasContext('patternCanvas');
          const cellSize = canvasWidth / gridSize;
          
          // 绘制格子
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              const colorIndex = gridData[y] ? gridData[y][x] : 0;
              const color = colorPalette[colorIndex];
              if (color) {
                patternCtx.setFillStyle('rgb(' + color.r + ',' + color.g + ',' + color.b + ')');
                patternCtx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
              }
            }
          }
          
          // 绘制色号文字
          patternCtx.setTextAlign('center');
          patternCtx.setTextBaseline('middle');
          
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              const colorIndex = gridData[y] ? gridData[y][x] : 0;
              const color = colorPalette[colorIndex];
              if (color) {
                const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
                const textColor = lum > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
                
                const colorId = color.id || '';
                const text = colorId.replace(/\D/g, '') || colorId;
                
                let fontSize = Math.max(3, Math.floor(cellSize * 0.5));
                patternCtx.setFontSize(fontSize);
                patternCtx.setFillStyle(textColor);
                patternCtx.fillText(text, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
              }
            }
          }
          
          // 使用备用机制确保回调
          let patternDone = false;
          const patternBackup = setTimeout(() => {
            if (!patternDone) {
              patternDone = true;
              resolvePattern('');
            }
          }, 3000);
          
          patternCtx.draw(false, () => {
            if (patternDone) return;
            patternDone = true;
            clearTimeout(patternBackup);
            wx.canvasToTempFilePath({
              canvasId: 'patternCanvas',
              x: 0, y: 0,
              width: canvasWidth, height: canvasWidth,
              destWidth: canvasWidth, destHeight: canvasWidth,
              success: (res) => resolvePattern(res.tempFilePath),
              fail: () => resolvePattern('')
            });
          });
        });
      };
      
      // 2. 渲染效果图
      const renderResult = () => {
        return new Promise((resolveResult) => {
          if (!rgbData || rgbData.length === 0) {
            resolveResult('');
            return;
          }
          
          const rgbHeight = rgbData.length;
          const rgbWidth = rgbData[0] ? rgbData[0].length : 0;
          if (rgbWidth === 0 || rgbHeight === 0) {
            resolveResult('');
            return;
          }
          
          const resultCtx = wx.createCanvasContext('resultCanvas');
          
          // 计算缩放比例，填充整个 canvas
          const scaleX = canvasWidth / rgbWidth;
          const scaleY = canvasWidth / rgbHeight;
          const scale = Math.min(scaleX, scaleY);
          const offsetX = (canvasWidth - rgbWidth * scale) / 2;
          const offsetY = (canvasWidth - rgbHeight * scale) / 2;
          
          // 绘制像素
          for (let y = 0; y < rgbHeight; y++) {
            for (let x = 0; x < rgbWidth; x++) {
              const rgb = rgbData[y][x];
              if (rgb && rgb.length >= 3) {
                resultCtx.setFillStyle('rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')');
                resultCtx.fillRect(
                  offsetX + x * scale,
                  offsetY + y * scale,
                  scale + 0.5,
                  scale + 0.5
                );
              }
            }
          }
          
          // 使用备用机制确保回调
          let resultDone = false;
          const resultBackup = setTimeout(() => {
            if (!resultDone) {
              resultDone = true;
              resolveResult('');
            }
          }, 3000);
          
          resultCtx.draw(false, () => {
            if (resultDone) return;
            resultDone = true;
            clearTimeout(resultBackup);
            wx.canvasToTempFilePath({
              canvasId: 'resultCanvas',
              x: 0, y: 0,
              width: canvasWidth, height: canvasWidth,
              destWidth: canvasWidth, destHeight: canvasWidth,
              success: (res) => resolveResult(res.tempFilePath),
              fail: () => resolveResult('')
            });
          });
        });
      };
      
      // 并行渲染两个 canvas
      Promise.all([renderPattern(), renderResult()])
        .then(([patternUrl, resultUrl]) => {
          console.log('=== renderCanvases 完成 ===');
          console.log('patternUrl:', patternUrl);
          console.log('resultUrl:', resultUrl);
          resolve({ patternUrl, resultUrl });
        });
    });
  },
});
