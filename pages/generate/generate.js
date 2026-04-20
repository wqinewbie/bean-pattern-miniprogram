const { API_BASE_URL } = require('../../utils/config');
const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');

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
    // 像素化模式
    pixelationModeIndex: 0,
    pixelationModeOptions: [
      { value: 'dominant', label: '卡通风格' },
      { value: 'average', label: '真实风格' }
    ],
    // 相似度阈值
    similarityThreshold: 30,
    showModeSheet: false,
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onLoad(options) {
    if (options && options.imageUrl) {
      const url = decodeURIComponent(options.imageUrl);
      this.setData({ imageUrl: url });
    }
    this.loadBrandsFromServer();
  },

  loadBrandsFromServer() {
    request.get('/bead/brands').then((data) => {
      if (!data || typeof data !== 'object') return;
      const brandList = Object.keys(data);
      if (brandList.length === 0) return;
      const firstBrand = brandList[0];
      const kits = data[firstBrand] || [];
      const colorCountOptions = [
        { value: 0, label: '全部色号' },
        ...kits.map(k => ({ value: k, label: k + '色' }))
      ];
      this.setData({
        brandList,
        brandIndex: 0,
        colorCountOptions,
        colorCountLabel: '全部色号',
        colorCountValue: 0,
        _brandsData: data
      });
    }).catch(() => {
      this.setData({
        brandList: ['MARD'],
        brandIndex: 0,
        colorCountOptions: [
          { value: 0, label: '全部色号' },
          { value: 24, label: '24色' }, { value: 48, label: '48色' },
          { value: 72, label: '72色' }, { value: 96, label: '96色' }
        ],
        colorCountLabel: '全部色号',
        colorCountValue: 0
      });
    });
  },

  onBrandChange(e) {
    const idx = parseInt(e.detail.value);
    const brand = this.data.brandList[idx];
    const brandsData = this.data._brandsData || {};
    const kits = brandsData[brand] || [];
    const colorCountOptions = [
      { value: 0, label: '全部色号' },
      ...kits.map(k => ({ value: k, label: k + '色' }))
    ];
    this.setData({
      brandIndex: idx,
      colorCountOptions,
      colorCountLabel: '全部色号',
      colorCountValue: 0
    });
  },

  onGridSizeChange(e) {
    const index = e.detail !== undefined ? parseInt(e.detail.value) : parseInt(e.currentTarget.dataset.index);
    this.setData({ gridSizeIndex: index, customMode: false, customConfirmed: false, customSizeVal: '' });
  },

  onMirrorToggle() {
    this.setData({ mirrorOn: !this.data.mirrorOn });
  },

  onCustomMode() {
    if (this.data.customMode) {
      let val = parseInt(this.data.customSizeVal, 10);
      if (isNaN(val) || val < 10) val = 24;
      if (val > 200) val = 200;
      this.setData({ customMode: false, customConfirmed: true, customSizeVal: String(val) });
    } else if (this.data.customConfirmed) {
      this.setData({ customMode: false, customConfirmed: false, customSizeVal: '' });
    } else {
      this.setData({ customMode: true, customSizeVal: '' });
    }
  },

  onEditCustom() {
    this.setData({ customMode: true });
  },

  onCustomSizeInput(e) {
    this.setData({ customSizeVal: e.detail.value });
  },

  onCustomSizeBlur() {
    let val = parseInt(this.data.customSizeVal, 10);
    if (isNaN(val) || val < 10) val = 15;
    if (val > 100) val = 100;
    this.setData({ customSizeVal: String(val) });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          imageUrl: res.tempFiles[0].tempFilePath,
          resultReady: false,
          resultUrl: '',
          patternUrl: '',
          colorStats: []
        });
      }
    });
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

  onPixelationModeChange(e) {
    const index = e.currentTarget.dataset.index !== undefined 
      ? parseInt(e.currentTarget.dataset.index) 
      : parseInt(e.detail.value);
    this.setData({ pixelationModeIndex: index });
  },

  onSimilarityThresholdChange(e) {
    this.setData({ similarityThreshold: parseInt(e.detail.value) || 0 });
  },

  onShowModeSheet() {
    this.setData({ showModeSheet: true });
  },

  onHideModeSheet() {
    this.setData({ showModeSheet: false });
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
        pixelationModeOptions,
        pixelationModeIndex,
        similarityThreshold
      } = this.data;
      
      const gridSize = gridSizeOptions[gridSizeIndex].value;
      const brand = brandList[brandIndex] || 'MARD';
      const algo = 'standard'; // 兼容旧接口
      const colorCount = colorCountValue || 0;
      const pixelationMode = pixelationModeOptions[pixelationModeIndex].value;
      
      // 跳转到生成等待页面
      wx.redirectTo({
        url: '/pages/generating/generating?mode=image' +
             '&imageUrl=' + encodeURIComponent(imageUrl) +
             '&gridSize=' + gridSize +
             '&brand=' + encodeURIComponent(brand) +
             '&colorCount=' + colorCount +
             '&algo=' + encodeURIComponent(algo) +
             '&pixelationMode=' + encodeURIComponent(pixelationMode) +
             '&similarityThreshold=' + similarityThreshold
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
