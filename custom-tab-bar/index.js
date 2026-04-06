Component({
  data: {
    selected: 0,
    leaving: -1,
    transitioning: false,
  },

  lifetimes: {
    attached() {
      this.syncSelectedByRoute();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelectedByRoute();
    }
  },

  methods: {
    getRoute() {
      const pages = getCurrentPages ? getCurrentPages() : [];
      const currentPage = pages.length ? pages[pages.length - 1] : null;
      return currentPage && currentPage.route ? currentPage.route : '';
    },

    routeToIndex(route) {
      const map = {
        'pages/home/home': 0,
        'pages/convert/convert': 1,
        'pages/ai-generate/ai-generate': 2,
        'pages/profile/profile': 3,
        'pages/history/history': 3,
        'pages/my-patterns/my-patterns': 3,
      };
      return Object.prototype.hasOwnProperty.call(map, route) ? map[route] : 0;
    },

    getSelectedByRoute() {
      return this.routeToIndex(this.getRoute());
    },

    setSelected(index) {
      if (typeof index !== 'number' || index < 0) return;
      this.setData({
        selected: index,
        leaving: -1,
        transitioning: false,
      });
    },

    syncSelectedByRoute() {
      const selected = this.getSelectedByRoute();
      this.setData({
        selected,
        leaving: -1,
        transitioning: false,
      });
    },

    onTab(e) {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      const url = e.currentTarget.dataset.url;
      const selected = this.getSelectedByRoute();

      if (Number.isNaN(index) || !url) return;
      if (this.data.transitioning) return;
      if (index === selected) {
        this.syncSelectedByRoute();
        return;
      }

      this.setData({
        selected,
        leaving: selected,
        transitioning: true,
      }, () => {
        setTimeout(() => {
          wx.switchTab({
            url,
            fail: () => {
              this.setData({
                selected,
                leaving: -1,
                transitioning: false,
              });
            }
          });
        }, 130);
      });
    }
  }
});
