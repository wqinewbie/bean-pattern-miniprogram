const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { drawPatternWithAxes } = require('../../utils/pattern-canvas');
const storage = require('../../utils/storage');
const { waitCanvas2dReady } = require('../../utils/canvas2d/controller');
const colorMatcher = require('../../utils/color-matcher');
const { patternBoardSize } = require('../../utils/canvas2d/size-strategies');
const { getWatermarkConfig } = require('../../utils/watermark-helper');
const { showCapacityFullIfNeeded, showRequestErrorToast } = require('../../utils/capacity-toast');

Page({
  data: {
    taskId: '',
    aiImageUrl: '',
    aiStyleTag: 'AI',
    originalImageUrl: '',
    displayOriginalUrl: '',
    resultImageUrl: '',
    colorNumberImageUrl: '',
    sizeMode: 'default',
    gridSize: 48,
    colorCount: 0,
    brand: 'MARD',
    mirror: false,
    mappedPixelData: null,
    colorList: [],
    gridData: [],
    colorPalette: [],
    totalBeads: 0,
    isGenerating: false,
    showNamingModal: false,
    patternName: '',

    statusBarHeight: 0,
    navBarHeight: 0,
    menuButtonInfo: null,

    activeImageTab: 0,

    mirroredAiImageUrl: '',

    isSaved: false,
    historyId: null,
    boxId: null,
    savingToAlbum: false,

    showCanvas: true,
  },

  onLoad(options) {
    this.initSystemInfo();

    const taskId = options.taskId || '';
    const historyId = options.historyId ? parseInt(options.historyId, 10) || null : null;
    const sizeMode = options.sizeMode || 'default';
    const brand = options.brand || 'MARD';
    const mirror = options.mirror === '1';
    const aiImageUrl = decodeURIComponent(options.aiImageUrl || '');
    const originalImageUrl = decodeURIComponent(options.originalImageUrl || '');
    const displayOriginalUrl = this.resolveDisplayOriginalUrl(originalImageUrl, aiImageUrl);

    const aiStyleTag = options.aiStyle ? decodeURIComponent(options.aiStyle) : 'AI';
    this.setData({ taskId, historyId, sizeMode, brand, mirror, aiImageUrl, originalImageUrl, displayOriginalUrl, aiStyleTag });

    // 1. 优先从 globalData 读取（generating 页面预加载）
    const resultToken = options.resultToken || '';
    if (resultToken && this.loadPreparedResult(resultToken, { taskId, historyId, aiImageUrl, originalImageUrl, sizeMode, brand, mirror })) {
      return;
    }

    // 2. 兜底：查询任务状态
    if (taskId) {
      this.loadFromTask(taskId);
    } else {
      wx.showToast({ title: '参数缺失', icon: 'none' });
      this.setData({ isGenerating: false });
    }
  },

  loadPreparedResult(resultToken, meta) {
    const app = getApp();
    const map = app && app.globalData ? (app.globalData.resultDataMap || {}) : {};
    const prepared = map[resultToken];

    if (!prepared || !prepared.mappedPixelData || !prepared.mappedPixelData.length) {
      return false;
    }

    this.setData({
      taskId: prepared.taskId || meta.taskId,
      historyId: prepared.historyId || meta.historyId || null,
      aiImageUrl: prepared.aiImageUrl || meta.aiImageUrl,
      aiStyleTag: prepared.aiStyle || prepared.style || meta.aiStyle || 'AI',
      originalImageUrl: prepared.originalImageUrl || meta.originalImageUrl || '',
      displayOriginalUrl: this.resolveDisplayOriginalUrl(prepared.originalImageUrl || meta.originalImageUrl, prepared.aiImageUrl || meta.aiImageUrl),
      sizeMode: prepared.sizeMode || meta.sizeMode,
      gridSize: prepared.gridSize || 48,
      brand: prepared.brand || meta.brand,
      colorCount: prepared.colorCount || 0,
      mirror: prepared.mirror !== undefined ? prepared.mirror : meta.mirror,
      isGenerating: true
    });

    this.renderFromMappedData(prepared.mappedPixelData, prepared.gridSize || 48);

    delete map[resultToken];
    return true;
  },

  async loadFromTask(taskId) {
    this.setData({ isGenerating: true });
    try {
      const data = await request.get(`/ai/task/${taskId}`);
      const taskData = data && data.data ? data.data : data;

      if (!taskData || taskData.status !== 'SUCCESS') {
        wx.showToast({ title: '任务未完成', icon: 'none' });
        this.setData({ isGenerating: false });
        return;
      }

      const mappedPixelData = taskData.mappedPixelData || [];
      const gridSize = Number(taskData.finalGridWidth || taskData.finalGridHeight || 48);
      const historyId = taskData.historyId || null;
      const aiImageUrl = taskData.aiImageUrl || '';
      const aiStyleTag = taskData.aiStyle || taskData.style || 'AI';
      const originalImageUrl = taskData.originalImageUrl || taskData.imageUrl || taskData.sourceUrl || taskData.inputImageUrl || '';

      this.setData({
        taskId,
        historyId,
        aiImageUrl,
        aiStyleTag,
        originalImageUrl,
        displayOriginalUrl: this.resolveDisplayOriginalUrl(originalImageUrl, aiImageUrl),
        sizeMode: taskData.sizeMode || 'default',
        gridSize,
        brand: taskData.brand || 'MARD',
        colorCount: taskData.colorCount || 0,
        mirror: !!(taskData.mirror),
      });

      if (mappedPixelData.length) {
        this.renderFromMappedData(mappedPixelData, gridSize);
      } else {
        wx.showToast({ title: '数据尚未就绪，请稍后重试', icon: 'none' });
        this.setData({ isGenerating: false });
      }
    } catch (err) {
      console.error('[ai-result] 加载任务失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ isGenerating: false });
    }
  },

  async renderFromMappedData(mappedPixelData, gridSize) {
    try {
      const colorList = colorMatcher.calcColorStats(mappedPixelData);
      const gridData = mappedPixelData.map(row => row.map(cell => cell.id));
      const colorPalette = colorList.map(s => ({ id: s.id, name: s.name, hex: s.hex, r: s.r, g: s.g, b: s.b }));
      const totalBeads = colorList.reduce((sum, item) => sum + (item.count || 0), 0);

      const { patternUrl, resultUrl } = await this._renderImages(mappedPixelData, gridData, colorPalette, gridSize);

      this.setData({
        mappedPixelData,
        colorList,
        colorPalette,
        gridData,
        totalBeads,
        colorCount: colorList.length,
        resultImageUrl: resultUrl,
        colorNumberImageUrl: patternUrl,
        isGenerating: false,
        showCanvas: false
      });

      this.ensureMirroredAiImageUrl();
    } catch (error) {
      console.error('[ai-result] 渲染失败:', error);
      wx.showToast({ title: '图片渲染失败', icon: 'none' });
      this.setData({ isGenerating: false });
    }
  },

  initSystemInfo() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = menuButtonInfo.bottom + 8;
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      navBarHeight: navBarHeight,
      menuButtonInfo: menuButtonInfo
    });
  },

  onImageTabChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ activeImageTab: index });
  },

  resolveDisplayOriginalUrl(originalImageUrl, aiImageUrl) {
    return originalImageUrl || '';
  },

  getDisplayOriginalUrl() {
    return this.resolveDisplayOriginalUrl(this.data.originalImageUrl, this.data.aiImageUrl);
  },

  getSourceUrlForExport() {
    const displayOriginalUrl = this.getDisplayOriginalUrl();
    return (this.data.mirror && this.data.mirroredAiImageUrl) ? this.data.mirroredAiImageUrl : displayOriginalUrl;
  },

  ensureMirroredAiImageUrl() {
    const displayOriginalUrl = this.getDisplayOriginalUrl();
    const { mirror } = this.data;
    if (!mirror || !displayOriginalUrl) return;
    if (this.data.mirroredAiImageUrl) return;

    if (/^https?:\/\//i.test(displayOriginalUrl)) {
      const mirrored = displayOriginalUrl + (displayOriginalUrl.includes('?') ? '&' : '?') + 'imageMogr2/flip/horizontal';
      this.setData({ mirroredAiImageUrl: mirrored });
    }
  },

  async _renderImages(mappedPixelData, gridData, colorPalette, gridSize) {
    const actualRows = mappedPixelData.length;
    const actualCols = mappedPixelData.length > 0 ? mappedPixelData[0].length : 0;
    const resultUrl = await this._exportResultImage(mappedPixelData, actualRows, actualCols);
    const patternUrl = await this._exportPatternImage(gridData, colorPalette, gridSize);
    return { patternUrl, resultUrl };
  },

  async _exportResultImage(mappedPixelData, actualRows, actualCols) {
    const canvasSize = 1024;

    return waitCanvas2dReady(this, 'resultCanvas2dComp', {
      label: 'result-export',
      maxCompRetry: 15,
      maxCtxRetry: 20
    }).then(({ comp, ctx }) => {
      const cellSize = canvasSize / Math.max(actualRows, actualCols);
      const drawWidth = actualCols * cellSize;
      const drawHeight = actualRows * cellSize;
      const offsetX = (canvasSize - drawWidth) / 2;
      const offsetY = (canvasSize - drawHeight) / 2;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let y = 0; y < actualRows; y++) {
        for (let x = 0; x < actualCols; x++) {
          const cell = mappedPixelData[y] && mappedPixelData[y][x];
          if (cell) {
            ctx.fillStyle = 'rgb(' + cell.r + ',' + cell.g + ',' + cell.b + ')';
            ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
          }
        }
      }

      return comp.exportTempFilePath({ width: canvasSize, height: canvasSize }).then((tempPath) => {
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        if (typeof comp.resizeSync === 'function') comp.resizeSync(1, 1);
        return tempPath;
      });
    }).catch((err) => {
      console.error('[ai-result] 效果图导出失败:', err);
      return '';
    });
  },

  async _exportPatternImage(gridData, colorPalette, gridSize) {
    return waitCanvas2dReady(this, 'patternCanvas2dComp', {
      label: 'pattern-export',
      maxCompRetry: 15,
      maxCtxRetry: 20
    }).then(async ({ comp, ctx }) => {
      const boardSize = patternBoardSize(gridSize, gridSize);
      const { appName, watermarkConfig } = await getWatermarkConfig();
      const drawOptions = { maxCanvasSize: 4096, appName, watermark: watermarkConfig };

      const layoutPreview = drawPatternWithAxes(ctx, gridData, colorPalette, gridSize, boardSize, drawOptions);

      if (typeof comp.resizeSync === 'function') {
        comp.resizeSync(layoutPreview.totalWidth, layoutPreview.totalHeight);
      }

      const context2 = comp.getContext();
      const drawCtx = context2 && context2.ctx ? context2.ctx : ctx;
      drawCtx.clearRect(0, 0, layoutPreview.totalWidth, layoutPreview.totalHeight);
      const layout = drawPatternWithAxes(drawCtx, gridData, colorPalette, gridSize, boardSize, drawOptions);

      return comp.exportTempFilePath({ width: layout.totalWidth, height: layout.totalHeight }).then((tempPath) => {
        drawCtx.clearRect(0, 0, layout.totalWidth, layout.totalHeight);
        if (typeof comp.resizeSync === 'function') comp.resizeSync(1, 1);
        return tempPath;
      });
    }).catch((err) => {
      console.error('[ai-result] 色号图导出失败:', err);
      return '';
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onPreviewImage() {
    const { mirroredAiImageUrl, mirror, resultImageUrl, colorNumberImageUrl, activeImageTab } = this.data;
    let imageUrl = '';
    if (activeImageTab === 0) {
      imageUrl = (mirror && mirroredAiImageUrl) ? mirroredAiImageUrl : this.getDisplayOriginalUrl();
    } else if (activeImageTab === 1) {
      imageUrl = resultImageUrl;
    } else {
      imageUrl = colorNumberImageUrl;
    }

    if (!imageUrl) {
      wx.showToast({ title: '暂无图片可预览', icon: 'none' });
      return;
    }

    wx.previewImage({ urls: [imageUrl], current: imageUrl });
  },

  onEnterEditMode() {
    const { mappedPixelData, gridData, colorPalette, gridSize, brand, colorCount, taskId, historyId, boxId, patternName } = this.data;

    if (!mappedPixelData || !mappedPixelData.length) {
      wx.showToast({ title: '暂无可编辑图纸', icon: 'none' });
      return;
    }

    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      wx.showToast({ title: '图纸数据不完整', icon: 'none' });
      return;
    }

    const storageKey = 'draw_edit_' + Date.now();
    storage.setJSON(storageKey, {
      gridSize,
      gridData,
      colorPalette,
      brand: brand || 'MARD',
      colorCount: colorCount || 0,
      editSourceType: boxId ? 'BOX' : 'AI',
      boxId: boxId || null,
      historyId: historyId || null,
      taskId: taskId || null,
      sourceUrl: this.getSourceUrlForExport(),
      name: patternName || ''
    });

    wx.navigateTo({
      url: '/pages/draw/draw?source=ai-result&storageKey=' + storageKey
    });
  },

  onEnterImmersive() {
    const { isSaved, boxId } = this.data;

    if (!isSaved || !boxId) {
      wx.showToast({ title: '请先保存到图纸箱', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: '/pages/focus-mode/focus-mode?boxId=' + (boxId || '')
    });
  },

  async onSaveToAlbum() {
    const { mirroredAiImageUrl, mirror, resultImageUrl, colorNumberImageUrl, activeImageTab, savingToAlbum } = this.data;
    if (savingToAlbum) return;
    let imageUrl = '';
    if (activeImageTab === 0) {
      imageUrl = (mirror && mirroredAiImageUrl) ? mirroredAiImageUrl : this.getDisplayOriginalUrl();
    } else if (activeImageTab === 1) {
      imageUrl = resultImageUrl;
    } else {
      imageUrl = colorNumberImageUrl;
    }
    if (!imageUrl) {
      wx.showToast({ title: '暂无图片可保存', icon: 'none' });
      return;
    }

    this.setData({ savingToAlbum: true });

    try {
      let filePath = imageUrl;
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const res = await new Promise((resolve, reject) => {
          wx.downloadFile({ url: imageUrl, success: resolve, fail: reject });
        });
        filePath = res.tempFilePath;
      }

      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
      });

      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      console.error('[保存相册失败]', err);
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          }
        });
      } else {
        wx.showToast({ title: '保存失败', icon: 'error' });
      }
    } finally {
      this.setData({ savingToAlbum: false });
    }
  },

  onSaveToBox() {
    this.setData({ showNamingModal: true });
  },

  onCloseModal() {
    this.setData({ showNamingModal: false, patternName: '' });
  },

  onModalContentTap() {
  },

  onNameInput(e) {
    this.setData({ patternName: e.detail.value });
  },

  async onConfirmSave() {
    const ok = await ensureProfileComplete();
    if (!ok) return;

    const finalName = this.data.patternName.trim() || 'AI作品-' + Date.now();
    const { taskId, aiImageUrl, resultImageUrl, colorNumberImageUrl, gridSize, brand, colorList, totalBeads, mappedPixelData, historyId, aiStyleTag } = this.data;
    const sourceUrl = this.getSourceUrlForExport();

    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const saveData = {
        name: finalName,
        taskId: taskId,
        sourceType: 'AI',
        sourceUrl,
        coverUrl: resultImageUrl || colorNumberImageUrl || aiImageUrl,
        gridSize: gridSize,
        brand: brand,
        colorCount: colorList.length,
        totalBeads: totalBeads,
        mappedPixelData: JSON.stringify(mappedPixelData),
        colorList: colorList,
        aiStyle: aiStyleTag && aiStyleTag !== 'AI' ? aiStyleTag : '',
        historyId: historyId || null
      };

      const res = await request.post('/box/save', saveData);

      wx.hideLoading();

      const newBoxId = res && res.id ? res.id : (res && res.boxId ? res.boxId : (res && res.box && res.box.id ? res.box.id : null));
      if (newBoxId) {
        this.setData({
          showNamingModal: false,
          patternName: '',
          isSaved: true,
          boxId: newBoxId
        });

        wx.showToast({ title: '已保存到图纸箱', icon: 'success', duration: 2000 });
        showCapacityFullIfNeeded(res, { type: 'box' });
      } else {
        throw new Error('保存失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[保存到图纸箱失败]', err);
      showRequestErrorToast(err, '保存失败');
    }
  },

  _showCapacityFullIfNeeded(result) {
    showCapacityFullIfNeeded(result, { type: 'box' });
  }
});
