/**
 * 洪水填充算法工具
 * 用于拼豆专注模式的连通区域检测和追踪
 */

/**
 * 获取与起点颜色相同的连通区域
 * 使用栈实现的非递归洪水填充，避免栈溢出
 * 
 * @param {Array} grid - 像素网格 mappedPixelData
 * @param {number} startRow - 起始行
 * @param {number} startCol - 起始列
 * @param {string} targetId - 目标色号 (如 'A01')
 * @returns {Array} 连通区域的坐标数组 [{row, col}, ...]
 */
function getConnectedRegion(grid, startRow, startCol, targetId) {
  if (!grid || !grid[startRow] || !grid[startRow][startCol]) {
    return [];
  }

  const M = grid.length;
  const N = grid[0].length;
  const visited = Array.from({ length: M }, () => Array(N).fill(false));
  const region = [];

  // 使用栈实现非递归洪水填充
  const stack = [{ row: startRow, col: startCol }];

  while (stack.length > 0) {
    const { row, col } = stack.pop();

    // 边界检查
    if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
      continue;
    }

    const currentCell = grid[row][col];

    // 检查是否是目标颜色且不是外部区域
    if (!currentCell || currentCell.isExternal || currentCell.id !== targetId) {
      continue;
    }

    // 标记为已访问
    visited[row][col] = true;

    // 添加到区域
    region.push({ row, col });

    // 添加相邻像素到栈中（上下左右）
    stack.push(
      { row: row - 1, col }, // 上
      { row: row + 1, col }, // 下
      { row, col: col - 1 }, // 左
      { row, col: col + 1 }  // 右
    );
  }

  return region;
}

/**
 * 获取所有同颜色的连通区域
 * 
 * @param {Array} grid - 像素网格
 * @param {string} targetId - 目标色号
 * @returns {Array} 所有连通区域数组
 */
function getAllConnectedRegions(grid, targetId) {
  if (!grid || grid.length === 0) {
    return [];
  }

  const M = grid.length;
  const N = grid[0].length;
  const visited = Array.from({ length: M }, () => Array(N).fill(false));
  const regions = [];

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      if (visited[row][col]) continue;

      const currentCell = grid[row][col];

      if (currentCell && !currentCell.isExternal && currentCell.id === targetId) {
        const region = getConnectedRegion(grid, row, col, targetId);

        if (region.length > 0) {
          regions.push(region);

          // 标记该区域的所有像素为已访问
          region.forEach(({ row: r, col: c }) => {
            visited[r][c] = true;
          });
        }
      }
    }
  }

  return regions;
}

/**
 * 检查区域是否完全完成
 * 
 * @param {Array} region - 区域坐标数组
 * @param {Set} completedCells - 已完成格子集合
 * @returns {boolean}
 */
function isRegionCompleted(region, completedCells) {
  return region.every(({ row, col }) => completedCells.has(`${row},${col}`));
}

/**
 * 检查区域是否部分完成
 * 
 * @param {Array} region - 区域坐标数组
 * @param {Set} completedCells - 已完成格子集合
 * @returns {boolean}
 */
function isRegionPartiallyCompleted(region, completedCells) {
  return region.some(({ row, col }) => completedCells.has(`${row},${col}`));
}

/**
 * 获取区域的中心点
 * 
 * @param {Array} region - 区域坐标数组
 * @returns {Object} 中心点坐标 {row, col}
 */
function getRegionCenter(region) {
  if (region.length === 0) {
    return { row: 0, col: 0 };
  }

  const totalRow = region.reduce((sum, cell) => sum + cell.row, 0);
  const totalCol = region.reduce((sum, cell) => sum + cell.col, 0);

  return {
    row: Math.floor(totalRow / region.length),
    col: Math.floor(totalCol / region.length)
  };
}

/**
 * 根据距离排序区域（最近优先）
 * 
 * @param {Array} regions - 区域数组
 * @param {Object} referencePoint - 参考点 {row, col}
 * @returns {Array} 排序后的区域数组
 */
function sortRegionsByDistance(regions, referencePoint) {
  return regions.sort((a, b) => {
    const centerA = getRegionCenter(a);
    const centerB = getRegionCenter(b);

    // 使用曼哈顿距离
    const distanceA = Math.abs(centerA.row - referencePoint.row) + Math.abs(centerA.col - referencePoint.col);
    const distanceB = Math.abs(centerB.row - referencePoint.row) + Math.abs(centerB.col - referencePoint.col);

    return distanceA - distanceB;
  });
}

/**
 * 根据大小排序区域（最大优先）
 * 
 * @param {Array} regions - 区域数组
 * @returns {Array} 排序后的区域数组
 */
function sortRegionsBySize(regions) {
  return regions.sort((a, b) => b.length - a.length);
}

/**
 * 根据边缘优先排序区域（从外向内）
 * 
 * @param {Array} regions - 区域数组
 * @param {number} gridSize - 网格尺寸
 * @returns {Array} 排序后的区域数组
 */
function sortRegionsByEdge(regions, gridSize) {
  const center = gridSize / 2;
  
  return regions.sort((a, b) => {
    const centerA = getRegionCenter(a);
    const centerB = getRegionCenter(b);

    // 计算到边缘的平均距离
    const edgeDistA = Math.min(centerA.row, centerA.col, gridSize - 1 - centerA.row, gridSize - 1 - centerA.col);
    const edgeDistB = Math.min(centerB.row, centerB.col, gridSize - 1 - centerB.row, gridSize - 1 - centerB.col);

    // 边缘优先（距离边缘近的排前面）
    return edgeDistB - edgeDistA;
  });
}

/**
 * 执行洪水填充（修改颜色）
 * 
 * @param {Array} grid - 像素网格
 * @param {number} startRow - 起始行
 * @param {number} startCol - 起始列
 * @param {string} sourceId - 源颜色色号
 * @param {Object} targetColor - 目标颜色对象
 * @param {number} M - 网格高度
 * @param {number} N - 网格宽度
 * @returns {Object} { newGrid, filledCells }
 */
function floodFill(grid, startRow, startCol, sourceId, targetColor, M, N) {
  const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
  const filledCells = [];
  
  if (startRow < 0 || startRow >= M || startCol < 0 || startCol >= N) {
    return { newGrid, filledCells };
  }

  const startCell = newGrid[startRow][startCol];
  
  // 如果起点颜色已经是目标颜色，无需填充
  if (startCell.id === targetColor.id) {
    return { newGrid, filledCells };
  }

  const visited = Array.from({ length: M }, () => Array(N).fill(false));
  const stack = [{ row: startRow, col: startCol }];

  while (stack.length > 0) {
    const { row, col } = stack.pop();

    if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
      continue;
    }

    const currentCell = newGrid[row][col];

    // 检查是否是源颜色且不是外部区域
    if (!currentCell || currentCell.isExternal || currentCell.id !== sourceId) {
      continue;
    }

    visited[row][col] = true;

    // 修改颜色
    newGrid[row][col] = { ...targetColor, isExternal: false };
    filledCells.push({ row, col });

    // 添加相邻像素到栈中
    stack.push(
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 }
    );
  }

  return { newGrid, filledCells };
}

/**
 * 替换所有指定颜色为新颜色
 * 
 * @param {Array} grid - 像素网格
 * @param {string} sourceId - 源颜色色号
 * @param {Object} targetColor - 目标颜色对象
 * @returns {Object} { newGrid, replacedCount }
 */
function replaceColor(grid, sourceId, targetColor) {
  const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
  let replacedCount = 0;

  for (let row = 0; row < newGrid.length; row++) {
    for (let col = 0; col < newGrid[row].length; col++) {
      if (newGrid[row][col].id === sourceId) {
        newGrid[row][col] = { ...targetColor, isExternal: false };
        replacedCount++;
      }
    }
  }

  return { newGrid, replacedCount };
}

/**
 * 修改单个像素颜色
 * 
 * @param {Array} grid - 像素网格
 * @param {number} row - 行索引
 * @param {number} col - 列索引
 * @param {Object} newColor - 新颜色对象
 * @returns {Object} { newGrid, previousCell, hasChange }
 */
function paintSinglePixel(grid, row, col, newColor) {
  const newGrid = grid.map(r => r.map(cell => ({ ...cell })));
  const previousCell = { ...newGrid[row][col] };
  const hasChange = previousCell.id !== newColor.id;

  if (hasChange) {
    newGrid[row][col] = { ...newColor, isExternal: false };
  }

  return { newGrid, previousCell, hasChange };
}

module.exports = {
  getConnectedRegion,
  getAllConnectedRegions,
  isRegionCompleted,
  isRegionPartiallyCompleted,
  getRegionCenter,
  sortRegionsByDistance,
  sortRegionsBySize,
  sortRegionsByEdge,
  floodFill,
  replaceColor,
  paintSinglePixel
};
