const request = require('../../utils/request');

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
    currentSize: 64,
    brandName: 'MARD',
    gridSizeOptions: [
      { value: 36, label: '36x36' }, { value: 50, label: '50x50' },
      { value: 64, label: '64x64' }, { value: 78, label: '78x78' },
      { value: 104, label: '104x104' }
    ],
    navTop: 88
  },

  onLoad(options) {
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBar = wx.getSystemInfoSync ? (wx.getSystemInfoSync().statusBarHeight || 20) : 20;
    const navTop = (menuButton && menuButton.bottom) ? (menuButton.bottom + 10) : (statusBar + 44);
    this.setData({ navTop });
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
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  getCurrentUrl() {
    const { activeTab, originalUrl, resultUrl, patternUrl } = this.data;
    if (activeTab === 'original') return originalUrl;
    if (activeTab === 'result')   return resultUrl;
    if (activeTab === 'pattern')  return patternUrl;
    return '';
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

  onSaveToMyPatterns() {
    const { taskId, isSaved } = this.data;
    // taskId 为空、null、-1 或字符串'-1'均视为无效
    if (!taskId || String(taskId) === '-1' || String(taskId) === 'null') {
      wx.showToast({ title: '请先登录再保存', icon: 'none' });
      return;
    }
    if (isSaved) {
      wx.showToast({ title: '已保存到我的图纸', icon: 'none' });
      return;
    }
    request.post('/api/my-pattern/save/' + taskId)
      .then(() => {
        this.setData({ isSaved: true });
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
  }
});
