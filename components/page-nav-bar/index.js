Component({
  options: {
    multipleSlots: true
  },
  properties: {
    title:    { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    navTop:   { type: Number, value: 44 }
  },
  methods: {
    onBack() {
      this.triggerEvent('back');
    }
  }
});
