/**
 * 拼豆图纸前端生成算法
 * 支持：Dominant(卡通模式) / Average(真实模式)
 * 输出：mappedPixelData 格式
 */
var request = require('./request');

// 像素化模式
var PixelationMode = {
  DOMINANT: 'dominant',  // 卡通模式（众数）
  AVERAGE: 'average'     // 真实模式（均值）
};

var SAMPLE_PX = 512;
var DRAW_LONG = 624;

/**
 * 生成拼豆图案
 * 
 * @param {string} imagePath - 图片路径
 * @param {Object} options - 生成选项
 * @param {number} options.gridSize - 网格尺寸
 * @param {string} options.brand - 品牌
 * @param {string} options.mode - 像素化模式 'dominant' | 'average'
 * @param {number} options.similarityThreshold - 颜色合并阈值 0-100
 * @returns {Promise}
 */
function generateBeadPattern(imagePath, options) {
  var gridSize = options.gridSize || 64;
  var brand = options.brand || 'MARD';
  var mode = options.mode || PixelationMode.DOMINANT;
  var threshold = options.similarityThreshold || 0;

  return new Promise(function(resolve, reject) {
    wx.getImageInfo({
      src: imagePath,
      success: function(info) {
        var ratio = info.width / info.height;
        var gridW, gridH;
        if (ratio >= 1) {
          gridW = gridSize;
          gridH = Math.max(1, Math.round(gridSize / ratio));
        } else {
          gridH = gridSize;
          gridW = Math.max(1, Math.round(gridSize * ratio));
        }
        var sampW, sampH;
        if (ratio >= 1) {
          sampW = SAMPLE_PX;
          sampH = Math.max(1, Math.round(SAMPLE_PX / ratio));
        } else {
          sampH = SAMPLE_PX;
          sampW = Math.max(1, Math.round(SAMPLE_PX * ratio));
        }

        // 采样
        var sCtx = wx.createCanvasContext('bead-sample-canvas');
        sCtx.drawImage(imagePath, 0, 0, sampW, sampH);
        sCtx.draw(false, function() {
          wx.canvasGetImageData({
            canvasId: 'bead-sample-canvas',
            x: 0, y: 0, width: sampW, height: sampH,
            success: function(pd) {
              try {
                // 1. 根据模式采样像素网格
                var rgbGrid = sampleGrid(pd.data, sampW, sampH, gridW, gridH, mode);
                
                // 2. 发送到后端匹配颜色
                request.post('/bead/match-colors', {
                  brand: brand,
                  grid: rgbGrid,
                  algo: mode === PixelationMode.DOMINANT ? 'dominant' : 'standard'
                })
                .then(function(matchedGrid) {
                  // 3. matchedGrid 转换为 mappedPixelData 格式
                  var mappedPixelData = convertToMappedPixelData(matchedGrid);
                  
                  // 4. 计算颜色统计
                  var colorStats = calcStats(mappedPixelData);
                  
                  resolve({
                    gridSize: gridSize,
                    mappedPixelData: mappedPixelData,
                    colorStats: colorStats,
                    mode: mode
                  });
                })
                .catch(reject);
              } catch(e) { reject(e); }
            },
            fail: reject
          });
        });
      },
      fail: reject
    });
  });
}

/**
 * 采样像素网格
 * 支持 Dominant(众数) 和 Average(均值) 两种模式
 * 
 * @param {Uint8ClampedArray} data - 图像数据
 * @param {number} sw - 采样宽度
 * @param {number} sh - 采样高度
 * @param {number} gw - 网格宽度
 * @param {number} gh - 网格高度
 * @param {string} mode - 像素化模式
 * @returns {Array} RGB网格 [gh][gw][3]
 */
function sampleGrid(data, sw, sh, gw, gh, mode) {
  var cw = sw / gw;
  var ch = sh / gh;
  var grid = [];

  for (var gy = 0; gy < gh; gy++) {
    var row = [];
    for (var gx = 0; gx < gw; gx++) {
      var x0 = Math.floor(gx * cw), x1 = Math.min(Math.ceil((gx+1)*cw), sw);
      var y0 = Math.floor(gy * ch), y1 = Math.min(Math.ceil((gy+1)*ch), sh);
      
      if (mode === PixelationMode.DOMINANT) {
        // 众数模式：统计每个RGB值的频率
        var colorCounts = {};
        var dominantRgb = null;
        var maxCount = 0;
        var hasOpaque = false;
        
        for (var py = y0; py < y1; py++) {
          for (var px = x0; px < x1; px++) {
            var i = (py * sw + px) * 4;
            var a = data[i + 3];
            if (a < 128) continue;
            
            hasOpaque = true;
            var r = data[i], g = data[i + 1], b = data[i + 2];
            var key = r + ',' + g + ',' + b;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
            
            if (colorCounts[key] > maxCount) {
              maxCount = colorCounts[key];
              dominantRgb = [r, g, b];
            }
          }
        }
        
        if (!hasOpaque) {
          row.push([255, 255, 255]); // 透明区域用白色
        } else {
          row.push(dominantRgb || [255, 255, 255]);
        }
      } else {
        // 均值模式：计算平均RGB
        var rSum = 0, gSum = 0, bSum = 0, n = 0;
        var hasOpaque = false;
        
        for (var py = y0; py < y1; py++) {
          for (var px = x0; px < x1; px++) {
            var i = (py * sw + px) * 4;
            var a = data[i + 3];
            if (a < 128) continue;
            
            hasOpaque = true;
            rSum += data[i];
            gSum += data[i + 1];
            bSum += data[i + 2];
            n++;
          }
        }
        
        if (!hasOpaque || n === 0) {
          row.push([255, 255, 255]);
        } else {
          row.push([
            Math.round(rSum / n),
            Math.round(gSum / n),
            Math.round(bSum / n)
          ]);
        }
      }
    }
    grid.push(row);
  }

  return grid;
}

/**
 * 将后端返回的匹配结果转换为 mappedPixelData 格式
 * 
 * @param {Array} matchedGrid - 后端返回的匹配网格
 * @returns {Array} mappedPixelData 二维数组
 */
function convertToMappedPixelData(matchedGrid) {
  var mappedData = [];
  
  for (var y = 0; y < matchedGrid.length; y++) {
    var row = [];
    var matchedRow = matchedGrid[y];
    
    for (var x = 0; x < matchedRow.length; x++) {
      var cell = matchedRow[x];
      
      row.push({
        id: cell.id || 'T1',
        name: cell.name || '',
        hex: rgbToHex(cell.r, cell.g, cell.b),
        r: cell.r,
        g: cell.g,
        b: cell.b,
        isExternal: false
      });
    }
    mappedData.push(row);
  }
  
  return mappedData;
}

/**
 * RGB转Hex
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function(x) {
    return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2);
  }).join('').toUpperCase();
}

/**
 * 计算颜色统计
 * 
 * @param {Array} mappedPixelData - 像素数据
 * @returns {Array} 颜色统计数组
 */
function calcStats(mappedPixelData) {
  var map = {};
  
  for (var y = 0; y < mappedPixelData.length; y++) {
    for (var x = 0; x < mappedPixelData[y].length; x++) {
      var cell = mappedPixelData[y][x];
      if (cell.isExternal) continue;
      
      var id = cell.id;
      if (!map[id]) {
        map[id] = {
          id: id,
          name: cell.name,
          hex: cell.hex,
          r: cell.r,
          g: cell.g,
          b: cell.b,
          count: 0
        };
      }
      map[id].count++;
    }
  }
  
  var arr = [];
  for (var k in map) arr.push(map[k]);
  return arr.sort(function(a, b) { return b.count - a.count; });
}

/**
 * 颜色合并（前端实现，基于频率优先贪心算法）
 * 
 * @param {Array} mappedPixelData - 像素数据
 * @param {number} threshold - 相似度阈值 0-100
 * @returns {Array} 合并后的像素数据
 */
function mergeSimilarColors(mappedPixelData, threshold) {
  if (threshold <= 0) return mappedPixelData;
  
  var gridSize = mappedPixelData.length;
  
  // 1. 统计每种颜色的频率
  var colorCounts = {};
  for (var y = 0; y < gridSize; y++) {
    for (var x = 0; x < mappedPixelData[y].length; x++) {
      var cell = mappedPixelData[y][x];
      if (cell.isExternal) continue;
      colorCounts[cell.id] = (colorCounts[cell.id] || 0) + 1;
    }
  }
  
  // 2. 按频率排序
  var sortedKeys = Object.entries(colorCounts)
    .sort(function(a, b) { return b[1] - a[1]; })
    .map(function(entry) { return entry[0]; });
  
  // 3. 构建颜色RGB映射
  var colorRgbMap = {};
  for (var y = 0; y < gridSize; y++) {
    for (var x = 0; x < mappedPixelData[y].length; x++) {
      var cell = mappedPixelData[y][x];
      if (!colorRgbMap[cell.id]) {
        colorRgbMap[cell.id] = { r: cell.r, g: cell.g, b: cell.b };
      }
    }
  }
  
  // 4. 贪心合并
  var newData = mappedPixelData.map(function(row) {
    return row.map(function(cell) {
      return Object.assign({}, cell);
    });
  });
  
  var allKeys = Object.keys(colorRgbMap);
  var merged = {};
  
  for (var i = 0; i < sortedKeys.length; i++) {
    var sourceKey = sortedKeys[i];
    if (merged[sourceKey]) continue;
    
    var sourceRgb = colorRgbMap[sourceKey];
    
    // 查找最近的可合并颜色
    for (var j = i + 1; j < sortedKeys.length; j++) {
      var targetKey = sortedKeys[j];
      if (merged[targetKey]) continue;
      
      var targetRgb = colorRgbMap[targetKey];
      var dist = colorDistance(sourceRgb, targetRgb);
      
      if (dist < threshold) {
        // 合并：将 sourceKey 替换为 targetKey
        for (var y = 0; y < gridSize; y++) {
          for (var x = 0; x < newData[y].length; x++) {
            if (newData[y][x].id === sourceKey) {
              newData[y][x].id = targetKey;
              newData[y][x].hex = rgbToHex(targetRgb.r, targetRgb.g, targetRgb.b);
              newData[y][x].r = targetRgb.r;
              newData[y][x].g = targetRgb.g;
              newData[y][x].b = targetRgb.b;
            }
          }
        }
        merged[sourceKey] = true;
        break;
      }
    }
  }
  
  return newData;
}

/**
 * 计算RGB欧几里得距离
 */
function colorDistance(rgb1, rgb2) {
  var dr = rgb1.r - rgb2.r;
  var dg = rgb1.g - rgb2.g;
  var db = rgb1.b - rgb2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

module.exports = {
  generateBeadPattern: generateBeadPattern,
  PixelationMode: PixelationMode,
  sampleGrid: sampleGrid,
  mergeSimilarColors: mergeSimilarColors,
  convertToMappedPixelData: convertToMappedPixelData,
  calcStats: calcStats
};
