// =========================================================================
// DETERMINISTISCHES PFADFINDUNGS-MODUL (BFS AUF 26x26 GITTER)
// Findet zuverlässig den kürzesten begehbaren Pfad um tiefes Wasser herum
// oder über seichte Furten und Pfad-Brücken hinweg.
// =========================================================================
import { MAP_SIZE } from './config.js?v=8';

export function isTileWalkable(map, x, y) {
  if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return false;
  const tile = map[y] && map[y][x];
  if (!tile) return false;
  // Nur tiefes Wasser ohne Furt blockiert den Durchgang
  if (tile.type === 'water' && !tile.isFord) return false;
  return true;
}

/**
 * Sucht den kürzesten Pfad von (startX, startY) nach (goalX, goalY).
 * Gibt ein Array von Wegpunkten [{x, y}, ...] zurück oder null, falls unerreichbar.
 */
export function findPath(map, startX, startY, goalX, goalY) {
  const sx = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(startX)));
  const sy = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(startY)));
  let gx = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(goalX)));
  let gy = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(goalY)));

  // Wenn Start gleich Ziel ist
  if (sx === gx && sy === gy) {
    return [{ x: gx, y: gy }];
  }

  // Falls das Ziel im tiefen Wasser liegt (z. B. Flussufer-Ziel),
  // suchen wir die nächste begehbare Kachel daneben
  if (!isTileWalkable(map, gx, gy)) {
    const neighbors = [
      { x: gx, y: gy - 1 }, { x: gx, y: gy + 1 },
      { x: gx - 1, y: gy }, { x: gx + 1, y: gy },
      { x: gx - 1, y: gy - 1 }, { x: gx + 1, y: gy - 1 },
      { x: gx - 1, y: gy + 1 }, { x: gx + 1, y: gy + 1 }
    ].filter(n => isTileWalkable(map, n.x, n.y));

    if (neighbors.length === 0) return null;
    neighbors.sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy));
    gx = neighbors[0].x;
    gy = neighbors[0].y;
  }

  const queue = [sy * MAP_SIZE + sx];
  const visited = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const parent = new Int16Array(MAP_SIZE * MAP_SIZE).fill(-1);

  visited[sy * MAP_SIZE + sx] = 1;
  let found = false;
  const targetIdx = gy * MAP_SIZE + gx;

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === targetIdx) {
      found = true;
      break;
    }

    const cx = curr % MAP_SIZE;
    const cy = Math.floor(curr / MAP_SIZE);

    // 4 Kardinalrichtungen
    const dirs = [
      [0, -1], [0, 1], [-1, 0], [1, 0]
    ];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < MAP_SIZE && ny >= 0 && ny < MAP_SIZE) {
        const nIdx = ny * MAP_SIZE + nx;
        if (!visited[nIdx] && isTileWalkable(map, nx, ny)) {
          visited[nIdx] = 1;
          parent[nIdx] = curr;
          queue.push(nIdx);
        }
      }
    }
  }

  if (!found) return null;

  // Pfad rekonstruieren
  const path = [];
  let curr = targetIdx;
  while (curr !== -1) {
    path.push({
      x: curr % MAP_SIZE,
      y: Math.floor(curr / MAP_SIZE)
    });
    curr = parent[curr];
  }

  return path.reverse();
}
