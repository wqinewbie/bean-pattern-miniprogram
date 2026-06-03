Component({
  externalClasses: ['custom-class'],

  properties: {
    options: { type: Array, value: [] },
    value: { type: null, value: null },
    title: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    activeColor: { type: String, value: '#FF9800' },
    maxHeight: { type: Number, value: 400 },
    placement: { type: String, value: 'auto' },
    panelBackground: { type: String, value: '#FFF9ED' },
    panelBorderColor: { type: String, value: '#FFEBB5' },
    activeBackground: { type: String, value: '#FFF4DC' },
    optionTextColor: { type: String, value: '#8C6B4B' }
  },

  data: {
    open: false,
    closing: false,
    displayTitle: '',
    normalizedOptions: [],
    panelStyle: ''
  },

  observers: {
    'options, value, title, placeholder': function () {
      this.syncOptions();
    }
  },

  lifetimes: {
    attached() {
      this.syncOptions();
    },

    detached() {
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
    }
  },

  methods: {
    syncOptions() {
      const normalizedOptions = (this.data.options || []).map((item) => {
        if (item && typeof item === 'object') {
          const text = item.text != null ? item.text : (item.label != null ? item.label : item.name);
          const value = item.value != null ? item.value : (item.id != null ? item.id : text);
          return { ...item, text: String(text == null ? '' : text), value };
        }
        const text = typeof item === 'number' ? `${item}x${item}` : String(item == null ? '' : item);
        return { text, value: item };
      });

      const selected = normalizedOptions.find((item) => item.value === this.data.value);
      const displayTitle = this.data.title || (selected && selected.text) || this.data.placeholder;
      this.setData({ normalizedOptions, displayTitle });
    },

    toggle() {
      if (this.data.open) {
        this.close();
        return;
      }

      this.open();
    },

    open() {
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      this.updatePanelPosition(() => {
        this.setData({ open: true, closing: false });
        this.triggerEvent('open');
        this.triggerEvent('openchange', { open: true });
      });
    },

    updatePanelPosition(done) {
      const fallback = () => {
        this.setData({
          panelStyle: `left:24rpx;right:24rpx;top:160rpx;${this.getThemeStyle()};--app-select-max-height:${this.data.maxHeight}rpx;`
        }, done);
      };

      try {
        const query = this.createSelectorQuery();
        query.select('.app-select__trigger').boundingClientRect();
        query.exec((res) => {
          const rect = res && res[0];
          if (!rect) {
            fallback();
            return;
          }

          const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {};
          const viewportHeight = windowInfo.windowHeight || 667;
          const gap = 12;
          const pagePadding = 12;
          const panelChromePx = 24;
          const desiredMaxHeightPx = Math.max(120, this.data.maxHeight / 2);
          const belowSpace = viewportHeight - rect.bottom - pagePadding;
          const aboveSpace = rect.top - pagePadding;
          const placement = this.data.placement;
          const shouldOpenUp = placement === 'top' || (placement !== 'bottom' && belowSpace < 140 && aboveSpace > belowSpace);
          const availableSpace = Math.max(80, shouldOpenUp ? aboveSpace : belowSpace);
          const maxHeightPx = Math.max(80, Math.min(desiredMaxHeightPx, availableSpace - gap - panelChromePx));
          const top = shouldOpenUp
            ? Math.max(pagePadding, rect.top - maxHeightPx - gap - panelChromePx)
            : Math.min(rect.bottom + gap, viewportHeight - pagePadding);
          const panelStyle = [
            `left:${rect.left}px`,
            `top:${top}px`,
            `width:${rect.width}px`,
            this.getThemeStyle(),
            `--app-select-max-height:${maxHeightPx}px`
          ].join(';') + ';';
          this.setData({ panelStyle }, done);
        });
      } catch (e) {
        fallback();
      }
    },

    close() {
      if (!this.data.open && !this.data.closing) return;
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      this.setData({ open: false, closing: true });
      this.triggerEvent('close');
      this.triggerEvent('openchange', { open: false });
      this._closeTimer = setTimeout(() => {
        this._closeTimer = null;
        this.setData({ closing: false });
      }, 220);
    },

    noop() {},

    getThemeStyle() {
      return [
        `--app-select-active:${this.data.activeColor}`,
        `--app-select-panel-bg:${this.data.panelBackground}`,
        `--app-select-panel-border:${this.data.panelBorderColor}`,
        `--app-select-active-bg:${this.data.activeBackground}`,
        `--app-select-option-text:${this.data.optionTextColor}`
      ].join(';');
    },

    onOptionTap(e) {
      const index = e.currentTarget.dataset.index;
      const option = this.data.normalizedOptions[index];
      if (!option) return;
      this.triggerEvent('change', option.value);
      this.close();
    }
  }
});
