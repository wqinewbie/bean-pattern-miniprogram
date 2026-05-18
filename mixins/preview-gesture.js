/**
 * 预览图片拖拽/缩放手势 mixin
 * generate.js / ai-generate.js / convert.js 共用
 *
 * 使用方式：
 *   const previewGesture = require('../../mixins/preview-gesture');
 *   Page({
 *     ...previewGesture,
 *     // 你的页面必须提供 data.previewTransform 和 data.previewImageUrl
 *   })
 */

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

module.exports = {
  data: {
    previewTransform: { x: 0, y: 0, scale: 1 },
    previewImageUrl: '',
    previewVisible: false,
  },

  onPreviewTouchStart(e) {
    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._startTransform = { ...this.data.previewTransform };

    if (e.touches.length >= 2) {
      const t2 = e.touches[1];
      this._startDistance = Math.hypot(
        t2.clientX - touch.clientX,
        t2.clientY - touch.clientY
      );
      this._startScale = this.data.previewTransform.scale;
    }
  },

  onPreviewTouchMove(e) {
    if (e.touches.length >= 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (this._startDistance && this._startDistance > 0) {
        let newScale = this._startScale * (dist / this._startDistance);
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        this._applyTransform({ scale: newScale });
      }
      return;
    }

    if (!this._touchStartX) return;
    const dx = e.touches[0].clientX - this._touchStartX;
    const dy = e.touches[0].clientY - this._touchStartY;
    this._applyTransform({
      x: this._startTransform.x + dx,
      y: this._startTransform.y + dy,
    });
  },

  onPreviewTouchEnd() {
    this._touchStartX = null;
    this._touchStartY = null;
    this._startDistance = null;
  },

  _applyTransform(partial) {
    const t = { ...this.data.previewTransform, ...partial };
    this.setData({ previewTransform: t });
  },

  openPreview(imageUrl) {
    this.setData({
      previewVisible: true,
      previewImageUrl: imageUrl,
      previewTransform: { x: 0, y: 0, scale: 1 },
    });
  },

  closePreview() {
    this.setData({ previewVisible: false });
  },
};
