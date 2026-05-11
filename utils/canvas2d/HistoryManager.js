/**
 * 历史管理器 - 操作记录模式
 *
 * 替代完整快照 JSON 深拷贝，只记录每次操作的变更集合。
 * 内存占用从 O(n² × depth) 降至 O(changes × depth)。
 *
 * 支持：
 *  - 单步（笔画）打包：一笔画完才算一个操作
 *  - 批量操作（填充、清空、加载、替换）
 *  - 撤销/重做
 */

const MAX_HISTORY = 100;

class HistoryManager {
  constructor() {
    this._undoStack = [];
    this._redoStack = [];
  }

  /**
   * 推送一个操作记录
   * @param {Object} record - { type: 'stroke'|'floodfill'|'clear'|'replace'|'mirror'|'load', cells: Map<string, {old,new}>, ...extra }
   */
  push(record) {
    if (!record || !record.type) return;

    this._redoStack.length = 0; // 新操作，清除重做栈

    // 合并连续的同类型操作（如笔画的多个像素变更）
    if (record.type === 'stroke' && this._undoStack.length > 0) {
      const last = this._undoStack[this._undoStack.length - 1];
      if (last.type === 'stroke') {
        // 合并 cell 变更
        if (record.cells) {
          for (const [key, val] of Object.entries(record.cells)) {
            if (!last.cells[key]) {
              last.cells[key] = val;
            } else {
              last.cells[key] = { old: last.cells[key].old, new: val.new };
            }
          }
        }
        return;
      }
    }

    if (record.cells instanceof Map) {
      record._cells = Object.fromEntries(record.cells);
      record.cells = undefined;
    }

    this._undoStack.push(record);

    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
  }

  undo() {
    if (this._undoStack.length === 0) return null;

    const record = this._undoStack.pop();
    this._redoStack.push(record);

    return this._invertRecord(record);
  }

  redo() {
    if (this._redoStack.length === 0) return null;

    const record = this._redoStack.pop();
    this._undoStack.push(record);

    return record;
  }

  _cloneTypedState(state) {
    if (!state || typeof state !== 'object') return state;
    const cloned = { ...state };

    if (state.fullGridData && Array.isArray(state.fullGridData)) {
      cloned.fullGridData = state.fullGridData.map((row) => (Array.isArray(row) ? [...row] : row));
    }

    if (state.pixelSnapshot && typeof state.pixelSnapshot === 'object') {
      const ps = state.pixelSnapshot;
      cloned.pixelSnapshot = {
        gridSize: ps.gridSize,
        palette: Array.isArray(ps.palette) ? [...ps.palette] : [],
        indices: ps.indices ? new Uint16Array(ps.indices) : new Uint16Array(0)
      };
    }

    if (state.meta && typeof state.meta === 'object') {
      cloned.meta = { ...state.meta };
    }

    return cloned;
  }

  _normalizeFullState(rawState) {
    if (!rawState) return null;

    if (Array.isArray(rawState)) {
      return { fullGridData: rawState.map((row) => (Array.isArray(row) ? [...row] : row)) };
    }

    if (rawState && typeof rawState === 'object') {
      return this._cloneTypedState(rawState);
    }

    return null;
  }

  _invertRecord(record) {
    const inverted = { type: record.type };

    if (record._cells) {
      const cells = {};
      for (const [key, val] of Object.entries(record._cells)) {
        cells[key] = { old: val.new, new: val.old };
      }
      inverted._cells = cells;
    }

    if (record.fullGridData || record.pixelSnapshot || record.meta) {
      inverted.fullGridData = record._previousFullGridData || record.fullGridData || null;
      inverted.pixelSnapshot = record._previousPixelSnapshot || record.pixelSnapshot || null;
      inverted.meta = record._previousMeta || record.meta || null;
    }

    return inverted;
  }

  pushBatch(type, cellChanges) {
    if (!cellChanges || Object.keys(cellChanges).length === 0) return;

    this._redoStack.length = 0;
    this._undoStack.push({ type, _cells: { ...cellChanges } });

    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
  }

  /**
   * 支持旧格式和新格式：
   * - 旧：pushFullState(type, fullGridDataArray, previousGridDataArray)
   * - 新：pushFullState(type, { fullGridData, pixelSnapshot, meta }, { ...previous }, meta?)
   */
  pushFullState(type, fullState, previousFullState, meta = null) {
    this._redoStack.length = 0;

    const currentState = this._normalizeFullState(fullState);
    const previousState = this._normalizeFullState(previousFullState);

    this._undoStack.push({
      type,
      _cells: null,
      fullGridData: currentState ? currentState.fullGridData : null,
      pixelSnapshot: currentState ? currentState.pixelSnapshot : null,
      meta: currentState && currentState.meta ? currentState.meta : (meta && typeof meta === 'object' ? { ...meta } : null),
      _previousFullGridData: previousState ? previousState.fullGridData : null,
      _previousPixelSnapshot: previousState ? previousState.pixelSnapshot : null,
      _previousMeta: previousState && previousState.meta ? previousState.meta : null
    });

    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
  }

  getState() {
    return {
      canUndo: this._undoStack.length > 0,
      canRedo: this._redoStack.length > 0,
      undoCount: this._undoStack.length,
      redoCount: this._redoStack.length
    };
  }

  clear() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }

  clearRedo() {
    this._redoStack.length = 0;
  }

  beginStroke() {
    return new Map();
  }

  endStroke(cells) {
    if (!cells || cells.size === 0) return;
    this.push({ type: 'stroke', cells });
  }
}

module.exports = HistoryManager;
