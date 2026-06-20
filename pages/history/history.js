const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { showCapacityFullIfNeeded, showRequestErrorToast } = require('../../utils/capacity-toast');
const analytics = require('../../utils/analytics');

const THUMB_RENDER_BATCH_SIZE = 4;
const THUMB_MAX_SAMPLE_GRID = 80;

function scheduleIdle(callback, delay = 0) {
  if (typeof wx !== 'undefined' && wx.nextTick && delay === 0) {
    wx.nextTick(callback);
    return;
  }
  setTimeout(callback, delay);
}

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
    swipeOffset: 0,
  },
  _pendingSwipeOffset: null,
  _swipeRaf: null,
  _historyById: null,
  _historyRenderDataById: null,
  _renderedThumbKeys: null,
  _thumbRenderTimer: null,

  onLoad() {
    this._historyById = {};
    this._historyRenderDataById = {};
    this._renderedThumbKeys = new Set();
    this.calcNavTop();
  },
  onUnload() {
    if (this._thumbRenderTimer) {
      clearTimeout(this._thumbRenderTimer);
      this._thumbRenderTimer = null;
    }
    if (this._renderedThumbKeys) this._renderedThumbKeys.clear();
  },
  onShow() {
    this.calcNavTop();
    if (!this._dataLoaded || this._needsRefresh) {
      this.loadHistory(true);
    }
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
      this._historyById = {};
      this._historyRenderDataById = {};
      if (this._renderedThumbKeys) this._renderedThumbKeys.clear();
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
            const createdAt = this.formatTime(item.createdAt);
            const aiStyle = item.aiStyle || item.style || '';
            const brand = item.brand || 'MARD';
            const colorCount = item.colorCount || 0;
            let mappedPixelData = [];
            try {
              mappedPixelData = item.mappedPixelData
                ? (typeof item.mappedPixelData === 'string' ? JSON.parse(item.mappedPixelData) : item.mappedPixelData)
                : [];
            } catch (e) { mappedPixelData = []; }
            const hasMappedData = Array.isArray(mappedPixelData) && mappedPixelData.length > 0;
            const listItem = {
              id: item.id,
              name: item.name || ('记录#' + item.id),
              gridSize: item.gridSize,
              colorCount,
              brand,
              aiStyle,
              metaText: isAiSource
                ? this.buildMetaText([brand, colorCount + '色', aiStyle, createdAt])
                : this.buildMetaText([(item.gridSize || 64) + 'x' + (item.gridSize || 64), brand, colorCount + '色', createdAt]),
              sourceUrl: isAiSource ? '' : (item.sourceUrl || ''),
              isAiSource,
              hasCanvasCover: isAiSource && hasMappedData,
              hasMappedData,
              boxId: item.boxId,
              createdAt,
              expiresAt: this.formatTime(item.expiresAt),
              expireText: item.expiresAt ? ('到期 ' + this.formatTime(item.expiresAt)) : '',
            };
            this._historyById[String(listItem.id)] = listItem;
            if (hasMappedData) {
              this._historyRenderDataById[String(listItem.id)] = {
                gridSize: listItem.gridSize || 64,
                mappedPixelData,
                updatedAt: item.updatedAt || item.createdAt || ''
              };
            }
            return listItem;
          });

          const history = reset ? newItems : [...this.data.history, ...newItems];

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
          }, () => this.scheduleRenderThumbnails(60));
        })
        .catch(() => {
          this.setData({ loading: false, loadingMore: false });
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
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
    const item = this._getHistoryById(e.currentTarget.dataset.id);
    if (!item) return;
    const isAi = item.isAiSource ? '&isAi=1' : '';
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
    this.setData({ viewMode: nextMode }, () => this.scheduleRenderThumbnails(60));
  },

  scheduleRenderThumbnails(delay = 0) {
    if (this._thumbRenderTimer) {
      clearTimeout(this._thumbRenderTimer);
      this._thumbRenderTimer = null;
    }
    this._thumbRenderTimer = setTimeout(() => {
      this._thumbRenderTimer = null;
      this.renderThumbnails();
    }, delay);
  },

  renderThumbnails() {
    if (this.data.viewMode !== 'thumb') return;
    const history = (this.data.filteredHistory || []).filter(item => item && item.hasCanvasCover);
    if (!history.length) return;
    if (!this._renderedThumbKeys) this._renderedThumbKeys = new Set();
    const pending = history.filter(item => !this._renderedThumbKeys.has(this._getThumbRenderKey(item)));
    this._renderThumbnailBatch(pending, 0);
  },

  _renderThumbnailBatch(items, startIndex) {
    if (!items || startIndex >= items.length || this.data.viewMode !== 'thumb') return;
    const batch = items.slice(startIndex, startIndex + THUMB_RENDER_BATCH_SIZE);
    batch.forEach(item => this._renderOneThumbnail(item));
    if (startIndex + THUMB_RENDER_BATCH_SIZE < items.length) {
      scheduleIdle(() => this._renderThumbnailBatch(items, startIndex + THUMB_RENDER_BATCH_SIZE), 16);
    }
  },

  _getThumbRenderKey(item) {
    const renderData = this._historyRenderDataById && this._historyRenderDataById[String(item.id)];
    return `thumb:${item.id}:${item.gridSize}:${(renderData && renderData.updatedAt) || item.createdAt || ''}`;
  },

  _renderOneThumbnail(item) {
    const renderData = this._historyRenderDataById && this._historyRenderDataById[String(item.id)];
    if (!renderData || !renderData.mappedPixelData || !renderData.mappedPixelData.length) return;
    const renderKey = this._getThumbRenderKey(item);
    const query = wx.createSelectorQuery();
    query.select('#histThumbCanvas' + item.id)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
        const dpr = Math.min(deviceInfo.pixelRatio || 2, 2);
        const size = Math.min(res[0].width, res[0].height) || 200;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.setTransform ? ctx.setTransform(dpr, 0, 0, dpr, 0, 0) : ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = false;
        this._drawThumbnailGrid(ctx, renderData, size);
        this._renderedThumbKeys.add(renderKey);
      });
  },

  _drawThumbnailGrid(ctx, renderData, size) {
    const gridSize = Number(renderData.gridSize || 64);
    const mappedPixelData = renderData.mappedPixelData || [];
    const sampleStep = Math.max(1, Math.ceil(gridSize / THUMB_MAX_SAMPLE_GRID));
    const blockSize = size / Math.ceil(gridSize / sampleStep);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    for (let y = 0, sy = 0; y < gridSize; y += sampleStep, sy++) {
      for (let x = 0, sx = 0; x < gridSize; x += sampleStep, sx++) {
        const cell = mappedPixelData[y] && mappedPixelData[y][x];
        if (!cell || cell.isExternal) continue;
        ctx.fillStyle = cell.hex || ('rgb(' + cell.r + ', ' + cell.g + ', ' + cell.b + ')');
        ctx.fillRect(sx * blockSize, sy * blockSize, blockSize + 0.5, blockSize + 0.5);
      }
    }
  },

  applyFilter() {
    const history = this.data.history || [];
    const kw = (this.data.keyword || '').trim().toLowerCase();
    if (!kw) {
      this.setData({ filteredHistory: [...history] }, () => this.scheduleRenderThumbnails(60));
      return;
    }
    const filtered = history.filter(h => {
      const name = (h.name || '').toLowerCase();
      return name.includes(kw);
    });
    this.setData({ filteredHistory: filtered }, () => this.scheduleRenderThumbnails(60));
  },

  closeSwipe() {
    const offsets = { ...this.data.swipedOffsets };
    Object.keys(offsets).forEach(k => { offsets[k] = 0; });
    this._pendingSwipeOffset = null;
    this.setData({ swipedOffsets: offsets, touchItemId: null, touchLastX: 0, isSwiping: false, swipeOffset: 0 });
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
      swipeOffset: offsets[String(id)] || 0,
    });
    this._pendingSwipeOffset = null;
  },

  onTouchMove(e) {
    if (this.data.viewMode !== 'list') return;
    if (!this.data.touchItemId) return;
    const x = e.touches[0].pageX;
    const lastX = this.data.touchLastX;
    const currentOffset = this._pendingSwipeOffset !== null ? this._pendingSwipeOffset : (this.data.swipeOffset || 0);
    const deltaX = lastX - x;
    let newOffset = currentOffset - deltaX;
    newOffset = Math.max(-this.data.swipeOpenPx, Math.min(0, newOffset));
    this.data.touchLastX = x;
    this._scheduleSwipeOffset(newOffset);
  },

  _scheduleSwipeOffset(offset) {
    this._pendingSwipeOffset = offset;
    if (this._swipeRaf) return;
    const runner = () => {
      this._swipeRaf = null;
      const id = this.data.touchItemId;
      if (!id || this._pendingSwipeOffset === null) return;
      this.setData({ swipeOffset: this._pendingSwipeOffset });
    };
    if (wx.nextTick) {
      this._swipeRaf = true;
      wx.nextTick(runner);
    } else {
      this._swipeRaf = setTimeout(runner, 16);
    }
  },

  onTouchEnd(e) {
    if (this.data.viewMode !== 'list') return;
    if (!this.data.touchItemId) return;
    const id = this.data.touchItemId;
    const currentOffset = this._pendingSwipeOffset !== null ? this._pendingSwipeOffset : (this.data.swipeOffset || this.data.swipedOffsets[String(id)] || 0);
    const threshold = this.data.swipeOpenPx * 0.4;
    const snapOpen = Math.abs(currentOffset) > threshold;
    this.setData({
      [`swipedOffsets.${id}`]: snapOpen ? -this.data.swipeOpenPx : 0,
      swipeOffset: snapOpen ? -this.data.swipeOpenPx : 0,
      touchItemId: null,
      touchStartX: 0,
      touchLastX: 0,
      isSwiping: false,
    });
    this._pendingSwipeOffset = null;
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
          analytics.track('history_restore_click', {
            pattern_id: item.id,
            expired_status: item.expired ? 'expired' : 'active'
          });
          analytics.track('pattern_box_save_result', {
            result: 'success',
            pattern_id: item.id,
            pattern_source: 'history'
          }, { immediate: true });
          showCapacityFullIfNeeded(result, { type: 'box' });
          this.loadHistory();
        })
        .catch((err) => {
          showRequestErrorToast(err, '保存失败');
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
              if (this._historyById) delete this._historyById[String(id)];
              if (this._historyRenderDataById) delete this._historyRenderDataById[String(id)];
              this.setData({ history }, () => {
                this.applyFilter();
              });
              wx.showToast({ title: '已删除', icon: 'success' });
              analytics.track('pattern_delete_result', {
                result: 'success',
                container_type: 'history',
                pattern_id: id,
                pattern_source: 'history'
              }, { immediate: true });
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

  buildMetaText(parts) {
    return (parts || []).filter(part => part !== undefined && part !== null && String(part).trim() !== '').join(' · ');
  },
  _getHistoryById(id) {
    const key = String(id || '');
    return (this._historyById && this._historyById[key]) || (this.data.history || []).find(h => String(h.id) === key) || null;
  },
});
