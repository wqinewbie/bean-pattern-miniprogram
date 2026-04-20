/**
 * 纯前端像素化处理（perler-beads-ai 方式）
 * 流程：Canvas采样 → 颜色匹配 → mappedPixelData → 渲染
 */
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
    mode: 'image', // 'ai' 或 'image'
    // 像素化模式参数
    pixelationMode: 'dominant', // 'dominant' | 'average'
    similarityThreshold: 30,
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
      // 图片生成模式 - 纯前端处理
      const imageUrl = decodeURIComponent(options.imageUrl || '');
      const gridSize = parseInt(options.gridSize) || 64;
      const brand = decodeURIComponent(options.brand || 'MARD');
      const colorCount = parseInt(options.colorCount) || 0;
      const pixelationMode = decodeURIComponent(options.pixelationMode || 'dominant');
      const similarityThreshold = parseInt(options.similarityThreshold) || 30;
      
      this.setData({ 
        imageUrl, 
        gridSize, 
        brand, 
        colorCount,
        pixelationMode,
        similarityThreshold
      });
      
      this.startImageGenerate(imageUrl, gridSize, brand, colorCount, pixelationMode, similarityThreshold);
    }
  },

  onUnload() {
    clearTimeout(this._timer);
    clearTimeout(this._timeoutTimer);
  },

  // ========== AI 文字生成模式 ==========
  startAiGenerate(prompt, style, size) {
    this.setData({ loadingText: 'AI 正在施展魔法...' });

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

  // ========== 图片生成模式 - 纯前端处理 ==========
  startImageGenerate(imageUrl, gridSize, brand, colorCount, pixelationMode, similarityThreshold) {
    this.setData({ loadingText: '正在采样图片...' });

    const sessionId = wx.getStorageSync('sessionId') || '';

    // 60秒超时提示
    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 60000);

    // 1. 前端 Canvas 采样获取 RGB 网格
    this._sampleImage(imageUrl, gridSize, pixelationMode)
      .then((rgbGrid) => {
        this.setData({ loadingText: '匹配颜色...' });
        // 2. 调用后端匹配颜色
        return this._matchColors(rgbGrid, brand, pixelationMode);
      })
      .then((matchedGrid) => {
        this.setData({ loadingText: '生成图案数据...' });
        // 3. 转换为 mappedPixelData 格式
        return this._convertToMappedPixelData(matchedGrid);
      })
      .then((mappedPixelData) => {
        this.setData({ loadingText: '正在渲染...' });
        // 4. 渲染预览图
        return this._renderPreview(mappedPixelData, gridSize);
      })
      .then((rendered) => {
        clearTimeout(this._timeoutTimer);
        
        // 5. 转换 mappedPixelData 为 result.js 兼容格式
        const { gridData, colorPalette, rgbData } = this._convertToResultFormat(rendered.mappedPixelData, rendered.colorStats);
        
        // 6. 保存数据到本地存储
        const resultData = {
          id: 'BP' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6).toUpperCase(),
          gridSize: gridSize,
          brand: brand,
          pixelationMode: pixelationMode,
          similarityThreshold: similarityThreshold,
          originalUrl: imageUrl,
          gridData: gridData,
          colorPalette: colorPalette,
          rgbData: rgbData,
          renderedPatternUrl: rendered.patternUrl || '',
          renderedResultUrl: rendered.resultUrl || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        const storageKey = 'pendingResult_' + Date.now();
        wx.setStorageSync(storageKey, resultData);
        
        console.log('=== 纯前端处理完成 ===');
        console.log('gridSize:', gridSize);
        console.log('pixelationMode:', pixelationMode);
        console.log('colorCount:', rendered.colorStats.length);
        
        // 6. 跳转到结果页
        wx.redirectTo({
          url: '/pages/result/result?storageKey=' + storageKey
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

  // ========== Canvas 采样 ==========
  _sampleImage(imagePath, gridSize, mode) {
    const SAMPLE_PX = 512;
    
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: (info) => {
          const ratio = info.width / info.height;
          let sampW, sampH;
          
          if (ratio >= 1) {
            sampW = SAMPLE_PX;
            sampH = Math.max(1, Math.round(SAMPLE_PX / ratio));
          } else {
            sampH = SAMPLE_PX;
            sampW = Math.max(1, Math.round(SAMPLE_PX * ratio));
          }
          
          // 创建采样画布
          const sCtx = wx.createCanvasContext('bead-sample-canvas');
          sCtx.drawImage(imagePath, 0, 0, sampW, sampH);
          sCtx.draw(false, () => {
            wx.canvasGetImageData({
              canvasId: 'bead-sample-canvas',
              x: 0, y: 0, width: sampW, height: sampH,
              success: (pd) => {
                try {
                  // 根据模式采样
                  const rgbGrid = this._sampleGrid(pd.data, sampW, sampH, gridSize, mode);
                  resolve(rgbGrid);
                } catch (e) {
                  reject(e);
                }
              },
              fail: reject
            });
          });
        },
        fail: reject
      });
    });
  },

  // 采样网格 - 支持 Dominant(众数) 和 Average(均值) 模式
  _sampleGrid(data, sw, sh, gridSize, mode) {
    const ratio = sw / sh >= 1 ? sw / sh : sh / sw;
    let gw, gh;
    
    if (sw >= sh) {
      gw = gridSize;
      gh = Math.max(1, Math.round(gridSize / ratio));
    } else {
      gh = gridSize;
      gw = Math.max(1, Math.round(gridSize * ratio));
    }
    
    const cw = sw / gw;
    const ch = sh / gh;
    const grid = [];

    for (let gy = 0; gy < gh; gy++) {
      const row = [];
      for (let gx = 0; gx < gw; gx++) {
        const x0 = Math.floor(gx * cw), x1 = Math.min(Math.ceil((gx+1)*cw), sw);
        const y0 = Math.floor(gy * ch), y1 = Math.min(Math.ceil((gy+1)*ch), sh);
        
        if (mode === 'dominant') {
          // 众数模式：统计每个RGB值的频率
          const colorCounts = {};
          let dominantRgb = null;
          let maxCount = 0;
          let hasOpaque = false;
          
          for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
              const i = (py * sw + px) * 4;
              const a = data[i + 3];
              if (a < 128) continue;
              
              hasOpaque = true;
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const key = r + ',' + g + ',' + b;
              colorCounts[key] = (colorCounts[key] || 0) + 1;
              
              if (colorCounts[key] > maxCount) {
                maxCount = colorCounts[key];
                dominantRgb = [r, g, b];
              }
            }
          }
          
          row.push(hasOpaque && dominantRgb ? dominantRgb : [255, 255, 255]);
        } else {
          // 均值模式：计算平均RGB
          let rSum = 0, gSum = 0, bSum = 0, n = 0;
          let hasOpaque = false;
          
          for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
              const i = (py * sw + px) * 4;
              const a = data[i + 3];
              if (a < 128) continue;
              
              hasOpaque = true;
              rSum += data[i];
              gSum += data[i + 1];
              bSum += data[i + 2];
              n++;
            }
          }
          
          if (!hasOpaque || n === 0) {
            row.push([255, 255, 255]);
          } else {
            row.push([Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)]);
          }
        }
      }
      grid.push(row);
    }

    return grid;
  },

  // ========== 颜色匹配 ==========
  _matchColors(rgbGrid, brand, mode) {
    return new Promise((resolve, reject) => {
      request.post('/bead/match-colors', {
        brand: brand.toLowerCase(),
        grid: rgbGrid,
        algo: mode === 'dominant' ? 'dominant' : 'standard'
      })
        .then(resolve)
        .catch(reject);
    });
  },

  // ========== 转换为 mappedPixelData ==========
  _convertToMappedPixelData(matchedGrid) {
    return new Promise((resolve) => {
      const mappedData = [];
      const colorStatsMap = {};
      
      for (let y = 0; y < matchedGrid.length; y++) {
        const row = [];
        const matchedRow = matchedGrid[y];
        
        for (let x = 0; x < matchedRow.length; x++) {
          const cell = matchedRow[x];
          const colorObj = {
            id: cell.id || 'T1',
            name: cell.name || '',
            hex: this._rgbToHex(cell.r, cell.g, cell.b),
            r: cell.r,
            g: cell.g,
            b: cell.b,
            isExternal: false
          };
          row.push(colorObj);
          
          // 统计颜色
          const id = colorObj.id;
          if (!colorStatsMap[id]) {
            colorStatsMap[id] = {
              id: id,
              name: colorObj.name,
              hex: colorObj.hex,
              r: colorObj.r,
              g: colorObj.g,
              b: colorObj.b,
              count: 0
            };
          }
          colorStatsMap[id].count++;
        }
        mappedData.push(row);
      }
      
      // 转换为数组并排序
      const colorStats = Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
      
      resolve({ mappedPixelData: mappedData, colorStats });
    });
  },

  // ========== 转换为 result.js 兼容格式 ==========
  _convertToResultFormat(mappedPixelData, colorStats) {
    const gridSize = mappedPixelData.length;
    
    // 构建 colorId -> index 映射（按频率排序后的顺序）
    const colorIdToIndex = {};
    colorStats.forEach((c, idx) => {
      colorIdToIndex[c.id] = idx;
    });
    
    // 构建 colorPalette 数组（按 colorStats 顺序）
    const colorPalette = colorStats.map(c => ({
      id: c.id,
      name: c.name,
      r: c.r,
      g: c.g,
      b: c.b,
      count: c.count
    }));
    
    // 构建 gridData（每个格子存储颜色索引）
    const gridData = [];
    const rgbData = [];
    
    for (let y = 0; y < gridSize; y++) {
      const gridRow = [];
      const rgbRow = [];
      
      for (let x = 0; x < mappedPixelData[y].length; x++) {
        const cell = mappedPixelData[y][x];
        const colorIndex = colorIdToIndex[cell.id] || 0;
        
        gridRow.push(colorIndex);
        rgbRow.push([cell.r, cell.g, cell.b]);
      }
      
      gridData.push(gridRow);
      rgbData.push(rgbRow);
    }
    
    return { gridData, colorPalette, rgbData };
  },

  // RGB转Hex
  _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(x) {
      return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2);
    }).join('').toUpperCase();
  },

  // ========== 渲染预览图 ==========
  _renderPreview(mappedPixelData, gridSize) {
    return new Promise((resolve) => {
      const canvasWidth = 300;
      const cellSize = canvasWidth / gridSize;
      
      // 1. 渲染色号图
      const renderPattern = () => {
        return new Promise((resolvePattern) => {
          const patternCtx = wx.createCanvasContext('patternCanvas');
          
          // 绘制格子
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              const cell = mappedPixelData[y] && mappedPixelData[y][x];
              if (cell) {
                patternCtx.setFillStyle('rgb(' + cell.r + ',' + cell.g + ',' + cell.b + ')');
                patternCtx.fillRect(x * cellSize + 0.5, y * cellSize + 0.5, cellSize, cellSize);
              }
            }
          }
          
          // 绘制色号文字
          if (cellSize >= 7) {
            patternCtx.setTextAlign('center');
            patternCtx.setTextBaseline('middle');
            
            for (let y = 0; y < gridSize; y++) {
              for (let x = 0; x < gridSize; x++) {
                const cell = mappedPixelData[y] && mappedPixelData[y][x];
                if (cell) {
                  const lum = 0.299 * cell.r + 0.587 * cell.g + 0.114 * cell.b;
                  const textColor = lum > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
                  const text = cell.id.replace(/\D/g, '') || cell.id;
                  
                  patternCtx.setFontSize(Math.max(3, Math.floor(cellSize * 0.5)));
                  patternCtx.setFillStyle(textColor);
                  patternCtx.fillText(text, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
                }
              }
            }
          }
          
          let patternDone = false;
          const patternBackup = setTimeout(() => {
            if (!patternDone) { patternDone = true; resolvePattern(''); }
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
          const resultCtx = wx.createCanvasContext('resultCanvas');
          
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              const cell = mappedPixelData[y] && mappedPixelData[y][x];
              if (cell) {
                resultCtx.setFillStyle('rgb(' + cell.r + ',' + cell.g + ',' + cell.b + ')');
                resultCtx.fillRect(x * cellSize + 0.5, y * cellSize + 0.5, cellSize, cellSize);
              }
            }
          }
          
          let resultDone = false;
          const resultBackup = setTimeout(() => {
            if (!resultDone) { resultDone = true; resolveResult(''); }
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
      
      // 并行渲染
      Promise.all([renderPattern(), renderResult()])
        .then(([patternUrl, resultUrl]) => {
          // 重新计算颜色统计
          const colorStatsMap = {};
          for (let y = 0; y < mappedPixelData.length; y++) {
            for (let x = 0; x < mappedPixelData[y].length; x++) {
              const cell = mappedPixelData[y][x];
              const id = cell.id;
              if (!colorStatsMap[id]) {
                colorStatsMap[id] = { ...cell, count: 0 };
              }
              colorStatsMap[id].count++;
            }
          }
          const colorStats = Object.values(colorStatsMap).sort((a, b) => b.count - a.count);
          
          resolve({ 
            mappedPixelData, 
            colorStats, 
            patternUrl, 
            resultUrl 
          });
        });
    });
  },

  // ========== 文件上传（用于保存原图）==========
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
});
