const request = require('../../utils/request');
const { ensureProfileComplete } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');

Page({
  data: {
    navTop: 88,
    loading: false,
    drafts: [],
    showSaveModal: false,
    selectedDraft: null,
    patternName: '',
  },

  onLoad() {
    const layout = getSafeAreaLayout();
    this.setData({ navTop: layout.navTop });
  },

  onShow() {
    this.loadDrafts();
  },

  onPullDownRefresh() {
    this.loadDrafts().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadDrafts() {
    this.setData({ loading: true });
    return request.get('/draft/list')
      .then((drafts) => {
        // 处理数据
        const processedDrafts = (drafts || []).map((draft) => {
          // 检查是否有颜色数据可以渲染
          const hasCanvas = draft.gridData && draft.colorPalette;
          return {
            ...draft,
            hasCanvas,
            gridData: draft.gridData ? JSON.parse(draft.gridData) : [],
            colorPalette: draft.colorPalette ? JSON.parse(draft.colorPalette) : [],
          };
        });
        this.setData({ drafts: processedDrafts, loading: false });
        
        // 渲染缩略图
        setTimeout(() => this.renderThumbnails(), 100);
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  // 渲染缩略图
  renderThumbnails() {
    const { drafts } = this.data;
    drafts.forEach((draft) => {
      if (!draft.hasCanvas) return;
      
      const canvasId = 'draftCanvas' + draft.id;
      const query = wx.createSelectorQuery();
      query.select('#' + canvasId)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) return;
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getWindowInfo().pixelRatio || 2;
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
    });
  },

  // 点击草稿查看详情
  onDraftTap(e) {
    const { item } = e.currentTarget.dataset;
    // 显示操作选项
    wx.showActionSheet({
      itemList: ['继续编辑', '保存到图纸箱', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onContinueEdit({ currentTarget: { dataset: { item } } });
        } else if (res.tapIndex === 1) {
          this.onSaveToBox({ currentTarget: { dataset: { item } } });
        } else if (res.tapIndex === 2) {
          this.onDeleteDraft({ currentTarget: { dataset: { id: item.id } } });
        }
      }
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

    const name = (patternName || '').trim() || ('草稿#' + Date.now());

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

  // 删除草稿
  onDeleteDraft(e) {
    const { id } = e.currentTarget.dataset;
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

  // 去画板
  onGoDraw() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
