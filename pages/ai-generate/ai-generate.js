const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { API_BASE_URL } = require('../../utils/config');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(2);
    }
  },

  data: {
    uploadedImage: '',
    aiInstruction: '',
    isGenerating: false,

    // 魔法风格
    magicStyles: [
      { name: '人物特化', icon: '👤', category: '题材', tag: '适用人物' },
      { name: '宠物毛发', icon: '🐱', category: '题材', tag: '适用宠物' },
      { name: '风景写意', icon: '🏞️', category: '题材', tag: '适用风景' },
      { name: '卡通二次元', icon: '🎨', category: '题材', tag: '适用二次元' },
      { name: '细节保留', icon: '✨', category: '用途', tag: '通用' },
      { name: '特征提取', icon: '🎯', category: '用途', tag: '抓重点' },
      { name: '大头照', icon: '🖼️', category: '用途', tag: '无身体' },
      { name: '飞天小女警', icon: '💫', category: '高阶', tag: '画风融入' },
      { name: '迪士尼风', icon: '🏰', category: '高阶', tag: '画风融入' },
    ],
    selectedStyle: '人物特化',

    // 图纸参数
    sizeMode: 'default',
    brands: [],
    brandIndex: 0,
    colorSets: [],
    colorSetIndex: 0,
    isMirrored: false,

    // 底部弹窗
    showBrandSheet: false,
    showColorSheet: false,

    magicCount: 3,
    scrollHeight: 400,
    statusBarHeight: 20,

    // 预览交互
    previewX: 0,
    previewY: 0,
    previewScale: 1,
    previewBaseW: 0,
    previewBaseH: 0,
    previewLeft: 0,
    previewTop: 0,
    previewBoxPx: 640,
  },

  onLoad() {
    const layout = getSafeAreaLayout();
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
    const sbh = layout.statusBarHeight;
    const windowHeight = windowInfo.windowHeight || 667;
    const tabBarH = 56;
    const scrollHeight = Math.max(windowHeight - sbh - tabBarH, 300);
    this.setData({ statusBarHeight: sbh, scrollHeight });
    this.loadBrandsFromServer();
  },

  onShow() {
    this.syncTabBar();
  },

  loadBrandsFromServer() {
    request.get('/bead/brands').then((data) => {
      if (!data || typeof data !== 'object') return;
      const brandList = Object.keys(data);
      if (brandList.length === 0) return;
      const firstBrand = brandList[0];
      const kits = data[firstBrand] || [];
      const colorSets = ['全部色号', ...kits.map(k => k + '色')];
      this.setData({
        brands: brandList,
        brandIndex: 0,
        colorSets,
        colorSetIndex: 0,
        _brandsData: data
      });
    }).catch(() => {
      this.setData({
        brands: ['MARD'],
        brandIndex: 0,
        colorSets: ['全部色号', '24色', '48色', '72色', '96色'],
        colorSetIndex: 0
      });
    });
  },

  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ uploadedImage: res.tempFilePaths[0] });
        this.initPreviewMetrics(res.tempFilePaths[0]);
      }
    });
  },

  initPreviewMetrics(url) {
    wx.getImageInfo({
      src: url,
      success: (info) => {
        const imgW = info.width || 1;
        const imgH = info.height || 1;
        const box = 640;
        const ratio = Math.max(box / imgW, box / imgH);
        const baseW = imgW * ratio;
        const baseH = imgH * ratio;
        const left = (box - baseW) / 2;
        const top = (box - baseH) / 2;
        this.setData({
          previewBaseW: baseW,
          previewBaseH: baseH,
          previewLeft: left,
          previewTop: top,
          previewBoxPx: box,
          previewX: 0,
          previewY: 0,
          previewScale: 1
        });
      }
    });
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
      const dist = Math.hypot(p2.pageX - p1.pageX, p2.pageY - p1.pageY) || 1;
      const scaleRatio = dist / this._pinchStartDistance;
      const nextScale = this._pinchStartScale * scaleRatio;
      this.applyPreviewTransform(this._pinchStartX, this._pinchStartY, nextScale);
      return;
    }

    if (this._dragging && touches.length === 1) {
      const dx = touches[0].pageX - this._dragStartX;
      const dy = touches[0].pageY - this._dragStartY;
      const nextX = this._dragOriginX + dx;
      const nextY = this._dragOriginY + dy;
      this.applyPreviewTransform(nextX, nextY, this.data.previewScale);
    }
  },

  onPreviewTouchEnd() {
    this._dragging = false;
    this._pinching = false;
  },

  applyPreviewTransform(nextX, nextY, nextScale) {
    const box = this.data.previewBoxPx || 0;
    const baseW = this.data.previewBaseW || 0;
    const baseH = this.data.previewBaseH || 0;
    if (!box || !baseW || !baseH) return;

    let scale = nextScale;
    if (scale < 1) scale = 1;
    if (scale > 5) scale = 5;

    const scaledW = baseW * scale;
    const scaledH = baseH * scale;

    let x = nextX;
    let y = nextY;

    if (scaledW <= box) {
      x = 0;
    } else {
      const maxX = (scaledW - box) / 2;
      if (x > maxX) x = maxX;
      if (x < -maxX) x = -maxX;
    }

    if (scaledH <= box) {
      y = 0;
    } else {
      const maxY = (scaledH - box) / 2;
      if (y > maxY) y = maxY;
      if (y < -maxY) y = -maxY;
    }

    this.setData({ previewX: x, previewY: y, previewScale: scale });
  },

  onAiInstructionInput(e) {
    this.setData({ aiInstruction: e.detail.value });
  },

  onStyleTap(e) {
    this.setData({ selectedStyle: e.currentTarget.dataset.style });
  },

  onSizeModeTap(e) {
    this.setData({ sizeMode: e.currentTarget.dataset.mode });
  },

  onShowBrandSheet() {
    this.setData({ showBrandSheet: true });
  },

  onHideBrandSheet() {
    this.setData({ showBrandSheet: false });
  },

  onSelectBrand(e) {
    const idx = parseInt(e.currentTarget.dataset.index);
    const brand = this.data.brands[idx];
    const brandsData = this.data._brandsData || {};
    const kits = brandsData[brand] || [];
    const colorSets = ['全部色号', ...kits.map(k => k + '色')];
    this.setData({
      brandIndex: idx,
      colorSets,
      colorSetIndex: 0,
      showBrandSheet: false
    });
  },

  onShowColorSheet() {
    this.setData({ showColorSheet: true });
  },

  onHideColorSheet() {
    this.setData({ showColorSheet: false });
  },

  onSelectColorSet(e) {
    const idx = parseInt(e.currentTarget.dataset.index);
    this.setData({
      colorSetIndex: idx,
      showColorSheet: false
    });
  },

  onBrandChange(e) {
    const idx = parseInt(e.detail.value);
    const brand = this.data.brands[idx];
    const brandsData = this.data._brandsData || {};
    const kits = brandsData[brand] || [];
    const colorSets = ['全部色号', ...kits.map(k => k + '色')];
    this.setData({
      brandIndex: idx,
      colorSets,
      colorSetIndex: 0
    });
  },

  onColorSetChange(e) {
    this.setData({ colorSetIndex: e.detail.value });
  },

  onMirrorToggle() {
    this.setData({ isMirrored: !this.data.isMirrored });
  },

  onGenerate() {
    const { uploadedImage, isGenerating, selectedStyle, sizeMode, brandIndex, brands, isMirrored, magicCount } = this.data;

    if (!uploadedImage || isGenerating) {
      wx.showToast({ title: '请先上传图片', icon: 'none' });
      return;
    }

    if (magicCount <= 0) {
      wx.showToast({ title: '魔法次数不足', icon: 'none' });
      return;
    }

    ensureProfileComplete().then((ok) => {
      if (!ok) return;

      this.setData({ isGenerating: true });

      const finalSize = sizeMode === 'small' ? 36 : 64;
      const brand = brands[brandIndex];

      wx.navigateTo({
        url: `/pages/result/result?generateNow=1&mode=ai&style=${encodeURIComponent(selectedStyle)}&size=${finalSize}&brand=${encodeURIComponent(brand)}&mirror=${isMirrored ? 1 : 0}`
      });

      setTimeout(() => {
        this.setData({
          isGenerating: false,
          magicCount: this.data.magicCount - 1
        });
      }, 1000);
    });
  },
});
