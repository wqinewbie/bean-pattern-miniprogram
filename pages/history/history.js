const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
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
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this.setData({ loading: true });
      request.get('/history/list')
        .then((data) => {
          const history = (Array.isArray(data) ? data : []).map((item) => ({
            id: item.id,
            name: item.name || ('记录#' + item.id),
            gridSize: item.gridSize,
            colorCount: item.colorCount,
            brand: item.brand,
            gridData: item.gridData,
            colorPalette: item.colorPalette,
            sourceUrl: item.sourceUrl,
            boxId: item.boxId,
            createdAt: this.formatTime(item.createdAt),
          }));
          this.setData({ history, loading: false });
        })
        .catch(() => {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: '/pages/result/result?historyId=' + item.id +
           '&gridSize=' + (item.gridSize || 64) +
           '&gridData=' + encodeURIComponent(item.gridData || '[]') +
           '&colorPalette=' + encodeURIComponent(item.colorPalette || '[]') +
           '&sourceType=HISTORY'
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onSaveToBox(e) {
    const item = e.currentTarget.dataset.item;
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      request.post('/history/to-box', { historyId: item.id })
        .then(() => {
          wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
          this.loadHistory();
        })
        .catch(() => {
          wx.showToast({ title: '保存失败', icon: 'none' });
        });
    });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示', content: '确认删除此记录？',
      success: (res) => {
        if (res.confirm) {
          request.delete('/history/delete/' + id)
            .then(() => {
              const history = this.data.history.filter(h => String(h.id) !== String(id));
              this.setData({ history });
              wx.showToast({ title: '已删除', icon: 'success' });
            })
            .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
        }
      }
    });
  },

  onClear() {
    wx.showModal({
      title: '提示', content: '确认清空历史记录？',
      success: (res) => {
        if (res.confirm) {
          const ids = this.data.history.map(h => h.id);
          Promise.all(ids.map(id => request.delete('/history/delete/' + id)))
            .then(() => {
              this.setData({ history: [] });
              wx.showToast({ title: '已清空', icon: 'success' });
            })
            .catch(() => wx.showToast({ title: '清空失败', icon: 'none' }));
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
