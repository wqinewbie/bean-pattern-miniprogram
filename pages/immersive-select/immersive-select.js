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
    statusBarHeight: 44,
  },

  onLoad() {
    // 获取状态栏高度
    const info = wx.getSystemInfoSync();
    const statusBarHeight = info.statusBarHeight || 44;
    this.setData({ statusBarHeight });
    
    this.loadPatterns();
  },

  onShow() {
    // 每次显示时刷新列表
    this.loadPatterns();
  },

  loadPatterns() {
    this.setData({ loading: true, patterns: [] });

    if (!hasSession()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1500);
      this.setData({ loading: false });
      return;
    }

    request.get('/box/list')
      .then((data) => {
        const patterns = (Array.isArray(data) ? data : []).map(item => {
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

        this.setData({ 
          patterns,
          loading: false 
        });
      })
      .catch((err) => {
        console.error('加载图纸失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  onSelectPattern(e) {
    const item = e.currentTarget.dataset.item;
    
    if (!item || !item.id) {
      wx.showToast({ title: '图纸数据错误', icon: 'none' });
      return;
    }

    // 跳转到沉浸式拼豆页面
    wx.navigateTo({
      url: `/pages/focus-mode/focus-mode?boxId=${item.id}`
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/home/home' });
      }
    });
  },

  onGoConvert() {
    wx.navigateTo({ url: '/pages/convert/convert' });
  },

  onGoAI() {
    wx.navigateTo({ url: '/pages/ai-generate/ai-generate' });
  },

  onGoDraw() {
    wx.navigateTo({ url: '/pages/draw/draw' });
  }
});
