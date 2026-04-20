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
      request.get('/box/list')
        .then((data) => {
          const patterns = (Array.isArray(data) ? data : []).map(item => ({
            id: item.id,
            name: item.name || ('图纸#' + item.id),
            gridSize: item.gridSize,
            colorCount: item.colorCount,
            brand: item.brand,
            gridData: item.gridData,
            colorPalette: item.colorPalette,
            sourceUrl: item.sourceUrl,
            createdAt: this.formatTime(item.createdAt),
            boxId: item.id,
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
    // 跳转到预加载页面，先渲染再显示预览
    wx.navigateTo({
      url: '/pages/result-loading/result-loading?boxId=' + item.id + '&sourceType=BOX'
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示', content: '确认删除此图纸？',
      success: (res) => {
        if (res.confirm) {
          request.delete('/box/delete/' + id)
            .then(() => {
              const patterns = this.data.patterns.filter(p => String(p.id) !== String(id));
              this.setData({ patterns }, () => this.applyFilter());
              wx.showToast({ title: '已删除', icon: 'success' });
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
      const name = item && item.name ? String(item.name) : '';
      const brand = item && item.brand ? String(item.brand) : '';
      return name.toLowerCase().includes(kw) || brand.toLowerCase().includes(kw);
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
