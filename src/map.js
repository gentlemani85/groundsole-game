import { MAP_SIZE, CAMP_CENTER, SHELTER_CONFIG, campfireStock, fireState } from './config.js';

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
        const treeMaxAge = 900 + Math.random() * 600;
        plant = {
          type: 'tree',
          stage: 3,
          woodStock: 4,
          seedVariance: Math.random(),
          maxAge: treeMaxAge,
          ageTimer: Math.random() * (treeMaxAge * 0.7)
        };
        npk = 65;
      }
      // Beerensträucher im Süden UND in der Nähe des Lagers
      else if ((y >= 20 && Math.random() < 0.25) || (Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) > 3 && Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) < 7 && Math.random() < 0.12)) {
        const bushMaxAge = 700 + Math.random() * 450;
        plant = {
          type: 'bush',
          stage: 3,
          berries: 4,
          maxBerries: 5,
          berryTimer: 0,
          seedVariance: Math.random(),
          maxAge: bushMaxAge,
          ageTimer: Math.random() * (bushMaxAge * 0.4),
          isRootstock: false
        };
        npk = 55;
      }
      // Pfad zum Wasser (als initialer Trampelpfad)
      let isDesirePath = false;
      let trample = 0;
      if (y === CAMP_CENTER.y && x >= CAMP_CENTER.x && x <= 19) {
        type = 'path';
        isDesirePath = true;
        trample = 90;
      }
      // Zentrales Stammesfeuer: Brennt zu Beginn bei 100%
      let fireObj = null;
      if (x === CAMP_CENTER.x && y === CAMP_CENTER.y) {
        type = 'fire';
        plant = null;
        fireObj = {
          intensity: 100,
          woodBurnTimer: 0,
          wood: 0,
          isCampCenter: true
        };
      }

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

      // Wurzelknollen im Boden (Grabstock-Ressource)
      let roots = 0;
      if (type === 'grass' && !plant && Math.random() < 0.40) {
        roots = 1 + Math.floor(Math.random() * 2);
      }

      map[y][x] = {
        type: type,
        npk: npk,
        plant: plant,
        roots: roots,
        poop: null,
        flowerDots: flowerDots,
        trample: trample,
        isDesirePath: isDesirePath,
        fire: fireObj
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
            if (Math.random() < 0.5) {
              tile.plant = {
                type: 'bush',
                stage: 1,
                growthTimer: 0,
                berries: 0,
                berryTimer: 0,
                seedVariance: Math.random(),
                maxAge: 350 + Math.random() * 250,
                ageTimer: 0
              };
              logEvent(`🌱 Wilder Beerenstrauch aus Kot gekeimt! [${x}, ${y}]`);
            } else {
              tile.plant = {
                type: 'tree',
                stage: 1,
                growthTimer: 0,
                woodStock: 3,
                seedVariance: Math.random(),
                maxAge: 900 + Math.random() * 600,
                ageTimer: 0
              };
              logEvent(`🌱 Baumkeimling wurzelt auf Düngeland. [${x}, ${y}]`);
            }
          }
        }
      }

      if (tile.type === 'grass' && tile.npk < 45) {
        tile.npk = Math.min(45, tile.npk + dtSec * 0.08);
      }

      // Regeneration von essbaren Wurzelknollen im nahrhaften Grasboden
      if (tile.type === 'grass' && (!tile.roots || tile.roots < 3) && tile.npk >= 30 && Math.random() < 0.003 * dtSec) {
        tile.roots = (tile.roots || 0) + 1;
      }

      // ==========================================
      // TRAMPELPFAD-RENATURIERUNG (Sukzession der Grasnarbe)
      // Ungenutzte Trampelpfade werden von der Wiese zurückerobert!
      // ==========================================
      if (tile.trample && tile.trample > 0) {
        tile.trample = Math.max(0, tile.trample - dtSec * 0.35);
      }
      if (tile.type === 'path' && tile.isDesirePath && (!tile.trample || tile.trample <= 0)) {
        tile.type = 'grass';
        tile.isDesirePath = false;
        tile.trample = 0;
        if (tile.npk < 32 && (!tile.flowerDots || tile.flowerDots.length === 0)) {
          tile.flowerDots = [];
          const count = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < count; i++) {
            tile.flowerDots.push({
              dx: (Math.random() - 0.5) * 22,
              dy: (Math.random() - 0.5) * 11,
              color: Math.random() < 0.5 ? '#f43f5e' : '#fbbf24',
              size: 0.9 + Math.random() * 0.7
            });
          }
        }
      }

      // ==========================================
      // HÜTTEN-VERFALL (Verwitterung durch Wind & Wetter)
      // Ohne Wartung durch Menschen verfällt jede Schutzhütte allmählich!
      // ==========================================
      if (tile.type === 'shelter') {
        if (!tile.shelter) {
          tile.shelter = { condition: 100, capacity: SHELTER_CONFIG.capacity };
        }
        tile.shelter.condition -= dtSec * SHELTER_CONFIG.decayRate;
        if (tile.shelter.condition <= 0) {
          tile.type = 'grass';
          tile.shelter = null;
          logEvent(`🏚️ Eine baufällige Schutzhütte bei [${x}, ${y}] ist eingestürzt und verfallen!`);
        }
      }

      // ==========================================
      // DEZENTRALE FEUER-THERMODYNAMIK (Jedes Feuer brennt autark!)
      // ==========================================
      if (tile.type === 'fire') {
        const isCampCenter = (x === CAMP_CENTER.x && y === CAMP_CENTER.y);
        if (!tile.fire) {
          tile.fire = {
            intensity: isCampCenter ? (fireState.intensity || 85) : 100,
            woodBurnTimer: 0,
            wood: isCampCenter ? 0 : 3,
            isCampCenter: isCampCenter
          };
        }

        tile.fire.woodBurnTimer = (tile.fire.woodBurnTimer || 0) + dtSec;
        if (tile.fire.woodBurnTimer >= 22.0) {
          tile.fire.woodBurnTimer = 0;
          if (tile.fire.isCampCenter) {
            // Zentrales Lagerfeuer bezieht Brennholz aus dem Clan-Vorratslager
            if (campfireStock.wood > 0) {
              campfireStock.wood--;
              tile.fire.intensity = Math.min(100, tile.fire.intensity + 15);
            } else {
              tile.fire.intensity = Math.max(0, tile.fire.intensity - 20);
              if (tile.fire.intensity <= 0) {
                logEvent(`❄️ Alarm! Das Stammesfeuer ist erloschen! Kälte bricht herein.`);
              }
            }
            fireState.intensity = tile.fire.intensity;
          } else {
            // Autarke Außen-Feuerstelle: Verbrennt ihren eigenen Holzvorrat
            if (tile.fire.wood > 0) {
              tile.fire.wood--;
              tile.fire.intensity = Math.min(100, tile.fire.intensity + 15);
            } else {
              tile.fire.intensity = Math.max(0, tile.fire.intensity - 25);
              if (tile.fire.intensity <= 0) {
                tile.type = 'grass';
                tile.fire = null;
                logEvent(`💨 Eine Außenfeuerstelle bei [${x}, ${y}] ist erloschen.`);
              }
            }
          }
        }
      }

      if (tile.plant) {
        const p = tile.plant;
        const growthRate = (tile.npk / 40);

        // Natürlicher Alterungs- und Totholz-Zyklus
        if (p.stage === 3) {
          p.ageTimer = (p.ageTimer || 0) + dtSec;
          const maxAge = p.maxAge || (p.type === 'bush' ? 800 : 1200);
          if (p.ageTimer >= maxAge) {
            if (p.type === 'bush') {
              // Stockausschlag / Wurzelstock-Regeneration:
              // Beerenstrauch stirbt nicht spurlos, sondern zieht sich in den Wurzelstock zurück!
              p.stage = 1;
              p.isRootstock = true;
              p.berries = 0;
              p.ageTimer = 0;
              p.growthTimer = 0;
              logEvent(`🌱 Ein alter Beerenstrauch bei [${x}, ${y}] zieht sich in den schlafenden Wurzelstock zurück.`);
              continue;
            } else {
              const compostNPK = 40;
              tile.npk = Math.min(100, tile.npk + compostNPK);
              tile.plant = null;
              continue;
            }
          }
        }

        if (p.stage < 3) {
          p.growthTimer = (p.growthTimer || 0) + dtSec * growthRate;
          if (p.growthTimer >= 16.0) {
            p.stage++;
            p.growthTimer = 0;
            if (p.type === 'bush' && p.stage === 3 && p.isRootstock) {
              p.isRootstock = false;
              p.berries = 2;
              logEvent(`🌿 Ein Wurzelstock bei [${x}, ${y}] hat wieder voll ausgetrieben und trägt Früchte!`);
            } else {
              logEvent(`🌿 Ein ${p.type === 'bush' ? 'Beerenstrauch' : 'Baum'} ist gewachsen (Stufe ${p.stage}).`);
            }
          }
        }

        if (p.type === 'bush' && p.stage >= 2 && p.berries < (p.maxBerries || 5) && !p.isRootstock) {
          p.berryTimer = (p.berryTimer || 0) + dtSec;
          if (p.berryTimer >= 9.0) {
            p.berries++;
            p.berryTimer = 0;
          }
        }

        // Samenverbreitung mit ökologischer Kronendichte (Lichtmangel-Filter)
        const seedChance = (p.type === 'bush' ? 0.0004 : 0.0008) * dtSec;
        if (p.stage === 3 && Math.random() < seedChance) {
          const nx = Math.max(0, Math.min(MAP_SIZE - 1, x + (Math.random() < 0.5 ? -1 : 1)));
          const ny = Math.max(0, Math.min(MAP_SIZE - 1, y + (Math.random() < 0.5 ? -1 : 1)));
          const nTile = map[ny][nx];
          if (nTile.type === 'grass' && !nTile.plant) {
            // Kronendichte: Wenn im 3x3 Umfeld bereits >= 2 Pflanzen stehen, fehlt das Sonnenlicht
            let neighborCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const ct = map[ny + dy] && map[ny + dy][nx + dx];
                if (ct && ct.plant) neighborCount++;
              }
            }
            if (neighborCount <= 2) {
              const maxA = p.type === 'bush' ? (350 + Math.random() * 250) : (900 + Math.random() * 600);
              nTile.plant = {
                type: p.type,
                stage: 1,
                growthTimer: 0,
                berries: 0,
                berryTimer: 0,
                woodStock: 3,
                seedVariance: Math.random(),
                maxAge: maxA,
                ageTimer: 0
              };
              logEvent(`🍃 Wind hat Samen verweht: Neuer ${p.type === 'bush' ? 'Strauch' : 'Baum'} keimt bei [${nx}, ${ny}].`);
            }
          }
        }
      }
    }
  }
}
