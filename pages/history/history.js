const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    history: [],
    filteredHistory: [],
    keyword: '',
    loading: false,
    statusBarHeight: 44,
    navHeight: 32,
    capsuleWidth: 87,
    searchFocused: false,
    viewMode: 'thumb',
    swipedOffsets: {},
    touchItemId: null,
    touchStartX: 0,
    touchLastX: 0,
    swipeOpenPx: 70,
    isSwiping: false,
  },

  onLoad() {
    this.calcNavTop();
  },
  onShow() {
    this.calcNavTop();
    this.loadHistory();
  },

  calcNavTop() {
    const layout = getSafeAreaLayout();
    const menuButton = layout.menuButton || {};
    this.setData({
      statusBarHeight: menuButton.top || layout.statusBarHeight || 44,
      navHeight: menuButton.height || 32,
      capsuleWidth: menuButton.width || 87,
    });
  },

  loadHistory() {
    this.setData({ loading: true, history: [], filteredHistory: [] });
    ensureProfileComplete().then((ok) => {
      if (!ok) {
        this.setData({ loading: false });
        return;
      }
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
          this.setData({ history }, () => {
            this.applyFilter();
            this.setData({ loading: false });
          });
        })
        .catch(() => {
          this.setData({ loading: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    // 跳转到预加载页面，先渲染再显示预览
    wx.navigateTo({
      url: '/pages/preview/preview?historyId=' + item.id + '&sourceType=HISTORY'
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/profile/profile' });
      }
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: (e.detail.value || '').trim() }, () => {
      this.applyFilter();
    });
  },

  onSearchFocus() {
    this.setData({ searchFocused: true });
  },

  onSearchBlur() {
    this.setData({ searchFocused: false });
  },

  onToggleViewMode() {
    const nextMode = this.data.viewMode === 'thumb' ? 'list' : 'thumb';
    this.closeSwipe();
    this.setData({ viewMode: nextMode });
  },

  applyFilter() {
    const history = this.data.history || [];
    const kw = (this.data.keyword || '').trim().toLowerCase();
    if (!kw) {
      this.setData({ filteredHistory: [...history] });
      return;
    }
    const filtered = history.filter(h => {
      const name = (h.name || '').toLowerCase();
      return name.includes(kw);
    });
    this.setData({ filteredHistory: filtered });
  },

  closeSwipe() {
    const offsets = { ...this.data.swipedOffsets };
    Object.keys(offsets).forEach(k => { offsets[k] = 0; });
    this.setData({ swipedOffsets: offsets, touchItemId: null, touchLastX: 0, isSwiping: false });
  },

  onTouchStart(e) {
    if (this.data.viewMode !== 'list') return;
    const id = e.currentTarget.dataset.id;
    const x = e.touches[0].pageX;
    const offsets = { ...this.data.swipedOffsets };
    Object.keys(offsets).forEach(k => {
      if (k !== String(id)) offsets[k] = 0;
    });
    this.setData({
      touchItemId: id,
      touchStartX: x,
      touchLastX: x,
      swipedOffsets: offsets,
      isSwiping: true,
    });
  },

  onTouchMove(e) {
    if (this.data.viewMode !== 'list') return;
    if (!this.data.touchItemId) return;
    const x = e.touches[0].pageX;
    const lastX = this.data.touchLastX;
    const currentOffset = this.data.swipedOffsets[String(this.data.touchItemId)] || 0;
    const deltaX = lastX - x;
    let newOffset = currentOffset - deltaX;
    newOffset = Math.max(-this.data.swipeOpenPx, Math.min(0, newOffset));
    this.setData({
      touchLastX: x,
      [`swipedOffsets.${this.data.touchItemId}`]: newOffset,
    });
  },

  onTouchEnd(e) {
    if (this.data.viewMode !== 'list') return;
    if (!this.data.touchItemId) return;
    const id = this.data.touchItemId;
    const currentOffset = this.data.swipedOffsets[String(id)] || 0;
    const threshold = this.data.swipeOpenPx * 0.4;
    const snapOpen = Math.abs(currentOffset) > threshold;
    this.setData({
      [`swipedOffsets.${id}`]: snapOpen ? -this.data.swipeOpenPx : 0,
      touchItemId: null,
      touchStartX: 0,
      touchLastX: 0,
      isSwiping: false,
    });
  },

  onSaveToBox(e) {
    const item = e.currentTarget.dataset.item;
    this.closeSwipe();
    if (item.boxId) {
      wx.showToast({ title: '已保存到图纸箱', icon: 'none' });
      return;
    }
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
    this.closeSwipe();
    wx.showModal({
      title: '提示', content: '确认删除此记录？',
      success: (res) => {
        if (res.confirm) {
          request.delete('/history/delete/' + id)
            .then(() => {
              const history = this.data.history.filter(h => String(h.id) !== String(id));
              this.setData({ history }, () => {
                this.applyFilter();
              });
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
});
