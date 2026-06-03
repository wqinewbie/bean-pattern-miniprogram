const request = require('../../utils/request');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { drawPatternWithAxes } = require('../../utils/pattern-canvas');
const storage = require('../../utils/storage');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { generatePatternName } = require('../../utils/name-helper');
const { renderResult } = require('../../utils/canvas2d/renderers/resultRenderer');
const { waitCanvas2dReady } = require('../../utils/canvas2d/controller');
const { previewSize, resultExportSize, patternExportSize } = require('../../utils/canvas2d/size-strategies');
const { showCapacityFullIfNeeded, showRequestErrorToast } = require('../../utils/capacity-toast');
const { getWatermarkConfig } = require('../../utils/watermark-helper');

Page({
  data: {
    sourceType: 'BOX',
    boxId: null,
    historyId: null,
    draftId: null,
    isSaved: false,
    showNameModal: false,
    patternNameInput: '',
    savingToBox: false,
    navTop: 88,
    loading: true,
    isHydrated: false,
    initialLoading: true,
    activeTab: 'result',
    originalUrl: '',
    currentPreviewUrl: '',
    name: '',
    currentSize: 64,
    brandName: 'MARD',
    colorCount: 0,
    mappedPixelData: [],
    gridData: [],
    colorPalette: [],
    totalBeads: 0,
    hasPatternData: false,
    hasResultData: false,
    resultRendered: false,
    patternRendered: false,
    renderedPatternUrl: '',
    renderedResultUrl: '',
    canvas2dReadyMap: {},
    savingToAlbum: false,
    isFromBox: true,
    canEnterFocusMode: true,
    // 水印配置
    watermarkConfig: null,
    appName: '',
    isVip: false,
    canCustomizeWatermark: false,
    isAiStyle: false,
    mirrorOn: false,
    mirroredOriginalUrl: '',
  },

  onLoad(options) {
    this.loadWatermarkConfig();
    const layout = getSafeAreaLayout();
    const boxId = options.boxId ? String(options.boxId) : '';
    const historyId = options.historyId ? String(options.historyId) : '';
    const draftId = options.draftId ? String(options.draftId) : '';
    const isAi = options.isAi === '1' || options.isAi === 'true';
    let sourceType = (options.sourceType || '').toUpperCase();
    if (!sourceType) {
      if (boxId) sourceType = 'BOX';
      else if (historyId) sourceType = 'HISTORY';
      else if (draftId) sourceType = 'DRAFT';
      else sourceType = 'BOX';
    }
    const mirrorOn = options.mirror === '1' || options.mirror === 'true';
    const isFromBox = sourceType === 'BOX';
    this.setData({ navTop: layout.navTop, boxId: boxId || null, historyId: historyId || null, draftId: draftId || null, sourceType, isFromBox, canEnterFocusMode: isFromBox, isAiStyle: isAi, mirrorOn });
    const id = boxId || historyId || draftId;
    if (!id) {
      wx.showToast({ title: '图纸不存在', icon: 'none' });
      this.setData({ loading: false, isHydrated: true, initialLoading: false });
      return;
    }
    this.loadDetail(sourceType, id);
  },
  async loadWatermarkConfig() {
    try {
      const { appName, watermarkConfig } = await getWatermarkConfig();
      
      this.setData({ 
        watermarkConfig: watermarkConfig,
        appName: appName,
        isVip: watermarkConfig.isVip || false,
        canCustomizeWatermark: watermarkConfig.canCustomize || false
      });
      
      console.log('[preview] 水印和小程序名称配置加载成功', {
        watermarkEnabled: watermarkConfig && watermarkConfig.enabled,
        watermarkText: watermarkConfig && watermarkConfig.text,
        watermarkColor: watermarkConfig && watermarkConfig.color,
        appName: appName,
        isVip: watermarkConfig && watermarkConfig.isVip
      });
    } catch (e) {
      console.error('[preview] 加载水印配置失败', e);
      // 使用默认配置
      this.setData({
        watermarkConfig: {
          enabled: 1,
          text: '拼豆魔法屋出品',
          fontSize: 24,
          color: 'rgba(100,100,100,0.25)',
          angle: -30,
          spacingXRatio: 0.22,
          spacingYRatio: 0.18,
          opacity: 0.25
        },
        appName: '拼豆魔法屋',
        isVip: false,
        canCustomizeWatermark: false
      });
    }
  },


  loadDetail(sourceType, id) {
    this.setData({ loading: true, isHydrated: false });
    const apiMap = { BOX: '/box/detail/', HISTORY: '/history/detail/', DRAFT: '/draft/detail/' };
    const apiUrl = (apiMap[sourceType] || '/box/detail/') + encodeURIComponent(id);
    request.get(apiUrl).then((data) => {
      if (!data) {
        wx.showToast({ title: '图纸不存在', icon: 'none' });
        this.setData({ loading: false, isHydrated: true, initialLoading: false });
        return;
      }
      let parsedMappedPixelData = [];
      try {
        if (data.mappedPixelData) parsedMappedPixelData = typeof data.mappedPixelData === 'string' ? JSON.parse(data.mappedPixelData) : data.mappedPixelData;
      } catch (e) { parsedMappedPixelData = []; }
      let parsedGridData = [], parsedColorPalette = [];
      if (parsedMappedPixelData.length) {
        const derived = this._deriveLegacyFromMapped(parsedMappedPixelData);
        parsedGridData = derived.gridData;
        parsedColorPalette = derived.colorPalette;
      }
      const hasPatternData = parsedGridData.length > 0 && parsedColorPalette.length > 0;
      const recordSourceType = String(data.sourceType || data.source || data.type || '').toUpperCase();
      const isAiStyle = recordSourceType.includes('AI');
      const originalUrl = (sourceType === 'DRAFT') ? '' : (data.sourceUrl || data.coverUrl || '');
      const totalBeads = parsedColorPalette.reduce((sum, c) => sum + (c.count || 0), 0);
      const renderedPatternUrl = data.renderedPatternUrl || '';
      const returnedBoxId = data.boxId ? String(data.boxId) : (this.data.boxId || null);
      const returnedDraftId = data.draftId ? String(data.draftId) : (this.data.draftId || null);
      const isSaved = sourceType === 'BOX' || (sourceType !== 'BOX' && !!returnedBoxId);
      const canEnterFocusMode = sourceType === 'BOX' || isSaved;
      let activeTab = 'pattern';
      if (sourceType === 'DRAFT' || isAiStyle) activeTab = hasPatternData ? 'result' : 'pattern';
      else { if (hasPatternData) activeTab = 'result'; else if (originalUrl) activeTab = 'original'; }
      this.setData({ name: data.name || '', originalUrl, currentPreviewUrl: originalUrl, currentSize: data.gridSize || 64, brandName: (data.brand || 'MARD').toUpperCase(), colorCount: data.colorCount || parsedColorPalette.length, mappedPixelData: parsedMappedPixelData, gridData: parsedGridData, colorPalette: parsedColorPalette, totalBeads, hasPatternData, hasResultData: hasPatternData, renderedPatternUrl, patternRendered: !!renderedPatternUrl, activeTab, boxId: returnedBoxId, draftId: returnedDraftId, isSaved, canEnterFocusMode, loading: false, isHydrated: true, initialLoading: hasPatternData ? true : false, isAiStyle }, () => { if (hasPatternData && !renderedPatternUrl) setTimeout(() => this._generatePatternPreview2d(), 200); this.ensureMirroredOriginalUrl(); });
    }).catch((err) => {
      const message = (err && err.message) ? err.message : '加载失败';
      wx.showToast({ title: message.length > 8 ? '加载失败' : message, icon: 'none' });
      this.setData({ loading: false, isHydrated: true, initialLoading: false });
    });
  },

  onCanvas2dReady(e) {
    const compId = e.currentTarget.id;
    const canvasId = e.detail.canvasId;
    console.log('[preview][canvas2d] ready', { compId, canvasId, activeTab: this.data.activeTab, hasResultData: this.data.hasResultData, resultRendered: this.data.resultRendered });
    if (compId === 'resultExport2dComp' || compId === 'patternExport2dComp') {
      this.setData({ [`canvas2dReadyMap.${compId}`]: true });
      return;
    }
    this.setData({ [`canvas2dReadyMap.${compId}`]: true });
    if (compId === 'resultCanvas2dComp' && this.data.hasResultData && !this.data.resultRendered) this._renderResultCanvas2d();
    else if (compId === 'patternCanvas2dComp' && this.data.hasPatternData && !this.data.patternRendered) this._renderPatternCanvas2d();
  },

  onCanvas2dError(e) { console.error('[preview][canvas2d] error', e.detail); },


  onBack() { wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/profile' }) }); },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'original') {
      const url = (this.data.mirrorOn && this.data.mirroredOriginalUrl) || this.data.originalUrl || '';
      this.setData({ activeTab: tab, currentPreviewUrl: url });
    } else {
      this.setData({ activeTab: tab, currentPreviewUrl: '' });
    }
    if (tab === 'result' && this.data.hasResultData && !this.data.resultRendered && !this.data.renderedResultUrl) this._renderResultCanvas2d();
    else if (tab === 'pattern' && this.data.hasPatternData && !this.data.patternRendered && !this.data.renderedPatternUrl) this._renderPatternCanvas2d();
  },

  onPreviewImage() {
    const { activeTab, currentPreviewUrl, renderedPatternUrl, renderedResultUrl, originalUrl, mirrorOn, mirroredOriginalUrl } = this.data;
    if (activeTab === 'original') { const url = (mirrorOn && mirroredOriginalUrl) || currentPreviewUrl || originalUrl; if (!url) return; wx.previewImage({ urls: [url], current: url }); }
    else if (activeTab === 'result' && renderedResultUrl) wx.previewImage({ urls: [renderedResultUrl], current: renderedResultUrl });
    else if (activeTab === 'pattern' && renderedPatternUrl) wx.previewImage({ urls: [renderedPatternUrl], current: renderedPatternUrl });
  },

  ensureMirroredOriginalUrl() {
    const { originalUrl, mirrorOn } = this.data;
    if (!mirrorOn || !originalUrl) return;
    if (this.data.mirroredOriginalUrl) return;

    if (/^https?:\/\//i.test(originalUrl)) {
      const mirrored = originalUrl + (originalUrl.includes('?') ? '&' : '?') + 'imageMogr2/flop';
      this.setData({ mirroredOriginalUrl: mirrored });
      if (this.data.activeTab === 'original') {
        this.setData({ currentPreviewUrl: mirrored });
      }
    }
  },

  _renderResultCanvas2d() {
    const { gridData, colorPalette } = this.data;
    console.log('[preview] _renderResultCanvas2d start', { gridDataLength: gridData.length, colorPaletteLength: colorPalette.length });
    if (!gridData.length || !colorPalette.length) { console.warn('[preview] _renderResultCanvas2d skip: no data'); return; }
    waitCanvas2dReady(this, 'resultCanvas2dComp', { timeout: 5000 }).then(({ comp, ctx, canvas }) => {
      const rect = { width: 1024, height: 1024 };
      const canvasSize = previewSize(rect.width);
      comp.resizeSync(canvasSize, canvasSize);
      renderResult(ctx, { gridData, colorPalette, gridSize: gridData.length }, { width: canvasSize, height: canvasSize });
      this.setData({ resultRendered: true, initialLoading: false });
      console.log('[preview] _renderResultCanvas2d success');
      return comp.exportTempFilePath({ x: 0, y: 0, width: canvasSize, height: canvasSize });
    }).then((tempFilePath) => {
      if (tempFilePath) { this.setData({ renderedResultUrl: tempFilePath }); console.log('[preview] result preview image generated'); }
    }).catch((err) => { console.error('[preview] _renderResultCanvas2d failed', err); this.setData({ initialLoading: false }); });
  },

  _renderPatternCanvas2d() {
    const { gridData, colorPalette, currentSize } = this.data;
    if (!gridData.length || !colorPalette.length) return;
    console.log('[preview] _renderPatternCanvas2d start');
    waitCanvas2dReady(this, 'patternCanvas2dComp', { timeout: 5000 }).then(({ comp, ctx, canvas }) => {
      const rect = { width: 1024, height: 1024 };
      const canvasSize = previewSize(rect.width);
      comp.resizeSync(canvasSize, canvasSize);
      renderResult(ctx, { gridData, colorPalette, gridSize: gridData.length }, { width: canvasSize, height: canvasSize });
      this.setData({ patternRendered: true });
      console.log('[preview] _renderPatternCanvas2d success');
    }).catch((err) => { console.error('[preview] _renderPatternCanvas2d failed', err); });
  },

  _generatePatternPreview2d() {
    if (this._patternPreviewGenerating || this.data.renderedPatternUrl) return;
    const { gridData, colorPalette, currentSize } = this.data;
    if (!gridData.length || !colorPalette.length) return;
    console.log('[preview] _generatePatternPreview2d start');
    this._patternPreviewGenerating = true;
    waitCanvas2dReady(this, 'patternExport2dComp', { timeout: 5000 }).then(async ({ comp, ctx, canvas }) => {
      const boardSize = patternExportSize(currentSize);
      const latestWatermark = await getWatermarkConfig();
      const appName = latestWatermark.appName || this.data.appName || '';
      const watermarkConfig = latestWatermark.watermarkConfig || this.data.watermarkConfig || null;
      this.setData({ appName, watermarkConfig });
      const drawOptions = {
        maxCanvasSize: 4096,
        appName: appName || '',
        watermark: watermarkConfig || null
      };
      const layoutPreview = drawPatternWithAxes(ctx, gridData, colorPalette, currentSize, boardSize, drawOptions);
      comp.resizeSync(layoutPreview.totalWidth, layoutPreview.totalHeight);
      const layout = drawPatternWithAxes(ctx, gridData, colorPalette, currentSize, boardSize, drawOptions);
      return comp.exportTempFilePath({ x: 0, y: 0, width: layout.totalWidth, height: layout.totalHeight });
    }).then((tempFilePath) => {
      if (tempFilePath) { this.setData({ renderedPatternUrl: tempFilePath }); console.log('[preview] pattern preview generated'); }
      this._patternPreviewGenerating = false;
    }).catch((err) => { console.error('[preview] _generatePatternPreview2d failed', err); this._patternPreviewGenerating = false; });
  },

  onSaveToMyPatterns() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const { isSaved, boxId } = this.data;
      if (isSaved || boxId) { wx.showToast({ title: '已保存到图纸箱', icon: 'none' }); return; }
      this.setData({ showNameModal: true, patternNameInput: '' });
    });
  },

  onNameInput(e) { this.setData({ patternNameInput: e.detail.value || '' }); },
  onCloseNameModal() { this.setData({ showNameModal: false }); },

  onConfirmSavePattern() {
    const { patternNameInput, historyId, draftId, sourceType, mappedPixelData, currentSize, brandName, colorCount, originalUrl } = this.data;
    if (this.data.savingToBox) return;
    const name = (patternNameInput || '').trim() || generatePatternName();
    this.setData({ savingToBox: true });
    const saveRequest = sourceType === 'DRAFT' && draftId
      ? request.post('/draft/to-box', { draftId: Number(draftId), name })
      : request.post('/box/save', { name, sourceType: sourceType || 'LOCAL', brand: brandName, colorCount, gridSize: currentSize, mappedPixelData: JSON.stringify(mappedPixelData), historyId: historyId || null, draftId: draftId || null, sourceUrl: originalUrl || '' });
    saveRequest.then((box) => {
      const newBoxId = box && box.id ? String(box.id) : (box && box.boxId ? String(box.boxId) : (box && box.box && box.box.id ? String(box.box.id) : null));
      this.setData({ isSaved: true, boxId: newBoxId, canEnterFocusMode: true, showNameModal: false, savingToBox: false });
      wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
      showCapacityFullIfNeeded(box, { type: 'box' });
      const pages = getCurrentPages();
      const prevPage = pages.length > 1 ? pages[pages.length - 2] : null;
      if (prevPage) prevPage._needsRefresh = true;
    }).catch((err) => { this.setData({ savingToBox: false }); showRequestErrorToast(err, '保存失败，请重试'); });
  },

  _showCapacityFullIfNeeded(result) {
    showCapacityFullIfNeeded(result, { type: 'box' });
  },

  onEnterFocusMode() {
    const { boxId, canEnterFocusMode, colorPalette, renderedPatternUrl } = this.data;
    if (!canEnterFocusMode || !boxId) { wx.showToast({ title: '请先保存到图纸箱', icon: 'none' }); return; }
    let url = '/pages/focus-mode/focus-mode?boxId=' + boxId;
    if (renderedPatternUrl) url += '&patternUrl=' + encodeURIComponent(renderedPatternUrl);
    if (colorPalette && colorPalette.length > 0) url += '&colorStats=' + encodeURIComponent(JSON.stringify(colorPalette));
    wx.navigateTo({ url });
  },

  handleToggleEditMode() {
    const { mappedPixelData, gridData, colorPalette, currentSize, brandName, colorCount, sourceType, draftId, boxId, name } = this.data;
    if (!mappedPixelData || !mappedPixelData.length) { wx.showToast({ title: '暂无可编辑图纸', icon: 'none' }); return; }

    // 确保 gridData 和 colorPalette 存在
    if (!gridData || !gridData.length || !colorPalette || !colorPalette.length) {
      wx.showToast({ title: '图纸数据不完整', icon: 'none' });
      return;
    }

    const storageKey = 'draw_edit_' + Date.now();
    storage.setJSON(storageKey, {
      gridSize: currentSize,
      gridData,
      colorPalette,
      brand: brandName || 'MARD',
      colorCount: colorCount || 0,
      editSourceType: sourceType,
      draftId: draftId || null,
      boxId: boxId || null,
      name: name || ''
    });
    wx.navigateTo({ url: '/pages/draw/draw?source=preview&storageKey=' + storageKey });
  },

  onSaveImage() {
    if (this.data.savingToAlbum) return;
    const { activeTab, renderedPatternUrl, renderedResultUrl, originalUrl, currentPreviewUrl, mirrorOn, mirroredOriginalUrl } = this.data;
    if (activeTab === 'pattern') { if (renderedPatternUrl) { this.setData({ savingToAlbum: true }); this._saveToAlbum(renderedPatternUrl); } else this._exportPatternWith2d(); return; }
    if (activeTab === 'result') { if (renderedResultUrl) { this.setData({ savingToAlbum: true }); this._saveToAlbum(renderedResultUrl); } else this._exportResultWith2d(); return; }
    const url = (mirrorOn && mirroredOriginalUrl) || currentPreviewUrl || originalUrl;
    if (!url) { wx.showToast({ title: '暂无图片', icon: 'none' }); return; }
    this.setData({ savingToAlbum: true });
    if (url.startsWith('http')) wx.downloadFile({ url, success: (res) => { if (res.statusCode === 200) this._saveToAlbum(res.tempFilePath); else { this.setData({ savingToAlbum: false }); wx.showToast({ title: '下载失败', icon: 'error' }); } }, fail: () => { this.setData({ savingToAlbum: false }); wx.showToast({ title: '下载失败', icon: 'error' }); } });
    else this._saveToAlbum(url);
  },

  _exportResultWith2d() {
    this.setData({ savingToAlbum: true });
    const { gridData, colorPalette, currentSize } = this.data;
    if (!gridData.length || !colorPalette.length) { this.setData({ savingToAlbum: false }); wx.showToast({ title: '暂无效果图', icon: 'none' }); return; }
    console.log('[preview] _exportResultWith2d start');
    waitCanvas2dReady(this, 'resultExport2dComp', { timeout: 5000 }).then(({ comp, ctx, canvas }) => {
      const exportSize = resultExportSize(currentSize);
      comp.resizeSync(exportSize, exportSize);
      renderResult(ctx, { gridData, colorPalette, gridSize: gridData.length }, { width: exportSize, height: exportSize });
      return comp.exportTempFilePath({ x: 0, y: 0, width: exportSize, height: exportSize });
    }).then((tempFilePath) => {
      if (tempFilePath) { this.setData({ renderedResultUrl: tempFilePath }); this._saveToAlbum(tempFilePath); } else throw new Error('导出失败');
    }).catch((err) => { console.error('[preview] _exportResultWith2d failed', err); this.setData({ savingToAlbum: false }); wx.showToast({ title: '保存失败', icon: 'none' }); });
  },

  _exportPatternWith2d() {
    this.setData({ savingToAlbum: true });
    const { gridData, colorPalette, currentSize } = this.data;
    if (!gridData.length || !colorPalette.length) { this.setData({ savingToAlbum: false }); wx.showToast({ title: '暂无色号图', icon: 'none' }); return; }
    console.log('[preview] _exportPatternWith2d start');
    waitCanvas2dReady(this, 'patternExport2dComp', { timeout: 5000 }).then(async ({ comp, ctx, canvas }) => {
      const boardSize = patternExportSize(currentSize);
      const latestWatermark = await getWatermarkConfig();
      const appName = latestWatermark.appName || this.data.appName || '';
      const watermarkConfig = latestWatermark.watermarkConfig || this.data.watermarkConfig || null;
      this.setData({ appName, watermarkConfig });
      const drawOptions = {
        maxCanvasSize: 4096,
        appName: appName || '',
        watermark: watermarkConfig || null
      };
      const layoutPreview = drawPatternWithAxes(ctx, gridData, colorPalette, currentSize, boardSize, drawOptions);
      comp.resizeSync(layoutPreview.totalWidth, layoutPreview.totalHeight);
      const layout = drawPatternWithAxes(ctx, gridData, colorPalette, currentSize, boardSize, drawOptions);
      return comp.exportTempFilePath({ x: 0, y: 0, width: layout.totalWidth, height: layout.totalHeight });
    }).then((tempFilePath) => {
      if (tempFilePath) { this.setData({ renderedPatternUrl: tempFilePath }); this._saveToAlbum(tempFilePath); } else throw new Error('导出失败');
    }).catch((err) => { console.error('[preview] _exportPatternWith2d failed', err); this.setData({ savingToAlbum: false }); wx.showToast({ title: '保存失败', icon: 'none' }); });
  },

  _saveToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({ filePath, success: () => { this.setData({ savingToAlbum: false }); wx.showToast({ title: '已保存到相册', icon: 'success' }); }, fail: (err) => { this.setData({ savingToAlbum: false }); if (err.errMsg && err.errMsg.includes('auth deny')) wx.showModal({ title: '需要授权', content: '请在设置中允许访问相册', confirmText: '去设置', success: (r) => { if (r.confirm) wx.openSetting(); } }); else wx.showToast({ title: '保存失败', icon: 'error' }); } });
  },

  noop() {},

  _deriveLegacyFromMapped(mappedPixelData) {
    const stats = new Map(), order = [];
    (mappedPixelData || []).forEach((row) => { (row || []).forEach((cell) => { if (!cell || cell.isExternal) return; const key = String(cell.id || '') + '|' + String(cell.hex || ''); if (!stats.has(key)) { stats.set(key, { id: cell.id || '', name: cell.name || '', r: Number(cell.r), g: Number(cell.g), b: Number(cell.b), count: 0 }); order.push(key); } stats.get(key).count++; }); });
    const colorPalette = order.map((k, i) => ({ index: i, ...stats.get(k) }));
    const indexMap = new Map(order.map((k, i) => [k, i]));
    const gridData = (mappedPixelData || []).map((row) => (row || []).map((cell) => { if (!cell || cell.isExternal) return -1; const key = String(cell.id || '') + '|' + String(cell.hex || ''); return indexMap.has(key) ? indexMap.get(key) : -1; }));
    return { gridData, colorPalette };
  },
});















