const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { generateDraftName } = require('../../utils/name-helper');

Page({
  data: {
    loading: false,
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
    showSaveModal: false,
    selectedDraft: null,
    patternName: '',
  },

  onLoad() {
    this.calcNavTop();
  },

  onShow() {
    this.calcNavTop();
    this.loadDrafts();
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
    this.loadDrafts().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadDrafts() {
    this.setData({ loading: true, drafts: [], filteredDrafts: [] });
    return request.get('/draft/list')
      .then((drafts) => {
        const processedDrafts = (drafts || []).map((draft) => {
          let mappedPixelData = [];
          try {
            mappedPixelData = draft.mappedPixelData
              ? (typeof draft.mappedPixelData === 'string' ? JSON.parse(draft.mappedPixelData) : draft.mappedPixelData)
              : [];
          } catch (e) {
            mappedPixelData = [];
          }

          let gridData = [];
          let colorPalette = [];
          try {
            gridData = draft.gridData ? (typeof draft.gridData === 'string' ? JSON.parse(draft.gridData) : draft.gridData) : [];
            colorPalette = draft.colorPalette ? (typeof draft.colorPalette === 'string' ? JSON.parse(draft.colorPalette) : draft.colorPalette) : [];
          } catch (e) {
            gridData = [];
            colorPalette = [];
          }

          const hasCanvas = mappedPixelData.length > 0 || (gridData.length > 0 && colorPalette.length > 0);
          return {
            ...draft,
            hasCanvas,
            mappedPixelData,
            gridData,
            colorPalette,
          };
        });
        this.setData({ drafts: processedDrafts }, () => {
          this.applyFilter();
          this.setData({ loading: false }, () => {
            // 延迟渲染，分批处理
            setTimeout(() => this.renderVisibleThumbnails(), 150);
          });
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  // 渲染可见区域的缩略图（分批渲染，避免性能问题）
  renderVisibleThumbnails() {
    const { drafts, viewMode } = this.data;
    const displayDrafts = this.data.filteredDrafts || drafts;
    const needRenderDrafts = displayDrafts.filter(d => d.hasCanvas);

    if (needRenderDrafts.length === 0) return;

    // 分批渲染，每批3个，避免卡顿
    const batchSize = 3;
    let currentIndex = 0;

    const renderBatch = () => {
      const batch = needRenderDrafts.slice(currentIndex, currentIndex + batchSize);
      if (batch.length === 0) return;

      batch.forEach(draft => {
        this.renderSingleThumbnail(draft, viewMode);
      });

      currentIndex += batchSize;
      if (currentIndex < needRenderDrafts.length) {
        setTimeout(renderBatch, 100); // 每批之间间隔100ms
      }
    };

    renderBatch();
  },

  // 渲染单个缩略图
  renderSingleThumbnail(draft, viewMode) {
    const canvasId = viewMode === 'thumb' ? ('draftCanvas' + draft.id) : ('draftListCanvas' + draft.id);
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
    const { item } = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/preview/preview?draftId=' + item.id + '&sourceType=DRAFT'
    });
  },

  // 继续编辑
  onContinueEdit(e) {
    ensureProfileComplete().then((ok) => {
      if (!ok) return;
      const { item } = e.currentTarget.dataset;
      wx.navigateTo({
        url: '/pages/draw/draw?draftId=' + item.id +
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
      const { item } = e.currentTarget.dataset;
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
      .then(() => {
        wx.showToast({ title: '已保存到图纸箱', icon: 'success' });
        this.setData({ showSaveModal: false, selectedDraft: null, patternName: '' });
        this.loadDrafts();
      })
      .catch(() => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
  },

  onRename(e) {
    const item = e.currentTarget.dataset.item;
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
              this.loadDrafts();
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
});
