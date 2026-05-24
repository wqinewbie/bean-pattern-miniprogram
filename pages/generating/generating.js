/**
 * AI 生成任务轮询页面
 * 功能：轮询 AI 任务状态，成功后跳转到 ai-result 页面
 */
const request = require('../../utils/request');

Page({
  data: {
    isTimeout: false,
    loadingText: 'AI 正在施展魔法...',
    taskId: '',
  },

  _timeoutTimer: null,
  _pollingTimer: null,
  _pollingCount: 0,

  onLoad(options) {
    const taskId = options.taskId || '';

    if (!taskId) {
      wx.showToast({ title: '任务ID缺失', icon: 'none' });
      setTimeout(() => { wx.navigateBack(); }, 1500);
      return;
    }

    this.setData({ taskId });
    this.startPolling(taskId);

    this._timeoutTimer = setTimeout(() => {
      this.setData({ isTimeout: true });
    }, 8000);
  },

  onUnload() {
    clearTimeout(this._timeoutTimer);
    clearTimeout(this._pollingTimer);
  },

  startPolling(taskId) {
    this._pollingCount = 0;
    this.pollTaskStatus(taskId);
  },

  pollTaskStatus(taskId) {
    request.get(`/ai/task/${taskId}`).then(data => {
      if (!data) {
        this.scheduleNextPoll(taskId);
        return;
      }

      const status = data.status;

      if (status === 'SUCCESS') {
        clearTimeout(this._timeoutTimer);
        clearTimeout(this._pollingTimer);

        const sizeMode = data.sizeMode || 'default';
        const brand = data.brand || 'MARD';
        const colorCount = data.colorCount || 0;
        const mirror = data.mirror || false;

        wx.redirectTo({
          url: `/pages/ai-result/ai-result?taskId=${taskId}&aiImageUrl=${encodeURIComponent(data.aiImageUrl || '')}&sizeMode=${sizeMode}&brand=${brand}&colorCount=${colorCount}&mirror=${mirror ? '1' : '0'}`
        });
      } else if (status === 'FAILED') {
        clearTimeout(this._timeoutTimer);
        clearTimeout(this._pollingTimer);

        wx.showToast({
          title: data.errorMessage || '生成失败',
          icon: 'none',
          duration: 2000
        });

        setTimeout(() => { wx.navigateBack(); }, 2000);
      } else {
        this.scheduleNextPoll(taskId);
      }
    }).catch(err => {
      console.error('查询任务状态失败', err);
      this.scheduleNextPoll(taskId);
    });
  },

  scheduleNextPoll(taskId) {
    this._pollingCount++;

    let delay;
    if (this._pollingCount < 5) {
      delay = 2000;
    } else if (this._pollingCount < 15) {
      delay = 5000;
    } else if (this._pollingCount < 30) {
      delay = 10000;
    } else {
      return;
    }

    this._pollingTimer = setTimeout(() => {
      this.pollTaskStatus(taskId);
    }, delay);
  },

  onKeepWaiting() {
    this.setData({ isTimeout: false });
  },

  onGoHistory() {
    clearTimeout(this._timeoutTimer);
    clearTimeout(this._pollingTimer);

    wx.redirectTo({
      url: '/pages/history/history'
    });
  },
});
