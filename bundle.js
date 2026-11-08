(() => {
  // src/config.js
  var TILE_W = 64;
  var TILE_H = 32;
  var MAP_SIZE = 26;
  var START_YEAR = -6e5;
  var SECONDS_PER_YEAR = 480;
  var CAMP_CENTER = { x: 12, y: 12 };
  var campfireStock = {
    stone: 3,
    wood: 6,
    // Brennholz-Vorrat
    food: 4,
    // Beeren & Vorrat
    water: 3
  };
  var fireState = {
    intensity: 100,
    // Zu Beginn brennendes Stammesfeuer (100%)
    woodBurnTimer: 0
  };
  var SHELTER_CONFIG = {
    capacity: 2,
    // Max 2 Personen pro Hütte
    decayRate: 0.22,
    // Verfall pro Sekunde (hält ohne Wartung ca. 450s)
    repairThreshold: 65
    // Reparatur-Bedarf ab unter 65% Haltbarkeit
  };
  var STORAGE_LIMITS = {
    maxFood: 34,
    // Maximal 34 Einheiten auf offenem Waldboden (Wintervorrat)
    maxWood: 35,
    maxStone: 25,
    maxWater: 20
  };
  var SPOILAGE_CONFIG = {
    decayInterval: 12,
    // Intervall für biologischen Fäulnis-Zerfall
    timer: 0
  };
  var SEASONS = [
    { key: "spring", label: "Fr\xFChling \u{1F331}" },
    { key: "summer", label: "Sommer \u2600\uFE0F" },
    { key: "autumn", label: "Herbst \u{1F342}" },
    { key: "winter", label: "Winter \u2744\uFE0F" }
  ];
  var seasonState = {
    elapsedYears: 0,
    index: 0,
    key: "spring",
    label: "Fr\xFChling \u{1F331}",
    isSpring: true,
    isSummer: false,
    isAutumn: false,
    isWinter: false,
    // Kontinuierliche Interpolations-Gewichte (Summe = 1.0)
    weights: { spring: 1, summer: 0, autumn: 0, winter: 0 }
  };
  function advanceSeasonClock(dtSec, logEvent2 = null) {
    if (dtSec <= 0) return;
    const prevIndex = seasonState.index;
    seasonState.elapsedYears += dtSec / SECONDS_PER_YEAR;
    const yearFrac = (seasonState.elapsedYears % 1 + 1) % 1;
    const yearPos = yearFrac * 4;
    const newIndex = Math.floor(yearPos) % 4;
    const seasonProgress = yearPos - Math.floor(yearPos);
    seasonState.index = newIndex;
    seasonState.key = SEASONS[newIndex].key;
    seasonState.label = SEASONS[newIndex].label;
    seasonState.isSpring = newIndex === 0;
    seasonState.isSummer = newIndex === 1;
    seasonState.isAutumn = newIndex === 2;
    seasonState.isWinter = newIndex === 3;
    const stableFrac = 100 / 120;
    const nextIndex = (newIndex + 1) % 4;
    let smoothT = 0;
    if (seasonProgress > stableFrac) {
      const rawT = Math.min(1, (seasonProgress - stableFrac) / (1 - stableFrac));
      smoothT = rawT * rawT * (3 - 2 * rawT);
    }
    const keys = ["spring", "summer", "autumn", "winter"];
    seasonState.weights = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    seasonState.weights[keys[newIndex]] = 1 - smoothT;
    seasonState.weights[keys[nextIndex]] = smoothT;
    if (newIndex !== prevIndex && logEvent2) {
      if (newIndex === 0) {
        logEvent2("\u{1F331} Schneeschmelze im Tal! Der Fr\xFChling weckt neue Knospen und Wildblumen.");
      } else if (newIndex === 2) {
        logEvent2("\u{1F342} Der Herbst zieht ins Tal: Das Laub f\xE4rbt sich golden \u2013 der Klan sammelt Wintervorr\xE4te.");
      } else if (newIndex === 3) {
        logEvent2("\u2744\uFE0F Der eisige Pleistoz\xE4n-Winter bricht herein! Beeren rasten, Schnee bedeckt das Land.");
      }
    }
  }

  // src/isometric.js
  var Camera = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      this.x = canvas2.width / 2;
      this.y = 120;
      this.zoom = 1;
    }
    gridToScreen(gx, gy) {
      const halfW = TILE_W / 2 * this.zoom;
      const halfH = TILE_H / 2 * this.zoom;
      return {
        x: (gx - gy) * halfW + this.x,
        y: (gx + gy) * halfH + this.y
      };
    }
    screenToGrid(sx, sy) {
      const halfW = TILE_W / 2 * this.zoom;
      const halfH = TILE_H / 2 * this.zoom;
      const dx = sx - this.x;
      const dy = sy - this.y - halfH;
      const gx = (dy / halfH + dx / halfW) / 2;
      const gy = (dy / halfH - dx / halfW) / 2;
      return {
        x: Math.floor(gx + 0.5),
        y: Math.floor(gy + 0.5)
      };
    }
  };

  // src/map.js
  var BIOMES = {
    river_valley: {
      id: "river_valley",
      name: "Fluss-Aue",
      icon: "\u{1F30A}",
      desc: "Fruchtbares Auenthal mit Schilf, Beeren und reichem Fischbestand.",
      palette: { grass: "#225522", dryGrass: "#2b5a27", water: "#0284c7" }
    },
    steppe: {
      id: "steppe",
      name: "Eiszeit-Steppe",
      icon: "\u{1F33E}",
      desc: "Karge Tundra. Kaum B\xE4ume, keine Beeren, eisiger Wind \u2013 Heimat der Bisons.",
      palette: { grass: "#4a5320", dryGrass: "#6b6638", water: "#38bdf8" }
    },
    forest: {
      id: "forest",
      name: "Dichter Urwald",
      icon: "\u{1F332}",
      desc: "Uralte Eichen & Dickicht. Reich an Holz, Wurzeln und Wildschweinen.",
      palette: { grass: "#1e3f20", dryGrass: "#1b3419", water: "#0ea5e9" }
    },
    karst_canyon: {
      id: "karst_canyon",
      name: "Felsenschlucht",
      icon: "\u{1FAA8}",
      desc: "Schroffe Felsw\xE4nde mit nat\xFCrlichen H\xF6hlen\xFCberh\xE4ngen und Feuerstein.",
      palette: { grass: "#3a4439", dryGrass: "#444d44", water: "#06b6d4" }
    }
  };
  function createMap(biomeId = "river_valley") {
    const biome = BIOMES[biomeId] || BIOMES.river_valley;
    const map2 = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      map2[y] = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        let type = "grass";
        let npk = 20 + Math.random() * 25;
        let plant = null;
        let shelter = null;
        let defaultFish = 0;
        if (biome.id === "river_valley") {
          const riverCenterX = 20 + Math.sin(y * 0.4) * 2;
          const riverWidth = y >= 8 && y <= 12 ? 1.8 : 1.1;
          if (Math.abs(x - riverCenterX) <= riverWidth) {
            type = "water";
            npk = 65;
            defaultFish = 3;
          }
        } else if (biome.id === "steppe") {
          const inPond1 = Math.hypot(x - 19, y - 7) <= 1.8;
          const inPond2 = Math.hypot(x - 7, y - 19) <= 1.5;
          if (inPond1 || inPond2) {
            type = "water";
            npk = 45;
            defaultFish = 1;
          }
        } else if (biome.id === "forest") {
          const brookX = Math.round(18 + Math.sin(y * 0.5) * 1.5);
          if (x === brookX) {
            type = "water";
            npk = 70;
            defaultFish = 2;
          }
        } else if (biome.id === "karst_canyon") {
          const canyonStreamX = Math.round(19 + Math.cos(y * 0.35) * 1.4);
          if (Math.abs(x - canyonStreamX) <= 1) {
            type = "water";
            npk = 50;
            defaultFish = 2;
          }
        }
        if (type !== "water") {
          if (biome.id === "karst_canyon") {
            if (x <= 6 && Math.random() < 0.65 || x >= 14 && x <= 17 && Math.random() < 0.55 || Math.random() < 0.12) {
              type = "rock";
            }
            if (x === CAMP_CENTER.x - 2 && y === CAMP_CENTER.y - 1 || x === CAMP_CENTER.x + 2 && y === CAMP_CENTER.y - 2) {
              type = "shelter";
              shelter = { condition: 100, capacity: 2, isCave: true };
            }
          } else if (biome.id === "steppe") {
            if (Math.random() < 0.08) type = "rock";
          } else if (biome.id === "forest") {
            if (Math.random() < 0.04) type = "rock";
          } else {
            if (x >= 15 && x <= 18 && y <= 3 || x === 6 && y === 4) {
              if (Math.random() < 0.45) type = "rock";
            }
          }
        }
        if (type === "grass") {
          const isNearCamp = Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) <= 2.2;
          if (biome.id === "forest") {
            if (!isNearCamp && Math.random() < 0.55) {
              const treeMaxAge = 1e3 + Math.random() * 500;
              plant = {
                type: "tree",
                stage: 3,
                woodStock: 4,
                seedVariance: Math.random(),
                maxAge: treeMaxAge,
                ageTimer: Math.random() * (treeMaxAge * 0.7)
              };
              npk = 75;
            } else if (Math.random() < 0.08) {
              plant = {
                type: "bush",
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
          } else if (biome.id === "steppe") {
            if (!isNearCamp && Math.random() < 0.012) {
              plant = {
                type: "tree",
                stage: 2,
                woodStock: 2,
                seedVariance: Math.random(),
                maxAge: 700,
                ageTimer: 0
              };
            }
          } else if (biome.id === "karst_canyon") {
            if (!isNearCamp && Math.random() < 0.1) {
              plant = {
                type: "tree",
                stage: 3,
                woodStock: 3,
                seedVariance: Math.random(),
                maxAge: 850,
                ageTimer: 0
              };
            } else if (Math.random() < 0.08) {
              plant = {
                type: "bush",
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
            if (x <= 5 && Math.random() < 0.35) {
              const treeMaxAge = 900 + Math.random() * 600;
              plant = {
                type: "tree",
                stage: 3,
                woodStock: 4,
                seedVariance: Math.random(),
                maxAge: treeMaxAge,
                ageTimer: Math.random() * (treeMaxAge * 0.7)
              };
              npk = 65;
            } else if (y >= 20 && Math.random() < 0.25 || Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) > 3 && Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y) < 7 && Math.random() < 0.12) {
              const bushMaxAge = 700 + Math.random() * 450;
              plant = {
                type: "bush",
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
        let roots = 0;
        if (type === "grass" && !plant) {
          if (biome.id === "steppe") {
            if (Math.random() < 0.5) roots = 1 + Math.floor(Math.random() * 2);
          } else if (biome.id === "forest") {
            if (Math.random() < 0.45) roots = 2;
          } else {
            if (Math.random() < 0.35) roots = 1 + Math.floor(Math.random() * 2);
          }
        }
        let isDesirePath = false;
        let trample = 0;
        const footprints = [];
        if (biome.id === "river_valley" && y === CAMP_CENTER.y && x > CAMP_CENTER.x && x <= 18 && type === "grass" && !plant) {
          trample = 55;
          const baseAngle = Math.atan2(0.5, 1);
          for (let i = 0; i < 6; i++) {
            const stepT = i / 5 - 0.5;
            const isLeft = i % 2 === 0;
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
        let fireObj = null;
        if (x === CAMP_CENTER.x && y === CAMP_CENTER.y) {
          type = "fire";
          plant = null;
          fireObj = {
            intensity: 100,
            woodBurnTimer: 0,
            wood: 0,
            isCampCenter: true
          };
        }
        const flowerDots = [];
        if (npk < 32 && type === "grass") {
          const count = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < count; i++) {
            flowerDots.push({
              dx: (Math.random() - 0.5) * 22,
              dy: (Math.random() - 0.5) * 11,
              color: biome.id === "steppe" ? "#eab308" : Math.random() < 0.5 ? "#f43f5e" : "#60a5fa",
              size: 0.9 + Math.random() * 0.7
            });
          }
        }
        map2[y][x] = {
          type,
          npk,
          plant,
          roots,
          shelter,
          stoneStock: type === "rock" ? 8 : 0,
          maxStoneStock: type === "rock" ? 8 : 0,
          fishStock: defaultFish,
          maxFishStock: defaultFish,
          fishRegenTimer: 0,
          poop: null,
          flowerDots,
          trample,
          footprints,
          isDesirePath,
          fire: fireObj
        };
      }
    }
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (map2[y][x].type === "water") {
          let width = 1;
          let lx = x - 1;
          while (lx >= 0 && map2[y][lx].type === "water") {
            width++;
            lx--;
          }
          let rx = x + 1;
          while (rx < MAP_SIZE && map2[y][rx].type === "water") {
            width++;
            rx++;
          }
          map2[y][x].waterWidth = width;
          map2[y][x].isFord = width <= 2;
        }
      }
    }
    map2.biomeId = biome.id;
    map2.biome = biome;
    return map2;
  }
  function updateEcology(map2, dtSec, logEvent2) {
    advanceSeasonClock(dtSec, logEvent2);
    if (!seasonState.isWinter) {
      const spoilageSpeed = seasonState.isSummer ? 1.35 : 1;
      SPOILAGE_CONFIG.timer = (SPOILAGE_CONFIG.timer || 0) + dtSec * spoilageSpeed;
      if (SPOILAGE_CONFIG.timer >= SPOILAGE_CONFIG.decayInterval) {
        SPOILAGE_CONFIG.timer = 0;
        if (campfireStock.food > 0) {
          const loss = campfireStock.food > 18 ? 2 : 1;
          campfireStock.food = Math.max(0, campfireStock.food - loss);
          if (Math.random() < 0.25) {
            logEvent2(`\u{1F342} Vorratsverderb: Fleisch & Beeren sind im feuchten Erdlager verfault (-${loss}).`);
          }
        }
      }
    }
    if (campfireStock.food > STORAGE_LIMITS.maxFood) {
      campfireStock.food = STORAGE_LIMITS.maxFood;
    }
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map2[y][x];
        if (tile.type === "water" && tile.fishStock < tile.maxFishStock) {
          tile.fishRegenTimer = (tile.fishRegenTimer || 0) + dtSec;
          if (tile.fishRegenTimer >= 140) {
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
            if (!tile.plant && tile.type === "grass") {
              const sproutRoll = Math.random();
              if (sproutRoll < 0.12 && map2.biomeId !== "steppe") {
                tile.plant = {
                  type: "bush",
                  stage: 1,
                  growthTimer: 0,
                  berries: 0,
                  berryTimer: 0,
                  seedVariance: Math.random(),
                  maxAge: 500,
                  ageTimer: 0,
                  isRootstock: false
                };
                logEvent2(`\u{1F331} Wilder Beerenstrauch keimt auf humosem Boden. [${x}, ${y}]`);
              } else if (sproutRoll < 0.16) {
                tile.plant = {
                  type: "tree",
                  stage: 1,
                  growthTimer: 0,
                  woodStock: 3,
                  seedVariance: Math.random(),
                  maxAge: 1200 + Math.random() * 600,
                  ageTimer: 0
                };
                logEvent2(`\u{1F331} Ein junger Baumkeimling schl\xE4gt Wurzeln. [${x}, ${y}]`);
              } else {
                for (let i = 0; i < 3; i++) {
                  tile.flowerDots.push({
                    dx: (Math.random() - 0.5) * 20,
                    dy: (Math.random() - 0.5) * 10,
                    color: Math.random() < 0.5 ? "#f59e0b" : "#ec4899",
                    size: 0.8 + Math.random() * 0.7
                  });
                }
              }
            }
          }
        }
        if (tile.type === "grass" && tile.npk < 45) {
          tile.npk = Math.min(45, tile.npk + dtSec * 0.08);
        }
        if (tile.type === "grass" && (!tile.roots || tile.roots < 2) && tile.npk >= 40 && Math.random() < 6e-4 * dtSec) {
          tile.roots = (tile.roots || 0) + 1;
        }
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
        if (tile.type === "path" && tile.isDesirePath && (!tile.trample || tile.trample <= 0)) {
          tile.type = "grass";
          tile.isDesirePath = false;
          tile.trample = 0;
        }
        if (tile.type === "shelter" && !tile.shelter?.isCave) {
          if (!tile.shelter) {
            tile.shelter = { condition: 100, capacity: SHELTER_CONFIG.capacity };
          }
          tile.shelter.condition -= dtSec * SHELTER_CONFIG.decayRate;
          if (tile.shelter.condition <= 0) {
            tile.type = "grass";
            tile.shelter = null;
            logEvent2(`\u{1F3DA}\uFE0F Eine bauf\xE4llige Schutzh\xFCtte bei [${x}, ${y}] ist eingest\xFCrzt und verfallen!`);
          }
        }
        if (tile.type === "fire") {
          const isCampCenter = x === CAMP_CENTER.x && y === CAMP_CENTER.y;
          if (!tile.fire) {
            tile.fire = {
              intensity: isCampCenter ? fireState.intensity || 85 : 100,
              woodBurnTimer: 0,
              wood: isCampCenter ? 0 : 3,
              isCampCenter
            };
          }
          const fireBurnRate = seasonState.isWinter ? 1.35 : 1;
          tile.fire.woodBurnTimer = (tile.fire.woodBurnTimer || 0) + dtSec * fireBurnRate;
          if (tile.fire.woodBurnTimer >= 22) {
            tile.fire.woodBurnTimer = 0;
            if (tile.fire.isCampCenter) {
              if (campfireStock.wood > 0) {
                campfireStock.wood--;
                tile.fire.intensity = Math.min(100, tile.fire.intensity + 15);
              } else {
                tile.fire.intensity = Math.max(0, tile.fire.intensity - 20);
                if (tile.fire.intensity <= 0) {
                  logEvent2(`\u2744\uFE0F Alarm! Das Stammesfeuer ist erloschen! K\xE4lte bricht herein.`);
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
                  tile.type = "grass";
                  tile.fire = null;
                  logEvent2(`\u{1F4A8} Eine Au\xDFenfeuerstelle bei [${x}, ${y}] ist erloschen.`);
                }
              }
            }
          }
        }
        if (tile.plant) {
          const p = tile.plant;
          const seasonGrowthMod = seasonState.isWinter ? 0 : seasonState.isSpring || seasonState.isSummer ? 1.2 : 0.85;
          const growthRate = tile.npk / 40 * seasonGrowthMod;
          if (p.stage === 3) {
            p.ageTimer = (p.ageTimer || 0) + dtSec;
            const maxAge = p.maxAge || (p.type === "bush" ? 800 : 1200);
            if (p.ageTimer >= maxAge) {
              if (p.type === "bush") {
                p.stage = 1;
                p.isRootstock = true;
                p.berries = 0;
                p.ageTimer = 0;
                p.growthTimer = 0;
                logEvent2(`\u{1F331} Ein alter Beerenstrauch bei [${x}, ${y}] zieht sich in den schlafenden Wurzelstock zur\xFCck.`);
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
            const targetGrowthTime = p.type === "tree" ? 130 : 24;
            if (p.growthTimer >= targetGrowthTime) {
              p.stage++;
              p.growthTimer = 0;
              if (p.type === "bush" && p.stage === 3 && p.isRootstock) {
                p.isRootstock = false;
                p.berries = 2;
                logEvent2(`\u{1F33F} Ein Wurzelstock bei [${x}, ${y}] hat wieder voll ausgetrieben und tr\xE4gt Fr\xFCchte!`);
              } else {
                logEvent2(`\u{1F33F} Ein ${p.type === "bush" ? "Beerenstrauch" : "Baum"} ist gewachsen (Stufe ${p.stage}).`);
              }
            }
          }
          if (p.type === "bush" && p.stage >= 2 && p.berries < (p.maxBerries || 5) && !p.isRootstock && !seasonState.isWinter) {
            const berryRate = seasonState.isAutumn ? 1.3 : 1;
            p.berryTimer = (p.berryTimer || 0) + dtSec * berryRate;
            if (p.berryTimer >= 10) {
              p.berries++;
              p.berryTimer = 0;
            }
          }
        }
      }
    }
  }

  // src/render/environment.js
  function blend4RGB(cSpring, cSummer, cAutumn, cWinter, w) {
    const r = Math.round(cSpring[0] * w.spring + cSummer[0] * w.summer + cAutumn[0] * w.autumn + cWinter[0] * w.winter);
    const g = Math.round(cSpring[1] * w.spring + cSummer[1] * w.summer + cAutumn[1] * w.autumn + cWinter[1] * w.winter);
    const b = Math.round(cSpring[2] * w.spring + cSummer[2] * w.summer + cAutumn[2] * w.autumn + cWinter[2] * w.winter);
    return `rgb(${r}, ${g}, ${b})`;
  }
  function getLocalSeasonWeights(gx, gy) {
    const base = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
    if (base.winter <= 1e-3) return base;
    const distToCamp = Math.hypot(gx - CAMP_CENTER.x, gy - CAMP_CENTER.y);
    const fireFactor = Math.max(0, Math.min(1, (fireState.intensity - 15) / 85));
    const radialMelt = Math.max(0, Math.min(1, (4.2 - distToCamp) / 2.4));
    const meltAmount = fireFactor * radialMelt;
    if (meltAmount <= 1e-3) return base;
    const meltedWinter = base.winter * (1 - meltAmount);
    const freedWeight = base.winter - meltedWinter;
    return {
      spring: base.spring + freedWeight * 0.35,
      summer: base.summer,
      autumn: base.autumn + freedWeight * 0.65,
      winter: meltedWinter
    };
  }
  var environmentRenderMethods = {
    drawGround(tile, gx, gy) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const pos = this.cam.gridToScreen(gx, gy);
      const tw = TILE_W * zoom;
      const th = TILE_H * zoom;
      const cx = pos.x;
      const cy = pos.y + th / 2;
      ctx2.save();
      ctx2.beginPath();
      ctx2.moveTo(pos.x, pos.y);
      ctx2.lineTo(pos.x + tw / 2, cy);
      ctx2.lineTo(pos.x, pos.y + th);
      ctx2.lineTo(pos.x - tw / 2, cy);
      ctx2.closePath();
      const w = getLocalSeasonWeights(gx, gy);
      let fillColor;
      if (tile.type === "grass") {
        const factor = Math.min(1, Math.max(0, tile.npk / 100));
        let cSpring, cSummer;
        if (this.biomeId === "steppe") {
          cSpring = [122 - factor * 38, 152 - factor * 36, 72 - factor * 28];
          cSummer = [164 - factor * 42, 142 - factor * 38, 62 - factor * 26];
        } else if (this.biomeId === "forest") {
          cSpring = [48 - factor * 20, 118 + factor * 18, 46 + factor * 6];
          cSummer = [28 - factor * 14, 78 + factor * 20, 26 + factor * 8];
        } else if (this.biomeId === "karst_canyon") {
          cSpring = [82 - factor * 26, 134 - factor * 24, 88 - factor * 18];
          cSummer = [114 - factor * 28, 116 - factor * 24, 86 - factor * 18];
        } else {
          cSpring = [70 - factor * 44, 174 - factor * 58, 68 - factor * 40];
          cSummer = [148 - factor * 72, 148 - factor * 58, 52 - factor * 34];
        }
        const cAutumn = [148 - factor * 58, 116 - factor * 48, 56 - factor * 32];
        const cWinter = [224 - factor * 28, 232 - factor * 24, 242 - factor * 18];
        fillColor = blend4RGB(cSpring, cSummer, cAutumn, cWinter, w);
      } else if (tile.type === "water") {
        const shimmer = Math.sin(this.waterPhase + gx * 0.8 + gy * 0.5) * 8;
        const baseW = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
        let cBase;
        if (this.biomeId === "karst_canyon") {
          cBase = [22 + shimmer, 120 + shimmer, 136 + shimmer];
        } else if (this.biomeId === "forest") {
          cBase = [24 + shimmer, 88 + shimmer, 98 + shimmer];
        } else {
          cBase = [34 + shimmer, 105 + shimmer, 136 + shimmer];
        }
        const cWinterWater = [64 + shimmer, 122 + shimmer, 156 + shimmer];
        fillColor = blend4RGB(cBase, cBase, cBase, cWinterWater, baseW);
      } else if (tile.type === "path") {
        const cNormal = this.biomeId === "karst_canyon" ? [118, 116, 114] : this.biomeId === "steppe" ? [162, 136, 98] : [138, 116, 82];
        const cWinterPath = [164, 172, 182];
        fillColor = blend4RGB(cNormal, cNormal, cNormal, cWinterPath, w);
      } else if (tile.type === "fire") {
        fillColor = "#3c362d";
      } else if (tile.type === "rock") {
        fillColor = this.biomeId === "karst_canyon" ? "#848f9d" : this.biomeId === "steppe" ? "#8e806d" : "#5f6977";
      } else if (tile.type === "shelter") {
        fillColor = "#4a3d2e";
      }
      ctx2.fillStyle = fillColor;
      ctx2.fill();
      ctx2.strokeStyle = tile.type === "water" ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.06)";
      ctx2.lineWidth = 0.8 * zoom;
      ctx2.stroke();
      const depth = 5 * zoom;
      ctx2.beginPath();
      ctx2.moveTo(pos.x - tw / 2, cy);
      ctx2.lineTo(pos.x, pos.y + th);
      ctx2.lineTo(pos.x, pos.y + th + depth);
      ctx2.lineTo(pos.x - tw / 2, cy + depth);
      ctx2.closePath();
      ctx2.fillStyle = "rgba(0,0,0,0.18)";
      ctx2.fill();
      ctx2.beginPath();
      ctx2.moveTo(pos.x, pos.y + th);
      ctx2.lineTo(pos.x + tw / 2, cy);
      ctx2.lineTo(pos.x + tw / 2, cy + depth);
      ctx2.lineTo(pos.x, pos.y + th + depth);
      ctx2.closePath();
      ctx2.fillStyle = "rgba(0,0,0,0.28)";
      ctx2.fill();
      if (tile.type === "water") {
        this.drawWaterWaves(cx, cy);
      }
      if (tile.footprints && tile.footprints.length > 0 && tile.type !== "water") {
        this.drawFootprints(cx, cy, tile.footprints, w);
      }
      const flowerScale = w.spring * 1.45 + w.summer * 0.42 + w.autumn * 0.18;
      if (flowerScale > 0.1 && tile.type === "grass" && tile.flowerDots && tile.flowerDots.length > 0 && !tile.plant && !tile.poop) {
        this.drawNaturalFlowers(cx, cy, tile.flowerDots, flowerScale);
      }
      if (tile.poop) {
        this.drawOrganicPoop(cx, cy);
      }
      ctx2.restore();
    },
    drawFootprints(cx, cy, footprints, w) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const trackColor = blend4RGB(
        [64, 48, 32],
        [112, 86, 54],
        [68, 48, 30],
        [134, 156, 186],
        w
      );
      for (const fp of footprints) {
        const lifeRatio = Math.max(0, 1 - fp.age / (fp.maxAge || 65));
        if (lifeRatio <= 0.02) continue;
        const alpha = Math.min(1, lifeRatio * 1.35) * 0.78;
        const s = (fp.scale || 1) * zoom;
        ctx2.save();
        ctx2.translate(cx + fp.lx * zoom, cy + fp.ly * zoom);
        ctx2.rotate(fp.angle || 0);
        ctx2.globalAlpha = alpha;
        if (w.winter > 0.25) {
          ctx2.fillStyle = `rgba(255, 255, 255, ${(w.winter * 0.55).toFixed(2)})`;
          ctx2.beginPath();
          ctx2.ellipse(0.9 * s, 0, 2.2 * s, 1.35 * s, 0, 0, Math.PI * 2);
          ctx2.fill();
        }
        ctx2.fillStyle = trackColor;
        ctx2.beginPath();
        ctx2.ellipse(1 * s, 0, 1.75 * s, 1.05 * s, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.beginPath();
        ctx2.ellipse(-1.25 * s, 0, 1.15 * s, 0.82 * s, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.restore();
      }
    },
    drawWaterWaves(cx, cy) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      ctx2.save();
      ctx2.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx2.lineWidth = 1 * zoom;
      const waveOff = Math.sin(this.waterPhase + cx * 0.05) * 3 * zoom;
      ctx2.beginPath();
      ctx2.moveTo(cx - 8 * zoom, cy - 2 * zoom + waveOff);
      ctx2.quadraticCurveTo(cx, cy - 4 * zoom + waveOff, cx + 8 * zoom, cy - 2 * zoom + waveOff);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(cx - 5 * zoom, cy + 3 * zoom - waveOff);
      ctx2.quadraticCurveTo(cx, cy + 1 * zoom - waveOff, cx + 6 * zoom, cy + 3 * zoom - waveOff);
      ctx2.stroke();
      ctx2.restore();
    },
    drawNaturalFlowers(cx, cy, dots, flowerScale = 1) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      for (const d of dots) {
        const fx = cx + d.dx * zoom;
        const fy = cy + d.dy * zoom;
        ctx2.fillStyle = "#3f6212";
        ctx2.fillRect(fx, fy, 0.8 * zoom, 1.8 * zoom * Math.min(1.1, flowerScale));
        ctx2.fillStyle = d.color;
        ctx2.beginPath();
        ctx2.arc(fx, fy - 1 * zoom, d.size * zoom * flowerScale, 0, Math.PI * 2);
        ctx2.fill();
      }
    },
    drawOrganicPoop(cx, cy) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      ctx2.save();
      ctx2.fillStyle = "#38220f";
      ctx2.beginPath();
      ctx2.ellipse(cx, cy + 1 * zoom, 3.5 * zoom, 2 * zoom, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "#633c1a";
      ctx2.beginPath();
      ctx2.arc(cx - 0.5 * zoom, cy - 1 * zoom, 1.8 * zoom, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
    },
    drawOrganicBush(cx, cy, plant) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const s = plant.stage;
      const seed = plant.seedVariance || 0.5;
      ctx2.save();
      if (plant.isRootstock) {
        ctx2.strokeStyle = "#5c3a21";
        ctx2.lineWidth = 1.5 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx, cy + 1 * zoom);
        ctx2.lineTo(cx - 3 * zoom, cy - 4 * zoom);
        ctx2.moveTo(cx, cy + 1 * zoom);
        ctx2.lineTo(cx + 3 * zoom, cy - 5 * zoom);
        ctx2.moveTo(cx, cy + 1 * zoom);
        ctx2.lineTo(cx - 0.5 * zoom, cy - 6 * zoom);
        ctx2.stroke();
        ctx2.fillStyle = "#78350f";
        ctx2.beginPath();
        ctx2.arc(cx, cy + 1 * zoom, 2 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.restore();
        return;
      }
      const varFactor = 0.85 + seed * 0.3;
      const baseR = (3.2 + s * 2.8) * varFactor * zoom;
      ctx2.beginPath();
      ctx2.ellipse(cx, cy + 2 * zoom, baseR * 1.2, baseR * 0.55, 0, 0, Math.PI * 2);
      ctx2.fillStyle = "rgba(0,0,0,0.25)";
      ctx2.fill();
      const w = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
      const isSteppe = this.biomeId === "steppe";
      const foliageDark = blend4RGB(
        isSteppe ? [48, 66, 28] : [34, 78, 26],
        isSteppe ? [42, 52, 24] : [20, 48, 16],
        [92, 45, 22],
        [51, 65, 85],
        w
      );
      const foliageMid = blend4RGB(
        isSteppe ? [76, 98, 42] : [54, 114, 38],
        isSteppe ? [66, 80, 36] : [34, 72, 26],
        [154, 68, 25],
        [100, 116, 139],
        w
      );
      const foliageLight = blend4RGB(
        isSteppe ? [112, 138, 62] : [88, 162, 58],
        isSteppe ? [96, 114, 52] : [52, 102, 40],
        [217, 119, 6],
        [226, 232, 240],
        w
      );
      ctx2.fillStyle = foliageDark;
      ctx2.beginPath();
      ctx2.arc(cx - (2 + seed) * zoom, cy - baseR + 2 * zoom, baseR * 0.85, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(cx + (2.5 - seed) * zoom, cy - baseR + 1 * zoom, baseR * 0.85, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = foliageMid;
      ctx2.beginPath();
      ctx2.arc(cx, cy - baseR - 1 * zoom, baseR * 0.75, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(cx - 3 * zoom, cy - baseR - (2 + seed * 2) * zoom, baseR * 0.55, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = foliageLight;
      ctx2.beginPath();
      ctx2.arc(cx - (0.5 + seed) * zoom, cy - baseR - 4 * zoom, baseR * 0.45, 0, Math.PI * 2);
      ctx2.fill();
      if (w.spring > 0.12 && s >= 2) {
        ctx2.fillStyle = `rgba(253, 224, 235, ${Math.min(0.95, w.spring * 1.1)})`;
        const blossomR = 1.45 * w.spring * zoom;
        const bCoords = [
          [cx - 2.5 * zoom, cy - baseR - 1 * zoom],
          [cx + 2.2 * zoom, cy - baseR - 3 * zoom],
          [cx - 0.5 * zoom, cy - baseR - 5.2 * zoom]
        ];
        for (const [bx, by] of bCoords) {
          ctx2.beginPath();
          ctx2.arc(bx, by, blossomR, 0, Math.PI * 2);
          ctx2.fill();
        }
      }
      if (plant.berries > 0 && s >= 2) {
        ctx2.fillStyle = this.biomeId === "steppe" ? "#f97316" : "#dc2626";
        const berryR = 1.6 * zoom;
        const berryCoords = [
          [cx - 3 * zoom, cy - baseR + 1 * zoom],
          [cx + 3 * zoom, cy - baseR - 2 * zoom],
          [cx, cy - baseR - 6 * zoom],
          [cx - 2 * zoom, cy - baseR - 4 * zoom],
          [cx + 2 * zoom, cy - baseR - 5 * zoom]
        ];
        const count = Math.min(berryCoords.length, plant.berries);
        for (let i = 0; i < count; i++) {
          ctx2.beginPath();
          ctx2.arc(berryCoords[i][0], berryCoords[i][1], berryR, 0, Math.PI * 2);
          ctx2.fill();
        }
      }
      ctx2.restore();
    },
    drawOrganicTree(cx, cy, plant) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const s = plant.stage;
      const seed = plant.seedVariance || 0.5;
      ctx2.save();
      const isPine = seed >= 0.35 && seed < 0.7;
      const isOak = seed < 0.35;
      const trunkH = ((isPine ? 11 : isOak ? 7 : 8) + s * 9) * zoom;
      const trunkW = (2 + s * 1.5) * zoom;
      const crownR = ((isOak ? 6.5 : isPine ? 4.8 : 5.5) + s * 5.5) * zoom;
      const lean = (seed - 0.5) * 5 * zoom;
      ctx2.beginPath();
      ctx2.ellipse(cx + 2 * zoom, cy + 2 * zoom, crownR * 1.15, crownR * 0.5, -0.2, 0, Math.PI * 2);
      ctx2.fillStyle = "rgba(0,0,0,0.28)";
      ctx2.fill();
      ctx2.fillStyle = "#422815";
      ctx2.beginPath();
      ctx2.moveTo(cx - trunkW, cy);
      ctx2.lineTo(cx + lean - trunkW * 0.6, cy - trunkH + 4 * zoom);
      ctx2.lineTo(cx + lean - crownR * 0.4, cy - trunkH);
      ctx2.lineTo(cx + lean + crownR * 0.3, cy - trunkH + 2 * zoom);
      ctx2.lineTo(cx + lean + trunkW * 0.6, cy - trunkH + 8 * zoom);
      ctx2.lineTo(cx + trunkW, cy);
      ctx2.closePath();
      ctx2.fill();
      ctx2.strokeStyle = "#261408";
      ctx2.lineWidth = 0.8 * zoom;
      ctx2.stroke();
      const crownX = cx + lean;
      const crownY = cy - trunkH - crownR * 0.35;
      const w = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
      if (isPine) {
        ctx2.fillStyle = "#102a16";
        ctx2.beginPath();
        ctx2.moveTo(crownX, crownY - crownR * 1.1);
        ctx2.lineTo(crownX + crownR * 0.8, crownY + crownR * 0.5);
        ctx2.lineTo(crownX - crownR * 0.8, crownY + crownR * 0.5);
        ctx2.closePath();
        ctx2.fill();
        ctx2.fillStyle = "#183c20";
        ctx2.beginPath();
        ctx2.moveTo(crownX, crownY - crownR * 0.9);
        ctx2.lineTo(crownX + crownR * 0.65, crownY + crownR * 0.1);
        ctx2.lineTo(crownX - crownR * 0.65, crownY + crownR * 0.1);
        ctx2.closePath();
        ctx2.fill();
        ctx2.fillStyle = "#265830";
        ctx2.beginPath();
        ctx2.moveTo(crownX, crownY - crownR * 0.7);
        ctx2.lineTo(crownX + crownR * 0.45, crownY - crownR * 0.2);
        ctx2.lineTo(crownX - crownR * 0.45, crownY - crownR * 0.2);
        ctx2.closePath();
        ctx2.fill();
        if (w.winter > 0.05) {
          ctx2.fillStyle = `rgba(241, 245, 249, ${Math.min(0.95, w.winter)})`;
          ctx2.beginPath();
          ctx2.moveTo(crownX, crownY - crownR * 1.12);
          ctx2.lineTo(crownX + crownR * 0.42, crownY - crownR * 0.25);
          ctx2.lineTo(crownX - crownR * 0.42, crownY - crownR * 0.25);
          ctx2.closePath();
          ctx2.fill();
        }
      } else {
        const isSteppe = this.biomeId === "steppe";
        const isRedAutumn = seed < 0.18;
        const cDark = blend4RGB(
          isSteppe ? [48, 66, 28] : [28, 68, 22],
          isSteppe ? [38, 48, 22] : [16, 40, 14],
          isRedAutumn ? [124, 45, 18] : [113, 63, 18],
          [51, 65, 85],
          w
        );
        const cMid = blend4RGB(
          isSteppe ? [76, 102, 42] : [48, 108, 34],
          isSteppe ? [60, 74, 34] : [26, 60, 20],
          isRedAutumn ? [194, 65, 12] : [180, 83, 9],
          [71, 85, 105],
          w
        );
        const cLight = blend4RGB(
          isSteppe ? [116, 146, 58] : [86, 162, 52],
          isSteppe ? [88, 106, 48] : [40, 88, 32],
          isRedAutumn ? [249, 115, 22] : [245, 158, 11],
          [241, 245, 249],
          w
        );
        ctx2.fillStyle = cDark;
        ctx2.beginPath();
        ctx2.arc(crownX - crownR * 0.45, crownY + crownR * 0.2, crownR * 0.65, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(crownX + crownR * 0.45, crownY + crownR * 0.2, crownR * 0.7, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = cMid;
        ctx2.beginPath();
        ctx2.arc(crownX, crownY, crownR * 0.85, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(crownX - crownR * 0.35, crownY - crownR * 0.25, crownR * 0.6, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(crownX + crownR * 0.3, crownY - crownR * 0.2, crownR * 0.65, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = cLight;
        ctx2.beginPath();
        ctx2.arc(crownX - crownR * 0.2, crownY - crownR * 0.45, crownR * 0.5, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.beginPath();
        ctx2.arc(crownX + crownR * 0.2, crownY - crownR * 0.4, crownR * 0.45, 0, Math.PI * 2);
        ctx2.fill();
        if (w.spring > 0.15 && s >= 2) {
          ctx2.fillStyle = seed < 0.2 ? `rgba(251, 207, 232, ${Math.min(0.92, w.spring)})` : `rgba(254, 249, 195, ${Math.min(0.88, w.spring)})`;
          const bRad = 1.6 * w.spring * zoom;
          const treeBlossoms = [
            [crownX - crownR * 0.35, crownY - crownR * 0.15],
            [crownX + crownR * 0.28, crownY - crownR * 0.32],
            [crownX - crownR * 0.05, crownY - crownR * 0.55],
            [crownX + crownR * 0.42, crownY + crownR * 0.1]
          ];
          for (const [bx, by] of treeBlossoms) {
            ctx2.beginPath();
            ctx2.arc(bx, by, bRad, 0, Math.PI * 2);
            ctx2.fill();
          }
        }
      }
      ctx2.restore();
    },
    // Stark verbesserte, plastische Naturfels-Grafik mit Koordinaten-Variation & Schrumpfung beim Abbau
    drawNaturalRock(cx, cy, gx = 0, gy = 0, stoneStock = 8, maxStoneStock = 8) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      ctx2.save();
      const r = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233));
      const stockRatio = typeof stoneStock === "number" && maxStoneStock > 0 ? Math.max(0.35, stoneStock / maxStoneStock) : 1;
      const rScale = (0.85 + r * 0.3) * (0.45 + stockRatio * 0.55);
      const w = 9 * rScale * zoom;
      const h = 8 * rScale * zoom;
      ctx2.beginPath();
      ctx2.ellipse(cx, cy + 3 * zoom, w + 2 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
      ctx2.fillStyle = "rgba(0,0,0,0.32)";
      ctx2.fill();
      let cDark = "#2d333b", cMid = "#485260", cLight = "#738094";
      if (this.biomeId === "karst_canyon") {
        cDark = "#333b47";
        cMid = "#586578";
        cLight = "#8e9eaf";
      } else if (this.biomeId === "steppe") {
        cDark = "#362e24";
        cMid = "#5c4e3e";
        cLight = "#8c7b66";
      }
      ctx2.fillStyle = cDark;
      ctx2.beginPath();
      ctx2.moveTo(cx - w, cy + 2 * zoom);
      ctx2.lineTo(cx - w * 0.6, cy - h);
      ctx2.lineTo(cx + w * 0.2, cy - h * 1.2);
      ctx2.lineTo(cx + w, cy - h * 0.4);
      ctx2.lineTo(cx + w * 0.9, cy + 3 * zoom);
      ctx2.closePath();
      ctx2.fill();
      ctx2.fillStyle = cMid;
      ctx2.beginPath();
      ctx2.moveTo(cx - w, cy + 2 * zoom);
      ctx2.lineTo(cx - w * 0.2, cy - h * 0.8);
      ctx2.lineTo(cx + w * 0.4, cy - 2 * zoom);
      ctx2.lineTo(cx - 1 * zoom, cy + 3 * zoom);
      ctx2.closePath();
      ctx2.fill();
      const sw = getLocalSeasonWeights(gx, gy);
      let cLightRGB = [115, 128, 148];
      if (this.biomeId === "karst_canyon") cLightRGB = [142, 158, 175];
      else if (this.biomeId === "steppe") cLightRGB = [140, 123, 102];
      ctx2.fillStyle = blend4RGB(cLightRGB, cLightRGB, cLightRGB, [232, 238, 246], sw);
      ctx2.beginPath();
      ctx2.moveTo(cx - w * 0.6, cy - h);
      ctx2.lineTo(cx + w * 0.2, cy - h * 1.2);
      ctx2.lineTo(cx + w * 0.9, cy - h * 0.5);
      ctx2.lineTo(cx + w * 0.2, cy - h * 0.4);
      ctx2.lineTo(cx - w * 0.2, cy - h * 0.8);
      ctx2.closePath();
      ctx2.fill();
      if (this.biomeId !== "steppe") {
        ctx2.fillStyle = "#3f6212";
        ctx2.beginPath();
        ctx2.arc(cx - w * 0.7, cy + 1 * zoom, 2 * zoom, 0, Math.PI * 2);
        ctx2.arc(cx + w * 0.6, cy + 2 * zoom, 2.2 * zoom, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.restore();
    },
    // Stark verbesserte, plastische Urzeit-Hütte mit Zustand & Verfall
    drawPrimitiveShelter(cx, cy, shelterData = null) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const condition = shelterData ? Math.max(0, Math.min(100, shelterData.condition)) : 100;
      const isWeathered = condition < 65;
      const isCritical = condition < 30;
      ctx2.save();
      ctx2.beginPath();
      ctx2.ellipse(cx, cy + 3 * zoom, 16 * zoom, 8 * zoom, 0, 0, Math.PI * 2);
      ctx2.fillStyle = "rgba(0,0,0,0.38)";
      ctx2.fill();
      ctx2.fillStyle = isWeathered ? "#444d59" : "#525c6a";
      const stones = [-7, -4.5, -2, 1, 3.5, 6.5];
      for (const sx of stones) {
        ctx2.beginPath();
        ctx2.arc(cx + sx * 2 * zoom, cy + 3 * zoom, 2.4 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = "#38404a";
        ctx2.lineWidth = 0.8 * zoom;
        ctx2.stroke();
      }
      ctx2.fillStyle = "#18120c";
      ctx2.beginPath();
      ctx2.moveTo(cx - 4 * zoom, cy + 2 * zoom);
      ctx2.lineTo(cx, cy - 11 * zoom);
      ctx2.lineTo(cx + 4 * zoom, cy + 2 * zoom);
      ctx2.closePath();
      ctx2.fill();
      ctx2.fillStyle = isCritical ? "#3b2414" : isWeathered ? "#482e1a" : "#5c3a21";
      ctx2.beginPath();
      ctx2.moveTo(cx - 12 * zoom, cy + 2 * zoom);
      ctx2.lineTo(cx, cy - 18 * zoom);
      ctx2.lineTo(cx - 3 * zoom, cy + 2 * zoom);
      ctx2.closePath();
      ctx2.fill();
      const w = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
      const baseRoofRGB = isCritical ? [90, 57, 26] : isWeathered ? [113, 70, 32] : [138, 88, 41];
      ctx2.fillStyle = blend4RGB(baseRoofRGB, baseRoofRGB, baseRoofRGB, [203, 213, 225], w);
      ctx2.beginPath();
      ctx2.moveTo(cx + 3 * zoom, cy + 2 * zoom);
      ctx2.lineTo(cx, cy - 18 * zoom);
      ctx2.lineTo(cx + 12 * zoom, cy + 2 * zoom);
      ctx2.closePath();
      ctx2.fill();
      if (isWeathered) {
        ctx2.strokeStyle = "#29170a";
        ctx2.lineWidth = 1.2 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx - 8 * zoom, cy);
        ctx2.lineTo(cx - 2 * zoom, cy - 12 * zoom);
        ctx2.moveTo(cx + 7 * zoom, cy);
        ctx2.lineTo(cx + 1 * zoom, cy - 13 * zoom);
        ctx2.stroke();
      }
      ctx2.strokeStyle = "#3b2211";
      ctx2.lineWidth = 2.2 * zoom;
      ctx2.beginPath();
      ctx2.moveTo(cx - 13 * zoom, cy + 3 * zoom);
      ctx2.lineTo(cx + 2 * zoom, cy - 21 * zoom);
      ctx2.moveTo(cx + 13 * zoom, cy + 3 * zoom);
      ctx2.lineTo(cx - 2 * zoom, cy - 21 * zoom);
      ctx2.stroke();
      if (condition < 80) {
        const barW = 14 * zoom;
        const barH = 2.2 * zoom;
        const bx = cx - barW / 2;
        const by = cy - 25 * zoom;
        ctx2.fillStyle = "rgba(0,0,0,0.6)";
        ctx2.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        const barFillW = barW * (condition / 100);
        const barCol = condition > 50 ? "#eab308" : condition > 25 ? "#f97316" : "#ef4444";
        ctx2.fillStyle = barCol;
        ctx2.fillRect(bx, by, barFillW, barH);
      }
      ctx2.restore();
    },
    // Echtes, organisches Acheuléen-Lagerfeuer (Züngelnde Flammen, Glutbett, Funkenflug)
    drawCampfire(gx, gy, cx, cy, fireIntensity = 100) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const isLit = fireIntensity > 5;
      const flameScale = Math.min(1.2, fireIntensity / 100);
      const now = Date.now() * 1e-3;
      const seed = gx * 3.7 + gy * 1.9;
      ctx2.save();
      if (isLit) {
        const flickerPulse = Math.sin(now * 5 + seed) * 0.12 + Math.cos(now * 8.2 + seed) * 0.08;
        const glowRad = (14 + flameScale * 26 + flickerPulse * 6) * zoom;
        const glowAlpha = Math.max(0.1, Math.min(0.65, 0.25 + flameScale * 0.35 + flickerPulse * 0.1));
        const glow = ctx2.createRadialGradient(cx, cy, 2 * zoom, cx, cy, glowRad);
        glow.addColorStop(0, `rgba(251, 146, 60, ${glowAlpha})`);
        glow.addColorStop(0.5, `rgba(234, 88, 12, ${glowAlpha * 0.4})`);
        glow.addColorStop(1, "rgba(234, 88, 12, 0)");
        ctx2.fillStyle = glow;
        ctx2.beginPath();
        ctx2.arc(cx, cy, glowRad, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.fillStyle = isLit ? "#1c1917" : "#27272a";
      ctx2.beginPath();
      ctx2.ellipse(cx, cy + 1 * zoom, 9 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
      ctx2.fill();
      if (isLit) {
        ctx2.fillStyle = "#dc2626";
        ctx2.beginPath();
        ctx2.arc(cx - 2 * zoom, cy + 1 * zoom, 2.5 * zoom, 0, Math.PI * 2);
        ctx2.arc(cx + 2.5 * zoom, cy + 0.5 * zoom, 2 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#f97316";
        ctx2.beginPath();
        ctx2.arc(cx, cy + 1 * zoom, 1.8 * zoom, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.strokeStyle = isLit ? "#271b12" : "#3f3f46";
      ctx2.lineWidth = 2.4 * zoom;
      ctx2.beginPath();
      ctx2.moveTo(cx - 6 * zoom, cy + 2 * zoom);
      ctx2.lineTo(cx + 6 * zoom, cy - 2 * zoom);
      ctx2.moveTo(cx - 5 * zoom, cy - 2 * zoom);
      ctx2.lineTo(cx + 5 * zoom, cy + 2 * zoom);
      ctx2.moveTo(cx, cy - 3 * zoom);
      ctx2.lineTo(cx, cy + 3 * zoom);
      ctx2.stroke();
      if (isLit) {
        const fl1 = Math.sin(now * 7 + seed) * 2.5 * zoom;
        const fl2 = Math.cos(now * 9.5 + seed * 1.5) * 2 * zoom;
        const fl3 = Math.sin(now * 11.2 + seed * 2) * 1.8 * zoom;
        const flameH = 16 * flameScale * zoom;
        const baseY = cy;
        ctx2.fillStyle = "#ea580c";
        ctx2.beginPath();
        ctx2.moveTo(cx - 6 * zoom, baseY);
        ctx2.quadraticCurveTo(cx - 5 * zoom + fl2, baseY - flameH * 0.6, cx - 2 * zoom + fl1, baseY - flameH * 0.95);
        ctx2.quadraticCurveTo(cx - 1 * zoom, baseY - flameH * 0.5, cx + fl3, baseY - flameH * 1.15);
        ctx2.quadraticCurveTo(cx + 3 * zoom, baseY - flameH * 0.6, cx + 4 * zoom + fl2, baseY - flameH * 0.85);
        ctx2.quadraticCurveTo(cx + 6 * zoom, baseY - flameH * 0.3, cx + 6 * zoom, baseY);
        ctx2.closePath();
        ctx2.fill();
        const midH = flameH * 0.75;
        ctx2.fillStyle = "#f59e0b";
        ctx2.beginPath();
        ctx2.moveTo(cx - 4 * zoom, baseY);
        ctx2.quadraticCurveTo(cx - 3 * zoom + fl3, baseY - midH * 0.6, cx + fl1 * 0.7, baseY - midH);
        ctx2.quadraticCurveTo(cx + 3 * zoom + fl2, baseY - midH * 0.6, cx + 4 * zoom, baseY);
        ctx2.closePath();
        ctx2.fill();
        const coreH = flameH * 0.42;
        ctx2.fillStyle = "#fef08a";
        ctx2.beginPath();
        ctx2.moveTo(cx - 2.5 * zoom, baseY);
        ctx2.quadraticCurveTo(cx - 1 * zoom + fl2 * 0.4, baseY - coreH * 0.5, cx + fl1 * 0.4, baseY - coreH);
        ctx2.quadraticCurveTo(cx + 1 * zoom, baseY - coreH * 0.5, cx + 2.5 * zoom, baseY);
        ctx2.closePath();
        ctx2.fill();
        for (let i = 0; i < 4; i++) {
          const pCycle = 1.4;
          const pTime = (now * 1.6 + i * 0.35 + seed) % pCycle;
          const pProg = pTime / pCycle;
          const sparkX = cx + (Math.sin(now * 3 + i * 2) * 4 + (i - 1.5) * 3) * zoom;
          const sparkY = baseY - (coreH + pProg * 22 * zoom);
          const sparkAlpha = Math.max(0, 1 - pProg);
          const sparkSize = (1.4 - pProg * 0.8) * zoom;
          ctx2.fillStyle = i % 2 === 0 ? `rgba(254, 240, 138, ${sparkAlpha})` : `rgba(251, 146, 60, ${sparkAlpha})`;
          ctx2.beginPath();
          ctx2.arc(sparkX, sparkY, Math.max(0.6, sparkSize), 0, Math.PI * 2);
          ctx2.fill();
        }
        const smokeTime = (now * 0.8 + seed) % 2;
        const smokeProg = smokeTime / 2;
        const smokeY = baseY - (flameH + smokeProg * 20 * zoom);
        const smokeX = cx + Math.sin(now * 1.5 + seed) * 6 * zoom;
        const smokeAlpha = Math.max(0, 0.28 * (1 - smokeProg));
        ctx2.fillStyle = `rgba(161, 161, 170, ${smokeAlpha})`;
        ctx2.beginPath();
        ctx2.arc(smokeX, smokeY, (2.5 + smokeProg * 4) * zoom, 0, Math.PI * 2);
        ctx2.fill();
      } else {
        ctx2.fillStyle = "#52525b";
        ctx2.beginPath();
        ctx2.arc(cx, cy - 1 * zoom, 2 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        const smokeY = cy - now * 8 % 14 * zoom;
        const smokeAlpha = Math.max(0, 0.2 - now * 8 % 14 / 14);
        ctx2.fillStyle = `rgba(113, 113, 122, ${smokeAlpha})`;
        ctx2.beginPath();
        ctx2.arc(cx + Math.sin(now * 2) * 2 * zoom, smokeY, 1.8 * zoom, 0, Math.PI * 2);
        ctx2.fill();
      }
      if (gx === CAMP_CENTER.x && gy === CAMP_CENTER.y) {
        ctx2.fillStyle = "#854d0e";
        ctx2.fillRect(cx + 8 * zoom, cy - 4 * zoom, 6 * zoom, 5 * zoom);
      }
      ctx2.restore();
    },
    drawHoverCursor(gx, gy) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const pos = this.cam.gridToScreen(gx, gy);
      const tw = TILE_W * zoom;
      const th = TILE_H * zoom;
      ctx2.save();
      ctx2.beginPath();
      ctx2.moveTo(pos.x, pos.y);
      ctx2.lineTo(pos.x + tw / 2, pos.y + th / 2);
      ctx2.lineTo(pos.x, pos.y + th);
      ctx2.lineTo(pos.x - tw / 2, pos.y + th / 2);
      ctx2.closePath();
      ctx2.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx2.fill();
      ctx2.strokeStyle = "#ffffff";
      ctx2.lineWidth = 1.6 * zoom;
      ctx2.stroke();
      ctx2.restore();
    }
  };

  // src/render/animals.js
  var animalRenderMethods = {
    drawAnimal(a) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const pos = this.cam.gridToScreen(a.x, a.y);
      const screenCx = pos.x;
      const screenCy = pos.y + TILE_H / 2 * zoom;
      ctx2.save();
      ctx2.translate(screenCx, screenCy);
      const screenMoveDx = a.targetX - a.x - (a.targetY - a.y);
      if (screenMoveDx < -0.05) {
        a.facingLeft = true;
      } else if (screenMoveDx > 0.05) {
        a.facingLeft = false;
      }
      if (a.facingLeft) {
        ctx2.scale(-1, 1);
      }
      const cx = 0;
      const cy = 0;
      const species = a.species || "deer";
      const isFleeing = a.state === "fleeing";
      const isMoving = a.state === "moving";
      if (species === "bison") {
        const shadowW = 12.5 * zoom;
        const shadowH = 5.4 * zoom;
        ctx2.beginPath();
        ctx2.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
        ctx2.fillStyle = isFleeing ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.35)";
        ctx2.fill();
        const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.022)) * 2.8 * zoom : isMoving ? Math.abs(Math.sin(Date.now() * 8e-3)) * 1.2 * zoom : 0;
        const legStride = isFleeing || isMoving ? Math.sin(Date.now() * 0.016) * 2.2 * zoom : 0;
        const bodyY = cy - 8 * zoom - hop;
        ctx2.fillStyle = "#17120e";
        ctx2.fillRect(cx - 6 * zoom, bodyY + 3 * zoom, 2 * zoom, 4.5 * zoom - legStride);
        ctx2.fillRect(cx + 4.5 * zoom, bodyY + 3 * zoom, 2 * zoom, 4.5 * zoom + legStride);
        ctx2.fillStyle = "#261912";
        ctx2.fillRect(cx - 3.5 * zoom, bodyY + 3.5 * zoom, 2.3 * zoom, 4.5 * zoom + legStride);
        ctx2.fillRect(cx + 2 * zoom, bodyY + 3.5 * zoom, 2.3 * zoom, 4.5 * zoom - legStride);
        ctx2.fillStyle = "#3a2215";
        ctx2.beginPath();
        ctx2.ellipse(cx - 3 * zoom, bodyY + 1 * zoom, 7.5 * zoom, 5.2 * zoom, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#22120a";
        ctx2.beginPath();
        ctx2.ellipse(cx + 2.2 * zoom, bodyY - 3.2 * zoom, 7 * zoom, 6.2 * zoom, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#1a0e08";
        ctx2.beginPath();
        ctx2.ellipse(cx + 7.5 * zoom, bodyY + 0.5 * zoom, 3.8 * zoom, 4.2 * zoom, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#0f172a";
        ctx2.beginPath();
        ctx2.moveTo(cx + 6 * zoom, bodyY + 3 * zoom);
        ctx2.lineTo(cx + 8.5 * zoom, bodyY + 3 * zoom);
        ctx2.lineTo(cx + 7.5 * zoom, bodyY + 7 * zoom);
        ctx2.closePath();
        ctx2.fill();
        ctx2.strokeStyle = "#e2d5bd";
        ctx2.lineWidth = 2.2 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx + 6.5 * zoom, bodyY - 2 * zoom);
        ctx2.quadraticCurveTo(cx + 8.5 * zoom, bodyY - 8.5 * zoom, cx + 5.5 * zoom, bodyY - 9.5 * zoom);
        ctx2.moveTo(cx + 8.5 * zoom, bodyY - 2 * zoom);
        ctx2.quadraticCurveTo(cx + 10.5 * zoom, bodyY - 8.5 * zoom, cx + 8 * zoom, bodyY - 10 * zoom);
        ctx2.stroke();
        ctx2.strokeStyle = "#18181b";
        ctx2.lineWidth = 2.4 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx + 6.2 * zoom, bodyY - 8.6 * zoom);
        ctx2.lineTo(cx + 5.5 * zoom, bodyY - 9.5 * zoom);
        ctx2.moveTo(cx + 8.6 * zoom, bodyY - 9.2 * zoom);
        ctx2.lineTo(cx + 8 * zoom, bodyY - 10 * zoom);
        ctx2.stroke();
        ctx2.fillStyle = "#f59e0b";
        ctx2.beginPath();
        ctx2.arc(cx + 8.8 * zoom, bodyY - 0.5 * zoom, 0.9 * zoom, 0, Math.PI * 2);
        ctx2.fill();
      } else if (species === "boar") {
        const shadowW = 8.5 * zoom;
        const shadowH = 3.8 * zoom;
        ctx2.beginPath();
        ctx2.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
        ctx2.fillStyle = isFleeing ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.32)";
        ctx2.fill();
        const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.026)) * 2.4 * zoom : isMoving ? Math.abs(Math.sin(Date.now() * 0.01)) * 1 * zoom : 0;
        const legStride = isFleeing || isMoving ? Math.sin(Date.now() * 0.018) * 1.8 * zoom : 0;
        const bodyY = cy - 5.5 * zoom - hop;
        ctx2.fillStyle = "#1c1917";
        ctx2.fillRect(cx - 4.5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, 4 * zoom - legStride);
        ctx2.fillRect(cx + 2.5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, 4 * zoom + legStride);
        ctx2.fillStyle = "#291c14";
        ctx2.fillRect(cx - 1.5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, 4 * zoom + legStride);
        ctx2.fillRect(cx + 5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, 4 * zoom - legStride);
        ctx2.fillStyle = "#3a2216";
        ctx2.beginPath();
        ctx2.ellipse(cx, bodyY + 0.5 * zoom, 6.8 * zoom, 4.4 * zoom, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#170e08";
        ctx2.beginPath();
        ctx2.ellipse(cx - 1 * zoom, bodyY - 2.8 * zoom, 5.5 * zoom, 1.8 * zoom, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#2a170e";
        ctx2.beginPath();
        ctx2.moveTo(cx + 2 * zoom, bodyY + 1.5 * zoom);
        ctx2.lineTo(cx + 8.5 * zoom, bodyY + 1.8 * zoom);
        ctx2.lineTo(cx + 4 * zoom, bodyY - 3.5 * zoom);
        ctx2.closePath();
        ctx2.fill();
        ctx2.fillStyle = "#fb923c";
        ctx2.beginPath();
        ctx2.arc(cx + 8.5 * zoom, bodyY + 1.8 * zoom, 1.2 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = "#ffffff";
        ctx2.lineWidth = 1.6 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx + 7.5 * zoom, bodyY + 2.2 * zoom);
        ctx2.quadraticCurveTo(cx + 9.5 * zoom, bodyY + 1.2 * zoom, cx + 8.8 * zoom, bodyY - 1.5 * zoom);
        ctx2.moveTo(cx + 6.8 * zoom, bodyY + 1 * zoom);
        ctx2.quadraticCurveTo(cx + 8 * zoom, bodyY + 0.2 * zoom, cx + 7.5 * zoom, bodyY - 1 * zoom);
        ctx2.stroke();
        ctx2.fillStyle = "#170e08";
        ctx2.beginPath();
        ctx2.moveTo(cx + 3.5 * zoom, bodyY - 3.5 * zoom);
        ctx2.lineTo(cx + 4.8 * zoom, bodyY - 6.5 * zoom);
        ctx2.lineTo(cx + 5.5 * zoom, bodyY - 3.5 * zoom);
        ctx2.closePath();
        ctx2.fill();
        ctx2.fillStyle = "#f87171";
        ctx2.beginPath();
        ctx2.arc(cx + 5.5 * zoom, bodyY - 0.5 * zoom, 0.7 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = "#3a2216";
        ctx2.lineWidth = 1.2 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx - 6.5 * zoom, bodyY);
        ctx2.quadraticCurveTo(cx - 8.5 * zoom, bodyY - 2 * zoom, cx - 7.5 * zoom, bodyY - 3.5 * zoom);
        ctx2.stroke();
      } else if (species === "hare") {
        const shadowW = 4.5 * zoom;
        const shadowH = 2.2 * zoom;
        ctx2.beginPath();
        ctx2.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
        ctx2.fillStyle = isFleeing ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.25)";
        ctx2.fill();
        const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.035)) * 4.2 * zoom : isMoving ? Math.abs(Math.sin(Date.now() * 0.015)) * 2 * zoom : 0;
        const bodyY = cy - 3.8 * zoom - hop;
        ctx2.fillStyle = "#8a6440";
        ctx2.beginPath();
        ctx2.ellipse(cx - 2.2 * zoom, bodyY + 1.2 * zoom, 3.2 * zoom, 2.2 * zoom, 0.3, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#a67c52";
        ctx2.beginPath();
        ctx2.ellipse(cx + 0.8 * zoom, bodyY, 2.8 * zoom, 1.8 * zoom, -0.2, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#f8fafc";
        ctx2.beginPath();
        ctx2.arc(cx - 4.5 * zoom, bodyY + 0.5 * zoom, 1.3 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#966c42";
        ctx2.beginPath();
        ctx2.ellipse(cx + 3.2 * zoom, bodyY - 1.8 * zoom, 1.8 * zoom, 1.4 * zoom, -0.3, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#a67c52";
        ctx2.beginPath();
        ctx2.ellipse(cx + 2.2 * zoom, bodyY - 5.5 * zoom, 0.9 * zoom, 3 * zoom, -0.25, 0, Math.PI * 2);
        ctx2.ellipse(cx + 3.8 * zoom, bodyY - 5.8 * zoom, 0.9 * zoom, 3.2 * zoom, 0.15, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#0f172a";
        ctx2.beginPath();
        ctx2.arc(cx + 1.5 * zoom, bodyY - 7.8 * zoom, 0.9 * zoom, 0, Math.PI * 2);
        ctx2.arc(cx + 4.2 * zoom, bodyY - 8.2 * zoom, 0.9 * zoom, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#09090b";
        ctx2.beginPath();
        ctx2.arc(cx + 3.8 * zoom, bodyY - 2.2 * zoom, 0.6 * zoom, 0, Math.PI * 2);
        ctx2.fill();
      } else {
        const shadowW = 8.5 * zoom;
        const shadowH = 3.6 * zoom;
        ctx2.beginPath();
        ctx2.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
        ctx2.fillStyle = isFleeing ? "rgba(0,0,0,0.20)" : "rgba(0,0,0,0.30)";
        ctx2.fill();
        const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.02)) * 3 * zoom : isMoving ? Math.abs(Math.sin(Date.now() * 8e-3)) * 1.2 * zoom : 0;
        const legStride = isFleeing || isMoving ? Math.sin(Date.now() * 0.015) * 2.5 * zoom : 0;
        const bodyY = cy - 6.5 * zoom - hop;
        ctx2.fillStyle = "#451a03";
        ctx2.fillRect(cx - 5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, 5.5 * zoom - legStride);
        ctx2.fillRect(cx + 2.5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, 5.5 * zoom + legStride);
        ctx2.fillStyle = "#78350f";
        ctx2.fillRect(cx - 2.5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, 5.5 * zoom + legStride);
        ctx2.fillRect(cx + 5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, 5.5 * zoom - legStride);
        ctx2.fillStyle = "#92400e";
        ctx2.beginPath();
        ctx2.ellipse(cx, bodyY + 1 * zoom, 6.2 * zoom, 3.8 * zoom, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#78350f";
        ctx2.beginPath();
        ctx2.moveTo(cx + 3 * zoom, bodyY + 1 * zoom);
        ctx2.lineTo(cx + 6 * zoom, bodyY - 5 * zoom);
        ctx2.lineTo(cx + 8 * zoom, bodyY - 5 * zoom);
        ctx2.lineTo(cx + 5 * zoom, bodyY + 2 * zoom);
        ctx2.closePath();
        ctx2.fill();
        ctx2.fillStyle = "#fef3c7";
        ctx2.beginPath();
        ctx2.ellipse(cx + 5.5 * zoom, bodyY - 2 * zoom, 1.2 * zoom, 2.5 * zoom, 0.3, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = "#92400e";
        ctx2.beginPath();
        ctx2.ellipse(cx + 7 * zoom, bodyY - 5.5 * zoom, 2.8 * zoom, 1.8 * zoom, -0.2, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = "#fef08a";
        ctx2.lineWidth = 1.4 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx + 6.2 * zoom, bodyY - 7 * zoom);
        ctx2.lineTo(cx + 4.5 * zoom, bodyY - 13.5 * zoom);
        ctx2.moveTo(cx + 7.8 * zoom, bodyY - 7 * zoom);
        ctx2.lineTo(cx + 9.5 * zoom, bodyY - 13.5 * zoom);
        ctx2.moveTo(cx + 5.5 * zoom, bodyY - 10 * zoom);
        ctx2.lineTo(cx + 3.2 * zoom, bodyY - 12.5 * zoom);
        ctx2.moveTo(cx + 4.8 * zoom, bodyY - 13 * zoom);
        ctx2.lineTo(cx + 3 * zoom, bodyY - 15 * zoom);
        ctx2.moveTo(cx + 8 * zoom, bodyY - 11 * zoom);
        ctx2.lineTo(cx + 10.5 * zoom, bodyY - 12.5 * zoom);
        ctx2.moveTo(cx + 9 * zoom, bodyY - 13 * zoom);
        ctx2.lineTo(cx + 11.2 * zoom, bodyY - 15 * zoom);
        ctx2.stroke();
      }
      ctx2.restore();
    }
  };

  // src/render/humans.js
  var humanRenderMethods = {
    drawHuman(h, selectedHumanId2) {
      const ctx2 = this.ctx;
      const zoom = this.cam.zoom;
      const pos = this.cam.gridToScreen(h.x, h.y);
      const cx = pos.x;
      const cy = pos.y + TILE_H / 2 * zoom;
      const isBaby = h.ageYears < 4;
      const isChild = h.ageYears >= 4 && h.ageYears < 12;
      const isElder = h.ageYears >= 40;
      const shadowW = isBaby ? 2.6 : isChild ? 3.8 : 5.8;
      const shadowH = isBaby ? 1.4 : isChild ? 2 : 2.8;
      ctx2.save();
      ctx2.beginPath();
      ctx2.ellipse(cx, cy + 2 * zoom, shadowW * zoom, shadowH * zoom, 0, 0, Math.PI * 2);
      ctx2.fillStyle = "rgba(0,0,0,0.28)";
      ctx2.fill();
      if (h.id === selectedHumanId2) {
        ctx2.strokeStyle = "#f59e0b";
        ctx2.lineWidth = 1.8 * zoom;
        ctx2.beginPath();
        ctx2.ellipse(cx, cy + 2 * zoom, (isBaby ? 5.5 : isChild ? 7.5 : 9.5) * zoom, (isBaby ? 2.8 : isChild ? 3.8 : 4.8) * zoom, 0, 0, Math.PI * 2);
        ctx2.stroke();
      }
      let bobbing = 0;
      const isMoving = h.state === "moving";
      if (isMoving) {
        bobbing = Math.abs(Math.sin(Date.now() * 0.012)) * (isBaby ? 1.4 : 2.8) * zoom;
      } else if (h.state === "playing") {
        bobbing = Math.abs(Math.sin(Date.now() * 0.018)) * 3.6 * zoom;
      }
      const scale = isBaby ? 0.44 : isChild ? 0.68 : isElder ? 0.9 : 1;
      const isSittingAtFire = h.state === "socializing" && h.actionIntent === "sit_campfire";
      const sitOffset = isSittingAtFire ? 3 * zoom * scale : 0;
      const bodyY = cy - 6 * scale * zoom - bobbing + sitOffset;
      if (!h.isAlive) {
        ctx2.fillStyle = "#64748b";
        ctx2.fillRect(cx - 5 * zoom, cy - 2 * zoom, 10 * zoom, 4 * zoom);
        ctx2.font = `${10 * zoom}px sans-serif`;
        ctx2.textAlign = "center";
        ctx2.fillText("\u{1FAA6}", cx, cy - 4 * zoom);
        ctx2.restore();
        return;
      }
      if (!isSittingAtFire) {
        const legStride = isMoving ? Math.sin(Date.now() * 0.015) * 3.5 * scale * zoom : 0;
        ctx2.fillStyle = h.tint === "#3b82f6" ? "#b45309" : "#92400e";
        ctx2.fillRect(cx - 2.5 * scale * zoom, bodyY + 5 * scale * zoom, 1.8 * scale * zoom, 4 * scale * zoom + legStride);
        ctx2.fillRect(cx + 0.8 * scale * zoom, bodyY + 5 * scale * zoom, 1.8 * scale * zoom, 4 * scale * zoom - legStride);
      }
      ctx2.fillStyle = "#5c2e0b";
      ctx2.beginPath();
      ctx2.moveTo(cx - 3.8 * scale * zoom, bodyY);
      ctx2.lineTo(cx + 3.8 * scale * zoom, bodyY);
      ctx2.lineTo(cx + 4.2 * scale * zoom, bodyY + 6.5 * scale * zoom);
      ctx2.lineTo(cx - 4.2 * scale * zoom, bodyY + 6.5 * scale * zoom);
      ctx2.closePath();
      ctx2.fill();
      ctx2.strokeStyle = "#1c1917";
      ctx2.lineWidth = 1 * zoom * scale;
      ctx2.beginPath();
      ctx2.moveTo(cx - 4.2 * scale * zoom, bodyY + 4 * scale * zoom);
      ctx2.lineTo(cx + 4.2 * scale * zoom, bodyY + 4 * scale * zoom);
      ctx2.stroke();
      ctx2.fillStyle = h.tint === "#3b82f6" ? "#b45309" : "#92400e";
      ctx2.fillRect(cx - 4.8 * scale * zoom, bodyY + 1 * scale * zoom, 1.6 * scale * zoom, 4 * scale * zoom);
      ctx2.fillRect(cx + 3.4 * scale * zoom, bodyY + 1 * scale * zoom, 1.6 * scale * zoom, 4 * scale * zoom);
      if (h.state === "hunting") {
        ctx2.strokeStyle = "#a16207";
        ctx2.lineWidth = 1.4 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx + 4 * scale * zoom, bodyY - 6 * scale * zoom);
        ctx2.lineTo(cx + 4 * scale * zoom, bodyY + 8 * scale * zoom);
        ctx2.stroke();
      } else if (h.state === "chopping" || h.state === "mining") {
        ctx2.fillStyle = "#475569";
        ctx2.beginPath();
        ctx2.arc(cx + 4.5 * scale * zoom, bodyY + 4.5 * scale * zoom, 1.8 * scale * zoom, 0, Math.PI * 2);
        ctx2.fill();
      } else if (h.state === "digging" || h.state === "foraging") {
        ctx2.strokeStyle = "#854d0e";
        ctx2.lineWidth = 1.3 * zoom;
        ctx2.beginPath();
        ctx2.moveTo(cx + 4.5 * scale * zoom, bodyY + 1 * scale * zoom);
        ctx2.lineTo(cx + 6 * scale * zoom, bodyY + 8 * scale * zoom);
        ctx2.stroke();
      }
      if (h.gender === "f" && !isBaby && (h.state === "resting" || h.state === "socializing")) {
        ctx2.fillStyle = "#fed7aa";
        ctx2.beginPath();
        ctx2.arc(cx - 3.5 * scale * zoom, bodyY - 1 * scale * zoom, 1.8 * scale * zoom, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.fillStyle = h.ageYears >= 40 ? "#cbd5e1" : "#fed7aa";
      ctx2.beginPath();
      ctx2.arc(cx, bodyY - 6 * scale * zoom, 3.2 * scale * zoom, 0, Math.PI * 2);
      ctx2.fill();
      const hairColor = h.ageYears >= 40 ? "#94a3b8" : h.gender === "m" ? "#1c1917" : "#291b12";
      ctx2.fillStyle = hairColor;
      ctx2.beginPath();
      ctx2.arc(cx, bodyY - 7.5 * scale * zoom, 2.8 * scale * zoom, Math.PI, Math.PI * 2);
      ctx2.fill();
      if (h.gender === "f" && !isBaby) {
        ctx2.fillStyle = hairColor;
        ctx2.fillRect(cx - 3.2 * scale * zoom, bodyY - 7 * scale * zoom, 1.4 * scale * zoom, 4.5 * scale * zoom);
        ctx2.fillRect(cx + 1.8 * scale * zoom, bodyY - 7 * scale * zoom, 1.4 * scale * zoom, 4.5 * scale * zoom);
      }
      if (h.gender === "m" && !isChild && !isBaby) {
        ctx2.fillStyle = hairColor;
        ctx2.beginPath();
        ctx2.arc(cx, bodyY - 4.5 * scale * zoom, 1.6 * scale * zoom, 0, Math.PI);
        ctx2.fill();
      }
      if (h.id === selectedHumanId2) {
        ctx2.font = `bold ${Math.max(9, 9 * zoom)}px sans-serif`;
        ctx2.textAlign = "center";
        ctx2.fillStyle = "#fbbf24";
        ctx2.fillText(`${h.name} (${Math.floor(h.ageYears)}J)`, cx, bodyY - 17 * scale * zoom);
      }
      if (h.state === "socializing") {
        ctx2.font = `${8 * zoom}px sans-serif`;
        ctx2.textAlign = "center";
        const icon2 = h.actionIntent === "sit_campfire" ? "\u{1F525}" : "\u{1F5E3}\uFE0F";
        ctx2.fillText(icon2, cx, bodyY - 11 * scale * zoom);
      } else if (h.state === "playing") {
        ctx2.font = `${8 * zoom}px sans-serif`;
        ctx2.textAlign = "center";
        ctx2.fillText("\u2B50", cx, bodyY - 11 * scale * zoom);
      }
      if (h.carried) {
        ctx2.font = `${10 * zoom}px sans-serif`;
        ctx2.textAlign = "center";
        let cIcon = "\u{1F4E6}";
        if (h.carried.includes("Stein")) cIcon = "\u{1FAA8}";
        else if (h.carried.includes("Holz")) cIcon = "\u{1FAB5}";
        else if (h.carried.includes("Wasser")) cIcon = "\u{1F4A7}";
        else if (h.carried.includes("Beeren")) cIcon = "\u{1F347}";
        else if (h.carried.includes("Wurzelknollen")) cIcon = "\u{1F954}";
        else if (h.carried.includes("Flussfisch")) cIcon = "\u{1F41F}";
        else if (h.carried.includes("Wildbret")) cIcon = "\u{1F969}";
        ctx2.fillText(cIcon, cx + 6 * zoom, bodyY);
      }
      let icon = "";
      if (h.state === "relieving") icon = "\u{1F4A8}";
      else if (h.state === "drinking") icon = "\u{1F4A7}";
      else if (h.state === "foraging") icon = "\u{1F347}";
      else if (h.state === "digging") icon = "\u{1F954}";
      else if (h.state === "fishing") icon = "\u{1F3A3}";
      else if (h.state === "mining") icon = "\u26CF\uFE0F";
      else if (h.state === "chopping") icon = "\u{1FA93}";
      else if (h.state === "hunting") icon = "\u{1F3F9}";
      else if (h.state === "building") icon = "\u{1F528}";
      else if (h.state === "resting") icon = "\u{1F525}";
      else if (h.state === "mating") icon = "\u2764\uFE0F";
      else if (h.state === "migrating") icon = "\u26FA";
      else if (h.injuredTimer > 0) icon = "\u{1FA78}";
      else if (h.sickTimer > 0) icon = "\u{1F912}";
      else if (h.pregnancyTimer > 0) icon = "\u{1F930}";
      if (icon) {
        ctx2.font = `${Math.max(10, 11 * zoom)}px sans-serif`;
        ctx2.textAlign = "center";
        ctx2.fillText(icon, cx, bodyY - 13 * zoom);
      }
      ctx2.restore();
    }
  };

  // src/render.js
  var Renderer = class {
    constructor(ctx2, camera2) {
      this.ctx = ctx2;
      this.cam = camera2;
      this.waterPhase = 0;
    }
    render(map2, humans2, animals2, hoveredGrid2, selectedHumanId2, dtSec, fireIntensity = 100) {
      const ctx2 = this.ctx;
      this.waterPhase += dtSec * 1.5;
      this.biomeId = map2.biomeId || "river_valley";
      ctx2.clearRect(0, 0, this.cam.canvas.width, this.cam.canvas.height);
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          this.drawGround(map2[y][x], x, y);
        }
      }
      if (hoveredGrid2.x >= 0 && hoveredGrid2.x < MAP_SIZE && hoveredGrid2.y >= 0 && hoveredGrid2.y < MAP_SIZE) {
        this.drawHoverCursor(hoveredGrid2.x, hoveredGrid2.y);
      }
      const depthItems = [];
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          const tile = map2[y][x];
          if (tile.type === "rock") {
            depthItems.push({
              type: "rock",
              x,
              y,
              stoneStock: tile.stoneStock,
              maxStoneStock: tile.maxStoneStock,
              sortKey: x + y + 0.1
            });
          } else if (tile.type === "shelter") {
            depthItems.push({ type: "shelter", x, y, shelter: tile.shelter, sortKey: x + y + 0.15 });
          } else if (tile.type === "fire") {
            depthItems.push({ type: "fire", x, y, fire: tile.fire, sortKey: x + y + 0.05 });
          }
          if (tile.plant) {
            depthItems.push({ type: "plant", x, y, plant: tile.plant, sortKey: x + y + 0.2 });
          }
        }
      }
      for (const h of humans2) {
        depthItems.push({ type: "human", entity: h, sortKey: h.x + h.y });
      }
      for (const a of animals2) {
        if (a.isAlive) {
          depthItems.push({ type: "animal", entity: a, sortKey: a.x + a.y });
        }
      }
      depthItems.sort((a, b) => a.sortKey - b.sortKey);
      for (const item of depthItems) {
        if (item.type === "rock") {
          const pos = this.cam.gridToScreen(item.x, item.y);
          this.drawNaturalRock(pos.x, pos.y + TILE_H / 2 * this.cam.zoom, item.x, item.y, item.stoneStock, item.maxStoneStock);
        } else if (item.type === "shelter") {
          const pos = this.cam.gridToScreen(item.x, item.y);
          this.drawPrimitiveShelter(pos.x, pos.y + TILE_H / 2 * this.cam.zoom, item.shelter);
        } else if (item.type === "fire") {
          const pos = this.cam.gridToScreen(item.x, item.y);
          const localIntensity = item.fire && typeof item.fire.intensity === "number" ? item.fire.intensity : item.x === CAMP_CENTER.x && item.y === CAMP_CENTER.y ? fireIntensity : 100;
          this.drawCampfire(item.x, item.y, pos.x, pos.y + TILE_H / 2 * this.cam.zoom, localIntensity);
        } else if (item.type === "plant") {
          const pos = this.cam.gridToScreen(item.x, item.y);
          const cy = pos.y + TILE_H / 2 * this.cam.zoom;
          if (item.plant.type === "bush") {
            this.drawOrganicBush(pos.x, cy, item.plant);
          } else if (item.plant.type === "tree") {
            this.drawOrganicTree(pos.x, cy, item.plant);
          }
        } else if (item.type === "human") {
          this.drawHuman(item.entity, selectedHumanId2);
        } else if (item.type === "animal") {
          this.drawAnimal(item.entity);
        }
      }
    }
  };
  Object.assign(
    Renderer.prototype,
    environmentRenderMethods,
    animalRenderMethods,
    humanRenderMethods
  );

  // src/pathfinding.js
  function isTileWalkable(map2, x, y) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return false;
    const tile = map2[y] && map2[y][x];
    if (!tile) return false;
    if (tile.type === "water" && !tile.isFord) return false;
    return true;
  }
  function findPath(map2, startX, startY, goalX, goalY) {
    const sx = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(startX)));
    const sy = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(startY)));
    let gx = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(goalX)));
    let gy = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(goalY)));
    if (sx === gx && sy === gy) {
      return [{ x: gx, y: gy }];
    }
    if (!isTileWalkable(map2, gx, gy)) {
      const neighbors = [
        { x: gx, y: gy - 1 },
        { x: gx, y: gy + 1 },
        { x: gx - 1, y: gy },
        { x: gx + 1, y: gy },
        { x: gx - 1, y: gy - 1 },
        { x: gx + 1, y: gy - 1 },
        { x: gx - 1, y: gy + 1 },
        { x: gx + 1, y: gy + 1 }
      ].filter((n) => isTileWalkable(map2, n.x, n.y));
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
      const curr2 = queue.shift();
      if (curr2 === targetIdx) {
        found = true;
        break;
      }
      const cx = curr2 % MAP_SIZE;
      const cy = Math.floor(curr2 / MAP_SIZE);
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0]
      ];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < MAP_SIZE && ny >= 0 && ny < MAP_SIZE) {
          const nIdx = ny * MAP_SIZE + nx;
          if (!visited[nIdx] && isTileWalkable(map2, nx, ny)) {
            visited[nIdx] = 1;
            parent[nIdx] = curr2;
            queue.push(nIdx);
          }
        }
      }
    }
    if (!found) return null;
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

  // src/foraging.js
  function findNearestBushWithBerries(map2, fromX, fromY) {
    let nearestBush = null;
    let minDist = 9999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const p = map2[y][x].plant;
        if (p && p.type === "bush" && p.berries > 0 && !p.isRootstock) {
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
  function findNearestRootDigSpot(map2, fromX, fromY) {
    let bestSpot = null;
    let minDist = 9999;
    for (let y = 1; y < MAP_SIZE - 1; y++) {
      for (let x = 1; x < MAP_SIZE - 1; x++) {
        const tile = map2[y][x];
        if (tile.type === "grass" && !tile.plant && !tile.fire && !tile.shelter && (tile.roots > 0 || tile.npk >= 28)) {
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
  function findNearestFishingSpot(map2, fromX, fromY) {
    let bestSpot = null;
    let minDist = 9999;
    for (let y = 1; y < MAP_SIZE - 1; y++) {
      for (let x = 1; x < MAP_SIZE - 1; x++) {
        const tile = map2[y][x];
        if (tile.type === "grass" || tile.type === "path" || tile.isFord) {
          const neighbors = [
            map2[y - 1] && map2[y - 1][x],
            map2[y + 1] && map2[y + 1][x],
            map2[y][x - 1],
            map2[y][x + 1]
          ];
          const waterNeighbor = neighbors.find((n) => n && n.type === "water" && (n.fishStock === void 0 || n.fishStock > 0));
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
  function findNearestTile(map2, fromX, fromY, type) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (map2[y][x].type === type) {
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
  function findNearestAdultTree(map2, fromX, fromY) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const p = map2[y][x].plant;
        if (p && p.type === "tree" && p.stage >= 2) {
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
  function findNearestShoreTile(map2, fromX, fromY) {
    let shoreTile = null;
    let minDist = 9999;
    for (let y = 1; y < MAP_SIZE - 1; y++) {
      for (let x = 1; x < MAP_SIZE - 1; x++) {
        if (map2[y][x].type === "grass" || map2[y][x].type === "path") {
          const hasWaterNeighbor = map2[y - 1][x].type === "water" || map2[y + 1][x].type === "water" || map2[y][x - 1].type === "water" || map2[y][x + 1].type === "water";
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
  function isPositionNearLitFire(map2, fromX, fromY) {
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map2[y][x];
        if (t.type === "fire") {
          const intensity = t.fire ? t.fire.intensity : x === CAMP_CENTER.x && y === CAMP_CENTER.y ? fireState.intensity : 100;
          if (intensity > 15) {
            const d = Math.hypot(x - fromX, y - fromY);
            if (d <= 4.5) return true;
          }
        }
      }
    }
    return false;
  }
  function findNearestLitFireTile(map2, fromX, fromY) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map2[y][x];
        if (t.type === "fire") {
          const intensity = t.fire ? t.fire.intensity : x === CAMP_CENTER.x && y === CAMP_CENTER.y ? fireState.intensity : 100;
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
  function findFreeShelterSpotNearCamp(map2, humans2 = []) {
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const sx = CAMP_CENTER.x + dx;
            const sy = CAMP_CENTER.y + dy;
            if (sx >= 1 && sx < MAP_SIZE - 1 && sy >= 1 && sy < MAP_SIZE - 1) {
              const t = map2[sy][sx];
              if ((t.type === "grass" || t.type === "path") && !t.plant && t.type !== "fire" && t.type !== "shelter") {
                const alreadyTargeted = humans2.some(
                  (h) => h.isAlive && h.actionIntent === "build_shelter" && Math.round(h.targetX) === sx && Math.round(h.targetY) === sy
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

  // src/wildlife.js
  var nextAnimalId = 1;
  var spookedTimer = 0;
  function spookWildlife(seconds = 90) {
    spookedTimer = Math.max(spookedTimer, seconds);
  }
  function updateSpookTimer(dt) {
    if (spookedTimer > 0) {
      spookedTimer = Math.max(0, spookedTimer - dt);
    }
  }
  var ANIMAL_SPECIES = {
    deer: {
      species: "deer",
      name: "Ur-Hirsch",
      icon: "\u{1F98C}",
      meatYield: 5,
      maxStamina: 100,
      speedRun: 2.3,
      speedWalk: 0.8,
      fleeDist: 5.5,
      toughness: 1,
      habitat: "all"
    },
    boar: {
      species: "boar",
      name: "Wildschwein",
      icon: "\u{1F417}",
      meatYield: 7,
      maxStamina: 120,
      speedRun: 1.85,
      speedWalk: 0.7,
      fleeDist: 4.5,
      toughness: 1,
      habitat: "forest"
    },
    bison: {
      species: "bison",
      name: "Ur-Bison",
      icon: "\u{1F9AC}",
      meatYield: 15,
      maxStamina: 240,
      speedRun: 1.45,
      speedWalk: 0.55,
      fleeDist: 4,
      toughness: 2,
      habitat: "grass"
    },
    hare: {
      species: "hare",
      name: "Feldhase",
      icon: "\u{1F407}",
      meatYield: 2,
      maxStamina: 40,
      speedRun: 2.8,
      speedWalk: 0.9,
      fleeDist: 3.5,
      toughness: 1,
      habitat: "grass"
    }
  };
  var WildAnimal = class {
    constructor(x, y, speciesKey = "deer") {
      this.id = nextAnimalId++;
      const spec = ANIMAL_SPECIES[speciesKey] || ANIMAL_SPECIES.deer;
      this.species = spec.species;
      this.name = spec.name;
      this.icon = spec.icon;
      this.meatYield = spec.meatYield;
      this.maxStamina = spec.maxStamina;
      this.stamina = spec.maxStamina;
      this.speedRun = spec.speedRun;
      this.speedWalk = spec.speedWalk;
      this.fleeDist = spec.fleeDist;
      this.toughness = spec.toughness;
      this.x = x;
      this.y = y;
      this.targetX = x;
      this.targetY = y;
      this.state = "grazing";
      this.stateTimer = 3 + Math.random() * 3;
      this.isAlive = true;
      this.wounds = 0;
    }
    update(dt, map2, humans2, logEvent2) {
      if (!this.isAlive || dt === 0) return;
      let nearestHumanDist = 999;
      let predator = null;
      let hunterCount = 0;
      for (const h of humans2) {
        if (h.isAlive) {
          const d = Math.hypot(h.x - this.x, h.y - this.y);
          if (d < nearestHumanDist) {
            nearestHumanDist = d;
            predator = h;
          }
          if (h.actionIntent === "hunt_animal" && h.huntTarget === this && d < 7) {
            hunterCount++;
          }
        }
      }
      const isTargeted = hunterCount > 0;
      const effectiveFleeDist = isTargeted ? this.fleeDist + 1.8 : this.fleeDist;
      if (nearestHumanDist < effectiveFleeDist && this.state !== "fleeing" && this.state !== "exhausted") {
        this.state = "fleeing";
        const angle = Math.atan2(this.y - predator.y, this.x - predator.x) + (Math.random() - 0.5) * 0.4;
        const fX = this.x + Math.cos(angle) * (this.species === "hare" ? 3.5 : 5.5);
        const fY = this.y + Math.sin(angle) * (this.species === "hare" ? 3.5 : 5.5);
        this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fX)));
        this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fY)));
        logEvent2(`${this.icon} ${this.name} wittert ${predator.name} und flieht in Panik!`);
      }
      if (this.state === "fleeing") {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        let speed;
        if (this.stamina > 20) {
          speed = this.speedRun * dt;
          const drain = this.species === "hare" ? 18 : this.species === "bison" ? 8 : 13;
          this.stamina = Math.max(0, this.stamina - dt * drain);
        } else {
          speed = this.speedRun * 0.55 * dt;
          this.stamina = Math.max(0, this.stamina - dt * 5);
        }
        if (this.stamina <= 3) {
          this.state = "exhausted";
          this.stateTimer = this.species === "bison" ? 1.8 : 2.5;
          logEvent2(`${this.icon} ${this.name} ist von der Hetzjagd v\xF6llig ersch\xF6pft und verlangsamt!`);
        } else if (dist < speed) {
          this.x = this.targetX;
          this.y = this.targetY;
          if (nearestHumanDist < this.fleeDist + 0.5 && predator) {
            const angle = Math.atan2(this.y - predator.y, this.x - predator.x) + (Math.random() - 0.5) * 0.5;
            const fX = this.x + Math.cos(angle) * 4.5;
            const fY = this.y + Math.sin(angle) * 4.5;
            this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fX)));
            this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fY)));
          } else {
            this.state = "grazing";
            this.stateTimer = 3 + Math.random() * 3;
          }
        } else {
          this.x += dx / dist * speed;
          this.y += dy / dist * speed;
        }
      }
      if (this.state === "exhausted") {
        this.stateTimer -= dt;
        this.stamina = Math.min(this.maxStamina, this.stamina + dt * 8);
        if (this.stateTimer <= 0) {
          this.state = "fleeing";
          if (predator) {
            const angle = Math.atan2(this.y - predator.y, this.x - predator.x);
            this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + Math.cos(angle) * 4)));
            this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + Math.sin(angle) * 4)));
          }
        }
      }
      if (this.state === "moving") {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        const speed = this.speedWalk * dt;
        if (dist < speed) {
          this.x = this.targetX;
          this.y = this.targetY;
          this.state = "grazing";
          this.stateTimer = 3 + Math.random() * 4;
        } else {
          this.x += dx / dist * speed;
          this.y += dy / dist * speed;
        }
      }
      if (this.state === "grazing") {
        this.stamina = Math.min(this.maxStamina, this.stamina + dt * 10);
        this.stateTimer -= dt;
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        const curTile = map2[gy] && map2[gy][gx];
        if (curTile) {
          if (this.species === "boar") {
            if (curTile.npk < 50 && Math.random() < 0.05 * dt) {
              curTile.npk = Math.min(60, curTile.npk + 2);
            }
          } else if (curTile.plant && curTile.plant.type === "bush" && curTile.plant.berries > 0) {
            if (Math.random() < 0.12 * dt) {
              curTile.plant.berries--;
            }
          }
        }
        if (this.stateTimer <= 0) {
          const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
          const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
          if (map2[ry] && map2[ry][rx] && map2[ry][rx].type !== "water") {
            this.targetX = rx;
            this.targetY = ry;
            this.state = "moving";
          }
        }
      }
    }
  };
  function maybeSpawnWildAnimal(animals2, humans2, logEvent2, map2 = null) {
    if (spookedTimer > 0) return;
    if (animals2.length >= 2 || Math.random() > 16e-4) return;
    const side = Math.floor(Math.random() * 4);
    let sx = 1, sy = 1;
    if (side === 0) {
      sx = Math.floor(Math.random() * MAP_SIZE);
      sy = 1;
    } else if (side === 1) {
      sx = Math.floor(Math.random() * MAP_SIZE);
      sy = MAP_SIZE - 2;
    } else if (side === 2) {
      sx = 1;
      sy = Math.floor(Math.random() * MAP_SIZE);
    } else {
      sx = MAP_SIZE - 2;
      sy = Math.floor(Math.random() * MAP_SIZE);
    }
    for (const h of humans2) {
      if (h.isAlive && Math.hypot(h.x - sx, h.y - sy) < 8) {
        return;
      }
    }
    const biomeId = map2 && map2.biomeId || "river_valley";
    const roll = Math.random();
    let speciesKey = "deer";
    if (biomeId === "steppe") {
      if (roll < 0.65) speciesKey = "bison";
      else if (roll < 0.95) speciesKey = "hare";
      else speciesKey = "deer";
    } else if (biomeId === "forest") {
      if (roll < 0.65) speciesKey = "boar";
      else if (roll < 0.9) speciesKey = "deer";
      else speciesKey = "hare";
    } else if (biomeId === "karst_canyon") {
      if (roll < 0.5) speciesKey = "hare";
      else if (roll < 0.85) speciesKey = "deer";
      else speciesKey = "bison";
    } else {
      if (roll < 0.35) speciesKey = "deer";
      else if (roll < 0.65) speciesKey = "boar";
      else if (roll < 0.85) speciesKey = "bison";
      else speciesKey = "hare";
    }
    const animal = new WildAnimal(sx, sy, speciesKey);
    animals2.push(animal);
    logEvent2(`${animal.icon} Ein wildes Einzelexemplar (${animal.name}) wagt sich am Talrand hervor.`);
  }

  // src/human/tasks.js
  var humanTaskMethods = {
    seekHunt(animals2, map2) {
      const liveAnimals = animals2.filter((a) => a.isAlive);
      if (liveAnimals.length === 0) return;
      liveAnimals.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
      const target = liveAnimals[0];
      this.setMoveTarget(map2, target.x, target.y, "hunt_animal", target);
    },
    seekRelief(map2) {
      let bestTarget = null;
      let maxDist = 0;
      for (let i = 0; i < 8; i++) {
        const rx = Math.floor(Math.random() * MAP_SIZE);
        const ry = Math.floor(Math.random() * MAP_SIZE);
        if (map2[ry][rx].type !== "water" && map2[ry][rx].type !== "fire") {
          const d = Math.hypot(rx - CAMP_CENTER.x, ry - CAMP_CENTER.y);
          if (d > maxDist) {
            maxDist = d;
            bestTarget = { x: rx, y: ry };
          }
        }
      }
      if (bestTarget) {
        this.setMoveTarget(map2, bestTarget.x, bestTarget.y, "relieve");
      }
    },
    seekWater(map2) {
      if (campfireStock.water > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 6) {
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "drink_stock");
        return;
      }
      const shoreTile = findNearestShoreTile(map2, this.x, this.y);
      if (shoreTile) {
        this.setMoveTarget(map2, shoreTile.x, shoreTile.y, "drink_source");
      } else {
        this.wander(map2);
      }
    },
    seekFood(map2, animals2 = []) {
      if (campfireStock.food > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 7) {
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "eat_stock");
        return;
      }
      const bush = findNearestBushWithBerries(map2, this.x, this.y);
      if (bush && Math.hypot(bush.x - this.x, bush.y - this.y) < 9) {
        this.setMoveTarget(map2, bush.x, bush.y, "eat_bush");
        return;
      }
      if (this.ageYears >= 10) {
        const fishSpot = findNearestFishingSpot(map2, this.x, this.y);
        if (fishSpot && Math.hypot(fishSpot.x - this.x, fishSpot.y - this.y) < 9) {
          this.setMoveTarget(map2, fishSpot.x, fishSpot.y, "fish_river");
          return;
        }
      }
      const rootSpot = findNearestRootDigSpot(map2, this.x, this.y);
      if (rootSpot && Math.hypot(rootSpot.x - this.x, rootSpot.y - this.y) < 10) {
        this.setMoveTarget(map2, rootSpot.x, rootSpot.y, "dig_roots");
        return;
      }
      if (this.ageYears >= 12 && animals2 && animals2.some((a) => a.isAlive)) {
        this.seekHunt(animals2, map2);
        return;
      }
      if (bush) {
        this.setMoveTarget(map2, bush.x, bush.y, "eat_bush");
        return;
      }
      if (rootSpot) {
        this.setMoveTarget(map2, rootSpot.x, rootSpot.y, "dig_roots");
        return;
      }
      this.wander(map2);
    },
    seekShelterOrFire(map2, humans2 = []) {
      const availableShelters = [];
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          const t = map2[y][x];
          if (t.type === "shelter" && (!t.shelter || t.shelter.condition > 15)) {
            const occupants = humans2.filter(
              (h) => h.isAlive && h.state === "resting" && h.actionIntent === "rest_shelter" && Math.round(h.x) === x && Math.round(h.y) === y
            ).length;
            const cap = t.shelter?.capacity || SHELTER_CONFIG.capacity;
            if (occupants < cap) {
              availableShelters.push({ x, y, dist: Math.hypot(x - this.x, y - this.y) });
            }
          }
        }
      }
      if (availableShelters.length > 0) {
        availableShelters.sort((a, b) => a.dist - b.dist);
        this.setMoveTarget(map2, availableShelters[0].x, availableShelters[0].y, "rest_shelter");
        return;
      }
      const fire = this.findNearestLitFire(map2);
      if (fire) {
        this.setMoveTarget(map2, fire.x, fire.y, "rest_fire");
        return;
      }
      this.wander(map2);
    },
    seekMate(humans2, map2) {
      const mate = humans2.find((h) => h.isAlive && h.gender === "f" && h.ageYears >= 13 && h.ageYears <= 48 && h.pregnancyTimer === 0 && h.nursingTimer <= 0 && h.needs.libido > 25);
      if (mate) {
        this.mateTarget = mate;
        this.setMoveTarget(map2, Math.round(mate.x), Math.round(mate.y), "approach_mate");
      }
    },
    seekProductiveTask(map2, humans2 = [], animals2 = []) {
      if (this.role.includes("Feuerh\xFCter") || this.role.includes("Sadhu")) {
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "bless_camp");
        return;
      }
      const fireTile = map2[CAMP_CENTER.y] && map2[CAMP_CENTER.y][CAMP_CENTER.x];
      const fireExists = fireTile && fireTile.type === "fire" && (fireTile.fire?.intensity > 15 || fireState.intensity > 15);
      if (!fireExists && campfireStock.wood > 0) {
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "rekindle_fire");
        return;
      }
      const currentIntensity = fireTile && fireTile.fire ? fireTile.fire.intensity : fireState.intensity;
      const stokeThreshold = seasonState.isWinter ? 65 : 50;
      if (currentIntensity < stokeThreshold && campfireStock.wood > 0) {
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "stoke_fire");
        return;
      }
      if ((this.injuredTimer > 0 || this.sickTimer > 0) && fireExists) {
        this.seekShelterOrFire(map2, humans2);
        return;
      }
      let damagedShelter = null;
      let totalShelterCapacity = 0;
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          const t = map2[y][x];
          if (t.type === "shelter") {
            const cond = t.shelter ? t.shelter.condition : 100;
            if (cond > 15) {
              totalShelterCapacity += t.shelter?.capacity || SHELTER_CONFIG.capacity;
            }
            if (cond < SHELTER_CONFIG.repairThreshold && !damagedShelter) {
              damagedShelter = { x, y };
            }
          }
        }
      }
      if (damagedShelter && campfireStock.wood >= 1) {
        this.setMoveTarget(map2, damagedShelter.x, damagedShelter.y, "repair_shelter");
        return;
      }
      const livingClanSize = humans2.filter((h) => h.isAlive).length;
      const inConstruction = humans2.filter((h) => h.isAlive && (h.actionIntent === "build_shelter" || h.state === "building")).length;
      const projectedCapacity = totalShelterCapacity + inConstruction * SHELTER_CONFIG.capacity;
      if (projectedCapacity < livingClanSize && fireExists) {
        if (campfireStock.wood >= 2 && campfireStock.stone >= 1) {
          const freeSpot = this.findFreeShelterSpot(map2, humans2);
          if (freeSpot) {
            this.setMoveTarget(map2, freeSpot.x, freeSpot.y, "build_shelter");
            return;
          }
        }
      }
      if (campfireStock.stone < 3) {
        const rock = this.findNearestTile(map2, "rock");
        if (rock) {
          this.setMoveTarget(map2, rock.x, rock.y, "mine_rock");
          return;
        }
      }
      const targetWoodStock = seasonState.isAutumn || seasonState.isWinter ? 8 : 5;
      if (campfireStock.wood < targetWoodStock) {
        const tree = this.findNearestAdultTree(map2);
        if (tree) {
          this.setMoveTarget(map2, tree.x, tree.y, "chop_tree");
          return;
        }
      }
      const targetFoodStock = seasonState.isAutumn || seasonState.isWinter ? 9 : 6;
      if (campfireStock.food < targetFoodStock) {
        const bush = findNearestBushWithBerries(map2, this.x, this.y);
        if (bush) {
          this.setMoveTarget(map2, bush.x, bush.y, "haul_food");
          return;
        }
        if (this.ageYears >= 12) {
          const fishSpot = findNearestFishingSpot(map2, this.x, this.y);
          if (fishSpot) {
            this.setMoveTarget(map2, fishSpot.x, fishSpot.y, "fish_river");
            return;
          }
        }
        const rootSpot = findNearestRootDigSpot(map2, this.x, this.y);
        if (rootSpot) {
          this.setMoveTarget(map2, rootSpot.x, rootSpot.y, "dig_roots");
          return;
        }
        if (this.ageYears >= 12 && animals2 && animals2.some((a) => a.isAlive)) {
          this.seekHunt(animals2, map2);
          return;
        }
      }
      if (campfireStock.water < 4) {
        const shoreTile = findNearestShoreTile(map2, this.x, this.y);
        if (shoreTile) {
          this.setMoveTarget(map2, shoreTile.x, shoreTile.y, "haul_water");
          return;
        }
      }
      this.wander(map2);
    },
    wander(map2) {
      const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
      const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
      if (map2[ry] && map2[ry][rx] && (map2[ry][rx].type !== "water" || map2[ry][rx].isFord)) {
        this.setMoveTarget(map2, rx, ry, "idle");
      }
    },
    wanderNearCamp(map2) {
      const rx = Math.max(1, Math.min(MAP_SIZE - 2, CAMP_CENTER.x + Math.floor((Math.random() - 0.5) * 8)));
      const ry = Math.max(1, Math.min(MAP_SIZE - 2, CAMP_CENTER.y + Math.floor((Math.random() - 0.5) * 8)));
      if (isTileWalkable(map2, rx, ry)) {
        this.setMoveTarget(map2, rx, ry, "explore");
      }
    },
    // Kompatibilitäts-Delegationen auf zentrale Suchfunktionen in foraging.js
    findNearestTile(map2, type) {
      return findNearestTile(map2, this.x, this.y, type);
    },
    findNearestBushWithBerries(map2) {
      return findNearestBushWithBerries(map2, this.x, this.y);
    },
    findNearestAdultTree(map2) {
      return findNearestAdultTree(map2, this.x, this.y);
    },
    isNearLitFire(map2) {
      return isPositionNearLitFire(map2, this.x, this.y);
    },
    findNearestLitFire(map2) {
      return findNearestLitFireTile(map2, this.x, this.y);
    },
    findFreeShelterSpot(map2, humans2 = []) {
      return findFreeShelterSpotNearCamp(map2, humans2);
    }
  };

  // src/human/actions.js
  var humanActionMethods = {
    onArrived(map2, humans2, animals2, logEvent2) {
      if (this.actionIntent === "hunt_animal") {
        if (this.huntTarget && this.huntTarget.isAlive) {
          this.state = "hunting";
          this.stateTimer = 2.5;
        } else {
          this.state = "idle";
        }
      } else if (this.actionIntent === "relieve") {
        this.state = "relieving";
        this.stateTimer = 3;
      } else if (this.actionIntent === "drink_source") {
        this.state = "drinking";
        this.stateTimer = 2.5;
      } else if (this.actionIntent === "drink_stock") {
        if (campfireStock.water > 0) campfireStock.water--;
        this.needs.water = 100;
        this.state = "idle";
      } else if (this.actionIntent === "eat_bush") {
        const tile = map2[Math.round(this.y)][Math.round(this.x)];
        if (tile && tile.plant && tile.plant.berries > 0) {
          tile.plant.berries--;
          this.state = "foraging";
          this.stateTimer = 3;
          this.needs.food = Math.min(100, this.needs.food + 55);
        } else {
          this.state = "idle";
        }
      } else if (this.actionIntent === "eat_stock") {
        if (campfireStock.food > 0) {
          campfireStock.food--;
          if (fireState.intensity > 20) {
            this.needs.food = 100;
            this.needs.energy = Math.min(100, this.needs.energy + 15);
          } else {
            this.needs.food = Math.min(100, this.needs.food + 65);
            if (this.sickTimer <= 0 && Math.random() < 0.2) {
              this.sickTimer = 22;
              logEvent2(`\u{1F922} ${this.name} hat ungegartes Essen aus dem kalten Lager gegessen und leidet an Magenparasiten!`);
            }
          }
        }
        this.state = "idle";
      } else if (this.actionIntent === "mine_rock") {
        this.state = "mining";
        this.stateTimer = 4;
      } else if (this.actionIntent === "chop_tree") {
        this.state = "chopping";
        this.stateTimer = 4.5;
      } else if (this.actionIntent === "dig_roots") {
        this.state = "digging";
        this.stateTimer = 3.2;
      } else if (this.actionIntent === "fish_river") {
        this.state = "fishing";
        this.stateTimer = 4;
      } else if (this.actionIntent === "haul_food") {
        const tile = map2[Math.round(this.y)][Math.round(this.x)];
        if (tile && tile.plant && tile.plant.berries > 0) {
          tile.plant.berries--;
          this.carried = "\u{1F347} Beeren";
          this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
        } else {
          this.state = "idle";
        }
      } else if (this.actionIntent === "haul_water") {
        this.carried = "\u{1F4A7} Wasser";
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
      } else if (this.actionIntent === "build_shelter") {
        this.state = "building";
        this.stateTimer = 6;
      } else if (this.actionIntent === "repair_shelter") {
        this.state = "repairing";
        this.stateTimer = 4;
      } else if (this.actionIntent === "stoke_fire") {
        if (campfireStock.wood > 0) {
          campfireStock.wood--;
          const gx = Math.round(this.x);
          const gy = Math.round(this.y);
          const fTile = map2[gy] && map2[gy][gx];
          if (fTile && fTile.type === "fire") {
            if (!fTile.fire) fTile.fire = { intensity: 50, woodBurnTimer: 0, wood: 0, isCampCenter: gx === CAMP_CENTER.x && gy === CAMP_CENTER.y };
            fTile.fire.intensity = Math.min(100, fTile.fire.intensity + 45);
            if (fTile.fire.isCampCenter) fireState.intensity = fTile.fire.intensity;
          } else {
            fireState.intensity = Math.min(100, fireState.intensity + 45);
          }
          this.utilityContributed += 15;
          logEvent2(`\u{1F525} ${this.name} hat Holz nachgelegt und das Feuer gesch\xFCrt!`);
        }
        this.state = "idle";
      } else if (this.actionIntent === "rekindle_fire") {
        if (campfireStock.wood > 0) {
          campfireStock.wood--;
          const gx = Math.round(this.x);
          const gy = Math.round(this.y);
          if (map2[gy] && map2[gy][gx]) {
            map2[gy][gx].type = "fire";
            map2[gy][gx].plant = null;
            map2[gy][gx].fire = {
              intensity: 85,
              woodBurnTimer: 0,
              wood: 0,
              isCampCenter: gx === CAMP_CENTER.x && gy === CAMP_CENTER.y
            };
          }
          fireState.intensity = 85;
          this.utilityContributed += 35;
          logEvent2(`\u2728 ${this.name} hat mit Faustkeilen Funken geschlagen und das Stammesfeuer entfacht!`);
        }
        this.state = "idle";
      } else if (this.actionIntent === "deliver_stock") {
        if (this.carried === "\u{1FAA8} Stein") {
          campfireStock.stone++;
          this.utilityContributed += 15;
        } else if (this.carried === "\u{1FAB5} Holz") {
          campfireStock.wood++;
          this.utilityContributed += 12;
        } else if (this.carried === "\u{1F347} Beeren") {
          campfireStock.food++;
          this.utilityContributed += 8;
        } else if (this.carried === "\u{1F954} Wurzelknollen") {
          campfireStock.food += 2;
          this.utilityContributed += 10;
          logEvent2(`\u{1F954} ${this.name} liefert nahrhafte Knollen/Wurzeln (+2 Vorrat).`);
        } else if (this.carried === "\u{1F41F} Flussfisch") {
          campfireStock.food += 2;
          this.utilityContributed += 12;
          logEvent2(`\u{1F41F} ${this.name} bringt frischen Fisch ans Lagerfeuer (+2 Vorrat).`);
        } else if (this.carried === "\u{1F4A7} Wasser") {
          campfireStock.water++;
          this.utilityContributed += 8;
        } else if (this.carried === "\u{1F969} Wildbret") {
          const yieldAmt = this.lastMeatYield || 5;
          campfireStock.food += yieldAmt;
          this.utilityContributed += yieldAmt * 5;
          logEvent2(`\u{1F356} ${this.name} bringt frisches Fleisch ins Lager! Vorrat +${yieldAmt}.`);
        }
        this.carried = null;
        this.state = "idle";
      } else if (this.actionIntent === "rest_shelter") {
        this.state = "resting";
        this.stateTimer = 5;
        this.needs.energy = Math.min(100, this.needs.energy + 85);
      } else if (this.actionIntent === "rest_fire") {
        this.state = "resting";
        this.stateTimer = 5;
        this.needs.energy = Math.min(100, this.needs.energy + 50);
      } else if (this.actionIntent === "approach_mate") {
        this.state = "mating";
        this.stateTimer = 4;
        if (this.mateTarget) {
          this.mateTarget.state = "mating";
          this.mateTarget.stateTimer = 4;
        }
      } else if (this.actionIntent === "bless_camp") {
        this.state = "resting";
        this.stateTimer = 5;
        for (const h of humans2) {
          if (h.isAlive && Math.hypot(h.x - CAMP_CENTER.x, h.y - CAMP_CENTER.y) < 5) {
            h.needs.energy = Math.min(100, h.needs.energy + 25);
          }
        }
        this.utilityContributed += 5;
      } else if (this.actionIntent === "sit_campfire") {
        this.state = "socializing";
        this.stateTimer = 10 + Math.random() * 8;
        const peersAtFire = humans2.filter(
          (h) => h.id !== this.id && h.isAlive && h.state === "socializing" && Math.hypot(h.x - CAMP_CENTER.x, h.y - CAMP_CENTER.y) < 3.2
        );
        if (peersAtFire.length > 0 && Math.random() < 0.4) {
          logEvent2(`\u{1F525} ${this.name} gesellt sich zu ${peersAtFire[0].name} ans Feuer. Sie w\xE4rmen sich und teilen Laute.`);
        }
      } else if (this.actionIntent === "play") {
        this.state = "playing";
        this.stateTimer = 4 + Math.random() * 3;
      } else if (this.actionIntent === "explore") {
        this.state = "idle";
      } else {
        this.state = "idle";
      }
    },
    finishAction(map2, animals2, logEvent2) {
      if (this.state === "hunting") {
        if (this.huntTarget) {
          const meat = this.huntTarget.meatYield || 5;
          const aName = this.huntTarget.name || "Wild";
          this.huntTarget.isAlive = false;
          this.carried = "\u{1F969} Wildbret";
          this.lastMeatYield = meat;
          spookWildlife(90);
          this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
          logEvent2(`\u{1F3F9} ${this.name} hat ein ${aName} erlegt! Er tr\xE4gt das Fleisch (${meat} Vorrat) ins Lager.`);
          return;
        }
      } else if (this.state === "digging") {
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        const t = map2[gy] && map2[gy][gx];
        if (t) {
          t.roots = Math.max(0, (t.roots || 1) - 1);
        }
        this.carried = "\u{1F954} Wurzelknollen";
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
        logEvent2(`\u{1F954} ${this.name} hat nahrhafte Wurzelknollen ausgegraben.`);
        return;
      } else if (this.state === "fishing") {
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        const neighbors = [
          map2[gy - 1] && map2[gy - 1][gx],
          map2[gy + 1] && map2[gy + 1][gx],
          map2[gy] && map2[gy][gx - 1],
          map2[gy] && map2[gy][gx + 1]
        ];
        const wTile = neighbors.find((n) => n && n.type === "water" && (n.fishStock === void 0 || n.fishStock > 0));
        if (wTile && typeof wTile.fishStock === "number") {
          wTile.fishStock = Math.max(0, wTile.fishStock - 1);
          if (wTile.fishStock === 0) {
            logEvent2(`\u{1F41F} ${this.name} hat den letzten Fisch an dieser Stelle erbeutet! (\xDCberfischt)`);
          } else {
            logEvent2(`\u{1F41F} ${this.name} hat am Flussufer einen Fisch erbeutet!`);
          }
        } else {
          logEvent2(`\u{1F41F} ${this.name} hat am Flussufer einen Fisch erbeutet!`);
        }
        this.carried = "\u{1F41F} Flussfisch";
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
        return;
      } else if (this.state === "relieving") {
        this.needs.bladder = 0;
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        if (map2[gy] && map2[gy][gx]) {
          map2[gy][gx].poop = { timer: 30, seed: true };
          logEvent2(`\u{1F4A9} ${this.name} hat sich am Rand erleichtert.`);
        }
      } else if (this.state === "drinking") {
        this.needs.water = 100;
      } else if (this.state === "foraging") {
        this.needs.food = 100;
      } else if (this.state === "mining") {
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        const t = map2[gy] && map2[gy][gx];
        if (t && t.type === "rock") {
          if (typeof t.stoneStock !== "number") {
            t.stoneStock = 8;
            t.maxStoneStock = 8;
          }
          t.stoneStock--;
          if (t.stoneStock <= 0) {
            t.type = "grass";
            t.stoneStock = 0;
            logEvent2(`\u{1FAA8} Ein Felsen bei [${gx}, ${gy}] ist durch steten Abbau zu Schotter abgetragen.`);
          }
        }
        this.carried = "\u{1FAA8} Stein";
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
        return;
      } else if (this.state === "chopping") {
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        const t = map2[gy] && map2[gy][gx];
        if (t && t.plant && t.plant.type === "tree") {
          t.plant.woodStock--;
          if (t.plant.woodStock <= 0) {
            if (Math.random() < 0.45) {
              t.plant = {
                type: "tree",
                stage: 1,
                growthTimer: 0,
                woodStock: 3,
                seedVariance: Math.random(),
                maxAge: 900 + Math.random() * 600,
                ageTimer: 0
              };
              logEvent2(`\u{1F331} Baumstumpf treibt neu aus (Stockausschlag) bei [${gx}, ${gy}].`);
            } else {
              t.plant = null;
            }
          }
        }
        this.carried = "\u{1FAB5} Holz";
        this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
        return;
      } else if (this.state === "building") {
        campfireStock.stone = Math.max(0, campfireStock.stone - 1);
        campfireStock.wood = Math.max(0, campfireStock.wood - 2);
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        if (map2[gy] && map2[gy][gx]) {
          map2[gy][gx].type = "shelter";
          map2[gy][gx].plant = null;
          map2[gy][gx].shelter = { condition: 100, capacity: SHELTER_CONFIG.capacity };
        }
        this.utilityContributed += 40;
        logEvent2(`\u26FA Schutzh\xFCtte errichtet (Platz f\xFCr 2)!`);
      } else if (this.state === "repairing") {
        if (campfireStock.wood > 0) campfireStock.wood--;
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        if (map2[gy] && map2[gy][gx] && map2[gy][gx].type === "shelter") {
          if (!map2[gy][gx].shelter) map2[gy][gx].shelter = { condition: 100, capacity: SHELTER_CONFIG.capacity };
          else map2[gy][gx].shelter.condition = 100;
          this.utilityContributed += 20;
          logEvent2(`\u{1F528} ${this.name} hat die Schutzh\xFCtte ausgebessert und gewartet.`);
        }
      } else if (this.state === "mating") {
        this.needs.libido = 0;
        if (this.gender === "f") {
          this.pregnancyTimer = 14;
          logEvent2(`\u2764\uFE0F ${this.name} erwartet Nachwuchs.`);
        } else if (this.mateTarget) {
          this.mateTarget.needs.libido = 0;
          this.mateTarget.pregnancyTimer = 14;
        }
      } else if (this.state === "playing") {
        this.needs.energy = Math.min(100, this.needs.energy + 10);
      } else if (this.state === "socializing") {
        this.needs.energy = Math.min(100, this.needs.energy + 12);
        this.utilityContributed += 2;
      }
      this.state = "idle";
    }
  };

  // src/human/social.js
  var nextId = 4;
  function allocNextHumanId() {
    return nextId++;
  }
  var FEMALE_NAMES = [
    "Nyx",
    "Kora",
    "Vana",
    "Sula",
    "Eila",
    "Mira",
    "Tala",
    "Rhea",
    "Ayla",
    "Sunita",
    "Brena",
    "Zaya",
    "Ona",
    "Yara",
    "Nesta",
    "Luma",
    "Dara",
    "Saga",
    "Thora"
  ];
  var MALE_NAMES = [
    "Einar",
    "Dagan",
    "Krag",
    "Toruk",
    "Boran",
    "Alok",
    "Jaro",
    "Bran",
    "Tark",
    "Vorn",
    "Raban",
    "Korm",
    "Hagan",
    "Wulf",
    "Gorm"
  ];
  var humanSocialMethods = {
    seekCampfireCircle(map2, humans2, logEvent2) {
      const candidates = [];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const d = Math.hypot(dx, dy);
          if (d >= 1 && d <= 2.2) {
            const tx = CAMP_CENTER.x + dx;
            const ty = CAMP_CENTER.y + dy;
            if (isTileWalkable(map2, tx, ty)) {
              const occupied = humans2.some((h) => h.isAlive && Math.hypot(h.x - tx, h.y - ty) < 0.6);
              if (!occupied) {
                candidates.push({ x: tx, y: ty });
              }
            }
          }
        }
      }
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return this.setMoveTarget(map2, chosen.x, chosen.y, "sit_campfire");
      }
      return false;
    },
    chatWithPeer(peer, logEvent2) {
      this.state = "socializing";
      this.actionIntent = "chat";
      this.stateTimer = 4 + Math.random() * 3;
      peer.state = "socializing";
      peer.actionIntent = "chat";
      peer.stateTimer = this.stateTimer;
      peer.path = [];
      this.needs.energy = Math.min(100, this.needs.energy + 8);
      peer.needs.energy = Math.min(100, peer.needs.energy + 8);
      if (Math.random() < 0.35) {
        logEvent2(`\u{1F5E3}\uFE0F ${this.name} und ${peer.name} halten inne und tauschen Laute aus.`);
      }
    },
    playWithPeer(friend, map2, logEvent2) {
      const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(friend.x + (Math.random() - 0.5) * 4)));
      const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(friend.y + (Math.random() - 0.5) * 4)));
      if (isTileWalkable(map2, rx, ry)) {
        this.setMoveTarget(map2, rx, ry, "play");
        this.needs.energy = Math.min(100, this.needs.energy + 5);
        if (Math.random() < 0.2) {
          logEvent2(`\u{1F9D2} ${this.name} und ${friend.name} spielen ausgelassen Fangen im Lager.`);
        }
      }
    },
    giveBirth(humans2, logEvent2) {
      const living = humans2.filter((h) => h.isAlive);
      const mCount = living.filter((h) => h.gender === "m").length;
      const fCount = living.filter((h) => h.gender === "f").length;
      let boyChance = 0.5;
      if (mCount < fCount) boyChance = 0.65;
      else if (fCount < mCount) boyChance = 0.35;
      const babyGender = Math.random() < boyChance ? "m" : "f";
      const pool = babyGender === "m" ? MALE_NAMES : FEMALE_NAMES;
      const babyName = pool[Math.floor(Math.random() * pool.length)];
      const babyTint = babyGender === "m" ? "#ea580c" : "#0ea5e9";
      this.nursingTimer = 50;
      const HumanClass = this.constructor;
      const baby = new HumanClass(allocNextHumanId(), babyName, babyGender, "S\xE4ugling / Tragling", this.x + 0.1, this.y + 0.1, babyTint, 0);
      baby.motherId = this.id;
      humans2.push(baby);
      logEvent2(`\u{1F476} Geburt! ${babyGender === "m" ? "Junge" : "M\xE4dchen"} ${babyName} wird von Mutter ${this.name} getragen.`);
    }
  };

  // src/human.js
  var Human = class {
    constructor(id, name, gender, role, x, y, tint, ageYears = 24) {
      this.id = id;
      this.name = name;
      this.gender = gender;
      this.role = role;
      this.x = x;
      this.y = y;
      this.targetX = x;
      this.targetY = y;
      this.tint = tint;
      this.motherId = null;
      this.ageYears = ageYears;
      this.maxAgeYears = 42 + Math.random() * 13;
      this.isAlive = true;
      this.needs = {
        water: 75 + Math.random() * 15,
        food: 80 + Math.random() * 10,
        energy: 90 + Math.random() * 10,
        bladder: 20 + Math.random() * 25,
        libido: 20 + Math.random() * 20
      };
      this.carried = null;
      this.utilityContributed = 0;
      this.pregnancyTimer = 0;
      this.nursingTimer = 0;
      this.injuredTimer = 0;
      this.sickTimer = 0;
      this.state = "idle";
      this.stateTimer = 0;
      this.path = [];
      this.stepAccum = 0;
      this.nextFootLeft = false;
    }
    setMoveTarget(map2, tx, ty, intent, huntTarget = null) {
      this.targetX = tx;
      this.targetY = ty;
      this.actionIntent = intent;
      this.huntTarget = huntTarget;
      const p = findPath(map2, this.x, this.y, tx, ty);
      if (!p) {
        this.path = [];
        this.state = "idle";
        this.actionIntent = "idle";
        this.huntTarget = null;
        return false;
      }
      if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) {
        p.shift();
      }
      this.path = p;
      this.state = "moving";
      return true;
    }
    update(dt, map2, humans2, animals2, logEvent2) {
      if (!this.isAlive) {
        if (dt > 0) {
          this.timeSinceDeathYears = (this.timeSinceDeathYears || 0) + dt / SECONDS_PER_YEAR;
        }
        return;
      }
      const prevAge = this.ageYears;
      this.ageYears += dt / SECONDS_PER_YEAR;
      if (prevAge < 4 && this.ageYears >= 4) {
        this.role = "Kind (Heranwachsend)";
        logEvent2(`\u{1F9D2} ${this.name} ist 4 Jahre alt geworden und erkundet nun spielerisch das Lager!`);
      }
      if (prevAge < 12 && this.ageYears >= 12 && this.role.includes("Kind")) {
        this.role = this.gender === "m" ? "J\xE4ger / Steinklopfer" : "Sammlerin & H\xFCterin";
        logEvent2(`\u2728 ${this.name} hat das 12. Lebensjahr erreicht und arbeitet nun vollwertig f\xFCr den Klan.`);
      }
      if (this.needs.water <= 0) {
        this.die("verdurstet (Wassermangel)", logEvent2);
        return;
      }
      if (this.needs.food <= 0) {
        this.die("verhungert (Nahrungsentzug)", logEvent2);
        return;
      }
      if (this.ageYears >= this.maxAgeYears) {
        this.die("biologisches Alterungsmaximum erreicht", logEvent2);
        return;
      }
      if (this.ageYears < 4) {
        this.role = "S\xE4ugling / Tragling";
        this.carried = null;
        let mother = humans2.find((h) => h.id === this.motherId && h.isAlive);
        if (!mother) {
          mother = humans2.find((h) => h.isAlive && h.gender === "f" && h.ageYears >= 13);
          if (mother) this.motherId = mother.id;
        }
        if (mother) {
          this.x = mother.x + 0.12;
          this.y = mother.y + 0.08;
          this.state = mother.state === "moving" ? "moving" : "resting";
          this.actionIntent = "with_mother";
          this.path = [];
          this.needs.water = Math.max(this.needs.water, 75);
          this.needs.food = Math.max(this.needs.food, 75);
          this.needs.energy = Math.max(this.needs.energy, 70);
          this.needs.libido = 0;
          mother.needs.water = Math.max(0, mother.needs.water - dt * 0.12);
          mother.needs.food = Math.max(0, mother.needs.food - dt * 0.1);
          mother.nursingTimer = 5;
        } else {
          this.x = CAMP_CENTER.x;
          this.y = CAMP_CENTER.y;
          this.state = "resting";
        }
        return;
      }
      const nearLitFire = this.isNearLitFire(map2);
      const isCold = !nearLitFire;
      const inShelter = this.state === "resting" && this.actionIntent === "rest_shelter";
      let coldPenalty = 1;
      if (isCold) {
        if (seasonState.isWinter) {
          coldPenalty = inShelter ? 1.4 : 1.95;
        } else if (seasonState.isAutumn) {
          coldPenalty = inShelter ? 1.3 : 1.72;
        } else {
          coldPenalty = inShelter ? 1.2 : 1.55;
        }
      }
      const healRate = nearLitFire || inShelter ? 1.8 : 0.75;
      if (this.injuredTimer > 0) {
        this.injuredTimer = Math.max(0, this.injuredTimer - dt * healRate);
      }
      if (this.sickTimer > 0) {
        this.sickTimer = Math.max(0, this.sickTimer - dt * healRate);
      }
      if (seasonState.isWinter && isCold && !inShelter && this.needs.energy < 22 && this.sickTimer <= 0 && Math.random() < 0.015 * dt) {
        this.sickTimer = 22;
        logEvent2(`\u{1F912} ${this.name} hat sich in der eisigen Winterk\xE4lte ohne Feuer stark verk\xFChlt!`);
      }
      const bodyScale = this.ageYears < 13 ? 0.55 : 1;
      const isSocializing = this.state === "socializing";
      const sickPenalty = this.sickTimer > 0 ? 1.25 : 1;
      const energyMod = isSocializing ? -2.2 : 0.25 * coldPenalty * sickPenalty;
      this.needs.water = Math.max(0, this.needs.water - dt * (0.75 * bodyScale * sickPenalty));
      this.needs.food = Math.max(0, this.needs.food - dt * (0.45 * coldPenalty * bodyScale * (isSocializing ? 0.6 : 1)));
      this.needs.energy = Math.min(100, Math.max(0, this.needs.energy - dt * energyMod));
      this.needs.bladder = Math.min(100, this.needs.bladder + dt * 0.8);
      if (this.nursingTimer > 0) {
        this.nursingTimer -= dt;
      }
      const carriesInfant = this.gender === "f" && humans2.some((h) => h.isAlive && h.motherId === this.id && h.ageYears < 4);
      if (this.ageYears >= 13 && this.ageYears <= 48 && this.needs.water > 40 && this.needs.food > 40 && this.nursingTimer <= 0 && !carriesInfant && this.pregnancyTimer <= 0) {
        this.needs.libido = Math.min(100, this.needs.libido + dt * 2.2);
      } else {
        this.needs.libido = Math.max(0, this.needs.libido - dt * 0.5);
      }
      if (this.pregnancyTimer > 0) {
        this.pregnancyTimer -= dt;
        if (this.pregnancyTimer <= 0) {
          this.giveBirth(humans2, logEvent2);
        }
      }
      if (this.state === "migrating") {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        const speed = 1.25 * dt;
        if (dist <= speed) {
          this.x = this.targetX;
          this.y = this.targetY;
        } else {
          this.x += dx / dist * speed;
          this.y += dy / dist * speed;
        }
        return;
      }
      if (this.state === "idle") {
        if (this.carried) {
          this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
          return;
        }
        if (this.ageYears < 12) {
          if (this.needs.bladder > 85) {
            this.seekRelief(map2);
            return;
          }
          if (this.needs.water < 55) {
            this.seekWater(map2);
            return;
          }
          if (this.needs.food < 50) {
            this.seekFood(map2);
            return;
          }
          if (this.needs.energy < 25) {
            this.seekShelterOrFire(map2, humans2);
            return;
          }
          const peers = humans2.filter((h) => h.id !== this.id && h.isAlive && h.ageYears >= 4 && h.ageYears < 12);
          if (peers.length > 0 && Math.random() < 0.72) {
            const friend = peers[Math.floor(Math.random() * peers.length)];
            this.playWithPeer(friend, map2, logEvent2);
            return;
          }
          if (this.ageYears >= 8) {
            const hare = animals2.find((a) => a.isAlive && a.species === "hare");
            if (hare && Math.random() < 0.35) {
              this.setMoveTarget(map2, hare.x, hare.y, "hunt_animal", hare);
              return;
            }
            if (Math.random() < 0.4) {
              const rootSpot = findNearestRootDigSpot(map2, this.x, this.y);
              if (rootSpot) {
                this.setMoveTarget(map2, rootSpot.x, rootSpot.y, "dig_roots");
                return;
              }
            }
          }
          if (Math.random() < 0.35) {
            const bush = this.findNearestBushWithBerries(map2);
            if (bush && Math.hypot(bush.x - CAMP_CENTER.x, bush.y - CAMP_CENTER.y) < 8) {
              this.setMoveTarget(map2, bush.x, bush.y, "gather_berries");
              return;
            }
          }
          this.wanderNearCamp(map2);
          return;
        }
        if (this.needs.bladder > 85) {
          this.seekRelief(map2);
        } else if (this.needs.water < 55) {
          this.seekWater(map2);
        } else if (this.needs.food < 50) {
          this.seekFood(map2, animals2);
        } else if (this.needs.energy < 25) {
          this.seekShelterOrFire(map2, humans2);
        } else if (this.role.includes("J\xE4ger") && animals2.length > 0) {
          this.seekHunt(animals2, map2);
        } else if (this.needs.libido > 50 && this.gender === "m") {
          this.seekMate(humans2, map2);
        } else if (this.needs.water > 55 && this.needs.food > 55) {
          if (fireState.intensity > 15 && Math.random() < 0.45) {
            if (this.seekCampfireCircle(map2, humans2, logEvent2)) return;
          }
          const nearbyPeer = humans2.find((h) => h.id !== this.id && h.isAlive && h.state === "idle" && Math.hypot(h.x - this.x, h.y - this.y) < 1.8);
          if (nearbyPeer && Math.random() < 0.35) {
            this.chatWithPeer(nearbyPeer, logEvent2);
            return;
          }
          this.seekProductiveTask(map2, humans2, animals2);
        } else {
          this.wander(map2);
        }
      }
      if (this.state === "moving") {
        if (this.actionIntent === "hunt_animal" && this.huntTarget) {
          if (!this.huntTarget.isAlive) {
            this.state = "idle";
            this.actionIntent = "idle";
            this.huntTarget = null;
            this.path = [];
            return;
          }
          this.targetX = this.huntTarget.x;
          this.targetY = this.huntTarget.y;
          this.needs.energy = Math.max(0, this.needs.energy - dt * 0.4);
          this.needs.water = Math.max(0, this.needs.water - dt * 0.3);
          const distToTarget = Math.hypot(this.huntTarget.x - this.x, this.huntTarget.y - this.y);
          if (distToTarget <= 1.25) {
            this.x = this.huntTarget.x;
            this.y = this.huntTarget.y;
            const meat = this.huntTarget.meatYield || 5;
            const aIcon = this.huntTarget.icon || "\u{1F98C}";
            const aName = this.huntTarget.name || "Wildtier";
            const species = this.huntTarget.species || "deer";
            const backupHunter = humans2.find(
              (h) => h.id !== this.id && h.isAlive && h.ageYears >= 12 && Math.hypot(h.x - this.x, h.y - this.y) <= 5
            );
            let injuryRisk = 0;
            if (species === "bison") injuryRisk = backupHunter ? 0.04 : 0.28;
            else if (species === "boar") injuryRisk = backupHunter ? 0.03 : 0.18;
            this.huntTarget.isAlive = false;
            this.carried = "\u{1F969} Wildbret";
            this.lastMeatYield = meat;
            this.huntTarget = null;
            this.utilityContributed += meat * 5;
            if (backupHunter) backupHunter.utilityContributed += 10;
            spookWildlife(90);
            if (Math.random() < injuryRisk) {
              this.injuredTimer = 26;
              this.needs.energy = Math.max(10, this.needs.energy - 25);
              logEvent2(`\u{1FA78} ${this.name} hat ${aIcon} ${aName} allein erlegt, wurde aber im Nahkampf verwundet und humpelt!`);
            } else if (backupHunter && (species === "bison" || species === "boar")) {
              logEvent2(`\u{1F3F9}\u{1F91D} Kooperationsjagd! ${this.name} und ${backupHunter.name} erlegen gemeinsam ${aIcon} ${aName} (+${meat} Fleisch)!`);
            } else {
              logEvent2(`\u{1F3F9} ${this.name} hat ${aIcon} ${aName} erlegt! (+${meat} Fleisch f\xFCrs Lager)`);
            }
            this.setMoveTarget(map2, CAMP_CENTER.x, CAMP_CENTER.y, "deliver_stock");
            return;
          }
          const lastWp = this.path && this.path[this.path.length - 1];
          if (!lastWp || Math.hypot(this.huntTarget.x - lastWp.x, this.huntTarget.y - lastWp.y) > 2) {
            const p = findPath(map2, this.x, this.y, this.huntTarget.x, this.huntTarget.y);
            if (p) {
              if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) p.shift();
              this.path = p;
            } else {
              this.state = "idle";
              this.actionIntent = "idle";
              this.huntTarget = null;
              this.path = [];
              return;
            }
          }
          if (this.needs.energy < 18 || this.needs.food < 28 || this.needs.water < 28) {
            this.state = "idle";
            this.actionIntent = "idle";
            this.huntTarget = null;
            this.path = [];
            logEvent2(`\u{1F62E}\u200D\u{1F4A8} ${this.name} bricht die Jagd rechtzeitig ab, um nicht zu entkr\xE4ften.`);
            return;
          }
        }
        if (this.actionIntent === "deliver_stock" && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) <= 1.5) {
          this.path = [];
          this.onArrived(map2, humans2, animals2, logEvent2);
          return;
        }
        if (!this.path || this.path.length === 0) {
          const distToEnd = Math.hypot(this.targetX - this.x, this.targetY - this.y);
          if (distToEnd <= 0.4) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.onArrived(map2, humans2, animals2, logEvent2);
          } else {
            const p = findPath(map2, this.x, this.y, this.targetX, this.targetY);
            if (p && p.length > 0) {
              if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) p.shift();
              this.path = p;
            } else {
              this.state = "idle";
              this.actionIntent = "idle";
              this.path = [];
            }
          }
          return;
        }
        const targetWp = this.path[0];
        if (!isTileWalkable(map2, targetWp.x, targetWp.y)) {
          const p = findPath(map2, this.x, this.y, this.targetX, this.targetY);
          if (p && p.length > 0) {
            if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) p.shift();
            this.path = p;
          } else {
            this.state = "idle";
            this.actionIntent = "idle";
            this.path = [];
          }
          return;
        }
        const dx = targetWp.x - this.x;
        const dy = targetWp.y - this.y;
        const dist = Math.hypot(dx, dy);
        const cx = Math.round(this.x);
        const cy = Math.round(this.y);
        const curTile = map2[cy] && map2[cy][cx];
        const onPath = Boolean(curTile && (curTile.type === "path" || curTile.trample && curTile.trample >= 35));
        const inWater = curTile && curTile.type === "water";
        if (curTile) {
          if (!curTile.plant && curTile.type !== "rock" && curTile.type !== "fire" && curTile.type !== "shelter" && curTile.type !== "water") {
            curTile.trample = Math.min(100, (curTile.trample || 0) + dt * 14);
          } else if (curTile.plant) {
            curTile.trample = 0;
          }
        }
        let terrainFactor = 1;
        if (onPath) terrainFactor = 1.45;
        else if (inWater) terrainFactor = 0.65;
        const hasInfant = humans2.some((h) => h.isAlive && h.motherId === this.id && h.ageYears < 4);
        const infantSpeedFactor = hasInfant ? 0.72 : 1;
        const isHuntingSprint = this.actionIntent === "hunt_animal";
        const sprintFactor = isHuntingSprint ? 1.45 : 1;
        const injuryFactor = this.injuredTimer > 0 ? 0.55 : 1;
        const speed = terrainFactor * sprintFactor * infantSpeedFactor * injuryFactor * (this.ageYears > 40 ? 0.78 : 1) * dt;
        const stepDist = Math.min(dist, speed);
        this.stepAccum = (this.stepAccum || 0) + stepDist;
        if (this.stepAccum >= 0.3 && curTile && (curTile.type === "grass" || curTile.type === "path") && !curTile.plant) {
          this.stepAccum = 0;
          this.nextFootLeft = !this.nextFootLeft;
          if (!curTile.footprints) curTile.footprints = [];
          if (curTile.footprints.length >= 20) curTile.footprints.shift();
          const sdx = dx - dy;
          const sdy = (dx + dy) * 0.5;
          const screenAngle = Math.atan2(sdy, sdx);
          const fx = this.x - cx;
          const fy = this.y - cy;
          const sideSign = this.nextFootLeft ? -1 : 1;
          const perpX = -Math.sin(screenAngle) * 2.2 * sideSign;
          const perpY = Math.cos(screenAngle) * 1.4 * sideSign;
          const lx = Math.max(-18, Math.min(18, (fx - fy) * 16 + perpX + (Math.random() - 0.5) * 7.5));
          const ly = Math.max(-9, Math.min(9, (fx + fy) * 8 + perpY + (Math.random() - 0.5) * 4));
          curTile.footprints.push({
            lx,
            ly,
            angle: screenAngle + (Math.random() - 0.5) * 0.16,
            isLeft: this.nextFootLeft,
            scale: this.ageYears < 12 ? 0.72 : 1,
            age: 0,
            maxAge: 65
          });
        }
        if (dist <= speed) {
          this.x = targetWp.x;
          this.y = targetWp.y;
          this.path.shift();
          if (this.path.length === 0) {
            this.onArrived(map2, humans2, animals2, logEvent2);
          }
        } else {
          this.x += dx / dist * speed;
          this.y += dy / dist * speed;
        }
      }
      if (this.stateTimer > 0) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.finishAction(map2, animals2, logEvent2);
        }
      }
    }
    die(cause, logEvent2) {
      this.isAlive = false;
      this.state = "dead";
      this.deathCause = cause;
      this.timeSinceDeathYears = 0;
      this.tint = "#4b5563";
      logEvent2(`\u{1FAA6} ${this.name} ist mit ${Math.floor(this.ageYears)} Jahren gestorben: ${cause}.`);
    }
  };
  Object.assign(
    Human.prototype,
    humanTaskMethods,
    humanActionMethods,
    humanSocialMethods
  );
  function maybeSpawnForeignWanderer(humans2, logEvent2, map2 = null) {
    const livingHumans = humans2.filter((h) => h.isAlive);
    if (livingHumans.length === 0) return;
    if (livingHumans.length >= 13 || Math.random() > 35e-4) return;
    const livingMales = livingHumans.filter((h) => h.gender === "m" && h.ageYears >= 13);
    const livingFemales = livingHumans.filter((h) => h.gender === "f" && h.ageYears >= 13);
    let spawnGender = "f";
    if (livingMales.length < livingFemales.length) {
      spawnGender = "m";
    } else if (livingFemales.length < livingMales.length) {
      spawnGender = "f";
    } else {
      spawnGender = Math.random() < 0.5 ? "m" : "f";
    }
    const pool = spawnGender === "m" ? MALE_NAMES : FEMALE_NAMES;
    const name = pool[Math.floor(Math.random() * pool.length)];
    let edgeX = Math.random() < 0.5 ? 1 : MAP_SIZE - 2;
    let edgeY = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
    if (map2 && !isTileWalkable(map2, edgeX, edgeY)) {
      for (let tryY = 1; tryY < MAP_SIZE - 1; tryY++) {
        if (isTileWalkable(map2, edgeX, tryY)) {
          edgeY = tryY;
          break;
        }
      }
    }
    const role = spawnGender === "m" ? "Wanderer (Neuer J\xE4ger)" : "Wanderin (Neue DNA)";
    const tint = spawnGender === "m" ? "#d97706" : "#10b981";
    const wanderer = new Human(allocNextHumanId(), name, spawnGender, role, edgeX, edgeY, tint, 18 + Math.floor(Math.random() * 5));
    humans2.push(wanderer);
    logEvent2(`\u{1F6B6} ${spawnGender === "m" ? "Ein wandernder J\xE4ger" : "Eine wandernde Sammlerin"} (${name}, ${Math.floor(wanderer.ageYears)} J.) schlie\xDFt sich dem Klan an!`);
  }
  function createInitialHumans() {
    return [
      new Human(1, "Einar", "m", "J\xE4ger / Steinklopfer", CAMP_CENTER.x - 1, CAMP_CENTER.y - 1, "#d97706", 22),
      new Human(2, "Halla", "f", "Sammlerin & H\xFCterin", CAMP_CENTER.x, CAMP_CENTER.y + 1, "#0284c7", 20),
      new Human(3, "Bruder Mohan", "m", "\xC4ltester / Feuerh\xFCter", CAMP_CENTER.x + 1, CAMP_CENTER.y, "#7c3aed", 38),
      new Human(4, "Sula", "f", "Junge Sammlerin", CAMP_CENTER.x - 1, CAMP_CENTER.y + 1, "#10b981", 18)
    ];
  }

  // src/migration.js
  var migrationState = {
    isMigrating: false,
    phase: "idle",
    // 'idle' | 'gathering' | 'marching' | 'transitioning'
    timer: 0,
    pressure: 0,
    pressureDetails: { food: 0, wood: 0, hunger: 0 },
    migrationsCount: 0,
    announcement: null,
    announcementTimer: 0
  };
  function computeEcologicalPressure(map2, humans2, animals2, campfireStock2, fireState2 = null) {
    const livingHumans = humans2.filter((h) => h.isAlive);
    if (livingHumans.length === 0) return 0;
    let fireScore = 0;
    const currentFire = fireState2 && typeof fireState2.intensity === "number" ? fireState2.intensity : 100;
    if (currentFire <= 0) {
      fireScore = 35;
    } else if (currentFire < 35) {
      fireScore = Math.round((35 - currentFire) / 35 * 35);
    }
    const hungryCount = livingHumans.filter((h) => h.needs.food < 45).length;
    const starvingCount = livingHumans.filter((h) => h.needs.food < 25).length;
    const hungerSeverity = (hungryCount * 0.5 + starvingCount * 0.5) / livingHumans.length;
    const hungerScore = Math.min(30, Math.round(hungerSeverity * 30));
    let stockScore = 0;
    if (campfireStock2.wood === 0) stockScore += 13;
    else if (campfireStock2.wood <= 1) stockScore += 6;
    if (campfireStock2.food === 0) stockScore += 12;
    else if (campfireStock2.food <= 2) stockScore += 5;
    let localBerries = 0;
    let localTrees = 0;
    let localFish = 0;
    let localShelters = 0;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const dist = Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y);
        if (dist <= 4.5) {
          const t = map2[y][x];
          if (t.plant) {
            if (t.plant.type === "bush" && !t.plant.isRootstock) {
              localBerries += t.plant.berries || 0;
            } else if (t.plant.type === "tree" && t.plant.stage === 3) {
              localTrees++;
            }
          }
          if (t.type === "water" && t.fishStock && t.fishStock > 0) {
            localFish += t.fishStock;
          }
          if (t.type === "shelter" && t.shelter && t.shelter.condition > 20) {
            localShelters++;
          }
        }
      }
    }
    let shelterScore = 0;
    if (localShelters === 0) {
      shelterScore = 25;
    } else if (localShelters === 1) {
      shelterScore = 10;
    }
    let localDepletionScore = 0;
    if (localTrees === 0) localDepletionScore += 15;
    else if (localTrees <= 1) localDepletionScore += 8;
    if (localBerries === 0) localDepletionScore += 10;
    else if (localBerries <= 2) localDepletionScore += 5;
    if (localFish === 0) localDepletionScore += 5;
    else if (localFish <= 1) localDepletionScore += 2;
    let coldTrapScore = 0;
    if (currentFire <= 0 && campfireStock2.wood === 0 && localTrees === 0) {
      coldTrapScore = 20;
    }
    const totalPressure = Math.min(100, fireScore + shelterScore + stockScore + localDepletionScore + hungerScore + coldTrapScore);
    migrationState.pressure = totalPressure;
    migrationState.pressureDetails = {
      fire: fireScore,
      shelter: shelterScore,
      hunger: hungerScore,
      stock: stockScore,
      localDepletion: localDepletionScore,
      coldTrap: coldTrapScore,
      localBerries,
      localTrees,
      localFish,
      localShelters
    };
    return totalPressure;
  }
  function startMigration(humans2, logEvent2) {
    if (migrationState.isMigrating) return;
    migrationState.isMigrating = true;
    migrationState.phase = "gathering";
    migrationState.timer = 4;
    migrationState.announcement = "\u26FA DIE HORDE BRICHT AUF: Die Ressourcen des Tals sind ersch\xF6pft. Der Stamm formiert sich zum Weiterzug!";
    migrationState.announcementTimer = 7;
    logEvent2(`\u26FA AUFBRUCH! Der Clan packt Faustkeile und Vorr\xE4te. M\xFCtter nehmen die Kinder huckepack. Das Tal wird verlassen.`);
    for (const h of humans2) {
      if (h.isAlive) {
        h.state = "migrating";
        h.targetX = CAMP_CENTER.x + (Math.random() * 2 - 1);
        h.targetY = CAMP_CENTER.y + (Math.random() * 2 - 1);
      }
    }
  }
  function updateMigration(dt, map2, humans2, animals2, campfireStock2, fireState2, advanceYearCallback, logEvent2) {
    if (migrationState.announcementTimer > 0) {
      migrationState.announcementTimer -= dt;
      if (migrationState.announcementTimer <= 0) {
        migrationState.announcement = null;
      }
    }
    if (!migrationState.isMigrating) {
      if (migrationState.pressure >= 75 && Math.random() < 0.08 * dt) {
        startMigration(humans2, logEvent2);
      }
      return map2;
    }
    migrationState.timer -= dt;
    if (migrationState.phase === "gathering") {
      if (migrationState.timer <= 0) {
        migrationState.phase = "marching";
        migrationState.timer = 5;
        logEvent2(`\u{1F6B6} Geschlossener Zug: Die Horde wandert gemeinsam dem \xF6stlichen Bergpass entgegen.`);
        for (const h of humans2) {
          if (h.isAlive) {
            h.state = "migrating";
            h.targetX = MAP_SIZE - 1;
            h.targetY = 12 + (Math.random() * 4 - 2);
          }
        }
      }
    } else if (migrationState.phase === "marching") {
      if (migrationState.timer <= 0) {
        migrationState.phase = "transitioning";
        return executeMigrationArrival(map2, humans2, animals2, campfireStock2, fireState2, advanceYearCallback, logEvent2);
      }
    }
    return map2;
  }
  var BIOME_SEQUENCE = ["river_valley", "steppe", "forest", "karst_canyon"];
  function executeMigrationArrival(oldMap, humans2, animals2, campfireStock2, fireState2, advanceYearCallback, logEvent2) {
    migrationState.migrationsCount++;
    migrationState.isMigrating = false;
    migrationState.phase = "idle";
    const curBiomeId = oldMap.biomeId || "river_valley";
    const curIdx = BIOME_SEQUENCE.indexOf(curBiomeId);
    const nextBiomeId = BIOME_SEQUENCE[(curIdx + 1) % BIOME_SEQUENCE.length];
    const newMap = createMap(nextBiomeId);
    if (typeof advanceYearCallback === "function") {
      advanceYearCallback(1);
    }
    const oldFireTile = oldMap[CAMP_CENTER.y] && oldMap[CAMP_CENTER.y][CAMP_CENTER.x];
    const oldIntensity = oldFireTile && oldFireTile.fire ? oldFireTile.fire.intensity : fireState2.intensity;
    const newCenterTile = newMap[CAMP_CENTER.y][CAMP_CENTER.x];
    if (oldIntensity > 15) {
      newCenterTile.type = "fire";
      newCenterTile.plant = null;
      newCenterTile.fire = {
        intensity: 95,
        woodBurnTimer: 0,
        wood: 2,
        isCampCenter: true
      };
      fireState2.intensity = 95;
      logEvent2(`\u{1F525} DIE GLUT HAT \xDCBERLEBT! Der im Zunderpilz geh\xFCtete Funke entfacht sofort das neue Stammesfeuer.`);
    } else {
      newCenterTile.type = "grass";
      newCenterTile.fire = null;
      fireState2.intensity = 0;
      logEvent2(`\u2744\uFE0F KALTES LAGER: Der Clan hatte keine Glut mehr. Das Feuer muss m\xFChsam neu geschlagen werden.`);
    }
    const livingHumans = humans2.filter((h) => h.isAlive);
    for (let i = 0; i < livingHumans.length; i++) {
      const h = livingHumans[i];
      h.x = 2 + i % 3;
      h.y = 11 + Math.floor(i / 3);
      h.targetX = CAMP_CENTER.x;
      h.targetY = CAMP_CENTER.y;
      h.state = "idle";
      h.actionIntent = "explore";
      h.needs.food = Math.max(35, h.needs.food - 15);
      h.needs.energy = Math.max(45, h.needs.energy - 10);
      h.ageYears += 1;
    }
    animals2.length = 0;
    for (let i = 0; i < 3; i++) {
      maybeSpawnWildAnimal(animals2, livingHumans, () => {
      });
    }
    campfireStock2.wood = Math.max(2, campfireStock2.wood);
    campfireStock2.food = Math.max(3, campfireStock2.food);
    campfireStock2.stone = Math.max(2, campfireStock2.stone);
    const biome = newMap.biome;
    migrationState.announcement = `\u{1F304} NEUES LAND: ${biome.icon} ${biome.name} erreicht! ${biome.desc}`;
    migrationState.announcementTimer = 9;
    logEvent2(`\u{1F304} NEUES LAND: Der Clan betritt das Biom "${biome.name}" (${biome.icon}). ${biome.desc}`);
    return newMap;
  }

  // src/main.js
  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");
  var container = document.getElementById("viewport-container");
  var eventTicker = document.getElementById("event-ticker");
  var inspectorBox = document.getElementById("inspector-box");
  var biomeBadgeEl = document.getElementById("biome-badge");
  var pressureValEl = document.getElementById("pressure-val");
  var pressureFillEl = document.getElementById("pressure-fill");
  var pressureDescEl = document.getElementById("pressure-desc");
  var btnMigrateEl = document.getElementById("btn-migrate");
  var migrationBannerEl = document.getElementById("migration-banner");
  var worldYearEl = document.getElementById("world-year");
  var elapsedYearsEl = document.getElementById("elapsed-years");
  var simSeasonEl = document.getElementById("sim-season");
  var demoCountEl = document.getElementById("demo-count");
  var demoCountSubEl = document.getElementById("demo-count-sub");
  var demoGenderEl = document.getElementById("demo-gender");
  var demoGenderSubEl = document.getElementById("demo-gender-sub");
  var demoAgeEl = document.getElementById("demo-age");
  var demoAgeSubEl = document.getElementById("demo-age-sub");
  var stockStoneEl = document.getElementById("stock-stone");
  var stockWoodEl = document.getElementById("stock-wood");
  var stockFoodEl = document.getElementById("stock-food");
  var stockWaterEl = document.getElementById("stock-water");
  var stockFireEl = document.getElementById("stock-fire");
  function logEvent(msg) {
    eventTicker.innerText = msg;
  }
  var camera = new Camera(canvas);
  var renderer = new Renderer(ctx, camera);
  var map = createMap();
  var humans = createInitialHumans();
  var animals = [];
  var elapsedYears = 0;
  var historicalDeathsCount = 0;
  var simSpeed = 1;
  var activeTool = "inspect";
  var selectedHumanId = null;
  var hoveredGrid = { x: -1, y: -1 };
  function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.imageSmoothingEnabled = true;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  var centerPos = camera.gridToScreen(CAMP_CENTER.x, CAMP_CENTER.y);
  camera.x = canvas.width / 2 - (centerPos.x - camera.x);
  camera.y = canvas.height / 2 - (centerPos.y - camera.y);
  function getStatusLabel(h) {
    if (!h.isAlive) return "verstorben";
    if (h.ageYears < 4) return "bei Mutter (Tragling)";
    const healthSuffix = h.injuredTimer > 0 ? " (verletzt \u{1FA78})" : h.sickTimer > 0 ? " (krank \u{1F912})" : "";
    if (h.state === "socializing") {
      return (h.actionIntent === "sit_campfire" ? "am Feuer \u{1F525}" : "plaudert \u{1F5E3}\uFE0F") + healthSuffix;
    }
    if (h.state === "playing") return "spielt \u2B50" + healthSuffix;
    if (h.state === "resting") return (h.actionIntent === "rest_shelter" ? "in H\xFCtte \u26FA" : "ruht") + healthSuffix;
    if (h.state === "moving") {
      if (h.actionIntent === "hunt_animal") return "auf Hetzjagd \u{1F3F9}" + healthSuffix;
      if (h.actionIntent === "sit_campfire") return "geht zum Feuer" + healthSuffix;
      if (h.actionIntent === "play") return "tollt umher" + healthSuffix;
      return "unterwegs" + healthSuffix;
    }
    return h.state + healthSuffix;
  }
  function renderOrUpdateCards(humanList) {
    const existingCards = inspectorBox.querySelectorAll(".human-card");
    const existingIds = Array.from(existingCards).map((c) => parseInt(c.dataset.humanId, 10));
    const currentIds = humanList.map((h) => h.id);
    const needsRebuild = existingIds.length !== currentIds.length || !currentIds.every((id, idx) => existingIds[idx] === id);
    if (needsRebuild) {
      let html = "";
      for (const h of humanList) {
        const isSel = h.id === selectedHumanId;
        const ageInt = Math.floor(h.ageYears);
        const statusLabel = getStatusLabel(h);
        html += `
        <div id="human-card-${h.id}" data-human-id="${h.id}" class="human-card ${isSel ? "selected" : ""} ${!h.isAlive ? "dead" : ""}" onclick="selectHuman(${h.id}, true)">
          <div class="human-header">
            <span class="card-name-title">${h.name} (${ageInt} J., ${h.gender === "m" ? "\u2642" : "\u2640"})</span>
            <span class="human-role">${h.role}</span>
          </div>
          <div class="card-status-line" style="font-size:0.66rem; color:#9ca3af; margin-bottom:4px;">
            Aktion: <b class="card-action">${statusLabel}</b> | Nutzen: <b class="card-utility">+${h.utilityContributed}</b>
            <div class="card-death-cause" style="color:#f87171; font-size:0.64rem; margin-top:2px; display:${!h.isAlive && h.deathCause ? "block" : "none"};">Ursache: ${h.deathCause || ""}</div>
          </div>

          <div class="card-bars-container" style="display: ${h.isAlive ? "block" : "none"};">
            <div class="bar-row">
              <div class="bar-label"><span>Wasser</span><span class="val-water">${Math.round(h.needs.water)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-water" style="width: ${h.needs.water}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Nahrung</span><span class="val-food">${Math.round(h.needs.food)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-hunger" style="width: ${h.needs.food}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Entleerungsdruck</span><span class="val-bladder">${Math.round(h.needs.bladder)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-bladder" style="width: ${h.needs.bladder}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Energie</span><span class="val-energy">${Math.round(h.needs.energy)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-energy" style="width: ${h.needs.energy}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Paarungstrieb</span><span class="val-libido">${Math.round(h.needs.libido)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-libido" style="width: ${h.needs.libido}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Alterung</span><span class="val-age">${ageInt} / ${Math.floor(h.maxAgeYears)} J.</span></div>
              <div class="bar-bg"><div class="bar-fill fill-age" style="width: ${h.ageYears / h.maxAgeYears * 100}%"></div></div>
            </div>
          </div>
          <div class="card-dead-msg" style="color:#ef4444; font-size:0.68rem; margin-top:3px; display: ${h.isAlive ? "none" : "block"};">Biophysikalisch erloschen.</div>
        </div>
      `;
      }
      inspectorBox.innerHTML = html;
      return;
    }
    for (const h of humanList) {
      const card = document.getElementById(`human-card-${h.id}`);
      if (!card) continue;
      const isSel = h.id === selectedHumanId;
      card.classList.toggle("selected", isSel);
      card.classList.toggle("dead", !h.isAlive);
      const ageInt = Math.floor(h.ageYears);
      const titleEl = card.querySelector(".card-name-title");
      if (titleEl) titleEl.innerText = `${h.name} (${ageInt} J., ${h.gender === "m" ? "\u2642" : "\u2640"})`;
      const actionEl = card.querySelector(".card-action");
      if (actionEl) actionEl.innerText = getStatusLabel(h);
      const utilityEl = card.querySelector(".card-utility");
      if (utilityEl) utilityEl.innerText = `+${h.utilityContributed}`;
      const deathEl = card.querySelector(".card-death-cause");
      if (deathEl) {
        if (!h.isAlive && h.deathCause) {
          deathEl.style.display = "block";
          deathEl.innerText = `Ursache: ${h.deathCause}`;
        } else {
          deathEl.style.display = "none";
        }
      }
      const barsContainer = card.querySelector(".card-bars-container");
      const deadMsg = card.querySelector(".card-dead-msg");
      if (barsContainer) barsContainer.style.display = h.isAlive ? "block" : "none";
      if (deadMsg) deadMsg.style.display = h.isAlive ? "none" : "block";
      if (h.isAlive) {
        const wEl = card.querySelector(".val-water");
        if (wEl) wEl.innerText = `${Math.round(h.needs.water)}%`;
        const wBar = card.querySelector(".bar-fill.fill-water");
        if (wBar) wBar.style.width = `${Math.min(100, Math.max(0, h.needs.water))}%`;
        const fEl = card.querySelector(".val-food");
        if (fEl) fEl.innerText = `${Math.round(h.needs.food)}%`;
        const fBar = card.querySelector(".bar-fill.fill-hunger");
        if (fBar) fBar.style.width = `${Math.min(100, Math.max(0, h.needs.food))}%`;
        const bEl = card.querySelector(".val-bladder");
        if (bEl) bEl.innerText = `${Math.round(h.needs.bladder)}%`;
        const bBar = card.querySelector(".bar-fill.fill-bladder");
        if (bBar) bBar.style.width = `${Math.min(100, Math.max(0, h.needs.bladder))}%`;
        const eEl = card.querySelector(".val-energy");
        if (eEl) eEl.innerText = `${Math.round(h.needs.energy)}%`;
        const eBar = card.querySelector(".bar-fill.fill-energy");
        if (eBar) eBar.style.width = `${Math.min(100, Math.max(0, h.needs.energy))}%`;
        const lEl = card.querySelector(".val-libido");
        if (lEl) lEl.innerText = `${Math.round(h.needs.libido)}%`;
        const lBar = card.querySelector(".bar-fill.fill-libido");
        if (lBar) lBar.style.width = `${Math.min(100, Math.max(0, h.needs.libido))}%`;
        const aEl = card.querySelector(".val-age");
        if (aEl) aEl.innerText = `${ageInt} / ${Math.floor(h.maxAgeYears)} J.`;
        const aBar = card.querySelector(".bar-fill.fill-age");
        if (aBar) aBar.style.width = `${Math.min(100, h.ageYears / h.maxAgeYears * 100)}%`;
      }
    }
  }
  function updateUI() {
    stockFireEl.innerText = `${Math.round(fireState.intensity)}%`;
    stockStoneEl.innerText = campfireStock.stone;
    stockWoodEl.innerText = campfireStock.wood;
    stockFoodEl.innerText = campfireStock.food;
    stockWaterEl.innerText = campfireStock.water;
    if (biomeBadgeEl && map && map.biome) {
      biomeBadgeEl.innerText = `${map.biome.icon} ${map.biome.name}`;
    }
    const currentYear = Math.floor(START_YEAR + elapsedYears);
    if (worldYearEl) {
      worldYearEl.innerText = `${currentYear.toLocaleString("de-DE")} v. Chr.`;
    }
    if (elapsedYearsEl) {
      elapsedYearsEl.innerText = `Klan-Jahr ${Math.floor(elapsedYears)}`;
    }
    if (simSeasonEl) {
      simSeasonEl.innerText = seasonState.label;
    }
    const living = humans.filter((h) => h.isAlive);
    const totalLiving = living.length;
    const recentDead = humans.filter((h) => !h.isAlive).length;
    const totalDead = historicalDeathsCount + recentDead;
    const males = living.filter((h) => h.gender === "m").length;
    const females = living.filter((h) => h.gender === "f").length;
    let avgAgeStr = "0.0 J.";
    let spanStr = "Keine";
    if (totalLiving > 0) {
      const ages = living.map((h) => h.ageYears);
      const avg = (ages.reduce((a, b) => a + b, 0) / totalLiving).toFixed(1);
      avgAgeStr = `${avg} J.`;
      const minA = Math.floor(Math.min(...ages));
      const maxA = Math.floor(Math.max(...ages));
      spanStr = `Spanne: ${minA}\u2013${maxA} J.`;
    }
    if (demoCountEl) demoCountEl.innerText = totalLiving;
    if (demoCountSubEl) demoCountSubEl.innerText = totalDead > 0 ? `${totalDead} verstorben` : "Vollz\xE4hlig";
    if (demoGenderEl) demoGenderEl.innerText = `${males}\u2642 \xB7 ${females}\u2640`;
    const mPct = totalLiving > 0 ? Math.round(males / totalLiving * 100) : 0;
    const fPct = totalLiving > 0 ? Math.round(females / totalLiving * 100) : 0;
    if (demoGenderSubEl) demoGenderSubEl.innerText = `${mPct}% \u2642 \xB7 ${fPct}% \u2640`;
    if (demoAgeEl) demoAgeEl.innerText = avgAgeStr;
    if (demoAgeSubEl) demoAgeSubEl.innerText = spanStr;
    renderOrUpdateCards(humans);
    computeEcologicalPressure(map, humans, animals, campfireStock, fireState);
    const pressure = migrationState.pressure;
    if (pressureValEl) pressureValEl.innerText = `${pressure}%`;
    if (pressureFillEl) pressureFillEl.style.width = `${pressure}%`;
    if (pressureDescEl) {
      if (pressure < 35) pressureDescEl.innerText = "Zustand: Reichhaltig & fruchtbar \u{1F331}";
      else if (pressure < 65) pressureDescEl.innerText = "Zustand: Ressourcen schwinden \u{1F342}";
      else if (pressure < 85) pressureDescEl.innerText = "Zustand: Nahrungsknappheit droht \u26A0\uFE0F";
      else pressureDescEl.innerText = "Zustand: \xDCberweidet! Not treibt zur Wanderung \u{1F6A8}";
    }
    if (btnMigrateEl) {
      if (migrationState.isMigrating) {
        btnMigrateEl.innerText = "\u{1F6B6} Horde auf Wanderschaft...";
        btnMigrateEl.classList.remove("urgent");
        btnMigrateEl.disabled = true;
      } else {
        btnMigrateEl.disabled = false;
        if (pressure >= 75) {
          btnMigrateEl.innerText = "\u26FA In neues Land aufbrechen! (Not)";
          btnMigrateEl.classList.add("urgent");
        } else {
          btnMigrateEl.innerText = "\u26FA In neues Tal weiterziehen";
          btnMigrateEl.classList.remove("urgent");
        }
      }
    }
    if (migrationBannerEl) {
      if (migrationState.announcement) {
        migrationBannerEl.innerText = migrationState.announcement;
        migrationBannerEl.classList.remove("hidden");
      } else {
        migrationBannerEl.classList.add("hidden");
      }
    }
  }
  function selectHuman(id, fromCardClick = false) {
    selectedHumanId = id;
    const h = humans.find((item) => item.id === id);
    if (!h) return;
    if (!fromCardClick) {
      logEvent(`\u{1F464} ${h.name} (${Math.floor(h.ageYears)} J., ${h.role}) fokussiert.`);
    }
    const card = document.getElementById(`human-card-${id}`);
    if (card && inspectorBox) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      card.classList.remove("flash-highlight");
      void card.offsetWidth;
      card.classList.add("flash-highlight");
    }
  }
  window.selectHuman = selectHuman;
  function findHumanAtScreen(sx, sy) {
    const sorted = [...humans].sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const h of sorted) {
      if (!h.isAlive) continue;
      const pos = camera.gridToScreen(h.x, h.y);
      const cx = pos.x;
      const cy = pos.y + 32 / 2 * camera.zoom;
      const scale = h.ageYears < 10 ? 0.65 : h.ageYears > 50 ? 0.9 : 1;
      const bodyCenterY = cy - 8 * scale * camera.zoom;
      const distScreen = Math.hypot(sx - cx, sy - bodyCenterY);
      const hitRadius = Math.max(16, 22 * camera.zoom * scale);
      if (distScreen <= hitRadius) {
        return h;
      }
      const grid = camera.screenToGrid(sx, sy);
      if (Math.hypot(h.x - grid.x, h.y - grid.y) < 1) {
        return h;
      }
    }
    return null;
  }
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTool = btn.dataset.tool;
    });
  });
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      simSpeed = parseFloat(btn.dataset.speed);
    });
  });
  if (btnMigrateEl) {
    btnMigrateEl.addEventListener("click", () => {
      startMigration(humans, logEvent);
    });
  }
  var isDragging = false;
  var downClientX = 0;
  var downClientY = 0;
  var dragStartX = 0;
  var dragStartY = 0;
  container.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isDragging = true;
      downClientX = e.clientX;
      downClientY = e.clientY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
  });
  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      camera.x += dx;
      camera.y += dy;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    } else {
      hoveredGrid = camera.screenToGrid(mouseX, mouseY);
      const hHover = findHumanAtScreen(mouseX, mouseY);
      if (hHover) {
        container.style.cursor = "pointer";
      } else {
        container.style.cursor = "grab";
      }
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (isDragging) {
      isDragging = false;
      container.style.cursor = "grab";
      const movedDist = Math.hypot(e.clientX - downClientX, e.clientY - downClientY);
      if (movedDist < 6) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const clickedH = findHumanAtScreen(sx, sy);
        if (clickedH) {
          selectHuman(clickedH.id);
          return;
        }
        applyToolAtScreen(sx, sy);
      }
    }
  });
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    camera.zoom = Math.min(2.4, Math.max(0.45, camera.zoom * zoomFactor));
  }, { passive: false });
  function applyToolAtScreen(sx, sy) {
    const grid = camera.screenToGrid(sx, sy);
    if (grid.x >= 0 && grid.x < MAP_SIZE && grid.y >= 0 && grid.y < MAP_SIZE) {
      const tile = map[grid.y][grid.x];
      if (activeTool === "rock") {
        tile.type = "rock";
        tile.plant = null;
        tile.trample = 0;
        tile.isDesirePath = false;
        logEvent(`\u{1FAA8} Felsen platziert.`);
      } else if (activeTool === "tree") {
        tile.type = "grass";
        tile.plant = { type: "tree", stage: 1, growthTimer: 0, woodStock: 3, seedVariance: Math.random(), maxAge: 1200, ageTimer: 0 };
        tile.npk = Math.max(tile.npk, 40);
        tile.trample = 0;
        tile.isDesirePath = false;
        tile.flowerDots = [];
        logEvent(`\u{1F333} Baum gepflanzt.`);
      } else if (activeTool === "bush") {
        tile.type = "grass";
        tile.plant = { type: "bush", stage: 1, growthTimer: 0, berries: 0, berryTimer: 0, seedVariance: Math.random(), maxAge: 450, ageTimer: 0 };
        tile.npk = Math.max(tile.npk, 35);
        tile.trample = 0;
        tile.isDesirePath = false;
        tile.flowerDots = [];
        logEvent(`\u{1F347} Beerenstrauch gepflanzt.`);
      } else if (activeTool === "fire") {
        tile.type = "fire";
        tile.plant = null;
        tile.trample = 0;
        tile.isDesirePath = false;
        const isCamp = grid.x === CAMP_CENTER.x && grid.y === CAMP_CENTER.y;
        tile.fire = {
          intensity: 100,
          woodBurnTimer: 0,
          wood: isCamp ? 0 : 4,
          isCampCenter: isCamp
        };
        if (isCamp) fireState.intensity = 100;
        logEvent(`\u{1F525} Autarke Feuerstelle platziert bei [${grid.x}, ${grid.y}].`);
      } else if (activeTool === "water") {
        tile.type = "water";
        tile.isFord = false;
        tile.plant = null;
        tile.trample = 0;
        tile.isDesirePath = false;
      } else if (activeTool === "path") {
        tile.type = "grass";
        tile.isFord = true;
        tile.plant = null;
        tile.trample = 85;
        tile.isDesirePath = false;
        if (!tile.footprints) tile.footprints = [];
        for (let i = 0; i < 8; i++) {
          tile.footprints.push({
            lx: (Math.random() - 0.5) * 26,
            ly: (Math.random() - 0.5) * 13,
            angle: (Math.random() - 0.5) * Math.PI,
            isLeft: i % 2 === 0,
            scale: 0.95,
            age: 0,
            maxAge: 90
          });
        }
        if (tile.footprints.length > 20) tile.footprints.splice(0, tile.footprints.length - 20);
      } else if (activeTool === "grass") {
        tile.type = "grass";
        tile.npk = 18;
        tile.plant = null;
        tile.trample = 0;
        tile.footprints = [];
        tile.isDesirePath = false;
        tile.flowerDots = [];
        for (let i = 0; i < 4; i++) {
          tile.flowerDots.push({
            dx: (Math.random() - 0.5) * 22,
            dy: (Math.random() - 0.5) * 11,
            color: Math.random() < 0.5 ? "#f43f5e" : "#fbbf24",
            size: 0.9 + Math.random() * 0.8
          });
        }
      } else if (activeTool === "shelter") {
        tile.type = "shelter";
        tile.plant = null;
        tile.trample = 0;
        tile.isDesirePath = false;
        tile.shelter = { condition: 100, capacity: 2 };
        logEvent(`\u26FA Schutzh\xFCtte platziert bei [${grid.x}, ${grid.y}] (Kapazit\xE4t: 2).`);
      } else if (activeTool === "inspect") {
        const hNear = humans.find((h) => h.isAlive && Math.hypot(h.x - grid.x, h.y - grid.y) < 1.3);
        if (hNear) {
          selectHuman(hNear.id);
        }
      }
    }
  }
  var lastTime = performance.now();
  function loop(now) {
    const dtSec = Math.min(0.1, (now - lastTime) / 1e3) * simSpeed;
    lastTime = now;
    if (dtSec > 0) {
      elapsedYears += dtSec / SECONDS_PER_YEAR;
    }
    updateEcology(map, dtSec, logEvent);
    map = updateMigration(dtSec, map, humans, animals, campfireStock, fireState, (addY) => {
      elapsedYears += addY;
      advanceSeasonClock(addY * SECONDS_PER_YEAR);
    }, logEvent);
    updateSpookTimer(dtSec);
    maybeSpawnWildAnimal(animals, humans, logEvent, map);
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      if (!a.isAlive) {
        animals.splice(i, 1);
      } else {
        a.update(dtSec, map, humans, logEvent);
      }
    }
    maybeSpawnForeignWanderer(humans, logEvent, map);
    for (let i = humans.length - 1; i >= 0; i--) {
      const h = humans[i];
      h.update(dtSec, map, humans, animals, logEvent);
      if (!h.isAlive && (h.timeSinceDeathYears || 0) >= 1) {
        historicalDeathsCount++;
        if (selectedHumanId === h.id) selectedHumanId = null;
        humans.splice(i, 1);
        logEvent(`\u{1F33F} Die sterblichen \xDCberreste von ${h.name} sind nach 1 Jahr vergangen und eins mit der Natur geworden.`);
      }
    }
    renderer.render(map, humans, animals, hoveredGrid, selectedHumanId, dtSec, fireState.intensity);
    updateUI();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
