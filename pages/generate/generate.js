const { API_BASE_URL } = require('../../utils/config');
const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const previewGesture = require('../../mixins/preview-gesture');
const { init2dCanvas, resize2dCanvas } = require('../../utils/canvas2d/core');
const { exportCanvasToTempFilePath } = require('../../utils/canvas2d/export');

const MIN_GRID_SIZE = 24;
const MAX_GRID_SIZE = 200;
const SIZE_LIMIT_TIP = '超出限值，数值范围24~200';

Page({
  data: {
    imageUrl: '',
    loading: false,
    loadingText: '处理中...',
    resultReady: false,
    resultUrl: '',
    patternUrl: '',
    colorStats: [],
    activeTab: 'result',
    mirrorOn: false,
    customMode: false,
    customConfirmed: false,
    customSizeVal: '',
    showColorSheet: false,
    brandList: [],
    brandIndex: 0,
    colorCountLabel: '全部色号',
    colorCountValue: 0,
    colorCountOptions: [{ value: 0, label: '全部色号' }],
    gridSizeIndex: 3,
    gridSizeOptions: [
      { value: 24, label: '24×24' },
      { value: 50, label: '50×50' },
      { value: 52, label: '52×52' },
      { value: 64, label: '64×64' },
      { value: 78, label: '78×78' },
      { value: 104, label: '104×104' }
    ],
    pixelationMode: 'average',
    // 相似度阈值，对齐 perler-beads-ai-main 默认值
    similarityThreshold: 30,
    showModeSheet: false,
    showSizeSheet: false,
    showBrandSheet: false,
    previewX: 0,
    previewY: 0,
    previewScale: 1,
    previewBaseW: 0,
    previewBaseH: 0,
    previewLeft: 0,
    previewTop: 0,
    previewBoxPx: 0,
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onLoad(options) {
    if (options && options.imageUrl) {
      const url = decodeURIComponent(options.imageUrl);
      this.setData({ imageUrl: url });
      this.initPreviewMetrics(url);
    }
    this.loadBrandsFromServer();
  },

  loadBrandsFromServer() {
    request.get('/bead/brands').then((data) => {
      if (!data || typeof data !== 'object') throw new Error('empty brands');
      const brandNames = Object.keys(data);
      if (!brandNames.length) throw new Error('empty brands');

      const brandRows = brandNames.map((name) => ({ id: name, name }));
      const firstBrand = brandRows[0];
      const kits = data[firstBrand.name] || [];
      const colorCountOptions = [
        { value: 0, label: '全部色号' },
        ...(kits || []).map(k => ({ value: k, label: k + '色' }))
      ];

      this.setData({
        brandList: brandRows,
        brandIndex: 0,
        colorCountOptions,
        colorCountLabel: '全部色号',
        colorCountValue: 0,
        _brandKitsMap: data
      });
    }).catch(() => {
      this.setData({
        brandList: [{ id: 'mard', name: 'MARD' }],
        brandIndex: 0,
        colorCountOptions: [
          { value: 0, label: '全部色号' },
          { value: 24, label: '24色' }, { value: 48, label: '48色' },
          { value: 72, label: '72色' }, { value: 96, label: '96色' }
        ],
        colorCountLabel: '全部色号',
        colorCountValue: 0,
        _brandKitsMap: { mard: [24, 48, 72, 96] }
      });
    });
  },

  onBrandChange(e) {
    this.applyBrandIndex(parseInt(e.detail.value));
  },

  onShowBrandSheet() {
    this.setData({ showBrandSheet: true });
  },

  onHideBrandSheet() {
    this.setData({ showBrandSheet: false });
  },

  onSelectBrand(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.applyBrandIndex(index, true);
  },

  applyBrandIndex(idx, closeSheet = false) {
    const brandRow = this.data.brandList[idx];
    const brandKey = brandRow && (brandRow.name || brandRow.id) ? String(brandRow.name || brandRow.id) : '';
    const kitsMap = this.data._brandKitsMap || {};
    const kits = kitsMap[brandKey] || [];

    const colorCountOptions = [
      { value: 0, label: '全部色号' },
      ...(kits || []).map(k => ({ value: k, label: k + '色' }))
    ];
    this.setData({
      brandIndex: idx,
      colorCountOptions,
      colorCountLabel: '全部色号',
      colorCountValue: 0,
      showBrandSheet: closeSheet ? false : this.data.showBrandSheet
    });
  },

  onGridSizeChange(e) {
    const index = e.detail !== undefined ? parseInt(e.detail.value) : parseInt(e.currentTarget.dataset.index);
    this.setData({ gridSizeIndex: index, customMode: false, customConfirmed: false, customSizeVal: '' });
  },

  onShowSizeSheet() {
    this.setData({ showSizeSheet: true });
  },

  onHideSizeSheet() {
    this.setData({ showSizeSheet: false });
  },

  onSelectGridSize(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      gridSizeIndex: index,
      customMode: false,
      customConfirmed: false,
      customSizeVal: '',
      showSizeSheet: false
    });
  },

  onMirrorToggle() {
    this.setData({ mirrorOn: !this.data.mirrorOn });
  },

  onCustomMode() {
    if (this.data.customMode) {
      let val = parseInt(this.data.customSizeVal, 10);
      if (!this._applyCustomSize(val)) return;
    } else if (this.data.customConfirmed) {
      this.setData({ customMode: false, customConfirmed: false, customSizeVal: '' });
    } else {
      this.setData({ customMode: true, customSizeVal: '' });
    }
  },

  onEditCustom() {
    this.setData({ customMode: true, customConfirmed: true });
  },

  onCustomSizeInput(e) {
    this.setData({ customSizeVal: e.detail.value, customMode: true, customConfirmed: true });
  },

  onCustomSizeBlur() {
    let val = parseInt(this.data.customSizeVal, 10);
    if (isNaN(val)) {
      this.setData({ customMode: false, customConfirmed: false, customSizeVal: '' });
      return;
    }
    this._applyCustomSize(val);
  },

  _applyCustomSize(value) {
    if (isNaN(value)) {
      this.setData({ customMode: false, customConfirmed: false, customSizeVal: '' });
      return false;
    }
    if (value < MIN_GRID_SIZE || value > MAX_GRID_SIZE) {
      wx.showToast({ title: SIZE_LIMIT_TIP, icon: 'none' });
      const clamped = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, value));
      this.setData({ customSizeVal: String(clamped), customMode: false, customConfirmed: true });
      return false;
    }
    this.setData({ customSizeVal: String(value), customMode: false, customConfirmed: true });
    return true;
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const imageUrl = res.tempFiles[0].tempFilePath;
        this.setData({
          imageUrl,
          resultReady: false,
          resultUrl: '',
          patternUrl: '',
          colorStats: [],
          previewX: 0,
          previewY: 0,
          previewScale: 1
        });
        this.initPreviewMetrics(imageUrl);
      }
    });
  },

  initPreviewMetrics(imagePath) {
    if (!imagePath) return;
    wx.getImageInfo({
      src: imagePath,
      success: (info) => {
        this._getPreviewViewportSize().then((previewBoxPx) => {
          const ratio = info.width / info.height;
          let baseW = previewBoxPx;
          let baseH = previewBoxPx;
          if (ratio >= 1) {
            baseW = previewBoxPx;
            baseH = previewBoxPx / ratio;
          } else {
            baseH = previewBoxPx;
            baseW = previewBoxPx * ratio;
          }
          this.setData({
            previewBaseW: baseW,
            previewBaseH: baseH,
            previewLeft: (previewBoxPx - baseW) / 2,
            previewTop: (previewBoxPx - baseH) / 2,
            previewBoxPx,
            previewX: 0,
            previewY: 0,
            previewScale: 1
          });
        });
      }
    });
  },

  _getPreviewViewportSize() {
    return new Promise((resolve) => {
      const fallback = () => {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
        resolve(Math.round((windowInfo.windowWidth || 375) * 624 / 750));
      };

      try {
        const query = wx.createSelectorQuery();
        query.select('.preview-interact').boundingClientRect((rect) => {
          const width = rect && Number(rect.width);
          const height = rect && Number(rect.height);
          const size = Math.min(width || 0, height || 0);
          if (Number.isFinite(size) && size > 0) {
            resolve(size);
          } else {
            fallback();
          }
        }).exec();
      } catch (e) {
        fallback();
      }
    });
  },

  applyPreviewTransform(nextX, nextY, nextScale) {
    const box = this.data.previewBoxPx || 0;
    const baseW = this.data.previewBaseW || 0;
    const baseH = this.data.previewBaseH || 0;
    if (!box || !baseW || !baseH) return;

    let scale = nextScale;
    if (scale < 0.5) scale = 0.5;
    if (scale > 5) scale = 5;

    const scaledW = baseW * scale;
    const scaledH = baseH * scale;

    let x = nextX;
    let y = nextY;

    const maxX = scaledW > box ? (scaledW - box) / 2 : (box + scaledW) / 2;
    if (x > maxX) x = maxX;
    if (x < -maxX) x = -maxX;

    const maxY = scaledH > box ? (scaledH - box) / 2 : (box + scaledH) / 2;
    if (y > maxY) y = maxY;
    if (y < -maxY) y = -maxY;

    this.setData({ previewX: x, previewY: y, previewScale: scale });
  },

  onShowColorSheet() {
    this.setData({ showColorSheet: true });
  },

  onHideColorSheet() {
    this.setData({ showColorSheet: false });
  },

  onSelectColorCount(e) {
    const { label, value } = e.currentTarget.dataset;
    this.setData({ colorCountLabel: label, colorCountValue: parseInt(value), showColorSheet: false });
  },

  onAlgoChange(e) {
    this.setData({ algoIndex: parseInt(e.detail.value) });
  },

  onSimilarityThresholdChange(e) {
    this.setData({ similarityThreshold: parseInt(e.detail.value) || 0 });
  },

  onPreviewMove(e) {
    if (!e || !e.detail) return;
    const x = typeof e.detail.x === 'number' ? e.detail.x : this.data.previewX;
    const y = typeof e.detail.y === 'number' ? e.detail.y : this.data.previewY;
    if (x !== this.data.previewX || y !== this.data.previewY) {
      this.setData({ previewX: x, previewY: y });
    }
  },

  onPreviewTouchStart(e) {
    const touches = (e && e.touches) || [];
    if (touches.length === 1) {
      this._dragging = true;
      this._dragStartX = touches[0].pageX;
      this._dragStartY = touches[0].pageY;
      this._dragOriginX = this.data.previewX || 0;
      this._dragOriginY = this.data.previewY || 0;
      this._pinching = false;
      return;
    }
    if (touches.length !== 2) return;
    const p1 = touches[0];
    const p2 = touches[1];
    this._pinchStartDistance = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || 1;
    this._pinchStartCenterX = (p1.pageX + p2.pageX) / 2;
    this._pinchStartCenterY = (p1.pageY + p2.pageY) / 2;
    this._pinchStartScale = this.data.previewScale || 1;
    this._pinchStartX = this.data.previewX || 0;
    this._pinchStartY = this.data.previewY || 0;
    this._pinching = true;
    this._dragging = false;
  },

  onPreviewTouchMove(e) {
    const touches = (e && e.touches) || [];

    if (this._pinching && touches.length === 2) {
      const p1 = touches[0];
      const p2 = touches[1];
      const curDistance = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || this._pinchStartDistance;
      const curCenterX = (p1.pageX + p2.pageX) / 2;
      const curCenterY = (p1.pageY + p2.pageY) / 2;

      const nextScale = this._pinchStartScale * (curDistance / (this._pinchStartDistance || 1));
      const dx = curCenterX - this._pinchStartCenterX;
      const dy = curCenterY - this._pinchStartCenterY;
      const nextX = this._pinchStartX + dx;
      const nextY = this._pinchStartY + dy;
      this.applyPreviewTransform(nextX, nextY, nextScale);
      return;
    }

    if (this._dragging && touches.length === 1) {
      const p = touches[0];
      const nextX = this._dragOriginX + (p.pageX - this._dragStartX);
      const nextY = this._dragOriginY + (p.pageY - this._dragStartY);
      this.applyPreviewTransform(nextX, nextY, this.data.previewScale || 1);
    }
  },

  onPreviewTouchEnd(e) {
    const touches = (e && e.touches) || [];
    if (touches.length === 1) {
      this._dragging = true;
      this._pinching = false;
      this._dragStartX = touches[0].pageX;
      this._dragStartY = touches[0].pageY;
      this._dragOriginX = this.data.previewX || 0;
      this._dragOriginY = this.data.previewY || 0;
      return;
    }
    this._pinching = false;
    this._dragging = false;
  },

  exportVisibleImage() {
    const {
      imageUrl,
      previewX,
      previewY,
      previewScale,
      previewBaseW,
      previewBaseH,
      previewLeft,
      previewTop,
      previewBoxPx
    } = this.data;
    if (!imageUrl) return Promise.resolve('');

    return new Promise((resolve) => {
      wx.getImageInfo({
        src: imageUrl,
        success: (info) => {
          this._getPreviewViewportSize().then((actualBoxPx) => {
          const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
          const fallbackBoxPx = Math.round((windowInfo.windowWidth || 375) * 624 / 750);
          const boxPxRaw = Number(previewBoxPx);
          const boxPx = Number.isFinite(actualBoxPx) && actualBoxPx > 0
            ? actualBoxPx
            : (Number.isFinite(boxPxRaw) && boxPxRaw > 0 ? boxPxRaw : fallbackBoxPx);
          const baseWRaw = Number(previewBaseW);
          const baseHRaw = Number(previewBaseH);
          const baseW = Number.isFinite(baseWRaw) && baseWRaw > 0 ? baseWRaw : boxPx;
          const baseH = Number.isFinite(baseHRaw) && baseHRaw > 0 ? baseHRaw : boxPx;
          const leftRaw = Number(previewLeft);
          const topRaw = Number(previewTop);
          const left = Number.isFinite(leftRaw) ? leftRaw : (boxPx - baseW) / 2;
          const top = Number.isFinite(topRaw) ? topRaw : (boxPx - baseH) / 2;
          const scaleRaw = Number(previewScale);
          const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
          const maxExportDim = 640;

          // ========== 可视区 -> 源图坐标映射 ==========
          // 计算缩放后的图片层左上角位置（考虑 transform-origin: center center）
          const scaledLeft = left + baseW * (1 - scale) / 2;
          const scaledTop = top + baseH * (1 - scale) / 2;

          // 加上平移后的最终位置
          const finalLeft = scaledLeft + previewX;
          const finalTop = scaledTop + previewY;

          // 可视区域左上角在图片层上的坐标（图片层坐标系，缩放后）
          const visibleLayerX = -finalLeft;
          const visibleLayerY = -finalTop;

          // 映射到源图坐标（考虑两层缩放）
          const unscaledX = visibleLayerX / scale;
          const unscaledY = visibleLayerY / scale;

          const srcToLayerScaleW = info.width / baseW;
          const srcToLayerScaleH = info.height / baseH;

          // 计算裁剪矩形
          let sx = Math.floor(unscaledX * srcToLayerScaleW);
          let sy = Math.floor(unscaledY * srcToLayerScaleH);
          let sw = Math.floor((boxPx / scale) * srcToLayerScaleW);
          let sh = Math.floor((boxPx / scale) * srcToLayerScaleH);

          // 边界检查
          if (sw > info.width) sw = info.width;
          if (sh > info.height) sh = info.height;
          if (sx < 0) sx = 0;
          if (sy < 0) sy = 0;
          if (sx + sw > info.width) sx = Math.max(0, info.width - sw);
          if (sy + sh > info.height) sy = Math.max(0, info.height - sh);

          // 按源矩形宽高比计算导出尺寸
          let exportW, exportH;
          if (sw >= sh) {
            exportW = maxExportDim;
            exportH = Math.max(1, Math.round(maxExportDim * sh / sw));
          } else {
            exportH = maxExportDim;
            exportW = Math.max(1, Math.round(maxExportDim * sw / sh));
          }

          const sourcePath = info.path || imageUrl;
          const isWholeImage = sx === 0
            && sy === 0
            && Math.abs(sw - info.width) <= 1
            && Math.abs(sh - info.height) <= 1;
          if (isWholeImage) {
            resolve(sourcePath || imageUrl);
            return;
          }

          // 使用 Canvas 2D
          init2dCanvas(this, '#genCropCanvas').then(({ canvas, ctx, dpr }) => {
            resize2dCanvas({ canvas, ctx, width: exportW, height: exportH, dpr });

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, exportW, exportH);

            // 加载图片并绘制
            const img = canvas.createImage();
            img.onload = () => {
              ctx.save();
              ctx.translate(-Math.round(sx * exportW / sw), -Math.round(sy * exportH / sh));
              ctx.scale(exportW / sw, exportH / sh);
              ctx.drawImage(img, 0, 0, info.width, info.height);
              ctx.restore();

              // 导出为临时文件
              exportCanvasToTempFilePath(canvas, {
                width: exportW,
                height: exportH,
                sourceWidth: canvas.width,
                sourceHeight: canvas.height,
                fileType: 'png',
                quality: 1
              }, this).then((tempFilePath) => {
                resolve(tempFilePath);
              }).catch((err) => {
                console.error('[generate][export] crop fail', err);
                resolve(imageUrl);
              });
            };
            img.onerror = (err) => {
              console.error('[generate][export] image load fail', err);
              resolve(imageUrl);
            };
            img.src = sourcePath;
          }).catch((err) => {
            console.error('[generate][export] canvas init fail', err);
            resolve(imageUrl);
          });
          });
        },
        fail: () => resolve(imageUrl)
      });
    });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  onGenerate() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      if (!this.data.imageUrl) {
        this.onChooseImage();
        return;
      }
      
      const { 
        imageUrl, 
        gridSizeOptions, 
        gridSizeIndex, 
        brandList, 
        brandIndex, 
        colorCountValue,
        similarityThreshold,
        customConfirmed,
        customSizeVal
      } = this.data;
      
      let gridSize = gridSizeOptions[gridSizeIndex].value;
      if (customConfirmed) {
        const customGridSize = parseInt(customSizeVal, 10);
        if (!isNaN(customGridSize) && customGridSize >= MIN_GRID_SIZE && customGridSize <= MAX_GRID_SIZE) {
          gridSize = customGridSize;
        }
      }
      let brand = 'MARD';
      const brandRow = brandList[brandIndex];
      if (brandRow && typeof brandRow === 'object') {
        brand = brandRow.name || brandRow.label || brand;
      } else if (typeof brandRow === 'string' && brandRow) {
        brand = brandRow;
      }
      const algo = 'standard'; // 兼容旧接口
      const colorCount = colorCountValue || 0;
      const pixelationMode = 'average';
      const mirrorOn = !!this.data.mirrorOn;

      this._flowId = 'flow_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

      this.exportVisibleImage()
        .then((visibleImageUrl) => {
          const finalImageUrl = visibleImageUrl || imageUrl;

          console.log('[generate] onGenerate export result', {
            visibleImageUrl: visibleImageUrl ? visibleImageUrl.slice(0, 100) : '',
            imageUrl: imageUrl ? imageUrl.slice(0, 100) : '',
            finalImageUrl: finalImageUrl ? finalImageUrl.slice(0, 100) : ''
          });

          if (!finalImageUrl) {
            wx.showToast({ title: '图片处理失败，请重新选择', icon: 'none' });
            return;
          }

          // 跳转到 result 页面，使用内置生成流程（替代 generating 页面）
          wx.redirectTo({
            url: '/pages/result/result?generateNow=1&mode=image' +
                 '&imageUrl=' + encodeURIComponent(finalImageUrl) +
                 '&gridSize=' + gridSize +
                 '&brand=' + encodeURIComponent(brand) +
                 '&colorCount=' + colorCount +
                 '&pixelationMode=' + encodeURIComponent(pixelationMode) +
                 '&similarityThreshold=' + similarityThreshold +
                 '&mirrorOn=' + (mirrorOn ? 1 : 0) +
                 '&flowId=' + encodeURIComponent(this._flowId || '')
          });
        })
        .catch((err) => {
          console.error('[generate] onGenerate error', err);
          wx.showToast({ title: '生成失败', icon: 'none' });
        });
    });
  },

  onPreviewOriginal() {
    if (this.data.imageUrl) wx.previewImage({ urls: [this.data.imageUrl], current: this.data.imageUrl });
  },

  onPreviewResult() {
    const { activeTab, imageUrl, resultUrl, patternUrl } = this.data;
    const cur = activeTab === 'original' ? imageUrl : activeTab === 'result' ? resultUrl : patternUrl;
    if (cur) wx.previewImage({ urls: [imageUrl, resultUrl, patternUrl].filter(Boolean), current: cur });
  },

  onSaveImage() {
    const { activeTab, imageUrl, resultUrl, patternUrl } = this.data;
    const url = activeTab === 'original' ? imageUrl : activeTab === 'result' ? resultUrl : patternUrl;
    if (!url) { wx.showToast({ title: '暂无图片', icon: 'none' }); return; }
    const save = (fp) => wx.saveImageToPhotosAlbum({
      filePath: fp,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    });
    if (url.startsWith('http')) {
      wx.downloadFile({ url, success: (r) => { if (r.statusCode === 200) save(r.tempFilePath); }, fail: () => {} });
    } else {
      save(url);
    }
  },

  onStatTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.showToast({ title: item.id + ' ' + item.name + ' ' + item.count + ' pcs', icon: 'none', duration: 2000 });
  }
});
