Component({
  options: {
    multipleSlots: true
  },
  properties: {
    variant: {
      type: String,
      value: 'warm'
    },
    animated: {
      type: Boolean,
      value: false
    },
    customClass: {
      type: String,
      value: ''
    }
  }
});
