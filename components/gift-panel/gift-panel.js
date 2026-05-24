Component({
  properties: {
    show: { type: Boolean, value: false },
    processing: { type: Boolean, value: false },
    giftTabs: { type: Array, value: [] },
    giftTab: { type: String, value: 'all' },
    visibleGifts: { type: Array, value: [] },
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onTabChange(e) { this.triggerEvent('tabchange', { tab: e.currentTarget.dataset.tab }); },
    onUse(e) { this.triggerEvent('use', { gift: e.currentTarget.dataset.gift }); },
  }
});
