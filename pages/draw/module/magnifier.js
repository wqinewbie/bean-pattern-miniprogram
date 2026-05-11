class Magnifier {
  constructor(options = {}) {
    this._canvas = null;
    this._ctx = null;
    this._size = options.size || 100;
  }

  init(canvas, ctx) {
    this._canvas = canvas || null;
    this._ctx = ctx || null;
  }

  update() {
    return {
      ready: !!(this._canvas && this._ctx),
      size: this._size
    };
  }
}

module.exports = Magnifier;
