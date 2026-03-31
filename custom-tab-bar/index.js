Component({
  data: {
    selected: 0,
  },

  methods: {
    onTab(e) {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      const url = e.currentTarget.dataset.url;
      if (index === this.data.selected) return;
      this.setData({ selected: index });
      wx.switchTab({ url });
    },

    setSelected(index) {
      this.setData({ selected: index });
    }
  }
});
