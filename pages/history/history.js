const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { API_BASE_URL } = require('../../utils/config');
const { processAiResult } = require('../../utils/ai-result-processor');

const PENDING_AI_HISTORY_KEY = 'pending_ai_history_tasks';

Page({
  data: {
    history: [],
    filteredHistory: [],
    keyword: '',
    loading: true,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    total: 0,
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

  _pendingAiTimer: null,
  _pendingAiRunning: false,

  onLoad() {
    this.calcNavTop();
  },
  onShow() {
    this.calcNavTop();
    if (!this._dataLoaded || this._needsRefresh) {
      this.loadHistory(true);
    }
    this.resumePendingAiTasks();
  },

  onHide() {
    this.clearPendingAiTimer();
  },

  onUnload() {
    this.clearPendingAiTimer();
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

  loadHistory(reset = false) {
    if (reset) {
      this.setData({
        page: 1,
        history: [],
        filteredHistory: [],
        hasMore: true,
        loading: true
      });
    } else {
      if (!this.data.hasMore || this.data.loadingMore) return Promise.resolve();
      this.setData({ loadingMore: true });
    }

    return ensureProfileComplete().then((ok) => {
      if (!ok) {
        this.setData({ loading: false, loadingMore: false });
        return;
      }

      return request.get('/history/list', {
        page: this.data.page,
        pageSize: this.data.pageSize
      })
        .then((res) => {
          const newItems = (Array.isArray(res.list) ? res.list : []).map((item) => {
            const sourceType = String(item.sourceType || '').toUpperCase();
            const isAiSource = sourceType === 'AI' || sourceType.includes('AI');
            let mappedPixelData = [];
            try {
              mappedPixelData = item.mappedPixelData
                ? (typeof item.mappedPixelData === 'string' ? JSON.parse(item.mappedPixelData) : item.mappedPixelData)
                : [];
            } catch (e) { mappedPixelData = []; }
            const hasMappedData = Array.isArray(mappedPixelData) && mappedPixelData.length > 0;
            return {
              id: item.id,
              name: item.name || ('记录#' + item.id),
              gridSize: item.gridSize,
              colorCount: item.colorCount,
              brand: item.brand,
              gridData: item.gridData,
              colorPalette: item.colorPalette,
              sourceUrl: isAiSource ? '' : (item.sourceUrl || ''),
              mappedPixelData,
              isAiSource,
              hasCanvasCover: isAiSource && hasMappedData,
              boxId: item.boxId,
              createdAt: this.formatTime(item.createdAt),
              expiresAt: this.formatTime(item.expiresAt),
              expireText: item.expiresAt ? ('到期 ' + this.formatTime(item.expiresAt)) : '',
            };
          });

          const history = reset ? newItems : [...this.data.history, ...newItems];

          // 立即计算 filteredHistory，避免显示空状态闪烁
          const kw = (this.data.keyword || '').trim().toLowerCase();
          const filteredHistory = kw
            ? history.filter(h => (h.name || '').toLowerCase().includes(kw))
            : [...history];

          this._dataLoaded = true;
          this._needsRefresh = false;
          this.setData({
            history,
            filteredHistory,
            page: this.data.page + 1,
            hasMore: res.hasMore || false,
            total: res.total || 0,
            loading: false,
            loadingMore: false
          }, () => {
            setTimeout(() => this.renderThumbnails(), 60);
          });
        })
        .catch(() => {
          this.setData({ loading: false, loadingMore: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
  },

  getPendingAiTasks() {
    try {
      const stored = wx.getStorageSync(PENDING_AI_HISTORY_KEY);
      return Array.isArray(stored) ? stored.filter(item => item && item.taskId) : [];
    } catch (e) {
      return [];
    }
  },

  setPendingAiTasks(tasks) {
    wx.setStorageSync(PENDING_AI_HISTORY_KEY, (tasks || []).filter(item => item && item.taskId).slice(0, 10));
  },

  clearPendingAiTimer() {
    if (this._pendingAiTimer) {
      clearTimeout(this._pendingAiTimer);
      this._pendingAiTimer = null;
    }
  },

  schedulePendingAiResume() {
    this.clearPendingAiTimer();
    if (!this.getPendingAiTasks().length) return;
    this._pendingAiTimer = setTimeout(() => {
      this.resumePendingAiTasks();
    }, 5000);
  },

  toReadableImageUrl(imageUrl) {
    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) return imageUrl;
    return `${API_BASE_URL}/api/image/proxy?url=${encodeURIComponent(imageUrl)}`;
  },

  buildAiHistoryPayload(taskData, prepared) {
    const fallbackGridSize = taskData.sizeMode === 'small' ? 32 : 48;
    const gridSize = Number(prepared.gridSize || taskData.finalGridWidth || taskData.finalGridHeight || fallbackGridSize);
    const colorList = prepared.colorList || [];
    return {
      sourceType: 'AI',
      brand: prepared.brand || taskData.brand || 'MARD',
      colorCount: Array.isArray(colorList) ? colorList.length : Number(taskData.colorCount || 0),
      name: 'AI记录#' + Date.now(),
      gridSize,
      mappedPixelData: JSON.stringify(prepared.mappedPixelData || []),
      sourceUrl: taskData.aiImageUrl || '',
      boxId: null
    };
  },

  async saveCompletedAiTaskToHistory(taskData) {
    const aiImageUrl = taskData.aiImageUrl || '';
    if (!aiImageUrl) return false;

    const sizeMode = taskData.sizeMode || 'default';
    const fallbackGridSize = sizeMode === 'small' ? 32 : 48;
    const gridSize = Number(taskData.finalGridWidth || taskData.finalGridHeight || fallbackGridSize);
    const brand = taskData.brand || 'MARD';
    const prepared = await processAiResult(this, this.toReadableImageUrl(aiImageUrl), {
      gridSize,
      brand,
      mirror: !!taskData.mirror
    });

    if (!prepared || !prepared.mappedPixelData || !prepared.mappedPixelData.length) {
      return false;
    }

    await request.post('/history/save', this.buildAiHistoryPayload(taskData, {
      ...prepared,
      gridSize,
      brand
    }));
    return true;
  },

  async resumePendingAiTasks() {
    const pending = this.getPendingAiTasks();
    if (!pending.length || this._pendingAiRunning) return;

    this._pendingAiRunning = true;
    let changed = false;
    let savedAny = false;
    const remaining = [];

    for (const item of pending) {
      try {
        const data = await request.get(`/ai/task/${item.taskId}`);
        const taskData = data && data.data ? data.data : data;
        const status = String((taskData && taskData.status) || '').trim().toUpperCase();

        if (status === 'SUCCESS') {
          const saved = await this.saveCompletedAiTaskToHistory(taskData);
          changed = true;
          savedAny = savedAny || saved;
        } else if (status === 'FAILED') {
          changed = true;
        } else {
          remaining.push(item);
        }
      } catch (err) {
        console.warn('[history] resume pending AI task failed', item.taskId, err);
        remaining.push(item);
      }
    }

    if (changed) {
      this.setPendingAiTasks(remaining);
    }

    this._pendingAiRunning = false;

    if (savedAny) {
      wx.showToast({ title: 'AI结果已加入时光机', icon: 'success' });
      this.loadHistory(true);
    }

    this.schedulePendingAiResume();
  },

  onReachBottom() {
    if (this.data.keyword) return;
    this.loadHistory(false);
  },

  onPullDownRefresh() {
    this.loadHistory(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    const isAi = item.isAiSource ? '&isAi=1' : '';
    // 跳转到预加载页面，先渲染再显示预览
    wx.navigateTo({
      url: '/pages/preview/preview?historyId=' + item.id + '&sourceType=HISTORY' + isAi
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

  renderThumbnails() {
    if (this.data.viewMode !== 'thumb') return;
    const history = this.data.filteredHistory || [];
    history.forEach(item => {
      if (!item.hasCanvasCover) return;
      const query = wx.createSelectorQuery();
      query.select('#histThumbCanvas' + item.id)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
          const dpr = Math.min(deviceInfo.pixelRatio || 2, 2);
          const size = Math.min(res[0].width, res[0].height) || 200;
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          ctx.scale(dpr, dpr);
          const gridSize = item.gridSize || 64;
          const cellSize = size / gridSize;
          const mappedPixelData = item.mappedPixelData || [];
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          if (mappedPixelData.length > 0) {
            for (let y = 0; y < gridSize; y++) {
              for (let x = 0; x < gridSize; x++) {
                const cell = mappedPixelData[y] && mappedPixelData[y][x];
                if (!cell || cell.isExternal) continue;
                ctx.fillStyle = 'rgb(' + cell.r + ', ' + cell.g + ', ' + cell.b + ')';
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
              }
            }
          }
        });
    });
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
        .then((result) => {
          wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
          if (result && result.capacityFull) {
            setTimeout(() => {
              wx.showToast({ title: result.capacityMessage || '图纸箱容量已满', icon: 'none', duration: 2200 });
            }, 1200);
          }
          this.loadHistory();
        })
        .catch((err) => {
          if (err && err.message) {
            wx.showToast({ title: err.message, icon: 'none' });
            return;
          }
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
