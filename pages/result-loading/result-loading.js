const request = require('../../utils/request');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    navTop: 88,
    // 数据
    boxId: null,
    historyId: null,
    draftId: null,
    sourceType: '',
    sourceUrl: '',
    // 加载状态
    step: 1,
    progressText: '正在加载数据...',
    // 渲染结果
    gridData: [],
    colorPalette: [],
    rgbData: [],
    gridSize: 64,
    renderedPatternUrl: '',
    renderedResultUrl: '',
  },

  onLoad(options) {
    console.log('=== result-loading.js onLoad ===');
    console.log('options:', options);

    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });

    const { boxId, historyId, draftId } = options;
    this.setData({
      boxId: boxId ? parseInt(boxId) : null,
      historyId: historyId ? parseInt(historyId) : null,
      draftId: draftId ? parseInt(draftId) : null,
      sourceType: options.sourceType || 'BOX'
    });

    // 开始加载流程
    this.loadAndRender();
  },

  // 加载数据并预渲染
  async loadAndRender() {
    try {
      // 步骤1: 加载数据
      this.setData({ step: 1, progressText: '正在加载数据...' });
      const data = await this.loadData();

      if (!data) {
        console.error('加载数据为空');
        wx.showToast({ title: '加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      console.log('数据加载成功:', data);

      // 解析数据
      const parsedGridData = this.parseJSON(data.gridData);
      const parsedColorPalette = this.parseJSON(data.colorPalette);
      const parsedRgbData = this.parseJSON(data.rgbData);

      this.setData({
        sourceUrl: data.sourceUrl || '',
        gridData: parsedGridData,
        colorPalette: parsedColorPalette,
        rgbData: parsedRgbData,
        gridSize: data.gridSize || 64,
      });

      // 步骤2: 预渲染
      this.setData({ step: 2, progressText: '正在渲染图纸...' });
      await this.preRender();

      // 步骤3: 完成
      this.setData({ step: 3, progressText: '渲染完成！' });

      // 短暂显示完成状态，然后跳转到预览页
      setTimeout(() => {
        this.navigateToResult();
      }, 300);

    } catch (err) {
      console.error('加载失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 加载数据
  loadData() {
    const { boxId, historyId, draftId } = this.data;

    if (boxId) {
      return request.get('/box/detail/' + boxId);
    } else if (historyId) {
      return request.get('/history/detail/' + historyId);
    } else if (draftId) {
      return request.get('/draft/detail/' + draftId);
    }

    return Promise.resolve(null);
  },

  // 解析 JSON 数据
  parseJSON(str) {
    if (!str) return [];
    if (typeof str === 'object') return str;
    try {
      return JSON.parse(str);
    } catch (e) {
      console.error('JSON 解析失败:', e);
      return [];
    }
  },

  // 预渲染 Canvas
  preRender() {
    return new Promise((resolve) => {
      const { gridData, colorPalette, rgbData } = this.data;

      // 如果没有数据，直接完成
      if (!gridData.length || !colorPalette.length) {
        console.log('没有需要渲染的数据');
        resolve();
        return;
      }

      // 延迟确保 DOM 渲染完成
      setTimeout(() => {
        Promise.all([
          this.renderPattern(),
          rgbData.length > 0 ? this.renderResult() : Promise.resolve('')
        ]).then(([patternUrl, resultUrl]) => {
          console.log('渲染完成:', patternUrl ? '色号图OK' : '', resultUrl ? '效果图OK' : '');
          this.setData({
            renderedPatternUrl: patternUrl || '',
            renderedResultUrl: resultUrl || ''
          });
          resolve();
        }).catch((err) => {
          console.error('渲染出错:', err);
          resolve();
        });
      }, 200);
    });
  },

  // 渲染色号图
  renderPattern() {
    return new Promise((resolve) => {
      const { gridData, colorPalette, gridSize } = this.data;
      const canvasSize = 300;
      const cellSize = canvasSize / gridSize;

      try {
        const ctx = wx.createCanvasContext('patternCanvas');

        // 绘制格子
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const colorIndex = gridData[y] ? gridData[y][x] : 0;
            const color = colorPalette[colorIndex];
            if (color) {
              ctx.setFillStyle(`rgb(${color.r},${color.g},${color.b})`);
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
          }
        }

        // 绘制色号文字
        ctx.setTextAlign('center');
        ctx.setTextBaseline('middle');
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const colorIndex = gridData[y] ? gridData[y][x] : 0;
            const color = colorPalette[colorIndex];
            if (color) {
              const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
              const textColor = lum > 140 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
              const colorId = color.id || '';
              const text = colorId.replace(/\D/g, '') || colorId;
              const fontSize = Math.max(4, Math.floor(cellSize * 0.4));
              ctx.setFontSize(fontSize);
              ctx.setFillStyle(textColor);
              ctx.fillText(text, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
            }
          }
        }

        ctx.draw(false, () => {
          // 备用超时机制
          const timeout = setTimeout(() => {
            console.log('色号图渲染超时');
            resolve('');
          }, 2000);

          wx.canvasToTempFilePath({
            canvasId: 'patternCanvas',
            x: 0, y: 0,
            width: canvasSize, height: canvasSize,
            destWidth: canvasSize, destHeight: canvasSize,
            success: (res) => {
              clearTimeout(timeout);
              console.log('色号图生成成功');
              resolve(res.tempFilePath);
            },
            fail: (err) => {
              clearTimeout(timeout);
              console.error('色号图生成失败:', err);
              resolve('');
            }
          });
        });
      } catch (err) {
        console.error('渲染色号图异常:', err);
        resolve('');
      }
    });
  },

  // 渲染效果图
  renderResult() {
    return new Promise((resolve) => {
      const { gridData, colorPalette, gridSize } = this.data;
      const canvasSize = 300;
      const cellSize = canvasSize / gridSize;

      try {
        const ctx = wx.createCanvasContext('resultCanvas');

        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const colorIndex = gridData[y] ? gridData[y][x] : 0;
            const color = colorPalette[colorIndex];
            if (color) {
              ctx.setFillStyle(`rgb(${color.r},${color.g},${color.b})`);
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
          }
        }

        ctx.draw(false, () => {
          // 备用超时机制
          const timeout = setTimeout(() => {
            console.log('效果图渲染超时');
            resolve('');
          }, 2000);

          wx.canvasToTempFilePath({
            canvasId: 'resultCanvas',
            x: 0, y: 0,
            width: canvasSize, height: canvasSize,
            destWidth: canvasSize, destHeight: canvasSize,
            success: (res) => {
              clearTimeout(timeout);
              console.log('效果图生成成功');
              resolve(res.tempFilePath);
            },
            fail: (err) => {
              clearTimeout(timeout);
              console.error('效果图生成失败:', err);
              resolve('');
            }
          });
        });
      } catch (err) {
        console.error('渲染效果图异常:', err);
        resolve('');
      }
    });
  },

  // 跳转到预览页
  navigateToResult() {
    const { boxId, historyId, draftId, sourceUrl, colorPalette } = this.data;

    // 构建 URL 参数
    let url = '/pages/result/result?';

    if (boxId) {
      url += `boxId=${boxId}&sourceType=BOX`;
    } else if (historyId) {
      url += `historyId=${historyId}&sourceType=HISTORY`;
    } else if (draftId) {
      url += `draftId=${draftId}&sourceType=DRAFT`;
    }

    // 如果有预渲染的图片，传递给结果页
    if (this.data.renderedPatternUrl) {
      url += `&renderedPatternUrl=${encodeURIComponent(this.data.renderedPatternUrl)}`;
    }
    if (this.data.renderedResultUrl) {
      url += `&renderedResultUrl=${encodeURIComponent(this.data.renderedResultUrl)}`;
    }
    
    // 传递原图 URL（用于沉浸模式）
    if (sourceUrl) {
      url += `&originalUrl=${encodeURIComponent(sourceUrl)}`;
    }
    
    // 传递色盘数据（用于沉浸模式）
    if (colorPalette && colorPalette.length > 0) {
      url += `&colorStats=${encodeURIComponent(JSON.stringify(colorPalette))}`;
    }

    console.log('跳转到预览页:', url);
    wx.redirectTo({ url });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },
});
