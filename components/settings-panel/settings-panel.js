Component({
  properties: {
    show: { type: Boolean, value: false },
    isVip: { type: Boolean, value: false },
    watermarkEnabled: { type: Boolean, value: true },
    watermarkText: { type: String, value: '' },
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onWatermarkChange(e) { this.triggerEvent('watermarkchange', { value: e.detail.value }); },
    onWatermarkTextChange(e) { this.triggerEvent('watermarktextchange', { value: e.detail.value }); },
    onConfirm() { this.triggerEvent('confirm'); },
    onCustomTap() { this.triggerEvent('customtap'); },
  }
});
