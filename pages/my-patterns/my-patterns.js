const request = require('../../utils/request');

Page({
  data: {
    patterns: [],
    loading: false,
    navTop: 88,
  },

  onLoad() {
    this.calcNavTop();
    this.loadPatterns();
  },
  onShow() {
    this.calcNavTop();
    this.loadPatterns();
  },

  calcNavTop() {
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBar = wx.getSystemInfoSync ? (wx.getSystemInfoSync().statusBarHeight || 20) : 20;
    const navTop = (menuButton && menuButton.bottom) ? (menuButton.bottom + 10) : (statusBar + 44);
    this.setData({ navTop });
  },

  loadPatterns() {
    this.setData({ loading: true });
    request.get('/api/my-pattern/list')
      .then((data) => {
        console.log('patterns data:', data);
        const patterns = (Array.isArray(data) ? data : []).map(item => ({
          ...item,
          createdAt: this.formatTime(item.createdAt),
        }));
        this.setData({ patterns, loading: false });
      })
      .catch((err) => { 
        console.error('load patterns error:', err);
        this.setData({ loading: false }); 
      });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: '/pages/result/result?taskId=' + item.taskId +
           '&originalUrl=' + encodeURIComponent(item.sourceUrl || '') +
           '&resultUrl=' + encodeURIComponent(item.resultUrl || '') +
           '&patternUrl=' + encodeURIComponent(item.patternUrl || '') +
           '&colorStats=' + encodeURIComponent(item.colorStats || '')
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onDelete(e) {
    const taskId = e.currentTarget.dataset.taskid;
    wx.showModal({
      title: '提示', content: '确认从我的图纸中移除？',
      success: (res) => {
        if (res.confirm) {
          request.post('/api/my-pattern/unsave/' + taskId)
            .then(() => {
              const patterns = this.data.patterns.filter(p => String(p.taskId) !== String(taskId));
              this.setData({ patterns });
              wx.showToast({ title: '已移除', icon: 'success' });
            })
            .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
        }
      }
    });
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/generate/generate' });
  },

  onSearchInput() {
  },

  onNavHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onNavPatterns() {
    wx.switchTab({ url: '/pages/convert/convert' });
  },

  onNavAI() {
    wx.switchTab({ url: '/pages/ai-generate/ai-generate' });
  },

  onNavProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },
});
