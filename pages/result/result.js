const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    // 旧参数（兼容）
    taskId: null,
    originalUrl: '',
    resultUrl: '',
    patternUrl: '',
    colorStats: [],
    // 新参数
    boxId: null,
    historyId: null,
    sourceType: '', // BOX, HISTORY, LOCAL, AI, DRAW, EDIT
    // 核心数据
    gridSize: 64,
    gridData: [],
    colorPalette: [],
    totalBeads: 0,
    // 效果图数据
    rgbData: [],
    rgbWidth: 0,
    rgbHeight: 0,
    // UI状态
    activeTab: 'original',
    saving: false,
    isSaved: false,
    currentPreviewUrl: '',
    currentSize: 64,
    brandName: 'MARD',
    colorCount: 0,
    navTop: 88,
    showNameModal: false,
    patternNameInput: '',
    hasPatternData: false,
    // 水印配置
    watermarkConfig: null,
    renderedPatternUrl: '', // 预渲染的色号图URL
    renderedResultUrl: '', // 预渲染的效果图URL
    // 加载状态
    canvasReady: true, // 默认设为 true，加载完成后会更新
    hasRgbData: false,
    hasPatternData2: false,
    resultReady: false, // 效果图渲染完成
    patternReady: false, // 色号图渲染完成
    // 来源标签
    sourceTypeTag: '',
  },

  onLoad(options) {
    console.log('=== result.js onLoad ===');
    console.log('options:', options);
    
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });

    const {
      taskId, originalUrl, resultUrl, patternUrl, colorStats,
      gridSize, brand, colorCount,
      boxId, historyId, sourceType,
      gridData, colorPalette, rgbData,
      renderedPatternUrl, renderedResultUrl,  // 预渲染好的图片
      storageKey  // 从本地存储读取的 key
    } = options;

    // 如果有 boxId 或 historyId，调用接口获取完整数据
    if (boxId || historyId) {
      this.loadDataFromServer(boxId, historyId, options);
      return;
    }

    // 否则使用 URL 参数中的数据（生成页面跳转过来的情况）
    this.loadDataFromUrl(options);
  },

  // 从接口加载数据
  loadDataFromServer(boxId, historyId, options) {
    const sourceType = options.sourceType || (boxId ? 'BOX' : 'HISTORY');
    const apiUrl = boxId ? '/box/detail/' + boxId : '/history/detail/' + historyId;
    
    console.log('=== 从接口加载数据 ===', apiUrl);
    
    request.get(apiUrl)
      .then((data) => {
        console.log('接口返回数据:', data);
        if (!data) {
          wx.showToast({ title: '数据加载失败', icon: 'none' });
          return;
        }
        
        // 解析数据
        let parsedGridData = [];
        let parsedColorPalette = [];
        let parsedRgbData = [];
        
        try {
          if (data.gridData) {
            parsedGridData = typeof data.gridData === 'string' 
              ? JSON.parse(data.gridData) 
              : data.gridData;
          }
          if (data.colorPalette) {
            parsedColorPalette = typeof data.colorPalette === 'string' 
              ? JSON.parse(data.colorPalette) 
              : data.colorPalette;
          }
          if (data.rgbData) {
            parsedRgbData = typeof data.rgbData === 'string' 
              ? JSON.parse(data.rgbData) 
              : data.rgbData;
          }
        } catch (e) {
          console.error('解析数据失败:', e);
        }
        
        const gridSize = data.gridSize || 64;
        const hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
        const hasRgbData = parsedRgbData.length > 0;
        
        // 计算 rgb 尺寸
        let rgbWidth = 0, rgbHeight = 0;
        if (hasRgbData && parsedRgbData.length > 0) {
          if (Array.isArray(parsedRgbData[0]) && Array.isArray(parsedRgbData[0][0])) {
            rgbHeight = parsedRgbData.length;
            rgbWidth = parsedRgbData[0].length;
          }
        }
        
        // 计算总豆数
        const totalBeads = parsedColorPalette.reduce((a, c) => a + (c.count || 0), 0);
        
        // 确定默认显示的 tab
        let activeTab = 'original';
        if (hasRgbData) {
          activeTab = 'result';
        } else if (hasPatternData) {
          activeTab = 'pattern';
        }
        
        // 来源类型标签
        const sourceTypeMap = {
          'LOCAL': '📷 图片转图纸',
          'AI': '🤖 AI生成',
          'DRAW': '🎨 画板',
          'BOX': '📦 图纸箱',
          'HISTORY': '⏰ 时光机'
        };
        const sourceTypeTag = sourceTypeMap[sourceType] || sourceTypeMap['LOCAL'];
        
        this.setData({
          // ID
          boxId: boxId || null,
          historyId: historyId || null,
          // 数据
          gridSize: gridSize,
          gridData: parsedGridData,
          colorPalette: parsedColorPalette,
          rgbData: parsedRgbData,
          rgbWidth: rgbWidth,
          rgbHeight: rgbHeight,
          // 元信息
          brandName: (data.brand || 'MARD').toUpperCase(),
          colorCount: data.colorCount || parsedColorPalette.length,
          totalBeads: totalBeads,
          name: data.name,
          // 图片
          originalUrl: data.sourceUrl || '',
          currentPreviewUrl: data.sourceUrl || '',
          // 状态
          activeTab: activeTab,
          currentSize: gridSize,
          hasPatternData: hasPatternData,
          hasPatternData2: hasPatternData,
          hasRgbData: hasRgbData,
          // 渲染状态（Canvas 模式）- 先设置为 true，如果需要渲染再改为 false
          canvasReady: !hasRgbData && !hasPatternData,
          renderedPatternUrl: '',
          renderedResultUrl: '',
          // 来源
          sourceType: sourceType,
          sourceTypeTag: sourceTypeTag,
        });
        
        // 如果有数据需要渲染，先设为 false，渲染完成后再设为 true
        if (hasRgbData || hasPatternData) {
          this.setData({ canvasReady: false });
          // 初始化渲染计数器
          this._pendingRenderCount = (hasRgbData ? 1 : 0) + (hasPatternData ? 1 : 0);
          // 10秒超时
          this._renderTimeout = setTimeout(() => {
            if (this._pendingRenderCount > 0) {
              console.log('渲染超时，强制显示');
              this._pendingRenderCount = 0;
              this.setData({ canvasReady: true });
              wx.hideLoading();
            }
          }, 10000);
          // 延迟触发渲染
          setTimeout(() => {
            if (hasRgbData) this.renderResultCanvas();
            if (hasPatternData) this.renderPatternCanvas();
          }, 100);
        } else {
          // 无需渲染，直接隐藏加载
          wx.hideLoading();
        }
      })
      .catch((err) => {
        console.error('加载数据失败:', err);
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 从 URL 参数加载数据（生成页面跳转过来的情况）
  loadDataFromUrl(options) {
    const {
      taskId, originalUrl, resultUrl, patternUrl, colorStats,
      gridSize, brand, colorCount,
      boxId, historyId, sourceType,
      gridData, colorPalette, rgbData,
      renderedPatternUrl, renderedResultUrl,
      storageKey
    } = options;

    console.log('原始参数:');
    console.log('  gridData:', gridData ? '存在' : '空');
    console.log('  colorPalette:', colorPalette ? '存在' : '空');
    console.log('  storageKey:', storageKey);

    // 优先从本地存储读取数据
    let parsedGridData = [];
    let parsedColorPalette = [];
    let parsedRgbData = [];
    let rgbWidth = 0;
    let rgbHeight = 0;
    let storedOriginalUrl = '';
    let storedBrand = '';
    let storedHistoryId = null;
    let storedRenderedPatternUrl = '';
    let storedRenderedResultUrl = '';
    
    if (storageKey) {
      try {
        const storedData = wx.getStorageSync(storageKey);
        if (storedData) {
          console.log('=== 从本地存储读取数据 ===');
          parsedGridData = storedData.gridData || [];
          parsedColorPalette = storedData.colorPalette || [];
          parsedRgbData = storedData.rgbData || [];
          storedOriginalUrl = storedData.originalUrl || '';
          storedBrand = storedData.brand || '';
          storedHistoryId = storedData.historyId;
          storedRenderedPatternUrl = storedData.renderedPatternUrl || '';
          storedRenderedResultUrl = storedData.renderedResultUrl || '';
          console.log('storedRenderedPatternUrl:', storedRenderedPatternUrl);
          console.log('storedRenderedResultUrl:', storedRenderedResultUrl);
          // 清理存储
          wx.removeStorageSync(storageKey);
        }
      } catch (e) {
        console.error('读取存储数据失败:', e);
      }
    }
    
    // 如果本地存储没有数据，解析 URL 参数
    if (parsedGridData.length === 0 && gridData) {
      try {
        console.log('=== 从 URL 参数解析数据 ===');
        console.log('gridData 原值:', gridData ? gridData.substring(0, 200) + '...' : '空');
        if (gridData) parsedGridData = JSON.parse(decodeURIComponent(gridData));
        console.log('parsedGridData 长度:', parsedGridData.length);
        if (colorPalette) parsedColorPalette = JSON.parse(decodeURIComponent(colorPalette));
        console.log('parsedColorPalette 长度:', parsedColorPalette.length);
        if (rgbData) {
          parsedRgbData = JSON.parse(decodeURIComponent(rgbData));
          console.log('parsedRgbData 长度:', parsedRgbData.length);
        }
      } catch (e) { console.error('解析错误:', e); }
    }
    
    // 计算 rgb 尺寸
    if (parsedRgbData.length > 0) {
      if (Array.isArray(parsedRgbData[0]) && Array.isArray(parsedRgbData[0][0]) && Array.isArray(parsedRgbData[0][0][0])) {
        rgbHeight = parsedRgbData.length;
        rgbWidth = parsedRgbData[0].length;
      } else if (Array.isArray(parsedRgbData[0])) {
        rgbWidth = parsedGridData.length > 0 ? parsedGridData[0].length : 0;
        rgbHeight = parsedGridData.length;
      }
    }
    
    console.log('parsedGridData:', parsedGridData.length, 'parsedColorPalette:', parsedColorPalette.length);

    // 兼容旧格式
    let stats = [];
    try {
      if (colorStats) stats = JSON.parse(decodeURIComponent(colorStats));
    } catch (e) {}

    // 计算总豆数
    const totalBeads = parsedColorPalette.reduce((a, c) => a + (c.count || 0), 0) ||
                       stats.reduce((a, c) => a + (c.count || 0), 0);

    const size = gridSize ? parseInt(gridSize) : (parsedGridData.length || 64);
    const brandName = (storedBrand || (brand ? decodeURIComponent(brand) : 'MARD')).toUpperCase();
    const cnt = colorCount ? parseInt(colorCount) : (parsedColorPalette.length || stats.length || 0);
    const hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
    const effectiveHistoryId = storedHistoryId || (historyId ? parseInt(historyId) : null);
    const effectiveOriginalUrl = storedOriginalUrl || decodeURIComponent(originalUrl || '');
    const effectiveRenderedPatternUrl = storedRenderedPatternUrl || decodeURIComponent(renderedPatternUrl || '');
    const effectiveRenderedResultUrl = storedRenderedResultUrl || decodeURIComponent(renderedResultUrl || '');
    const effectiveSourceUrl = decodeURIComponent(options.sourceUrl || storedOriginalUrl || '');

    // 计算来源类型标签
    const sourceTypeMap = {
      'LOCAL': '📷 图片转图纸',
      'AI': '🤖 AI生成',
      'DRAW': '🎨 画板',
      'BOX': '📦 图纸箱',
      'HISTORY': '⏰ 时光机'
    };
    const sourceTypeTag = effectiveHistoryId ? sourceTypeMap['HISTORY'] : 
                          (effectiveSourceUrl ? sourceTypeMap[sourceType] || sourceTypeMap['LOCAL'] : '');
    const effectiveSourceType = effectiveHistoryId ? 'HISTORY' : (sourceType || 'LOCAL');

    // 确定默认显示的tab
    let activeTab = 'original';
    let currentPreviewUrl = effectiveOriginalUrl;
    const hasRgbData = parsedRgbData.length > 0;
    if (hasRgbData) {
      // 有效果图数据，优先显示效果图
      activeTab = 'result';
      currentPreviewUrl = '';
    } else if (hasPatternData) {
      // 有色号图数据，显示色号图
      activeTab = 'pattern';
      currentPreviewUrl = '';
    } else if (resultUrl) {
      activeTab = 'result';
      currentPreviewUrl = decodeURIComponent(resultUrl);
    }

    this.setData({
      taskId: taskId || null,
      originalUrl: effectiveOriginalUrl,
      resultUrl: decodeURIComponent(resultUrl || ''),
      patternUrl: decodeURIComponent(patternUrl || ''),
      colorStats: stats,
      // 新参数
      boxId: boxId ? parseInt(boxId) : null,
      historyId: effectiveHistoryId,
      sourceType: sourceType || '',
      // 核心数据
      gridSize: size,
      gridData: parsedGridData,
      colorPalette: parsedColorPalette,
      totalBeads,
      colorCount: cnt,
      hasPatternData,
      // 效果图数据
      rgbData: parsedRgbData,
      rgbWidth,
      rgbHeight,
      // UI
      activeTab,
      currentPreviewUrl,
      currentSize: size,
      brandName: brandName,
      sourceType: effectiveSourceType,
      sourceTypeTag: sourceTypeTag,
      // 加载状态
      hasRgbData,
      hasPatternData2: hasPatternData,
      // 如果有预渲染图片，直接设为 true（不需要等待渲染）
      canvasReady: !!(effectiveRenderedPatternUrl || effectiveRenderedResultUrl),
      // 预渲染的图片
      renderedPatternUrl: effectiveRenderedPatternUrl,
      renderedResultUrl: effectiveRenderedResultUrl,
    });

    // 如果有预渲染图片，不需要再渲染，直接使用
    if (effectiveRenderedPatternUrl || effectiveRenderedResultUrl) {
      console.log('=== 使用预渲染图片 ===');
      console.log('renderedPatternUrl:', effectiveRenderedPatternUrl);
      console.log('renderedResultUrl:', effectiveRenderedResultUrl);
      // 如果效果图的预渲染图片也传了，需要更新 resultUrl
      if (effectiveRenderedResultUrl) {
        this.setData({ resultUrl: effectiveRenderedResultUrl });
      }
      return; // 跳过渲染逻辑
    }

    // 检查是否已在图纸箱
    if (boxId) {
      this.setData({ isSaved: true });
    }

    // 加载水印配置
    this.loadWatermarkConfig();
  },

  // 加载水印配置
  async loadWatermarkConfig() {
    try {
      const config = await request.get('/watermark/config');
      this.setData({ watermarkConfig: config });
    } catch (e) {
      console.error('加载水印配置失败', e);
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    let nextUrl = '';
    
    if (tab === 'original') {
      nextUrl = this.data.originalUrl;
    } else if (tab === 'result') {
      if (this.data.rgbData && this.data.rgbData.length > 0) {
        nextUrl = '';
      } else {
        nextUrl = this.data.resultUrl;
      }
    } else if (tab === 'pattern') {
      nextUrl = '';
    }
    
    this.setData({
      activeTab: tab,
      currentPreviewUrl: nextUrl
    });
  },

  // 渲染色号图 Canvas（使用传统 API）
  renderPatternCanvas() {
    const { gridData, colorPalette, gridSize } = this.data;

    console.log('=== renderPatternCanvas 开始 ===');

    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      console.log('数据为空');
      return;
    }

    // 获取容器尺寸
    const query = wx.createSelectorQuery();
    query.select('.preview-wrap').boundingClientRect((rect) => {
      if (!rect) {
        console.log('容器尺寸获取失败');
        return;
      }
      
      const canvasSize = rect.width;
      console.log('容器尺寸:', canvasSize);

      const ctx = wx.createCanvasContext('patternCanvas');

      // 每个格子填满整个 Canvas
      const cellSize = canvasSize / gridSize;
      const offsetX = 0;
      const offsetY = 0;

      console.log('cellSize:', cellSize);

      // 绘制每个格子
      let drawnCount = 0;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const row = gridData[y];
          const colorIndex = row ? row[x] : 0;
          const color = colorPalette[colorIndex];
          
          if (color) {
            ctx.setFillStyle(`rgb(${color.r},${color.g},${color.b})`);
            ctx.fillRect(
              offsetX + x * cellSize,
              offsetY + y * cellSize,
              cellSize + 0.5,
              cellSize + 0.5
            );
            drawnCount++;
          } else {
            ctx.setFillStyle('#cccccc');
            ctx.fillRect(
              offsetX + x * cellSize,
              offsetY + y * cellSize,
              cellSize + 0.5,
              cellSize + 0.5
            );
          }
        }
      }
      
      console.log('绘制完成: drawnCount=', drawnCount);
      
      // 绘制色号文字（小格子也要显示）
      ctx.setTextAlign('center');
      ctx.setTextBaseline('middle');
      
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const row = gridData[y];
          const colorIndex = row ? row[x] : 0;
          const color = colorPalette[colorIndex];
          if (color) {
            const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
            const textColor = lum > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
            
            // 提取色码中的数字部分用于显示
            const colorId = color.id || '';
            const text = colorId.replace(/\D/g, '') || colorId;
            
            // 计算字体大小：格子越小字体相对越大
            let fontSize = Math.max(3, Math.floor(cellSize * 0.5));
            
            // 测量文字宽度
            ctx.setFontSize(fontSize);
            let textWidth = ctx.measureText(text).width;
            if (!textWidth) textWidth = fontSize * text.length * 0.6;
            
            // 如果文字超出格子，继续缩小
            while (textWidth > cellSize * 0.9 && fontSize > 3) {
              fontSize--;
              ctx.setFontSize(fontSize);
              textWidth = ctx.measureText(text).width;
              if (!textWidth) textWidth = fontSize * text.length * 0.6;
            }
            
            ctx.setFontSize(fontSize);
            ctx.setFillStyle(textColor);
            ctx.fillText(text, offsetX + x * cellSize + cellSize / 2, offsetY + y * cellSize + cellSize / 2);
          }
        }
      }
      console.log('色号文字绘制完成');
      
      console.log('色号图渲染完成');
      // 使用 setTimeout 备用机制：1秒后强制触发回调
      const backupTimeout = setTimeout(() => {
        console.log('色号图渲染回调备用触发');
        this.onCanvasRendered('pattern');
      }, 1000);
      
      ctx.draw(false, () => {
        clearTimeout(backupTimeout); // 清除备用定时器
        this.onCanvasRendered('pattern');
      });
    }).exec();
  },

  // 渲染效果图 Canvas（使用传统 API）
  renderResultCanvas() {
    const { rgbData, rgbWidth, rgbHeight, gridData, colorPalette, gridSize } = this.data;

    console.log('=== renderResultCanvas 开始 ===');

    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      console.log('gridData 或 colorPalette 为空，跳过渲染');
      return;
    }

    // 获取容器尺寸
    const query = wx.createSelectorQuery();
    query.select('.preview-wrap').boundingClientRect((rect) => {
      if (!rect) {
        console.log('容器尺寸获取失败');
        return;
      }
      
      const canvasSize = rect.width;
      console.log('容器尺寸:', canvasSize);

      const ctx = wx.createCanvasContext('resultCanvas');
      const cellSize = canvasSize / gridSize;

      console.log('cellSize:', cellSize);

      // 绘制每个格子
      let drawnCount = 0;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const colorIndex = gridData[y] ? gridData[y][x] : 0;
          const color = colorPalette[colorIndex];
          
          if (color) {
            ctx.setFillStyle(`rgb(${color.r},${color.g},${color.b})`);
            ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
            drawnCount++;
          }
        }
      }
      
      console.log('效果图绘制完成:', drawnCount);
      // 使用 setTimeout 备用机制：1秒后强制触发回调
      const backupTimeout = setTimeout(() => {
        console.log('效果图渲染回调备用触发');
        this.onCanvasRendered('result');
      }, 1000);
      
      ctx.draw(false, () => {
        clearTimeout(backupTimeout); // 清除备用定时器
        this.onCanvasRendered('result');
      });
    }).exec();
  },

  // canvas 渲染完成回调
  onCanvasRendered(type) {
    console.log('Canvas 渲染完成:', type);
    
    // 减少待完成的渲染数量
    if (this._pendingRenderCount > 0) {
      this._pendingRenderCount--;
    }
    
    // 所有渲染都完成（或超时），显示内容
    if (this._pendingRenderCount <= 0) {
      // 清除超时定时器
      if (this._renderTimeout) {
        clearTimeout(this._renderTimeout);
        this._renderTimeout = null;
      }
      this.setData({ canvasReady: true });
      wx.hideLoading();
    }
  },

  // 应用水印（兼容传统 Canvas API）
  applyWatermark(ctx, width, height, config) {
    if (!config || config.enabled !== 1) {
      return;
    }

    const text = config.text || '';
    const fontSize = config.fontSize || 16;
    const color = config.color || 'rgba(128,128,128,0.5)';
    const position = config.position || '右下';
    const margin = config.margin || 10;

    ctx.setFontSize(fontSize);
    ctx.setFillStyle(color);
    ctx.setTextAlign(position === '右下' ? 'right' : 'left');
    ctx.setTextBaseline('bottom');
    
    ctx.fillText(text, position === '右下' ? width - margin : margin, height - margin);
  },

  getCurrentUrl() {
    return this.data.currentPreviewUrl || '';
  },

  onPreviewImage() {
    const { activeTab, rgbData, renderedPatternUrl, renderedResultUrl } = this.data;
    let urls = [this.data.originalUrl, this.data.resultUrl].filter(Boolean);

    // 添加渲染后的图片
    if (renderedPatternUrl) {
      urls.push(renderedPatternUrl);
    }
    if (renderedResultUrl) {
      urls.push(renderedResultUrl);
    }

    let current = '';
    if (activeTab === 'pattern' && renderedPatternUrl) {
      current = renderedPatternUrl;
    } else {
      current = this.getCurrentUrl();
    }

    if (!current) return;
    wx.previewImage({ urls, current });
  },

  onSaveImage() {
    const { activeTab, rgbData } = this.data;
    let url = '';

    if (activeTab === 'pattern') {
      // 保存渲染的色号图
      this.savePatternCanvas();
      return;
    }

    if (activeTab === 'result' && rgbData && rgbData.length > 0) {
      // 保存渲染的效果图
      this.saveResultCanvas();
      return;
    }

    url = this.getCurrentUrl();
    if (!url) { wx.showToast({ title: '暂无图片', icon: 'none' }); return; }
    this.setData({ saving: true });
    if (url.startsWith('http')) {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200) this.saveToAlbum(res.tempFilePath);
          else { this.setData({ saving: false }); wx.showToast({ title: '下载失败', icon: 'error' }); }
        },
        fail: () => { this.setData({ saving: false }); wx.showToast({ title: '下载失败', icon: 'error' }); }
      });
    } else {
      this.saveToAlbum(url);
    }
  },

  // 保存渲染的色号图（使用高分辨率渲染）
  savePatternCanvas() {
    this.setData({ saving: true });
    const { gridData, colorPalette, gridSize } = this.data;
    
    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      this.setData({ saving: false });
      wx.showToast({ title: '暂无色号图', icon: 'none' });
      return;
    }
    
    // 高分辨率：64x64 -> 1920x1920 (30倍)，可看清色号文字
    const highResSize = Math.min(gridSize * 30, 2048);
    console.log('保存分辨率:', highResSize, 'x', highResSize);
    const tempCanvasId = 'tempSaveCanvas';
    
    const ctx = wx.createCanvasContext(tempCanvasId);
    
    // 计算格子尺寸
    const cellSize = highResSize / gridSize;
    console.log('格子尺寸:', cellSize);
    
    // 绘制背景
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, highResSize, highResSize);
    
    // 绘制每个格子
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
    
    // 绘制色号文字（小格子也显示）
    ctx.setTextAlign('center');
    ctx.setTextBaseline('middle');
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const colorIndex = gridData[y] ? gridData[y][x] : 0;
        const color = colorPalette[colorIndex];
        if (color) {
          const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
          const textColor = lum > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
          
          // 提取色码中的数字部分用于显示
          const colorId = color.id || '';
          const text = colorId.replace(/\D/g, '') || colorId;
          
          // 计算字体大小
          let fontSize = Math.max(4, Math.floor(cellSize * 0.5));
          
          // 测量文字宽度
          ctx.setFontSize(fontSize);
          let textWidth = ctx.measureText(text).width;
          if (!textWidth) textWidth = fontSize * text.length * 0.6;
          
          // 如果文字超出格子，缩小
          while (textWidth > cellSize * 0.9 && fontSize > 4) {
            fontSize--;
            ctx.setFontSize(fontSize);
            textWidth = ctx.measureText(text).width;
            if (!textWidth) textWidth = fontSize * text.length * 0.6;
          }
          
          ctx.setFontSize(fontSize);
          ctx.setFillStyle(textColor);
          ctx.fillText(text, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }
    }
    
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: tempCanvasId,
        x: 0,
        y: 0,
        width: highResSize,
        height: highResSize,
        destWidth: highResSize,
        destHeight: highResSize,
        success: (res) => {
          console.log('保存成功:', res.tempFilePath);
          this.setData({ renderedPatternUrl: res.tempFilePath });
          this.saveToAlbum(res.tempFilePath);
        },
        fail: (err) => {
          console.error('保存色号图失败', err);
          this.setData({ saving: false });
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      });
    });
  },

  // 保存渲染的效果图（使用高分辨率渲染）
  saveResultCanvas() {
    this.setData({ saving: true });
    const { rgbData, rgbWidth, rgbHeight, gridData, colorPalette, gridSize } = this.data;
    
    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      this.setData({ saving: false });
      wx.showToast({ title: '暂无效果图', icon: 'none' });
      return;
    }
    
    // 创建临时的高分辨率 Canvas
    const highResSize = gridSize * 10;
    const tempCanvasId = 'tempSaveCanvas';
    
    const ctx = wx.createCanvasContext(tempCanvasId);
    
    // 计算格子尺寸
    const cellSize = highResSize / gridSize;
    
    // 绘制每个格子（使用与色号图相同的颜色）
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
      wx.canvasToTempFilePath({
        canvasId: tempCanvasId,
        x: 0,
        y: 0,
        width: highResSize,
        height: highResSize,
        destWidth: highResSize,
        destHeight: highResSize,
        success: (res) => {
          this.setData({ renderedPatternUrl: res.tempFilePath });
          this.saveToAlbum(res.tempFilePath);
        },
        fail: (err) => {
          console.error('保存效果图失败', err);
          this.setData({ saving: false });
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      });
    });
  },

  saveToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => { this.setData({ saving: false }); wx.showToast({ title: '已保存到相册', icon: 'success' }); },
      fail: (err) => {
        this.setData({ saving: false });
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          wx.showModal({ title: '需要授权', content: '请在设置中允许访问相册', confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); } });
        } else {
          wx.showToast({ title: '保存失败', icon: 'error' });
        }
      }
    });
  },

  onEnterFocusMode() {
    const { boxId, isSaved } = this.data;
    if (!isSaved || !boxId) {
      wx.showToast({ title: '请先保存到图纸箱', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/focus-mode/focus-mode?boxId=' + boxId
    });
  },

  onSaveToMyPatterns() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const { isSaved, boxId, historyId, sourceType } = this.data;

      if (isSaved || boxId) {
        wx.showToast({ title: '已保存到图纸箱', icon: 'none' });
        return;
      }

      this.setData({ showNameModal: true, patternNameInput: '' });
    });
  },

  onNameInput(e) {
    this.setData({ patternNameInput: e.detail.value || '' });
  },

  onCloseNameModal() {
    this.setData({ showNameModal: false });
  },

  onConfirmSavePattern() {
    const { patternNameInput, historyId, sourceType } = this.data;
    const name = (patternNameInput || '').trim() || ('图纸#' + Date.now());

    // 保存到图纸箱（可能关联到已有的历史记录）
    request.post('/box/save', {
      name: name,
      sourceType: sourceType || 'LOCAL',
      brand: this.data.brandName,
      colorCount: this.data.colorCount,
      gridSize: this.data.gridSize,
      gridData: JSON.stringify(this.data.gridData),
      colorPalette: JSON.stringify(this.data.colorPalette),
      rgbData: JSON.stringify(this.data.rgbData || []),
      historyId: historyId || null,
    })
      .then((box) => {
        this.setData({
          isSaved: true,
          showNameModal: false,
          patternNameInput: name,
          boxId: box.id
        });
        wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
      })
      .catch(() => {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      });
  },

  onSaveToHistory() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const { gridData, colorPalette, gridSize, brandName, colorCount, isSaved, boxId } = this.data;
      
      // 判断是否在图纸箱
      if (!isSaved || !boxId) {
        wx.showModal({
          title: '提示',
          content: '请先保存到图纸箱，再保存到时光机',
          showCancel: false,
          confirmText: '我知道了'
        });
        return;
      }
      
      request.post('/history/save', {
        sourceType: 'LOCAL',
        brand: brandName,
        colorCount: colorCount,
        gridSize: gridSize,
        gridData: JSON.stringify(gridData),
        colorPalette: JSON.stringify(colorPalette),
        boxId: boxId,
      })
        .then(() => {
          wx.showToast({ title: '已保存到时光机', icon: 'success' });
        })
        .catch(() => {
          wx.showToast({ title: '保存失败', icon: 'none' });
        });
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onColorTap(e) {
    const { name, id, count } = e.currentTarget.dataset;
    const message = name ? '#' + id + ' ' + name : '#' + id;
    wx.showToast({ title: message + ' (' + count + '颗)', icon: 'none', duration: 2000 });
  },

  onUnload() {
    // 清除渲染超时定时器，防止内存泄漏
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout);
      this._renderTimeout = null;
    }
    if (this._resultRenderTimeout) {
      clearTimeout(this._resultRenderTimeout);
      this._resultRenderTimeout = null;
    }
    if (this._patternRenderTimeout) {
      clearTimeout(this._patternRenderTimeout);
      this._patternRenderTimeout = null;
    }
  },

  noop() {}
});
