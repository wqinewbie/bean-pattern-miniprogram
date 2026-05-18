/**
 * AI 生成任务轮询页面
 * 功能：轮询 AI 任务状态，成功后跳转到 ai-result 页面
 */
const request = require('../../utils/request');

Page({
  data: {
    isTimeout: false,
    loadingText: '正在处理...',
    taskId: '',
  },

  _timeoutTimer: null,
  _pollingTimer: null,
  _pollingCount: 0,

  onLoad(options) {
    const taskId = options.taskId || '';
    const fromAiGenerate = options.fromAiGenerate === '1';
    this.setData({ taskId });

    if (fromAiGenerate) {
      // 从 ai-generate 页面跳转过来，需要先上传图片和调用 API
      this.setData({ loadingText: '正在上传图片...' });
      const app = getApp();
      const params = app.globalData.aiGenerateParams;

      if (!params) {
        wx.showToast({ title: '参数缺失', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // 上传图片并调用 AI 生成接口
      this.uploadImage(params.uploadedImage).then(imageUrl => {
        this.setData({ loadingText: 'AI 正在施展魔法...' });
        return this.callAiGenerate({
          imageUrl,
          style: params.style,
          size: params.size,
          brand: params.brand,
          colorCount: params.colorCount,
          mirror: params.mirror
        });
      }).then(taskId => {
        // 获取到 taskId 后开始轮询
        this.setData({ taskId });
        this.startPolling(taskId);

        // 8秒后显示超时提示
        this._timeoutTimer = setTimeout(() => {
          this.setData({ isTimeout: true });
        }, 8000);
      }).catch(err => {
        console.error('生成失败', err);
        wx.showToast({ title: err.message || '生成失败', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      });
    } else if (taskId) {
      this.startPolling(taskId);

      // 8秒后显示超时提示
      this._timeoutTimer = setTimeout(() => {
        this.setData({ isTimeout: true });
      }, 8000);
    } else {
      wx.showToast({ title: '任务ID缺失', icon: 'none' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  onUnload() {
    clearTimeout(this._timeoutTimer);
    clearTimeout(this._pollingTimer);
  },

  // ========== AI 任务轮询 ==========
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
        // 生成成功，跳转到结果页
        clearTimeout(this._timeoutTimer);
        clearTimeout(this._pollingTimer);

        // 从 globalData 获取生成参数
        const app = getApp();
        const aiParams = app.globalData.aiGenerateParams || {};
        const gridSize = aiParams.size || 64;
        const brand = aiParams.brand || 'MARD';

        wx.redirectTo({
          url: `/pages/ai-result/ai-result?taskId=${taskId}&aiImageUrl=${encodeURIComponent(data.aiImageUrl || '')}&gridSize=${gridSize}&brand=${brand}`
        });
      } else if (status === 'FAILED') {
        // 生成失败
        clearTimeout(this._timeoutTimer);
        clearTimeout(this._pollingTimer);

        wx.showToast({
          title: data.errorMessage || '生成失败',
          icon: 'none',
          duration: 2000
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      } else {
        // 继续轮询
        this.scheduleNextPoll(taskId);
      }
    }).catch(err => {
      console.error('查询任务状态失败', err);
      this.scheduleNextPoll(taskId);
    });
  },

  scheduleNextPoll(taskId) {
    this._pollingCount++;

    // 智能轮询策略
    let delay;
    if (this._pollingCount < 5) {
      delay = 2000; // 前10秒：每2秒查询一次
    } else if (this._pollingCount < 15) {
      delay = 5000; // 10-30秒：每5秒查询一次
    } else if (this._pollingCount < 30) {
      delay = 10000; // 30-60秒：每10秒查询一次
    } else {
      // 超过60秒，停止轮询
      return;
    }

    this._pollingTimer = setTimeout(() => {
      this.pollTaskStatus(taskId);
    }, delay);
  },

  onKeepWaiting() {
    // 继续守护 - 关闭超时提示，继续轮询
    this.setData({ isTimeout: false });
  },

  onGoHistory() {
    // 去时光机
    clearTimeout(this._timeoutTimer);
    clearTimeout(this._pollingTimer);

    wx.redirectTo({
      url: '/pages/history/history'
    });
  },

  // ========== AI 生成相关方法 ==========
  uploadImage(filePath) {
    return request.uploadImage(filePath).then(data => data.imageUrl || data.originalUrl);
  },

  callAiGenerate(params) {
    return new Promise((resolve, reject) => {
      request.post('/ai/generate', params).then(data => {
        if (data && data.taskId) {
          resolve(data.taskId);
        } else {
          reject(new Error('生成失败'));
        }
      }).catch(err => {
        reject(err);
      });
    });
  },
});
