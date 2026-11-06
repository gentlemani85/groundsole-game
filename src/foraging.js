// =========================================================================
// FORAGING & SUBSISTENCE (Nahrungsbeschaffung & Sammelwirtschaft - Acheuléen)
// =========================================================================
// Beeren, Wurzelknollen graben & Speerfischen am Gewässer.
// =========================================================================

import { MAP_SIZE, CAMP_CENTER, campfireStock } from './config.js';

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
