/**
 * AI 生成任务轮询页面
 * 功能：轮询 AI 任务状态，成功后跳转到 ai-result 页面
 */
const request = require('../../utils/request');
const { API_BASE_URL } = require('../../utils/config');
const { processAiResult } = require('../../utils/ai-result-processor');
const PENDING_AI_HISTORY_KEY = 'pending_ai_history_tasks';

Page({
  data: {
    isTimeout: false,
    loadingText: 'AI 正在施展魔法...',
    statusText: '正在注入魔法能量',
    taskId: '',
    showCanvas: true,
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
      const taskData = data && data.data ? data.data : data;
      console.log('[AI_POLL]', taskId, taskData);

      if (!taskData) {
        this.scheduleNextPoll(taskId);
        return;
      }

      const status = String(taskData.status || '').trim().toUpperCase();

      if (status === 'SUCCESS') {
        clearTimeout(this._timeoutTimer);
        clearTimeout(this._pollingTimer);

        const sizeMode = taskData.sizeMode || 'default';
        const brand = taskData.brand || 'MARD';
        const colorCount = taskData.colorCount || 0;
        const mirror = taskData.mirror || false;
        const aiImageUrl = taskData.aiImageUrl || '';
        const finalGridWidth = Number(taskData.finalGridWidth || 0);
        const finalGridHeight = Number(taskData.finalGridHeight || 0);
        this.prepareResultAndRedirect({
          taskId,
          aiImageUrl,
          sizeMode,
          brand,
          colorCount,
          mirror,
          finalGridWidth,
          finalGridHeight
        });
        return;
      } else if (status === 'FAILED') {
        clearTimeout(this._timeoutTimer);
        clearTimeout(this._pollingTimer);

        wx.showToast({
          title: taskData.errorMessage || '生成失败',
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

  toReadableImageUrl(imageUrl) {
    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) return imageUrl;
    return `${API_BASE_URL}/api/image/proxy?url=${encodeURIComponent(imageUrl)}`;
  },

  async prepareResultAndRedirect(taskData) {
    const { taskId, aiImageUrl, sizeMode, brand, colorCount, mirror, finalGridWidth, finalGridHeight } = taskData;
    const fallbackGridSize = sizeMode === 'small' ? 32 : 48;
    const gridSize = Number(finalGridWidth || finalGridHeight || fallbackGridSize);
    const resultToken = 'ai_' + taskId + '_' + Date.now();
    let redirectUrl = `/pages/ai-result/ai-result?taskId=${encodeURIComponent(taskId)}&aiImageUrl=${encodeURIComponent(aiImageUrl)}&sizeMode=${encodeURIComponent(sizeMode)}&brand=${encodeURIComponent(brand)}&colorCount=${encodeURIComponent(colorCount)}&mirror=${mirror ? '1' : '0'}&finalGridWidth=${encodeURIComponent(gridSize)}&finalGridHeight=${encodeURIComponent(gridSize)}`;

    this.setData({
      isTimeout: false,
      statusText: '正在凝结效果图和色号图...'
    });

    try {
      const prepared = await processAiResult(this, this.toReadableImageUrl(aiImageUrl), {
        gridSize,
        brand,
        mirror
      });
      const app = getApp();
      if (app && app.globalData) {
        if (!app.globalData.resultDataMap) app.globalData.resultDataMap = {};
        app.globalData.resultDataMap[resultToken] = {
          ...prepared,
          resultToken,
          taskId,
          aiImageUrl,
          sizeMode,
          gridSize,
          finalGridWidth: gridSize,
          finalGridHeight: gridSize,
          brand,
          mirror,
          preparedAt: Date.now()
        };
      }
      redirectUrl += `&resultToken=${encodeURIComponent(resultToken)}`;
    } catch (err) {
      console.error('[AI_PREPARE_RESULT_FAIL]', err);
    }

    this.setData({ showCanvas: false });

    wx.redirectTo({
      url: redirectUrl,
      success: () => {
        console.log('[AI_REDIRECT_SUCCESS]', redirectUrl);
      },
      fail: (err) => {
        console.error('[AI_REDIRECT_FAIL]', redirectUrl, err);
        wx.showToast({ title: '打开结果页失败', icon: 'none' });
      }
    });
  },

  onKeepWaiting() {
    this.setData({ isTimeout: false });
  },

  onGoHistory() {
    this.rememberPendingAiTask();
    clearTimeout(this._timeoutTimer);
    clearTimeout(this._pollingTimer);

    wx.redirectTo({
      url: '/pages/history/history'
    });
  },

  rememberPendingAiTask() {
    const taskId = this.data.taskId;
    if (!taskId) return;

    let pending = [];
    try {
      const stored = wx.getStorageSync(PENDING_AI_HISTORY_KEY);
      pending = Array.isArray(stored) ? stored : [];
    } catch (e) {
      pending = [];
    }

    const next = pending.filter(item => item && item.taskId !== taskId);
    next.unshift({ taskId, createdAt: Date.now() });
    wx.setStorageSync(PENDING_AI_HISTORY_KEY, next.slice(0, 10));
  },
});
