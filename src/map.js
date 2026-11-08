// =========================================================================
// MAP & BIOME GENERATION (Acheuléen-Landschaften & Ökologie)
// =========================================================================
// 4 unterschiedliche Landschaften: Fluss-Aue, Eiszeit-Steppe, Dichter Urwald, Felsenschlucht.
// =========================================================================

import { MAP_SIZE, CAMP_CENTER, SHELTER_CONFIG, campfireStock, fireState, STORAGE_LIMITS, SPOILAGE_CONFIG, seasonState, advanceSeasonClock } from './config.js';

export const BIOMES = {
  river_valley: {
    id: 'river_valley',
    name: 'Fluss-Aue',
    icon: '🌊',
    desc: 'Fruchtbares Auenthal mit Schilf, Beeren und reichem Fischbestand.',
    palette: { grass: '#225522', dryGrass: '#2b5a27', water: '#0284c7' }
  },
  steppe: {
    id: 'steppe',
    name: 'Eiszeit-Steppe',
    icon: '🌾',
    desc: 'Karge Tundra. Kaum Bäume, keine Beeren, eisiger Wind – Heimat der Bisons.',
    palette: { grass: '#4a5320', dryGrass: '#6b6638', water: '#38bdf8' }
  },
  forest: {
    id: 'forest',
    name: 'Dichter Urwald',
    icon: '🌲',
    desc: 'Uralte Eichen & Dickicht. Reich an Holz, Wurzeln und Wildschweinen.',
    palette: { grass: '#1e3f20', dryGrass: '#1b3419', water: '#0ea5e9' }
  },
  karst_canyon: {
    id: 'karst_canyon',
    name: 'Felsenschlucht',
    icon: '🪨',
    desc: 'Schroffe Felswände mit natürlichen Höhlenüberhängen und Feuerstein.',
    palette: { grass: '#3a4439', dryGrass: '#444d44', water: '#06b6d4' }
  }
};

export function createMap(biomeId = 'river_valley') {
  const biome = BIOMES[biomeId] || BIOMES.river_valley;
  const map = [];

  for (let y = 0; y < MAP_SIZE; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      let type = 'grass';
      let npk = 20 + Math.random() * 25;
      let plant = null;
      let shelter = null;
      let defaultFish = 0;

      // 1. GEWÄSSER-GENERIERUNG NACH BIOM
      if (biome.id === 'river_valley') {
        // Breiter, organischer Flusslauf im Osten
        const riverCenterX = 20 + Math.sin(y * 0.4) * 2;
        const riverWidth = (y >= 8 && y <= 12) ? 1.8 : 1.1;
        if (Math.abs(x - riverCenterX) <= riverWidth) {
          type = 'water';
          npk = 65;
          defaultFish = 3;
        }
      } else if (biome.id === 'steppe') {
        // Keine großen Flüsse! Nur 2 seichte Tümpel/Wasserlöcher
        const inPond1 = Math.hypot(x - 19, y - 7) <= 1.8;
        const inPond2 = Math.hypot(x - 7, y - 19) <= 1.5;
        if (inPond1 || inPond2) {
          type = 'water';
          npk = 45;
          defaultFish = 1; // Sehr schnell überfischt
        }
      } else if (biome.id === 'forest') {
        // Schmaler, sich durch die Bäume schlängelnder Wald-Bach (1 Kachel breit)
        const brookX = Math.round(18 + Math.sin(y * 0.5) * 1.5);
        if (x === brookX) {
          type = 'water';
          npk = 70;
          defaultFish = 2;
        }
      } else if (biome.id === 'karst_canyon') {
        // Reißender Gebirgsbach in der Klamm
        const canyonStreamX = Math.round(19 + Math.cos(y * 0.35) * 1.4);
        if (Math.abs(x - canyonStreamX) <= 1.0) {
          type = 'water';
          npk = 50;
          defaultFish = 2;
        }
      }

      // 2. FELSEN & HÖHLEN-GENERIERUNG
      if (type !== 'water') {
        if (biome.id === 'karst_canyon') {
          // Massiver Karst: 35% Felswände
          if ((x <= 6 && Math.random() < 0.65) || (x >= 14 && x <= 17 && Math.random() < 0.55) || Math.random() < 0.12) {
            type = 'rock';
          }
          // Natürlicher Höhlen-Überhang in der Nähe des Lagers (fertiger Schutzraum)
          if ((x === CAMP_CENTER.x - 2 && y === CAMP_CENTER.y - 1) || (x === CAMP_CENTER.x + 2 && y === CAMP_CENTER.y - 2)) {
            type = 'shelter';
            shelter = { condition: 100, capacity: 2, isCave: true };
          }
        } else if (biome.id === 'steppe') {
          // Vereinzelte Findlinge
          if (Math.random() < 0.08) type = 'rock';
        } else if (biome.id === 'forest') {
          // Moosige Felsbrocken
          if (Math.random() < 0.04) type = 'rock';
        } else {
          // Fluss-Aue Felsen
          if ((x >= 15 && x <= 18 && y <= 3) || (x === 6 && y === 4)) {
            if (Math.random() < 0.45) type = 'rock';
          }
        }
      }

      // 3. VEGETATION (Bäume & Beerensträucher)
      if (type === 'grass') {
        const isNearCamp = Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) <= 2.2;

        if (biome.id === 'forest') {
          // Dichter Urwald: 55% Baumbedeckung überall außer im Lagerzentrum
          if (!isNearCamp && Math.random() < 0.55) {
            const treeMaxAge = 1000 + Math.random() * 500;
            plant = {
              type: 'tree',
              stage: 3,
              woodStock: 4,
              seedVariance: Math.random(),
              maxAge: treeMaxAge,
              ageTimer: Math.random() * (treeMaxAge * 0.7)
            };
            npk = 75;
          } else if (Math.random() < 0.08) {
            plant = {
              type: 'bush',
              stage: 2,
              berries: 2,
              maxBerries: 4,
              berryTimer: 0,
              seedVariance: Math.random(),
              maxAge: 600,
              ageTimer: 0,
              isRootstock: false
            };
          }
        } else if (biome.id === 'steppe') {
          // Steppe: Nahezu KEINE Bäume (Holznot!), 0 Beerensträucher!
          if (!isNearCamp && Math.random() < 0.012) {
            plant = {
              type: 'tree',
              stage: 2,
              woodStock: 2,
              seedVariance: Math.random(),
              maxAge: 700,
              ageTimer: 0
            };
          }
          // Keine Sträucher in der eisigen Steppe
        } else if (biome.id === 'karst_canyon') {
          // Felsige Schlucht: Spärliche, zähe Gehölze
          if (!isNearCamp && Math.random() < 0.10) {
            plant = {
              type: 'tree',
              stage: 3,
              woodStock: 3,
              seedVariance: Math.random(),
              maxAge: 850,
              ageTimer: 0
            };
          } else if (Math.random() < 0.08) {
            plant = {
              type: 'bush',
              stage: 2,
              berries: 2,
              maxBerries: 4,
              berryTimer: 0,
              seedVariance: Math.random(),
              maxAge: 600,
              ageTimer: 0,
              isRootstock: false
            };
          }
        } else {
          // Fluss-Aue: Ausgewogene Vegetation
          if (x <= 5 && Math.random() < 0.35) {
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
          } else if ((y >= 20 && Math.random() < 0.25) || (Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) > 3 && Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) < 7 && Math.random() < 0.12)) {
            const bushMaxAge = 700 + Math.random() * 450;
            plant = {
              type: 'bush',
              stage: 3,
              berries: 3,
              maxBerries: 5,
              berryTimer: 0,
              seedVariance: Math.random(),
              maxAge: bushMaxAge,
              ageTimer: Math.random() * (bushMaxAge * 0.4),
              isRootstock: false
            };
            npk = 55;
          }
        }
      }

      // 4. ESSBARE WURZELKNOLLEN IM BODEN (Grabstock-Subsistenz)
      let roots = 0;
      if (type === 'grass' && !plant) {
        if (biome.id === 'steppe') {
          // Steppenboden birgt viele zähe Wurzeln
          if (Math.random() < 0.50) roots = 1 + Math.floor(Math.random() * 2);
        } else if (biome.id === 'forest') {
          // Waldhumus ist voll mit stärkehaltigen Wurzeln
          if (Math.random() < 0.45) roots = 2;
        } else {
          if (Math.random() < 0.35) roots = 1 + Math.floor(Math.random() * 2);
        }
      }

      // Anfängliche Fußspuren zum Flussufer (statt brauner Block-Kacheln)
      let isDesirePath = false;
      let trample = 0;
      const footprints = [];
      if (biome.id === 'river_valley' && y === CAMP_CENTER.y && x > CAMP_CENTER.x && x <= 18 && type === 'grass' && !plant) {
        trample = 55;
        const baseAngle = Math.atan2(0.5, 1.0); // Richtung Osten (+x) in Isometrie
        for (let i = 0; i < 6; i++) {
          const stepT = (i / 5) - 0.5;
          const isLeft = (i % 2 === 0);
          footprints.push({
            lx: stepT * 18 + (Math.random() - 0.5) * 5,
            ly: stepT * 9 + (isLeft ? -1.8 : 1.8) + (Math.random() - 0.5) * 3,
            angle: baseAngle + (Math.random() - 0.5) * 0.25,
            isLeft,
            scale: 0.95,
            age: Math.random() * 18,
            maxAge: 65
          });
        }
      }

      // Zentrales Stammesfeuer am Camp-Zentrum (12, 12)
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
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          flowerDots.push({
            dx: (Math.random() - 0.5) * 22,
            dy: (Math.random() - 0.5) * 11,
            color: biome.id === 'steppe' ? '#eab308' : (Math.random() < 0.5 ? '#f43f5e' : '#60a5fa'),
            size: 0.9 + Math.random() * 0.7
          });
        }
      }

      map[y][x] = {
        type: type,
        npk: npk,
        plant: plant,
        roots: roots,
        shelter: shelter,
        stoneStock: (type === 'rock' ? 8 : 0),
        maxStoneStock: (type === 'rock' ? 8 : 0),
        fishStock: defaultFish,
        maxFishStock: defaultFish,
        fishRegenTimer: 0,
        poop: null,
        flowerDots: flowerDots,
        trample: trample,
        footprints: footprints,
        isDesirePath: isDesirePath,
        fire: fireObj
      };
    }
  }

  // Für jede Wasserkachel die lokale Furt-Passierbarkeit prüfen
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (map[y][x].type === 'water') {
        let width = 1;
        let lx = x - 1;
        while (lx >= 0 && map[y][lx].type === 'water') { width++; lx--; }
        let rx = x + 1;
        while (rx < MAP_SIZE && map[y][rx].type === 'water') { width++; rx++; }

        map[y][x].waterWidth = width;
        map[y][x].isFord = (width <= 2);
      }
    }
  }

  // Biom-Metadaten anhängen
  map.biomeId = biome.id;
  map.biome = biome;

  return map;
}

export function updateEcology(map, dtSec, logEvent) {
  // 0. Jahreszeiten-Uhr fortschreiben
  advanceSeasonClock(dtSec, logEvent);

  // ==========================================
  // NAHRUNGSVERDERB & LAGERKAPAZITÄT (Thermodynamik der Fäule vs. Winterfrost)
  // Im Winter gefriert der Vorrat (Natur-Kühlschrank: 0 Fäulnis!).
  // Im heißen Sommer verdirbt Fleisch auf offenem Erdboden 1.35x schneller.
  // ==========================================
  if (!seasonState.isWinter) {
    const spoilageSpeed = seasonState.isSummer ? 1.35 : 1.0;
    SPOILAGE_CONFIG.timer = (SPOILAGE_CONFIG.timer || 0) + dtSec * spoilageSpeed;
    if (SPOILAGE_CONFIG.timer >= SPOILAGE_CONFIG.decayInterval) {
      SPOILAGE_CONFIG.timer = 0;
      if (campfireStock.food > 0) {
        // Höherer Verderb bei großem Vorratshaufen (> 18 Nahrung)
        const loss = (campfireStock.food > 18) ? 2 : 1;
        campfireStock.food = Math.max(0, campfireStock.food - loss);
        if (Math.random() < 0.25) {
          logEvent(`🍂 Vorratsverderb: Fleisch & Beeren sind im feuchten Erdlager verfault (-${loss}).`);
        }
      }
    }
  }

  // Obergrenze: Auf offenem Erdboden kann maximal STORAGE_LIMITS.maxFood gelagert werden
  if (campfireStock.food > STORAGE_LIMITS.maxFood) {
    campfireStock.food = STORAGE_LIMITS.maxFood;
  }

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = map[y][x];

      // ==========================================
      // GEWÄSSER: FISCHBESTAND-REGENERATION (Überfischungs-Schutz)
      // ==========================================
      if (tile.type === 'water' && tile.fishStock < tile.maxFishStock) {
        tile.fishRegenTimer = (tile.fishRegenTimer || 0) + dtSec;
        if (tile.fishRegenTimer >= 140.0) {
          tile.fishStock++;
          tile.fishRegenTimer = 0;
        }
      }

      if (tile.poop) {
        tile.poop.timer -= dtSec;
        if (tile.poop.timer <= 0) {
          tile.npk = Math.min(100, tile.npk + 35);
          tile.poop = null;
          tile.flowerDots = [];

          if (!tile.plant && tile.type === 'grass') {
            const sproutRoll = Math.random();
            if (sproutRoll < 0.12 && map.biomeId !== 'steppe') {
              tile.plant = {
                type: 'bush',
                stage: 1,
                growthTimer: 0,
                berries: 0,
                berryTimer: 0,
                seedVariance: Math.random(),
                maxAge: 500,
                ageTimer: 0,
                isRootstock: false
              };
              logEvent(`🌱 Wilder Beerenstrauch keimt auf humosem Boden. [${x}, ${y}]`);
            } else if (sproutRoll < 0.16) {
              // Seltene Baumkeimung (4% Chance) - verhindert unendliche Überwucherung
              tile.plant = {
                type: 'tree',
                stage: 1,
                growthTimer: 0,
                woodStock: 3,
                seedVariance: Math.random(),
                maxAge: 1200 + Math.random() * 600,
                ageTimer: 0
              };
              logEvent(`🌱 Ein junger Baumkeimling schlägt Wurzeln. [${x}, ${y}]`);
            } else {
              // Hauptsächlich blühende Magerwiese
              for (let i = 0; i < 3; i++) {
                tile.flowerDots.push({
                  dx: (Math.random() - 0.5) * 20,
                  dy: (Math.random() - 0.5) * 10,
                  color: Math.random() < 0.5 ? '#f59e0b' : '#ec4899',
                  size: 0.8 + Math.random() * 0.7
                });
              }
            }
          }
        }
      }

      if (tile.type === 'grass' && tile.npk < 45) {
        tile.npk = Math.min(45, tile.npk + dtSec * 0.08);
      }

      // Nachhaltige Regeneration von Wurzelknollen (stark verlangsamt für spürbare Ressourcenknappheit)
      if (tile.type === 'grass' && (!tile.roots || tile.roots < 2) && tile.npk >= 40 && Math.random() < 0.0006 * dtSec) {
        tile.roots = (tile.roots || 0) + 1;
      }

      // ==========================================
      // FUSSABDRÜCKE & PFAD-RENATURIERUNG
      // Wenn längere Zeit niemand über eine Kachel läuft, verblassen die Fußabdrücke und verschwinden.
      // ==========================================
      if (tile.footprints && tile.footprints.length > 0) {
        for (let i = tile.footprints.length - 1; i >= 0; i--) {
          tile.footprints[i].age += dtSec;
          if (tile.footprints[i].age >= tile.footprints[i].maxAge) {
            tile.footprints.splice(i, 1);
          }
        }
      }
      if (tile.trample && tile.trample > 0) {
        tile.trample = Math.max(0, tile.trample - dtSec * 0.45);
      }
      if (tile.type === 'path' && tile.isDesirePath && (!tile.trample || tile.trample <= 0)) {
        tile.type = 'grass';
        tile.isDesirePath = false;
        tile.trample = 0;
      }

      // ==========================================
      // HÜTTEN-VERFALL
      // Natürliche Höhlenüberhänge verfallen nicht!
      // ==========================================
      if (tile.type === 'shelter' && !tile.shelter?.isCave) {
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
      // DEZENTRALE FEUER-THERMODYNAMIK
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

        // Im Winter brennt das Feuer wegen des Kältegradienten 1.35x schneller ab
        const fireBurnRate = seasonState.isWinter ? 1.35 : 1.0;
        tile.fire.woodBurnTimer = (tile.fire.woodBurnTimer || 0) + dtSec * fireBurnRate;
        if (tile.fire.woodBurnTimer >= 22.0) {
          tile.fire.woodBurnTimer = 0;
          if (tile.fire.isCampCenter) {
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
        const seasonGrowthMod = seasonState.isWinter ? 0 : (seasonState.isSpring || seasonState.isSummer ? 1.2 : 0.85);
        const growthRate = (tile.npk / 40) * seasonGrowthMod;

        // Alterung & Wurzelstock-Regeneration
        if (p.stage === 3) {
          p.ageTimer = (p.ageTimer || 0) + dtSec;
          const maxAge = p.maxAge || (p.type === 'bush' ? 800 : 1200);
          if (p.ageTimer >= maxAge) {
            if (p.type === 'bush') {
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

        if (p.stage < 3 && growthRate > 0) {
          p.growthTimer = (p.growthTimer || 0) + dtSec * growthRate;
          const targetGrowthTime = (p.type === 'tree') ? 130.0 : 24.0;
          if (p.growthTimer >= targetGrowthTime) {
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

        // Im Winter wachsen keine neuen Beeren nach; im Herbst reifen sie 1.3x schneller vor dem Frost
        if (p.type === 'bush' && p.stage >= 2 && p.berries < (p.maxBerries || 5) && !p.isRootstock && !seasonState.isWinter) {
          const berryRate = seasonState.isAutumn ? 1.3 : 1.0;
          p.berryTimer = (p.berryTimer || 0) + dtSec * berryRate;
          if (p.berryTimer >= 10.0) {
            p.berries++;
            p.berryTimer = 0;
          }
        }
      }
    }
  }
}
