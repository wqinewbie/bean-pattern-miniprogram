/**
 * 图案数据存储管理
 * 统一管理拼豆图案的 JSON 数据结构
 */

const STORAGE_PREFIX = 'bead_pattern_';
const PATTERN_LIST_KEY = 'bead_pattern_list';

/**
 * 生成图案ID
 * @returns {string}
 */
function generatePatternId() {
  return 'BP' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * 创建图案数据对象
 * 
 * @param {Object} params
 * @param {number} params.gridSize - 网格尺寸
 * @param {string} params.brand - 品牌
 * @param {string} params.pixelationMode - 像素化模式
 * @param {number} params.similarityThreshold - 相似度阈值
 * @param {string} params.originalUrl - 原图URL
 * @param {Array} params.mappedPixelData - 像素数据
 * @param {Array} params.colorPalette - 调色板
 * @param {Array} params.colorStats - 颜色统计
 * @returns {Object} 图案数据对象
 */
function createPatternData({
  gridSize,
  brand,
  pixelationMode = 'dominant',
  similarityThreshold = 30,
  originalUrl,
  mappedPixelData,
  colorPalette,
  colorStats
}) {
  return {
    id: generatePatternId(),
    gridSize,
    brand,
    pixelationMode,
    similarityThreshold,
    originalUrl,
    mappedPixelData,
    colorPalette,
    colorStats,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 保存图案到本地存储
 * 
 * @param {Object} patternData - 图案数据
 * @returns {boolean} 是否成功
 */
function savePattern(patternData) {
  try {
    const key = STORAGE_PREFIX + patternData.id;
    
    // 添加更新时间
    patternData.updatedAt = new Date().toISOString();
    
    // 保存图案数据
    wx.setStorageSync(key, patternData);
    
    // 更新图案列表
    const list = getPatternList();
    if (!list.find(p => p.id === patternData.id)) {
      list.unshift({
        id: patternData.id,
        gridSize: patternData.gridSize,
        brand: patternData.brand,
        colorCount: patternData.colorStats ? patternData.colorStats.length : 0,
        createdAt: patternData.createdAt,
        thumbnail: patternData.thumbnail || ''
      });
      wx.setStorageSync(PATTERN_LIST_KEY, list);
    }
    
    return true;
  } catch (e) {
    console.error('保存图案失败:', e);
    return false;
  }
}

/**
 * 加载图案数据
 * 
 * @param {string} patternId - 图案ID
 * @returns {Object|null} 图案数据
 */
function loadPattern(patternId) {
  try {
    const key = STORAGE_PREFIX + patternId;
    return wx.getStorageSync(key) || null;
  } catch (e) {
    console.error('加载图案失败:', e);
    return null;
  }
}

/**
 * 删除图案
 * 
 * @param {string} patternId - 图案ID
 * @returns {boolean} 是否成功
 */
function deletePattern(patternId) {
  try {
    const key = STORAGE_PREFIX + patternId;
    wx.removeStorageSync(key);
    
    // 从列表中移除
    const list = getPatternList();
    const newList = list.filter(p => p.id !== patternId);
    wx.setStorageSync(PATTERN_LIST_KEY, newList);
    
    return true;
  } catch (e) {
    console.error('删除图案失败:', e);
    return false;
  }
}

/**
 * 获取图案列表
 * 
 * @returns {Array} 图案列表
 */
function getPatternList() {
  try {
    return wx.getStorageSync(PATTERN_LIST_KEY) || [];
  } catch (e) {
    return [];
  }
}

/**
 * 更新图案数据
 * 
 * @param {string} patternId - 图案ID
 * @param {Object} updates - 更新的字段
 * @returns {boolean} 是否成功
 */
function updatePattern(patternId, updates) {
  try {
    const pattern = loadPattern(patternId);
    if (!pattern) return false;
    
    const updatedPattern = {
      ...pattern,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    return savePattern(updatedPattern);
  } catch (e) {
    console.error('更新图案失败:', e);
    return false;
  }
}

/**
 * 更新图案进度
 * 
 * @param {string} patternId - 图案ID
 * @param {Object} completedMap - 已完成格子 { 'row,col': true }
 * @returns {boolean} 是否成功
 */
function updateProgress(patternId, completedMap) {
  return updatePattern(patternId, { completedMap });
}

/**
 * 获取图案进度
 * 
 * @param {string} patternId - 图案ID
 * @returns {Object} completedMap
 */
function getProgress(patternId) {
  const pattern = loadPattern(patternId);
  return pattern ? (pattern.completedMap || {}) : {};
}

/**
 * 导出图案为JSON字符串
 * 
 * @param {Object} patternData - 图案数据
 * @returns {string} JSON字符串
 */
function exportToJson(patternData) {
  return JSON.stringify(patternData, null, 2);
}

/**
 * 从JSON导入图案
 * 
 * @param {string} jsonStr - JSON字符串
 * @returns {Object|null} 图案数据
 */
function importFromJson(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    
    // 验证必需字段
    if (!data.mappedPixelData || !data.gridSize || !data.colorPalette) {
      throw new Error('数据格式无效');
    }
    
    // 生成新ID避免冲突
    data.id = generatePatternId();
    data.createdAt = new Date().toISOString();
    data.updatedAt = data.createdAt;
    
    return data;
  } catch (e) {
    console.error('导入图案失败:', e);
    return null;
  }
}

/**
 * 生成缩略图数据URL
 * 
 * @param {Array} mappedPixelData - 像素数据
 * @param {number} gridSize - 网格尺寸
 * @param {number} thumbSize - 缩略图尺寸
 * @returns {string} 数据URL
 */
function generateThumbnail(mappedPixelData, gridSize, thumbSize = 100) {
  try {
    const cellSize = thumbSize / gridSize;
    
    const canvas = wx.createOffscreenCanvas ? wx.createOffscreenCanvas({
      type: '2d',
      width: thumbSize,
      height: thumbSize
    }) : null;
    
    if (!canvas) return '';
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, thumbSize, thumbSize);
    
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cell = mappedPixelData[row] && mappedPixelData[row][col];
        if (cell && !cell.isExternal) {
          ctx.fillStyle = cell.hex || `rgb(${cell.r},${cell.g},${cell.b})`;
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
    
    return canvas.toDataURL ? canvas.toDataURL() : '';
  } catch (e) {
    return '';
  }
}

module.exports = {
  createPatternData,
  savePattern,
  loadPattern,
  deletePattern,
  getPatternList,
  updatePattern,
  updateProgress,
  getProgress,
  exportToJson,
  importFromJson,
  generateThumbnail,
  generatePatternId
};
