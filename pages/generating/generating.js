/**
 * AI 生成任务轮询页面
 * 功能：轮询 AI 任务状态，成功后跳转到 ai-result 页面
 */
const request = require('../../utils/request');

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

        const resultToken = 'ai_' + taskId + '_' + Date.now();
        const mappedPixelData = taskData.mappedPixelData || [];
        const historyId = taskData.historyId || null;

        // 如果服务端还没处理完（mappedPixelData 尚未来得及写入），继续轮询
        if (!mappedPixelData.length && !historyId) {
          this.scheduleNextPoll(taskId);
          return;
        }

        const app = getApp();
        if (app && app.globalData) {
          if (!app.globalData.resultDataMap) app.globalData.resultDataMap = {};
          app.globalData.resultDataMap[resultToken] = {
            resultToken,
            taskId,
            historyId,
            aiImageUrl: taskData.aiImageUrl || '',
            originalImageUrl: taskData.originalImageUrl || taskData.imageUrl || taskData.sourceUrl || taskData.inputImageUrl || '',
            sizeMode: taskData.sizeMode || 'default',
            brand: taskData.brand || 'MARD',
            colorCount: taskData.colorCount || 0,
            mirror: !!(taskData.mirror),
            gridSize: Number(taskData.finalGridWidth || taskData.finalGridHeight || 48),
            mappedPixelData,
            preparedAt: Date.now()
          };
          if (typeof app.pruneResultDataMap === 'function') {
            app.pruneResultDataMap();
          }
        }

        const redirectUrl = `/pages/ai-result/ai-result?taskId=${encodeURIComponent(taskId)}`
          + `&resultToken=${encodeURIComponent(resultToken)}`
          + `&historyId=${historyId || ''}`;

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

});
