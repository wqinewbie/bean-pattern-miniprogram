const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    taskId: null,
    originalUrl: '',
    resultUrl: '',
    patternUrl: '',
    colorStats: [],
    totalBeads: 0,
    activeTab: 'result',
    saving: false,
    isSaved: false,
    currentPreviewUrl: '',
    currentSize: 64,
    brandName: 'MARD',
    gridSizeOptions: [
      { value: 36, label: '36x36' }, { value: 50, label: '50x50' },
      { value: 64, label: '64x64' }, { value: 78, label: '78x78' },
      { value: 104, label: '104x104' }
    ],
    navTop: 88,
    showNameModal: false,
    patternNameInput: '',
  },

  onLoad(options) {
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });
    const { taskId, originalUrl, resultUrl, patternUrl, colorStats, gridSize, brand } = options;
    let stats = [];
    try {
      if (colorStats) stats = JSON.parse(decodeURIComponent(colorStats));
    } catch (e) {}
    const totalBeads = stats.reduce((a, c) => a + (c.count || 0), 0);
    const size = gridSize ? parseInt(gridSize) : 64;
    const brandName = brand ? decodeURIComponent(brand) : 'MARD';
    this.setData({
      taskId: taskId || null,
      originalUrl: decodeURIComponent(originalUrl || ''),
      resultUrl:   decodeURIComponent(resultUrl || ''),
      patternUrl:  decodeURIComponent(patternUrl || ''),
      colorStats:  stats,
      totalBeads,
      activeTab: resultUrl ? 'result' : 'original',
      currentPreviewUrl: decodeURIComponent(resultUrl || '') || decodeURIComponent(originalUrl || ''),
      currentSize: size,
      brandName,
    });
  },

  onSizeChange(e) {
    const val = parseInt(e.currentTarget.dataset.value);
    this.setData({ currentSize: val });
    wx.showToast({ title: '尺寸切换需重新生成', icon: 'none', duration: 1500 });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    const nextUrl = tab === 'original'
      ? this.data.originalUrl
      : (tab === 'result' ? this.data.resultUrl : this.data.patternUrl);
    this.setData({
      activeTab: tab,
      currentPreviewUrl: nextUrl || ''
    });
  },

  getCurrentUrl() {
    return this.data.currentPreviewUrl || '';
  },

  onPreviewImage() {
    const url = this.getCurrentUrl();
    if (!url) return;
    const urls = [this.data.originalUrl, this.data.resultUrl, this.data.patternUrl].filter(Boolean);
    wx.previewImage({ urls, current: url });
  },

  onSaveImage() {
    const url = this.getCurrentUrl();
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
    const { patternUrl, colorStats, currentSize, brandName } = this.data;
    if (!patternUrl || !colorStats.length) {
      wx.showToast({ title: '暂无可进入的数据', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/focus-mode/focus-mode?patternUrl=' + encodeURIComponent(patternUrl)
        + '&colorStats=' + encodeURIComponent(JSON.stringify(colorStats))
        + '&gridSize=' + currentSize
        + '&brand=' + encodeURIComponent(brandName)
    });
  },

  onSaveToMyPatterns() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const { taskId, isSaved } = this.data;
      if (!taskId || String(taskId) === '-1' || String(taskId) === 'null') {
        wx.showToast({ title: '请先登录再保存', icon: 'none' });
        return;
      }
      if (isSaved) {
        wx.showToast({ title: '已保存到我的图纸', icon: 'none' });
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
    const { taskId, patternNameInput } = this.data;
    const name = (patternNameInput || '').trim() || ('魔法图纸#' + taskId);
    request.post('/my-pattern/save/' + taskId)
      .then(() => {
        const map = wx.getStorageSync('patternNameMap') || {};
        map[String(taskId)] = name;
        wx.setStorageSync('patternNameMap', map);
        this.setData({ isSaved: true, showNameModal: false, patternNameInput: name });
        wx.showToast({ title: '已保存到我的图纸', icon: 'success' });
      })
      .catch(() => {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
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
