Component({
  properties: {
    show: { type: Boolean, value: false },
    processing: { type: Boolean, value: false },
    taskActionProcessingCode: { type: String, value: '' },
    checkinStatus: { type: Object, value: {} },
    tasks: { type: Array, value: [] },
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onCheckin() { this.triggerEvent('checkin'); },
    onClaim() { this.triggerEvent('claim'); },
    onDoTask(e) { this.triggerEvent('dotask', { task: e.currentTarget.dataset.task }); },
  }
});
