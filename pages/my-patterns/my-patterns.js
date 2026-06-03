const request = require('../../utils/request');
const { hasSession } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { API_BASE_URL } = require('../../utils/config');

const THUMB_RENDER_BATCH_SIZE = 4;
const THUMB_MAX_SAMPLE_GRID = 80;

function scheduleIdle(callback, delay = 0) {
  if (typeof wx !== 'undefined' && wx.nextTick && delay === 0) {
    wx.nextTick(callback);
    return;
  }
  setTimeout(callback, delay);
}

function resolveImageUrl(url) {
  if (!url) return '';
  url = String(url).trim();
  if (!url) return '';
  // 过滤掉本地临时文件路径（这些路径不应该存在于数据库中）
  if (url.startsWith('wxfile://')) return '';
  // 如果是完整的 HTTP/HTTPS URL（COS URL），直接返回
  if (/^https?:\/\//i.test(url)) return url;
  // 如果是相对路径，拼接 API_BASE_URL
  return API_BASE_URL.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

Page({
  data: {
    patterns: [],
    filteredPatterns: [],
    keyword: '',
    loading: true,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    total: 0,
    patternCurrent: 0,
    patternLimit: 0,
    patternRuleText: '',
    patternRuleLoaded: false,
    navTop: 88,
    statusBarHeight: 44,
    navHeight: 32,
    capsuleWidth: 87,
    searchFocused: false,
    viewMode: 'thumb',
    swipedOffsets: {},
    touchItemId: null,
    touchStartX: 0,
    touchLastX: 0,
    swipeOpenPx: 140,
    isSwiping: false,
    swipeOffset: 0,
  },
  _pendingSwipeOffset: null,
  _swipeRaf: null,
  _renderedThumbKeys: null,
  _thumbRenderTimer: null,

  onLoad() {
    this._renderedThumbKeys = new Set();
    this.calcNavTop();
  },
  onShow() {
    this.calcNavTop();
    this.loadPatternRule();
    if (!this._dataLoaded || this._needsRefresh) {
      this.loadPatterns(true);
    }
    const tab = this.selectComponent('#appTabBar');
    if (tab && tab.setSelected) tab.setSelected(3);
  },

  onUnload() {
    if (this._thumbRenderTimer) {
      clearTimeout(this._thumbRenderTimer);
      this._thumbRenderTimer = null;
    }
    if (this._renderedThumbKeys) this._renderedThumbKeys.clear();
  },

  calcNavTop() {
    const layout = getSafeAreaLayout();
    const menuButton = layout.menuButton || {};
    this.setData({
      navTop: layout.navTop,
      statusBarHeight: menuButton.top || layout.statusBarHeight || 44,
      navHeight: menuButton.height || 32,
      capsuleWidth: menuButton.width || 87,
    });
  },

  loadPatternRule() {
    return request.get('/privilege/check/pattern-box')
      .then((rule) => {
        const current = Number(rule.current || 0);
        const limit = Number(rule.limit || 0);
        if (!Number.isFinite(limit) || limit <= 0 || rule.current === undefined) {
          this.setData({ patternRuleLoaded: false });
          return;
        }
        this.setData({
          patternCurrent: current,
          patternLimit: limit,
          patternRuleText: `${current}/${limit}`,
          patternRuleLoaded: true
        });
      })
      .catch(() => {
        this.setData({ patternRuleLoaded: false });
      });
  },

  loadPatterns(reset = false) {
    if (reset) {
      if (this._renderedThumbKeys) this._renderedThumbKeys.clear();
      this.setData({
        page: 1,
        hasMore: true,
        loading: !this._dataLoaded
      });
    } else {
      if (!this.data.hasMore || this.data.loadingMore) return Promise.resolve();
      this.setData({ loadingMore: true });
    }

    if (!hasSession()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.switchTab({ url: '/pages/index/index' });
      this.setData({ loading: false, loadingMore: false });
      return Promise.resolve();
    }

    return request.get('/box/list', {
      page: this.data.page,
      pageSize: this.data.pageSize
    })
      .then((res) => {
        const newItems = (Array.isArray(res.list) ? res.list : []).map(item => {
          let mappedPixelData = [];
          try {
            mappedPixelData = item.mappedPixelData
              ? (typeof item.mappedPixelData === 'string' ? JSON.parse(item.mappedPixelData) : item.mappedPixelData)
              : [];
          } catch (e) {
            console.error('解析 mappedPixelData 失败:', e, 'item.id:', item.id);
            mappedPixelData = [];
          }
          const rawSourceUrl = item.sourceUrl || '';
          const resolvedSourceUrl = resolveImageUrl(rawSourceUrl);
          const resolvedCoverUrl = resolveImageUrl(item.coverUrl || item.sourceUrl || '');
          const hasMappedData = Array.isArray(mappedPixelData) && mappedPixelData.length > 0;
          const sourceType = this.getPatternSourceType(item);
          const isAiSource = sourceType === 'ai';
          const hasOriginal = !!(resolvedSourceUrl && resolvedSourceUrl.trim());
          const isDraftSource = sourceType === 'draft';

          if (isDraftSource) {
            console.log('草稿箱来源记录:', {
              id: item.id,
              name: item.name,
              sourceType: item.sourceType,
              draftId: item.draftId,
              hasOriginal,
              hasMappedData,
              mappedPixelDataLength: mappedPixelData.length,
              mappedPixelDataType: typeof mappedPixelData
            });
          }

          return {
            id: item.id,
            name: item.name || ('图纸#' + item.id),
            gridSize: item.gridSize,
            colorCount: item.colorCount,
            brand: item.brand,
            sourceType: item.sourceType || '',
            sourceLabel: this.getPatternSourceLabel(sourceType),
            sourceClass: this.getPatternSourceClass(sourceType),
            draftId: item.draftId || null,
            historyId: item.historyId || null,
            mappedPixelData,
            sourceUrl: isAiSource ? '' : resolvedSourceUrl,
            coverUrl: isAiSource ? '' : (resolvedCoverUrl || resolvedSourceUrl),
            createdAt: this.formatTime(item.createdAt),
            boxId: item.id,
            hasOriginal: isAiSource ? false : hasOriginal,
            isDraftSource,
            hasCanvasCover: hasMappedData && (isDraftSource || isAiSource || !resolvedCoverUrl),
          };
        });

        const patterns = reset ? newItems : [...this.data.patterns, ...newItems];

        // 立即计算 filteredPatterns，避免显示空状态闪烁
        const kw = (this.data.keyword || '').trim().toLowerCase();
        const filteredPatterns = kw
          ? patterns.filter(p => (p.name || '').toLowerCase().includes(kw))
          : [...patterns];

        this._dataLoaded = true;
        this._needsRefresh = false;
        this.setData({
          patterns,
          filteredPatterns,
          page: this.data.page + 1,
          hasMore: res.hasMore || false,
          total: res.total || 0,
          patternCurrent: res.total || 0,
          patternRuleText: this.data.patternRuleLoaded ? `${Number(res.total || 0)}/${Number(this.data.patternLimit || 0)}` : '',
          loading: false,
          loadingMore: false
        }, () => {
          this.scheduleRenderThumbnails(60);
        });
      })
      .catch(() => {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false, loadingMore: false });
      });
  },

  onReachBottom() {
    if (this.data.keyword) return;
    this.loadPatterns(false);
  },

  onPullDownRefresh() {
    this.loadPatterns(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    const isAi = item.sourceType === 'AI' || (item.sourceLabel === 'AI生成') ? '&isAi=1' : '';
    wx.navigateTo({
      url: '/pages/preview/preview?boxId=' + item.id + isAi
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/profile/profile' });
      }
    });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    this.closeSwipe();
    wx.showModal({
      title: '提示', content: '确认删除此图纸？',
      success: (res) => {
        if (res.confirm) {
          request.delete('/box/delete/' + id)
            .then(() => {
              const patterns = this.data.patterns.filter(p => String(p.id) !== String(id));
              this.setData({ patterns }, () => {
                this.applyFilter();
                if (this._renderedThumbKeys) this._renderedThumbKeys.clear();
                this.scheduleRenderThumbnails(60);
              });
              wx.showToast({ title: '已删除', icon: 'success' });
            })
            .finally(() => this.loadPatternRule())
            .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
        }
      }
    });
  },

  closeSwipe() {
    const offsets = { ...this.data.swipedOffsets };
    Object.keys(offsets).forEach(k => { offsets[k] = 0; });
    this.setData({ swipedOffsets: offsets, touchItemId: null, touchLastX: 0, isSwiping: false });
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  getPatternSourceType(item) {
    const raw = String(item.sourceType || '').toUpperCase();
    if (raw === 'AI') return 'ai';
    if (item.draftId || raw === 'DRAW') return 'draft';
    if (raw === 'LOCAL') return 'free';
    const lc = raw.toLowerCase();
    if (lc.includes('ai')) return 'ai';
    if (lc.includes('draft') || lc.includes('draw')) return 'draft';
    if (lc.includes('free') || lc.includes('convert') || lc.includes('image')) return 'free';
    if (item.sourceUrl) return 'free';
    return '';
  },

  getPatternSourceLabel(sourceType) {
    if (sourceType === 'ai') return 'AI生成';
    if (sourceType === 'draft') return '草稿箱';
    if (sourceType === 'free') return '图片转换';
    return '';
  },

  getPatternSourceClass(sourceType) {
    return sourceType || '';
  },

  onSearchInput(e) {
    this.setData({ keyword: (e.detail.value || '').trim() }, () => {
      this.applyFilter();
      this.scheduleRenderThumbnails(60);
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
    this.setData({ viewMode: nextMode }, () => {
      this.scheduleRenderThumbnails(60);
    });
  },

  onRename(e) {
    if (this._renaming) return;
    const item = e.currentTarget.dataset.item;
    this.closeSwipe();
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: '输入新名称',
      content: item.name || '未命名作品',
      success: (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim();
          if (!newName || newName === item.name) return;
          this._renaming = true;
          wx.showLoading({ title: '保存中...', mask: true });
          request.put('/box/rename', { id: item.id, name: newName })
            .then(() => {
              const patterns = this.data.patterns.map(p => {
                if (String(p.id) === String(item.id)) {
                  return { ...p, name: newName };
                }
                return p;
              });
              this.setData({ patterns }, () => {
                this.applyFilter();
              });
              wx.showToast({ title: '已重命名', icon: 'success' });
            })
            .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }))
            .finally(() => {
              this._renaming = false;
              wx.hideLoading();
            });
        }
      }
    });
  },

  onTouchStart(e) {
    if (this.data.viewMode !== 'list') return;
    const id = e.currentTarget.dataset.id;
    const x = e.touches[0].pageX;
    // 关闭前一个打开的
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
  },

  onTouchMove(e) {
    if (this.data.viewMode !== 'list') return;
    if (!this.data.touchItemId) return;
    const x = e.touches[0].pageX;
    const lastX = this.data.touchLastX;
    const currentOffset = this._pendingSwipeOffset !== null ? this._pendingSwipeOffset : (this.data.swipeOffset || 0);

    // 计算本次移动的增量
    const deltaX = lastX - x;
    // 在当前偏移基础上累加增量
    let newOffset = currentOffset - deltaX;

    // 限制滑动范围：0 到 -swipeOpenPx
    newOffset = Math.max(-this.data.swipeOpenPx, Math.min(0, newOffset));

    this.data.touchLastX = x;
    this._scheduleSwipeOffset(newOffset);
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
      swipeOffset: 0,
      touchItemId: null,
      touchStartX: 0,
      touchLastX: 0,
      isSwiping: false,
    });
  },

  _scheduleSwipeOffset(offset) {
    this._pendingSwipeOffset = offset;
    if (this._swipeRaf) return;
    const runner = () => {
      this._swipeRaf = null;
      const id = this.data.touchItemId;
      if (!id || this._pendingSwipeOffset === null) return;
      const next = this._pendingSwipeOffset;
      this.setData({
        swipeOffset: next,
        [`swipedOffsets.${id}`]: next
      });
    };
    if (wx.nextTick) {
      this._swipeRaf = true;
      wx.nextTick(runner);
    } else {
      this._swipeRaf = setTimeout(runner, 16);
    }
  },

  applyFilter() {
    const patterns = this.data.patterns || [];
    const kw = (this.data.keyword || '').trim().toLowerCase();
    if (!kw) {
      this.setData({ filteredPatterns: [...patterns] });
      return;
    }
    const filtered = patterns.filter(p => {
      const name = (p.name || '').toLowerCase();
      return name.includes(kw);
    });
    this.setData({ filteredPatterns: filtered });
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
    const patterns = (this.data.filteredPatterns || []).filter(item => item && item.hasCanvasCover);
    if (!patterns.length) return;
    if (!this._renderedThumbKeys) this._renderedThumbKeys = new Set();

    const mode = this.data.viewMode;
    const pending = patterns.filter(item => !this._renderedThumbKeys.has(this._getThumbRenderKey(item, mode)));
    this._renderThumbnailBatch(pending, 0, mode);
  },

  _renderThumbnailBatch(items, startIndex, mode) {
    if (!items || startIndex >= items.length) return;
    const batch = items.slice(startIndex, startIndex + THUMB_RENDER_BATCH_SIZE);

    batch.forEach(item => this._renderOneThumbnail(item, mode));

    if (startIndex + THUMB_RENDER_BATCH_SIZE < items.length) {
      scheduleIdle(() => {
        this._renderThumbnailBatch(items, startIndex + THUMB_RENDER_BATCH_SIZE, mode);
      }, 16);
    }
  },

  _getThumbRenderKey(item, mode) {
    return `${mode}:${item.id}:${item.gridSize}:${item.updatedAt || item.createdAt || ''}`;
  },

  _renderOneThumbnail(item, mode) {
    const canvasId = mode === 'thumb' ? '#boxThumbCanvas' + item.id : '#boxListCanvas' + item.id;
    const renderKey = this._getThumbRenderKey(item, mode);
    const query = wx.createSelectorQuery();
    query.select(canvasId)
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

        this._drawThumbnailGrid(ctx, item, size);
        this._renderedThumbKeys.add(renderKey);
      });
  },

  _drawThumbnailGrid(ctx, item, size) {
    const gridSize = Number(item.gridSize || 64);
    const mappedPixelData = item.mappedPixelData || [];
    const sampleStep = Math.max(1, Math.ceil(gridSize / THUMB_MAX_SAMPLE_GRID));
    const blockSize = size / Math.ceil(gridSize / sampleStep);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    if (!mappedPixelData.length) return;

    for (let y = 0, sy = 0; y < gridSize; y += sampleStep, sy++) {
      for (let x = 0, sx = 0; x < gridSize; x += sampleStep, sx++) {
        const cell = mappedPixelData[y] && mappedPixelData[y][x];
        if (!cell || cell.isExternal) continue;
        ctx.fillStyle = cell.hex || ('rgb(' + cell.r + ', ' + cell.g + ', ' + cell.b + ')');
        ctx.fillRect(sx * blockSize, sy * blockSize, blockSize + 0.5, blockSize + 0.5);
      }
    }
  },
});
