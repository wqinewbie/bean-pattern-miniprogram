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
    // UI状态
    activeTab: 'result',
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
    renderedPatternUrl: '', // 渲染后的色号图URL
  },

  onLoad(options) {
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });

    const {
      taskId, originalUrl, resultUrl, patternUrl, colorStats,
      gridSize, brand, colorCount,
      boxId, historyId, sourceType,
      gridData, colorPalette
    } = options;

    // 解析新格式数据
    let parsedGridData = [];
    let parsedColorPalette = [];
    try {
      if (gridData) parsedGridData = JSON.parse(decodeURIComponent(gridData));
      if (colorPalette) parsedColorPalette = JSON.parse(decodeURIComponent(colorPalette));
    } catch (e) {}

    // 兼容旧格式
    let stats = [];
    try {
      if (colorStats) stats = JSON.parse(decodeURIComponent(colorStats));
    } catch (e) {}

    // 计算总豆数
    const totalBeads = parsedColorPalette.reduce((a, c) => a + (c.count || 0), 0) ||
                       stats.reduce((a, c) => a + (c.count || 0), 0);

    const size = gridSize ? parseInt(gridSize) : 64;
    const brandName = brand ? decodeURIComponent(brand) : 'MARD';
    const cnt = colorCount ? parseInt(colorCount) : (parsedColorPalette.length || stats.length || 0);
    const hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;

    this.setData({
      taskId: taskId || null,
      originalUrl: decodeURIComponent(originalUrl || ''),
      resultUrl: decodeURIComponent(resultUrl || ''),
      patternUrl: decodeURIComponent(patternUrl || ''),
      colorStats: stats,
      // 新参数
      boxId: boxId ? parseInt(boxId) : null,
      historyId: historyId ? parseInt(historyId) : null,
      sourceType: sourceType || '',
      // 核心数据
      gridSize: size,
      gridData: parsedGridData,
      colorPalette: parsedColorPalette,
      totalBeads,
      colorCount: cnt,
      hasPatternData,
      // UI
      activeTab: resultUrl ? 'result' : 'original',
      currentPreviewUrl: decodeURIComponent(resultUrl || '') || decodeURIComponent(originalUrl || ''),
      currentSize: size,
      brandName: brandName.toUpperCase(),
    });

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
      nextUrl = this.data.resultUrl;
    } else if (tab === 'pattern') {
      // 色号图模式，渲染 Canvas
      nextUrl = '';
      this.renderPatternCanvas();
    }
    this.setData({
      activeTab: tab,
      currentPreviewUrl: nextUrl
    });
  },

  // 渲染色号图 Canvas
  renderPatternCanvas() {
    const { gridData, colorPalette, gridSize, watermarkConfig } = this.data;

    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      return;
    }

    const canvasId = 'patternCanvas';
    const query = wx.createSelectorQuery();
    query.select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.error('Canvas 获取失败');
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio || 2;
        const canvasWidth = res[0].width;
        const canvasHeight = res[0].height;

        // 设置 Canvas 尺寸
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);

        // 计算每个格子的大小
        const cellSize = Math.min(
          Math.floor((canvasWidth - 40) / gridSize),
          Math.floor((canvasHeight - 40) / gridSize),
          40
        );
        const offsetX = (canvasWidth - cellSize * gridSize) / 2;
        const offsetY = (canvasHeight - cellSize * gridSize) / 2;

        // 建立颜色索引
        const colorIndexMap = {};
        colorPalette.forEach((color, index) => {
          colorIndexMap[color.index !== undefined ? color.index : index] = color;
        });

        // 绘制底色
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 绘制每个格子
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const colorIndex = gridData[y] ? gridData[y][x] : 0;
            const color = colorIndexMap[colorIndex];
            if (color) {
              ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
              ctx.fillRect(
                offsetX + x * cellSize,
                offsetY + y * cellSize,
                cellSize,
                cellSize
              );

              // 绘制色码文字（格子足够大时）
              if (cellSize >= 20) {
                const lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
                ctx.fillStyle = lum > 140 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)';
                ctx.font = `${Math.max(8, cellSize * 0.4)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                  color.id || '',
                  offsetX + x * cellSize + cellSize / 2,
                  offsetY + y * cellSize + cellSize / 2
                );
              }
            }
          }
        }

        // 绘制边框
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= gridSize; i++) {
          // 垂直线
          ctx.beginPath();
          ctx.moveTo(offsetX + i * cellSize, offsetY);
          ctx.lineTo(offsetX + i * cellSize, offsetY + gridSize * cellSize);
          ctx.stroke();
          // 水平线
          ctx.beginPath();
          ctx.moveTo(offsetX, offsetY + i * cellSize);
          ctx.lineTo(offsetX + gridSize * cellSize, offsetY + i * cellSize);
          ctx.stroke();
        }

        // 应用水印
        this.applyWatermark(ctx, canvasWidth, canvasHeight, watermarkConfig);
      });
  },

  // 应用水印
  applyWatermark(ctx, width, height, config) {
    if (!config || config.enabled !== 1) {
      return;
    }

    const text = config.text || '';
    const fontSize = config.fontSize || 24;
    const color = config.color || 'rgba(128,128,128,0.5)';
    const position = config.position || '右下';
    const opacity = config.opacity || 0.5;
    const margin = config.margin || 20;

    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    ctx.globalAlpha = opacity;

    if (position === '平铺') {
      // 平铺水印
      ctx.fillStyle = color;
      const spacingX = textWidth + 60;
      const spacingY = textHeight + 40;
      for (let y = 0; y < height + spacingY; y += spacingY) {
        for (let x = 0; x < width + spacingX; x += spacingX) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-Math.PI / 6);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    } else {
      // 单个水印
      ctx.fillStyle = color;
      ctx.textAlign = position === '右下' ? 'right' : 'left';
      ctx.fillText(text, position === '右下' ? width - margin : margin, height - margin);
    }

    ctx.globalAlpha = 1;
  },

  getCurrentUrl() {
    return this.data.currentPreviewUrl || '';
  },

  onPreviewImage() {
    const url = this.getCurrentUrl();
    if (!url) return;
    const urls = [this.data.originalUrl, this.data.resultUrl, this.data.renderedPatternUrl].filter(Boolean);
    wx.previewImage({ urls, current: url });
  },

  onSaveImage() {
    const { activeTab } = this.data;
    let url = '';
    let saveFunc = null;

    if (activeTab === 'pattern') {
      // 保存渲染的色号图
      this.savePatternCanvas();
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

  // 保存渲染的色号图
  savePatternCanvas() {
    this.setData({ saving: true });
    const canvasId = 'patternCanvas';
    wx.canvasToTempFilePath({
      canvasId,
      success: (res) => {
        this.setData({ renderedPatternUrl: res.tempFilePath });
        this.saveToAlbum(res.tempFilePath);
      },
      fail: (err) => {
        console.error('保存色号图失败', err);
        this.setData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
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
    const { gridData, colorPalette, currentSize, brandName, boxId, isSaved } = this.data;
    if (!isSaved || !boxId) {
      wx.showToast({ title: '请先保存到图纸箱', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/focus-mode/focus-mode?boxId=' + boxId +
        '&gridSize=' + currentSize +
        '&brand=' + encodeURIComponent(brandName)
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

    // 根据来源决定保存到哪
    if (historyId) {
      // 时光机已有，直接关联即可
      this.setData({ isSaved: true, showNameModal: false, patternNameInput: name });
      wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
      return;
    }

    // 保存到图纸箱
    request.post('/box/save', {
      name: name,
      sourceType: sourceType || 'LOCAL',
      brand: this.data.brandName,
      colorCount: this.data.colorCount,
      gridSize: this.data.gridSize,
      gridData: JSON.stringify(this.data.gridData),
      colorPalette: JSON.stringify(this.data.colorPalette),
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
    wx.showToast({ title: '#' + id + ' ' + name + '(' + count + '颗)', icon: 'none', duration: 2000 });
  },

  noop() {}
});
