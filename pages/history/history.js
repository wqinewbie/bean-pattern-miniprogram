const request = require('../../utils/request');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    history: [],
    loading: false,
    navTop: 88,
  },

  onLoad() {
    this.calcNavTop();
    this.loadHistory();
  },
  onShow() {
    this.calcNavTop();
    this.loadHistory();
    const tab = this.selectComponent('#appTabBar');
    if (tab && tab.setSelected) tab.setSelected(3);
  },

  calcNavTop() {
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });
  },

  loadHistory() {
    this.setData({ loading: true });
    request.get('/api/task/list?page=1&pageSize=50')
      .then((data) => {
        const raw = data.list || [];
        const history = raw.map((item) => ({
          taskId: item.id,
          resultUrl: item.resultUrl || '',
          originalUrl: item.sourceUrl || '',
          patternUrl: item.patternUrl || '',
          colorStats: item.colorStats || '',
          gridSize: 64,
          createdAt: this.formatTime(item.createdAt),
        }));
        this.setData({ history, loading: false });
      })
      .catch(() => { this.setData({ loading: false }); });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: '/pages/result/result?taskId=' + item.taskId +
           '&originalUrl=' + encodeURIComponent(item.originalUrl || '') +
           '&resultUrl=' + encodeURIComponent(item.resultUrl || '') +
           '&patternUrl=' + encodeURIComponent(item.patternUrl || '') +
           '&colorStats=' + encodeURIComponent(item.colorStats || '')
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onClear() {
    wx.showModal({
      title: '提示', content: '确认清除历史记录？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] });
          wx.showToast({ title: '已清除', icon: 'success' });
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
