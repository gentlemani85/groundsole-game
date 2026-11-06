import { MAP_SIZE, CAMP_CENTER } from './config.js';

export function createMap() {
  const map = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      let type = 'grass';
      let npk = 20 + Math.random() * 25;
      let plant = null;

      // Flusslauf im Osten (organisch geschwungen)
      // An den meisten Stellen 1-2 Kacheln breit (Furt), stellenweise 3 Kacheln breit (tiefes Wasser)
      const riverCenterX = 20 + Math.sin(y * 0.4) * 2;
      const riverWidth = (y >= 8 && y <= 12) ? 1.8 : 1.1; // Bei y=8-12 ca 3-4 Kacheln breit, sonst 2 Kacheln

      if (Math.abs(x - riverCenterX) <= riverWidth) {
        type = 'water';
        npk = 65;
      }
      // Felsbrocken
      else if ((x >= 15 && x <= 18 && y <= 3) || (x === 6 && y === 4)) {
        if (Math.random() < 0.45) type = 'rock';
      }
      // Wilde Waldzone im Westen
      else if (x <= 5 && Math.random() < 0.35) {
        plant = { type: 'tree', stage: 3, woodStock: 4, seedVariance: Math.random() };
        npk = 65;
      }
      // Beerensträucher im Süden UND in der Nähe des Lagers
      else if ((y >= 20 && Math.random() < 0.25) || (Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) > 3 && Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) < 7 && Math.random() < 0.12)) {
        plant = { type: 'bush', stage: 3, berries: 3, berryTimer: 0, seedVariance: Math.random() };
        npk = 55;
      }
      // Pfad zum Wasser
      else if (y === CAMP_CENTER.y && x >= CAMP_CENTER.x && x <= 19) {
        type = 'path';
      }
      // Zentrales Stammesfeuer: Am Anfang ist nur kalte Vorbereitung da ('grass'),
      // die Hominiden müssen das Feuer erst selbst entzünden!
      // (Erst durch Entfachen wird es zu 'fire')

      // Blumen auf magerem Boden
      const flowerDots = [];
      if (npk < 32 && type === 'grass') {
        const count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          flowerDots.push({
            dx: (Math.random() - 0.5) * 22,
            dy: (Math.random() - 0.5) * 11,
            color: Math.random() < 0.35 ? '#f43f5e' : (Math.random() < 0.65 ? '#fbbf24' : '#60a5fa'),
            size: 0.9 + Math.random() * 0.8
          });
        }
      }

      map[y][x] = {
        type: type,
        npk: npk,
        plant: plant,
        poop: null,
        flowerDots: flowerDots
      };
    }
  }

  // Für jede Wasserkachel die lokale Flussbreite vorberechnen:
  // Ist sie <= 2 Kacheln (Furt / seicht) oder >= 3 (tief / unpassierbar)
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (map[y][x].type === 'water') {
        // Zähle zusammenhängende horizontale Wasser-Kacheln
        let width = 1;
        let lx = x - 1;
        while (lx >= 0 && map[y][lx].type === 'water') { width++; lx--; }
        let rx = x + 1;
        while (rx < MAP_SIZE && map[y][rx].type === 'water') { width++; rx++; }

        map[y][x].waterWidth = width;
        map[y][x].isFord = (width <= 2); // Furt = passierbar!
      }
    }
  }

  return map;
}

export function updateEcology(map, dtSec, logEvent) {
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = map[y][x];

      if (tile.poop) {
        tile.poop.timer -= dtSec;
        if (tile.poop.timer <= 0) {
          tile.npk = Math.min(100, tile.npk + 35);
          tile.poop = null;
          tile.flowerDots = [];

          if (!tile.plant && tile.type === 'grass') {
            if (Math.random() < 0.6) {
              tile.plant = { type: 'bush', stage: 1, growthTimer: 0, berries: 0, berryTimer: 0, seedVariance: Math.random() };
              logEvent(`🌱 Wilder Beerenstrauch aus Kot gekeimt! [${x}, ${y}]`);
            } else {
              tile.plant = { type: 'tree', stage: 1, growthTimer: 0, woodStock: 3, seedVariance: Math.random() };
              logEvent(`🌱 Baumkeimling wurzelt auf Düngeland. [${x}, ${y}]`);
            }
          }
        }
      }

      if (tile.type === 'grass' && tile.npk < 45) {
        tile.npk = Math.min(45, tile.npk + dtSec * 0.08);
      }

      if (tile.plant) {
        const p = tile.plant;
        const growthRate = (tile.npk / 40);

        if (p.stage < 3) {
          p.growthTimer = (p.growthTimer || 0) + dtSec * growthRate;
          if (p.growthTimer >= 18.0) {
            p.stage++;
            p.growthTimer = 0;
            logEvent(`🌿 Ein ${p.type === 'bush' ? 'Beerenstrauch' : 'Baum'} ist gewachsen (Stufe ${p.stage}).`);
          }
        }

        if (p.type === 'bush' && p.stage >= 2 && p.berries < 3) {
          p.berryTimer = (p.berryTimer || 0) + dtSec;
          if (p.berryTimer >= 12.0) {
            p.berries++;
            p.berryTimer = 0;
          }
        }

        if (p.stage === 3 && Math.random() < (0.0012 * dtSec)) {
          const nx = Math.max(0, Math.min(MAP_SIZE - 1, x + (Math.random() < 0.5 ? -1 : 1)));
          const ny = Math.max(0, Math.min(MAP_SIZE - 1, y + (Math.random() < 0.5 ? -1 : 1)));
          const nTile = map[ny][nx];
          if (nTile.type === 'grass' && !nTile.plant) {
            nTile.plant = { type: p.type, stage: 1, growthTimer: 0, berries: 0, berryTimer: 0, woodStock: 3, seedVariance: Math.random() };
            logEvent(`🍃 Wind hat Samen verweht: Neuer ${p.type === 'bush' ? 'Strauch' : 'Baum'} keimt bei [${nx}, ${ny}].`);
          }
        }
      }
    }
  }
}
