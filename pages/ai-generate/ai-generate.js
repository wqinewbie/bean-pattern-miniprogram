const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { API_BASE_URL } = require('../../utils/config');
const { getSafeAreaLayout } = require('../../utils/safe-area');

const RANDOM_PROMPTS = [
  '戴围巾的橘猫，旁边有一杯热咖啡',
  '像素风格的小恐龙，绿色',
  '可爱的草莓蛋糕，粉色背景',
  '简约风格的富士山，蓝天白云',
  '小熊猫抱着竹子',
  '宇航员漂浮在太空中',
];

Page({
  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(2);
    }
  },

  data: {
    prompt: '',
    isGenerating: false,
    selectedStyle: '可爱风',
    selectedSize: 64,
    styles: ['可爱风', '像素风', '简约风', '3D立体', '动漫风'],
    sizes: [24, 50, 52, 64, 78, 104],
    scrollHeight: 400,
    statusBarHeight: 20,
  },

  onLoad() {
    const layout = getSafeAreaLayout();
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    const sbh = layout.statusBarHeight;
    const windowWidth = sys.windowWidth || 375;
    const windowHeight = sys.windowHeight || 667;
    const headerH = sbh + 24 + Math.round(160 / 750 * windowWidth);
    const tabBarH = 56;
    const scrollHeight = Math.max(windowHeight - headerH - tabBarH, 300);
    this.setData({ statusBarHeight: sbh, scrollHeight });
  },

  onShow() {
    this.syncTabBar();
  },

  onPromptInput(e) {
    this.setData({ prompt: e.detail.value });
  },

  onRandom() {
    const idx = Math.floor(Math.random() * RANDOM_PROMPTS.length);
    this.setData({ prompt: RANDOM_PROMPTS[idx] });
  },

  onStyleTap(e) {
    this.setData({ selectedStyle: e.currentTarget.dataset.style });
  },

  onSizeTap(e) {
    this.setData({ selectedSize: e.currentTarget.dataset.size });
  },

  onGenerate() {
    const { prompt, isGenerating, selectedStyle, selectedSize } = this.data;
    if (!prompt.trim() || isGenerating) return;
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      this.setData({ isGenerating: true });
      wx.navigateTo({
        url: '/pages/generating/generating?prompt=' + encodeURIComponent(prompt) +
             '&style=' + encodeURIComponent(selectedStyle) +
             '&size=' + selectedSize
      });
      setTimeout(() => {
        this.setData({ isGenerating: false });
      }, 1000);
    });
  },
});
