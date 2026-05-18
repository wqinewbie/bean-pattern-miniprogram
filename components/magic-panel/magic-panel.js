Component({
  properties: {
    show: { type: Boolean, value: false },
    magicCount: { type: Number, value: 0 },
    isVip: { type: Boolean, value: false },
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onTask() { this.triggerEvent('task'); },
    onVip() { this.triggerEvent('vip'); },
    onCards() { this.triggerEvent('cards'); },
  }
});
