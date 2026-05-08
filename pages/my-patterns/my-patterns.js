const request = require('../../utils/request');
const { hasSession } = require('../../utils/profile-guard');
const { getSafeAreaLayout } = require('../../utils/safe-area');
const { API_BASE_URL } = require('../../utils/config');

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
    navTop: 88,
    statusBarHeight: 44,
    navHeight: 32,
    capsuleWidth: 87,
    maxCapacity: 10,
    searchFocused: false,
    viewMode: 'thumb',
    swipedOffsets: {},
    touchItemId: null,
    touchStartX: 0,
    touchLastX: 0,
    swipeOpenPx: 140,
    isSwiping: false,
  },

  onLoad() {
    this.calcNavTop();
  },
  onShow() {
    this.calcNavTop();
    this.loadPatterns();
    const tab = this.selectComponent('#appTabBar');
    if (tab && tab.setSelected) tab.setSelected(3);
  },

  calcNavTop() {
    const layout = getSafeAreaLayout();
    const menuButton = layout.menuButton || {};
    const vipExpire = wx.getStorageSync('vipExpire') || '';
    const isVip = vipExpire && new Date(vipExpire) > new Date();
    this.setData({
      navTop: layout.navTop,
      statusBarHeight: menuButton.top || layout.statusBarHeight || 44,
      maxCapacity: isVip ? 100 : 10,
      navHeight: menuButton.height || 32,
      capsuleWidth: menuButton.width || 87,
    });
  },

  loadPatterns() {
    this.setData({ loading: true, patterns: [], filteredPatterns: [] });

    if (!hasSession()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.navigateTo({ url: '/pages/login/login' });
      this.setData({ loading: false });
      return;
    }

    request.get('/box/list')
      .then((data) => {
        const patterns = (Array.isArray(data) ? data : []).map(item => {
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
          const hasOriginal = !!(resolvedSourceUrl && resolvedSourceUrl.trim());
          const isDraftSource = !hasOriginal && (item.sourceType === 'DRAW' || !!item.draftId);
          const hasMappedData = Array.isArray(mappedPixelData) && mappedPixelData.length > 0;
          const sourceType = this.getPatternSourceType(item);

          // 调试日志
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
            sourceUrl: resolvedSourceUrl,
            coverUrl: resolvedCoverUrl || resolvedSourceUrl,
            createdAt: this.formatTime(item.createdAt),
            boxId: item.id,
            hasOriginal,
            isDraftSource,
            hasCanvasCover: isDraftSource && hasMappedData,
          };
        });
        this.setData({ patterns }, () => {
          this.applyFilter();
          this.setData({ loading: false }, () => {
            setTimeout(() => this.renderThumbnails(), 60);
          });
        });
      })
      .catch(() => {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: '/pages/preview/preview?boxId=' + item.id
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
                setTimeout(() => this.renderThumbnails(), 60);
              });
              wx.showToast({ title: '已删除', icon: 'success' });
            })
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
    if (item.draftId || item.sourceType === 'DRAW') return 'draft';
    const sourceType = String(item.sourceType || item.source || item.type || '').toLowerCase();
    if (sourceType.includes('ai')) return 'ai';
    if (sourceType.includes('draft') || sourceType.includes('draw')) return 'draft';
    if (sourceType.includes('free') || sourceType.includes('convert') || sourceType.includes('image')) return 'free';
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
      setTimeout(() => this.renderThumbnails(), 60);
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
      setTimeout(() => this.renderThumbnails(), 60);
    });
  },

  onRename(e) {
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
          request.put('/box/update', { id: item.id, name: newName })
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
            .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
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
    });
  },

  onTouchMove(e) {
    if (this.data.viewMode !== 'list') return;
    if (!this.data.touchItemId) return;
    const x = e.touches[0].pageX;
    const lastX = this.data.touchLastX;
    const currentOffset = this.data.swipedOffsets[String(this.data.touchItemId)] || 0;

    // 计算本次移动的增量
    const deltaX = lastX - x;
    // 在当前偏移基础上累加增量
    let newOffset = currentOffset - deltaX;

    // 限制滑动范围：0 到 -swipeOpenPx
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

  renderThumbnails() {
    // 仅对草稿来源且无原图的项用 canvas 渲染缩略图
    if (this.data.viewMode !== 'thumb') return;
    const patterns = this.data.filteredPatterns || [];
    patterns.forEach(item => {
      if (!item.hasCanvasCover) return;
      const query = wx.createSelectorQuery();
      query.select('#boxThumbCanvas' + item.id)
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

          // 绘制底色
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);

          // mappedPixelData 是二维数组，每个元素是 { id, name, r, g, b, hex, isExternal }
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
});
