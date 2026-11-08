// =========================================================================
// FORAGING & SUBSISTENCE (Nahrungsbeschaffung & Sammelwirtschaft - Acheuléen)
// =========================================================================
// Beeren, Wurzelknollen graben & Speerfischen am Gewässer.
// =========================================================================

import { MAP_SIZE, CAMP_CENTER, campfireStock, fireState } from './config.js';

/**
 * Sucht den nächsten Beerenstrauch mit reifen Früchten.
 */
export function findNearestBushWithBerries(map, fromX, fromY) {
  let nearestBush = null;
  let minDist = 9999;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const p = map[y][x].plant;
      if (p && p.type === 'bush' && p.berries > 0 && !p.isRootstock) {
        const d = Math.hypot(x - fromX, y - fromY);
        if (d < minDist) {
          minDist = d;
          nearestBush = { x, y };
        }
      }
    }
  }
  return nearestBush;
}

/**
 * Sucht eine geeignete Kachel zum Knollen-/Wurzelgraben mit dem Grabstock.
 * Ideal auf unversiegelten Wiesen und Waldrändern mit ausreichend Humus/NPK.
 */
export function findNearestRootDigSpot(map, fromX, fromY) {
  let bestSpot = null;
  let minDist = 9999;
  for (let y = 1; y < MAP_SIZE - 1; y++) {
    for (let x = 1; x < MAP_SIZE - 1; x++) {
      const tile = map[y][x];
      // Grasland ohne Hindernisse, mit vorhandenem Wurzelvorrat
      if (tile.type === 'grass' && !tile.plant && !tile.fire && !tile.shelter && (tile.roots > 0 || tile.npk >= 28)) {
        const d = Math.hypot(x - fromX, y - fromY);
        if (d < minDist) {
          minDist = d;
          bestSpot = { x, y };
        }
      }
    }
  }
  return bestSpot;
}

/**
 * Sucht eine Uferkachel am Flusslauf, an der mit dem Holzspeer gefischt werden kann.
 * Voraussetzung: Eine begehbare Kachel (Gras, Pfad, Furt), die direkt an tiefes/fließendes Wasser grenzt.
 */
export function findNearestFishingSpot(map, fromX, fromY) {
  let bestSpot = null;
  let minDist = 9999;
  for (let y = 1; y < MAP_SIZE - 1; y++) {
    for (let x = 1; x < MAP_SIZE - 1; x++) {
      const tile = map[y][x];
      if (tile.type === 'grass' || tile.type === 'path' || tile.isFord) {
        // Prüfen ob Nachbarkachel Wasser mit intaktem Fischbestand (> 0) ist (Überfischungs-Schutz)
        const neighbors = [
          map[y - 1] && map[y - 1][x],
          map[y + 1] && map[y + 1][x],
          map[y][x - 1],
          map[y][x + 1]
        ];
        const waterNeighbor = neighbors.find(n => n && n.type === 'water' && (n.fishStock === undefined || n.fishStock > 0));
        if (waterNeighbor) {
          const d = Math.hypot(x - fromX, y - fromY);
          if (d < minDist) {
            minDist = d;
            bestSpot = { x, y };
          }
        }
      }
    }
  }
  return bestSpot;
}

/**
 * Zählt alle momentan verfügbaren Nahrungseinheiten auf der gesamten Karte
 * (Für Migrations- und ökologische Druck-Berechnung).
 */
export function countGlobalAvailableFood(map, animals) {
  let berries = 0;
  let roots = 0;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const t = map[y][x];
      if (t.plant && t.plant.type === 'bush' && !t.plant.isRootstock) {
        berries += (t.plant.berries || 0);
      }
      if (t.roots && t.roots > 0) {
        roots += t.roots;
      }
    }
  }

  let livingWildlifeMeat = 0;
  for (const a of animals) {
    if (a.isAlive) livingWildlifeMeat += (a.meatYield || 4);
  }

  return {
    berries,
    roots,
    wildlifeMeat: livingWildlifeMeat,
    stockFood: campfireStock.food,
    totalImmediatelyAccessible: campfireStock.food + berries + (roots > 0 ? 3 : 0)
  };
}

/**
 * Sucht die nächstgelegene Kachel eines bestimmten Grundtyps (z. B. 'rock').
 */
export function findNearestTile(map, fromX, fromY, type) {
  let nearest = null;
  let minDist = 99999;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (map[y][x].type === type) {
        const d = Math.hypot(x - fromX, y - fromY);
        if (d < minDist) {
          minDist = d;
          nearest = { x, y };
        }
      }
    }
  }
  return nearest;
}

/**
 * Sucht den nächstgelegenen fällbaren Baum (ausgewachsen: stage === 3).
 */
export function findNearestAdultTree(map, fromX, fromY) {
  let nearest = null;
  let minDist = 99999;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const p = map[y][x].plant;
      if (p && p.type === 'tree' && !p.isStump && p.stage >= 3 && (p.woodStock === undefined || p.woodStock > 0)) {
        const d = Math.hypot(x - fromX, y - fromY);
        if (d < minDist) {
          minDist = d;
          nearest = { x, y };
        }
      }
    }
  }
  return nearest;
}

/**
 * Sucht die nächste begehbare Uferkachel (Gras/Pfad mit direktem Wasser-Nachbarn) zum Trinken oder Wasserholen.
 */
export function findNearestShoreTile(map, fromX, fromY) {
  let shoreTile = null;
  let minDist = 9999;
  for (let y = 1; y < MAP_SIZE - 1; y++) {
    for (let x = 1; x < MAP_SIZE - 1; x++) {
      if (map[y][x].type === 'grass' || map[y][x].type === 'path') {
        const hasWaterNeighbor = (
          map[y - 1][x].type === 'water' || map[y + 1][x].type === 'water' ||
          map[y][x - 1].type === 'water' || map[y][x + 1].type === 'water'
        );
        if (hasWaterNeighbor) {
          const d = Math.hypot(x - fromX, y - fromY);
          if (d < minDist) {
            minDist = d;
            shoreTile = { x, y };
          }
        }
      }
    }
  }
  return shoreTile;
}

/**
 * Prüft, ob die Position (fromX, fromY) im Wärmeradius (4.5 Kacheln) eines brennenden Feuers liegt.
 */
export function isPositionNearLitFire(map, fromX, fromY) {
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const t = map[y][x];
      if (t.type === 'fire') {
        const intensity = t.fire ? t.fire.intensity : (x === CAMP_CENTER.x && y === CAMP_CENTER.y ? fireState.intensity : 100);
        if (intensity > 15) {
          const d = Math.hypot(x - fromX, y - fromY);
          if (d <= 4.5) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Sucht die nächstgelegene brennende Feuerstelle (> 15% Intensität).
 */
export function findNearestLitFireTile(map, fromX, fromY) {
  let nearest = null;
  let minDist = 99999;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const t = map[y][x];
      if (t.type === 'fire') {
        const intensity = t.fire ? t.fire.intensity : (x === CAMP_CENTER.x && y === CAMP_CENTER.y ? fireState.intensity : 100);
        if (intensity > 15) {
          const d = Math.hypot(x - fromX, y - fromY);
          if (d < minDist) {
            minDist = d;
            nearest = { x, y };
          }
        }
      }
    }
  }
  return nearest;
}

/**
 * Sucht einen freien Bauplatz für eine neue Schutzhütte im Lagerumkreis (Radius 1 bis 4).
 */
export function findFreeShelterSpotNearCamp(map, humans = []) {
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r || Math.abs(dy) === r) {
          const sx = CAMP_CENTER.x + dx;
          const sy = CAMP_CENTER.y + dy;
          if (sx >= 1 && sx < MAP_SIZE - 1 && sy >= 1 && sy < MAP_SIZE - 1) {
            const t = map[sy][sx];
            if ((t.type === 'grass' || t.type === 'path') && !t.plant && t.type !== 'fire' && t.type !== 'shelter') {
              const alreadyTargeted = humans.some(
                h => h.isAlive && h.actionIntent === 'build_shelter' && Math.round(h.targetX) === sx && Math.round(h.targetY) === sy
              );
              if (!alreadyTargeted) {
                return { x: sx, y: sy };
              }
            }
          }
        }
      }
    }
  }
  return null;
}
