const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    patterns: [],
    filteredPatterns: [],
    keyword: '',
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
    const tab = this.selectComponent('#appTabBar');
    if (tab && tab.setSelected) tab.setSelected(3);
  },

  calcNavTop() {
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });
  },

  loadPatterns() {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this.setData({ loading: true });
      request.get('/my-pattern/list')
        .then((data) => {
          const nameMap = wx.getStorageSync('patternNameMap') || {};
          const patterns = (Array.isArray(data) ? data : []).map(item => ({
            ...item,
            patternName: item.patternName || nameMap[String(item.taskId)] || ('魔法图纸#' + item.taskId),
            createdAt: this.formatTime(item.createdAt),
          }));
          this.setData({ patterns, loading: false }, () => this.applyFilter());
        })
        .catch(() => {
          wx.showToast({ title: '加载失败', icon: 'none' });
          this.setData({ loading: false });
        });
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
          request.post('/my-pattern/unsave/' + taskId)
            .then(() => {
              const patterns = this.data.patterns.filter(p => String(p.taskId) !== String(taskId));
              this.setData({ patterns }, () => this.applyFilter());
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

  onSearchInput(e) {
    this.setData({ keyword: (e.detail.value || '').trim() }, () => this.applyFilter());
  },

  applyFilter() {
    const kw = (this.data.keyword || '').toLowerCase();
    const source = this.data.patterns || [];
    if (!kw) {
      this.setData({ filteredPatterns: source });
      return;
    }
    const filteredPatterns = source.filter((item) => {
      const title = item && item.patternName ? String(item.patternName) : '未命名作品';
      const colorStats = (item && item.colorStats) ? String(item.colorStats) : '';
      const createdAt = item && item.createdAt ? String(item.createdAt) : '';
      return title.toLowerCase().includes(kw)
        || colorStats.toLowerCase().includes(kw)
        || createdAt.toLowerCase().includes(kw)
        || String(item.taskId || '').toLowerCase().includes(kw);
    });
    this.setData({ filteredPatterns });
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
