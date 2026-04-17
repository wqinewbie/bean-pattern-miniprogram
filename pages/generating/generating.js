const request = require('../../utils/request');

Page({
  data: {
    isTimeout: false,
    prompt: '',
    style: '',
    size: 24,
  },

  _timer: null,
  _timeoutTimer: null,

  onLoad(options) {
    const prompt = decodeURIComponent(options.prompt || '');
    const style  = decodeURIComponent(options.style  || '');
    const size   = parseInt(options.size) || 24;
    this.setData({ prompt, style, size });
    this.startGenerate(prompt, style, size);
  },

  onUnload() {
    clearTimeout(this._timer);
    clearTimeout(this._timeoutTimer);
  },

  startGenerate(prompt, style, size) {
    // 30秒超时提示
    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 30000);

    request.post('/bead/pattern-ai-text', {
      prompt, style, size
    })
      .then((data) => {
        clearTimeout(this._timeoutTimer);
        wx.redirectTo({
          url: '/pages/result/result?resultUrl=' + encodeURIComponent(data.resultUrl || '') +
               '&patternUrl=' + encodeURIComponent(data.patternUrl || '') +
               '&colorStats=' + encodeURIComponent(data.colorStats || '')
        });
      })
      .catch((err) => {
        clearTimeout(this._timeoutTimer);
        if (err && err.message === 'PROFILE_INCOMPLETE') {
          wx.navigateBack({ delta: 1 });
          return;
        }
        wx.showModal({
          title: 'AI生成失败',
          content: (err && err.message) ? err.message : '请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack({ delta: 1 })
        });
      });
  },

  onGoMyPatterns() {
    wx.redirectTo({ url: '/pages/my-patterns/my-patterns' });
  },

  onKeepWaiting() {
    this.setData({ isTimeout: false });
  },
});
