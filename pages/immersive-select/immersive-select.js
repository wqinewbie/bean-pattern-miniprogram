// 沉浸式拼豆选择页面 - 从图纸箱选择图纸
const request = require('../../utils/request');
const { hasSession } = require('../../utils/profile-guard');
const { API_BASE_URL } = require('../../utils/config');

function resolveImageUrl(url) {
  if (!url) return '';
  url = String(url).trim();
  if (!url) return '';
  if (url.startsWith('wxfile://')) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE_URL.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

Page({
  data: {
    patterns: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    total: 0,
    statusBarHeight: 44,
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    const statusBarHeight = info.statusBarHeight || 44;
    this.setData({ statusBarHeight });
    this.loadPatterns(true);
  },

  onShow() {
    this.loadPatterns(true);
  },

  onReachBottom() {
    this.loadPatterns(false);
  },

  onPullDownRefresh() {
    this.loadPatterns(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadPatterns(reset) {
    if (reset) {
      this.setData({ page: 1, patterns: [], hasMore: true, loading: true });
    } else {
      if (!this.data.hasMore || this.data.loadingMore) return Promise.resolve();
      this.setData({ loadingMore: true });
    }

    if (!hasSession()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
      this.setData({ loading: false, loadingMore: false });
      return Promise.resolve();
    }

    return request.get('/box/list', {
      page: this.data.page,
      pageSize: this.data.pageSize
    })
      .then((data) => {
        const list = (data && data.list) || data;
        const newItems = (Array.isArray(list) ? list : []).map(item => {
          const resolvedCoverUrl = resolveImageUrl(item.coverUrl || item.sourceUrl || '');
          return {
            id: item.id,
            name: item.name || ('图纸#' + item.id),
            gridSize: item.gridSize || 32,
            colorCount: item.colorCount || 0,
            brand: item.brand || 'MARD',
            coverUrl: resolvedCoverUrl,
            createdAt: item.createdAt,
          };
        });

        const patterns = reset ? newItems : [...this.data.patterns, ...newItems];

        this.setData({
          patterns,
          page: this.data.page + 1,
          hasMore: data.hasMore !== false,
          total: data.total || 0,
          loading: false,
          loadingMore: false
        });
      })
      .catch((err) => {
        console.error('加载图纸失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false, loadingMore: false });
      });
  },

  onSelectPattern(e) {
    const item = e.currentTarget.dataset.item;

    if (!item || !item.id) {
      wx.showToast({ title: '图纸数据错误', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/focus-mode/focus-mode?boxId=${item.id}`
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  onGoConvert() {
    wx.switchTab({ url: '/pages/convert/convert' });
  },

  onGoAI() {
    wx.switchTab({ url: '/pages/ai-generate/ai-generate' });
  },

  onGoDraw() {
    wx.navigateTo({ url: '/pages/draw/draw' });
  }
});
