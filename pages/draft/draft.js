const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { generateDraftName } = require('../../utils/name-helper');
const { showCapacityFullIfNeeded, showRequestErrorToast } = require('../../utils/capacity-toast');

Page({
  data: {
    loading: false,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    total: 0,
    draftCurrent: 0,
    draftLimit: 0,
    draftRuleText: '',
    draftRuleLoaded: false,
    drafts: [],
    filteredDrafts: [],
    keyword: '',
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
    showSaveModal: false,
    selectedDraft: null,
    patternName: '',
  },
  _pendingSwipeOffset: null,
  _swipeRaf: null,
  _draftById: null,
  _draftRenderCache: null,
  _thumbnailRenderToken: 0,

  onLoad() {
    this.calcNavTop();
  },

  onShow() {
    this.calcNavTop();
    this.loadDraftRule();
    if (!this._dataLoaded || this._needsRefresh) {
      this.loadDrafts(true);
    }
  },

  loadDraftRule() {
    return request.get('/privilege/check/draft-box')
      .then((rule) => {
        const current = Number(rule.current || 0);
        const limit = Number(rule.limit || 0);
        if (!Number.isFinite(limit) || limit <= 0 || rule.current === undefined) {
          this.setData({ draftRuleLoaded: false });
          return;
        }
        this.setData({
          draftCurrent: current,
          draftLimit: limit,
          draftRuleText: `${current}/${limit}`,
          draftRuleLoaded: true
        });
      })
      .catch(() => {
        this.setData({ draftRuleLoaded: false });
      });
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

  onPullDownRefresh() {
    this.loadDrafts(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadDrafts(reset = false) {
    this._thumbnailRenderToken++;
    if (reset) {
      this.setData({
        page: 1,
        hasMore: true,
        loading: !this._dataLoaded
      });
    } else {
      if (!this.data.hasMore || this.data.loadingMore) return;
      this.setData({ loadingMore: true });
    }

    return request.get('/draft/list', {
      page: this.data.page,
      pageSize: this.data.pageSize
    })
      .then((res) => {
        this._draftById = this._draftById || {};
        this._draftRenderCache = this._draftRenderCache || {};
        if (reset) {
          const nextIds = {};
          (res.list || []).forEach((draft) => { nextIds[String(draft.id)] = true; });
          Object.keys(this._draftById).forEach((id) => {
            if (!nextIds[id]) {
              delete this._draftById[id];
              delete this._draftRenderCache[id];
            }
          });
        }

        const newItems = (res.list || []).map((draft) => {
          const id = String(draft.id);
          const previous = this._draftById[id];
          const changed = !previous || String(previous.updatedAt || '') !== String(draft.updatedAt || '');
          this._draftById[id] = draft;
          if (changed) delete this._draftRenderCache[id];

          const hasCanvas = !!draft.mappedPixelData || (!!draft.gridData && !!draft.colorPalette);
          return this._buildDraftListItem(draft, hasCanvas);
        });

        const drafts = reset ? newItems : [...this.data.drafts, ...newItems];

        // 立即计算 filteredDrafts，避免显示空状态闪烁
        const kw = (this.data.keyword || '').trim().toLowerCase();
        const filteredDrafts = kw
          ? drafts.filter(d => (d.name || '').toLowerCase().includes(kw))
          : [...drafts];

        this._dataLoaded = true;
        this._needsRefresh = false;
        this.setData({
          drafts,
          filteredDrafts,
          page: this.data.page + 1,
          hasMore: res.hasMore || false,
          total: res.total || 0,
          draftCurrent: res.total || 0,
          draftRuleText: this.data.draftRuleLoaded ? `${Number(res.total || 0)}/${Number(this.data.draftLimit || 0)}` : '',
          loading: false,
          loadingMore: false
        }, () => {
          setTimeout(() => this.renderVisibleThumbnails(), reset ? 40 : 120);
        });
      })
      .catch(() => {
        this.setData({ loading: false, loadingMore: false });
      });
  },

  onReachBottom() {
    if (this.data.keyword) return;
    this.loadDrafts(false);
  },

  _buildDraftListItem(draft, hasCanvas) {
    return {
      id: draft.id,
      sourceType: draft.sourceType,
      brand: draft.brand,
      colorCount: draft.colorCount,
      name: draft.name,
      gridSize: draft.gridSize,
      boxId: draft.boxId,
      sourceUrl: draft.sourceUrl || draft.coverUrl || '',
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      expiresAt: draft.expiresAt,
      hasCanvas
    };
  },

  _getDraftById(id) {
    const key = String(id || '');
    return (this._draftById && this._draftById[key]) || (this.data.drafts || []).find(d => String(d.id) === key) || null;
  },

  _parseMaybeJSON(value, fallback) {
    if (!value) return fallback;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  },

  _getDraftRenderData(id) {
    const key = String(id || '');
    const draft = this._getDraftById(key);
    if (!draft) return null;

    const signature = [
      draft.updatedAt || '',
      draft.mappedPixelData ? draft.mappedPixelData.length : 0,
      draft.gridData ? draft.gridData.length : 0,
      draft.colorPalette ? draft.colorPalette.length : 0
    ].join(':');
    const cached = this._draftRenderCache && this._draftRenderCache[key];
    if (cached && cached.signature === signature) return cached.data;

    const data = {
      gridSize: draft.gridSize || 16,
      mappedPixelData: this._parseMaybeJSON(draft.mappedPixelData, []),
      gridData: this._parseMaybeJSON(draft.gridData, []),
      colorPalette: this._parseMaybeJSON(draft.colorPalette, [])
    };
    this._draftRenderCache = this._draftRenderCache || {};
    this._draftRenderCache[key] = { signature, data };
    return data;
  },

  // 渲染可见区域的缩略图（分批渲染，避免性能问题）
  renderVisibleThumbnails() {
    const { drafts, viewMode } = this.data;
    const displayDrafts = this.data.filteredDrafts || drafts;
    const needRenderDrafts = displayDrafts.filter(d => d.hasCanvas);
    const renderToken = ++this._thumbnailRenderToken;

    if (needRenderDrafts.length === 0) return;

    // 分批渲染，每批3个，避免卡顿
    const batchSize = 3;
    let currentIndex = 0;

    const renderBatch = () => {
      if (renderToken !== this._thumbnailRenderToken) return;
      const batch = needRenderDrafts.slice(currentIndex, currentIndex + batchSize);
      if (batch.length === 0) return;

      batch.forEach(draft => {
        this.renderSingleThumbnail(draft.id, viewMode);
      });

      currentIndex += batchSize;
      if (currentIndex < needRenderDrafts.length) {
        setTimeout(renderBatch, 100); // 每批之间间隔100ms
      }
    };

    renderBatch();
  },

  // 渲染单个缩略图
  renderSingleThumbnail(draftId, viewMode) {
    const draft = this._getDraftRenderData(draftId);
    if (!draft) return;
    const canvasId = viewMode === 'thumb' ? ('draftCanvas' + draftId) : ('draftListCanvas' + draftId);
    const query = wx.createSelectorQuery();
    query.select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) return;

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(wx.getWindowInfo().pixelRatio || 2, 2); // 限制最大dpr为2，减少内存占用
        const width = res[0].width;
        const height = res[0].height;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const gridSize = draft.gridSize || 16;
        const cellSize = Math.min(width, height) / gridSize;

        // 建立颜色索引
        const colorIndexMap = {};
        draft.colorPalette.forEach((color, index) => {
          colorIndexMap[color.index !== undefined ? color.index : index] = color;
        });

        // 绘制底色
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        if (draft.mappedPixelData && draft.mappedPixelData.length) {
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              const cell = draft.mappedPixelData[y] && draft.mappedPixelData[y][x];
              if (!cell || cell.isExternal) continue;
              ctx.fillStyle = 'rgb(' + cell.r + ', ' + cell.g + ', ' + cell.b + ')';
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
          }
          return;
        }

        // 绘制格子
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const colorIndex = draft.gridData[y] ? draft.gridData[y][x] : 0;
            const color = colorIndexMap[colorIndex];
            if (color) {
              ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
          }
        }
      });
  },

  // 点击草稿查看详情
  onItemTap(e) {
    const item = this._getDraftById(e.currentTarget.dataset.id);
    if (!item) return;
    wx.navigateTo({
      url: '/pages/preview/preview?draftId=' + item.id + '&sourceType=DRAFT'
    });
  },

  // 继续编辑
  onContinueEdit(e) {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const item = this._getDraftById(e.currentTarget.dataset.id);
      if (!item) return;
      this._needsRefresh = true;
      wx.navigateTo({
        url: '/pages/draw/draw?draftId=' + item.id +
          '&source=draft' +
          '&gridSize=' + item.gridSize +
          '&brand=' + (item.brand || '')
      });
    });
  },

  // 保存到图纸箱
  onSaveToBox(e) {
    this.closeSwipe();
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const item = this._getDraftById(e.currentTarget.dataset.id);
      if (!item) return;
      this.setData({
        showSaveModal: true,
        selectedDraft: item,
        patternName: item.name || ''
      });
    });
  },

  onCloseSaveModal() {
    this.setData({ showSaveModal: false, selectedDraft: null, patternName: '' });
  },

  onNameInput(e) {
    this.setData({ patternName: e.detail.value || '' });
  },

  onConfirmSaveToBox() {
    const { selectedDraft, patternName } = this.data;
    if (!selectedDraft) return;

    const name = (patternName || '').trim() || generateDraftName();

    request.post('/draft/to-box', {
      draftId: selectedDraft.id,
      name: name
    })
      .then((result) => {
        if (result && result.alreadySaved) {
          wx.showToast({ title: '该草稿已保存到图纸箱', icon: 'none' });
        } else {
          wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
          showCapacityFullIfNeeded(result, { type: 'box' });
        }
        this.setData({ showSaveModal: false, selectedDraft: null, patternName: '' });
        this.loadDrafts(true);
      })
      .catch((err) => {
        showRequestErrorToast(err, '保存失败');
      });
  },

  onRename(e) {
    const item = this._getDraftById(e.currentTarget.dataset.id);
    if (!item) return;
    this.closeSwipe();
    wx.showModal({
      title: '重命名',
      editable: true,
      placeholderText: '输入新名称',
      content: item.name || '未命名草稿',
      success: (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim();
          if (!newName || newName === item.name) return;
          request.put('/draft/rename', { id: item.id, name: newName })
            .then(() => {
              const cached = this._getDraftById(item.id);
              if (cached) cached.name = newName;
              const drafts = this.data.drafts.map(d => {
                if (String(d.id) === String(item.id)) {
                  return { ...d, name: newName };
                }
                return d;
              });
              this.setData({ drafts }, () => {
                this.applyFilter();
              });
              wx.showToast({ title: '已重命名', icon: 'success' });
            })
            .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
        }
      }
    });
  },

  // 删除草稿
  onDeleteDraft(e) {
    const { id } = e.currentTarget.dataset;
    this.closeSwipe();
    wx.showModal({
      title: '删除草稿',
      content: '确认删除这个草稿？删除后无法恢复',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          request.delete('/draft/delete/' + id)
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadDraftRule();
              this.loadDrafts(true);
            })
            .catch(() => {
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
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
      // 搜索后重新渲染可见缩略图
      setTimeout(() => this.renderVisibleThumbnails(), 60);
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
      // 切换视图模式后重新渲染
      setTimeout(() => this.renderVisibleThumbnails(), 100);
    });
  },

  applyFilter() {
    const drafts = this.data.drafts || [];
    const kw = (this.data.keyword || '').trim().toLowerCase();
    if (!kw) {
      this.setData({ filteredDrafts: [...drafts] });
      return;
    }
    const filtered = drafts.filter(d => {
      const name = (d.name || '').toLowerCase();
      return name.includes(kw);
    });
    this.setData({ filteredDrafts: filtered });
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
      const next = this._pendingSwipeOffset;
      this.setData({
        swipeOffset: next
      });
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
});
