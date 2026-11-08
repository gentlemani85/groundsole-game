// =========================================================================
// HUMAN TASKS & TARGET SEEKING (Priorisierung, Subsistenz-Entscheidung & Zielwahl)
// =========================================================================
import { campfireStock, fireState, MAP_SIZE, CAMP_CENTER, SHELTER_CONFIG, seasonState } from '../config.js';
import { isTileWalkable } from '../pathfinding.js';
import {
  findNearestBushWithBerries,
  findNearestRootDigSpot,
  findNearestFishingSpot,
  findNearestTile,
  findNearestAdultTree,
  findNearestShoreTile,
  isPositionNearLitFire,
  findNearestLitFireTile,
  findFreeShelterSpotNearCamp
} from '../foraging.js';

export const humanTaskMethods = {
  seekHunt(animals, map) {
    const liveAnimals = animals.filter(a => a.isAlive);
    if (liveAnimals.length === 0) return;
    // Nächstes Tier anvisieren
    liveAnimals.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
    const target = liveAnimals[0];
    this.setMoveTarget(map, target.x, target.y, 'hunt_animal', target);
  },

  seekRelief(map) {
    let bestTarget = null;
    let maxDist = 0;
    for (let i = 0; i < 8; i++) {
      const rx = Math.floor(Math.random() * MAP_SIZE);
      const ry = Math.floor(Math.random() * MAP_SIZE);
      if (map[ry][rx].type !== 'water' && map[ry][rx].type !== 'fire') {
        const d = Math.hypot(rx - CAMP_CENTER.x, ry - CAMP_CENTER.y);
        if (d > maxDist) {
          maxDist = d;
          bestTarget = { x: rx, y: ry };
        }
      }
    }
    if (bestTarget) {
      this.setMoveTarget(map, bestTarget.x, bestTarget.y, 'relieve');
    }
  },

  seekWater(map) {
    if (campfireStock.water > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 6) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'drink_stock');
      return;
    }
    const shoreTile = findNearestShoreTile(map, this.x, this.y);
    if (shoreTile) {
      this.setMoveTarget(map, shoreTile.x, shoreTile.y, 'drink_source');
    } else {
      this.wander(map);
    }
  },

  seekFood(map, animals = []) {
    // 1. Vorrat am Lagerfeuer
    if (campfireStock.food > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 7) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'eat_stock');
      return;
    }

    // 2. Nächster Beerenstrauch mit Früchten
    const bush = findNearestBushWithBerries(map, this.x, this.y);
    if (bush && Math.hypot(bush.x - this.x, bush.y - this.y) < 9) {
      this.setMoveTarget(map, bush.x, bush.y, 'eat_bush');
      return;
    }

    // 3. Fischen am Gewässer (ab 10 Jahren)
    if (this.ageYears >= 10) {
      const fishSpot = findNearestFishingSpot(map, this.x, this.y);
      if (fishSpot && Math.hypot(fishSpot.x - this.x, fishSpot.y - this.y) < 9) {
        this.setMoveTarget(map, fishSpot.x, fishSpot.y, 'fish_river');
        return;
      }
    }

    // 4. Wurzeln/Knollen graben mit Grabstock
    const rootSpot = findNearestRootDigSpot(map, this.x, this.y);
    if (rootSpot && Math.hypot(rootSpot.x - this.x, rootSpot.y - this.y) < 10) {
      this.setMoveTarget(map, rootSpot.x, rootSpot.y, 'dig_roots');
      return;
    }

    // 5. Jagd auf Tiere (falls alt genug)
    if (this.ageYears >= 12 && animals && animals.some(a => a.isAlive)) {
      this.seekHunt(animals, map);
      return;
    }

    if (bush) {
      this.setMoveTarget(map, bush.x, bush.y, 'eat_bush');
      return;
    }
    if (rootSpot) {
      this.setMoveTarget(map, rootSpot.x, rootSpot.y, 'dig_roots');
      return;
    }

    this.wander(map);
  },

  seekShelterOrFire(map, humans = []) {
    // 1. Suche freie Schutzhütte (Kapazität: Max 2 Personen pro Hütte!)
    const availableShelters = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map[y][x];
        if (t.type === 'shelter' && (!t.shelter || t.shelter.condition > 15)) {
          // Prüfen wie viele Personen aktuell in dieser Hütte schlafen
          const occupants = humans.filter(
            h => h.isAlive && h.state === 'resting' && h.actionIntent === 'rest_shelter' && Math.round(h.x) === x && Math.round(h.y) === y
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
      this.setMoveTarget(map, availableShelters[0].x, availableShelters[0].y, 'rest_shelter');
      return;
    }

    // Wenn alle Hütten voll sind oder keine steht: Rast an einer warmen Feuerstelle
    const fire = this.findNearestLitFire(map);
    if (fire) {
      this.setMoveTarget(map, fire.x, fire.y, 'rest_fire');
      return;
    }

    this.wander(map);
  },

  seekMate(humans, map) {
    const mate = humans.find(h => (
      h.isAlive &&
      h.gender === 'f' &&
      h.ageYears >= 13 &&
      h.ageYears <= 48 &&
      h.pregnancyTimer === 0 &&
      h.nursingTimer <= 0 &&
      h.needs.libido > 25
    ));
    if (mate) {
      this.mateTarget = mate;
      this.setMoveTarget(map, Math.round(mate.x), Math.round(mate.y), 'approach_mate');
    }
  },

  seekProductiveTask(map, humans = [], animals = []) {
    if (this.role.includes('Feuerhüter') || this.role.includes('Sadhu')) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'bless_camp');
      return;
    }

    // 1. OBERSTE PRIORITÄT: FEUER ENTFACHEN ODER HÜTEN!
    // Ohne Feuer herrscht Kälte und rohes Essen. Feuer hat absoluten Vorrang vor der Hütte!
    const fireTile = map[CAMP_CENTER.y] && map[CAMP_CENTER.y][CAMP_CENTER.x];
    const fireExists = (fireTile && fireTile.type === 'fire' && (fireTile.fire?.intensity > 15 || fireState.intensity > 15));

    if (!fireExists && campfireStock.wood > 0) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'rekindle_fire');
      return;
    }

    // Wenn Feuer brennt, aber schwach wird (< 50%, im Winter schon ab < 65%): Nachlegen!
    const currentIntensity = (fireTile && fireTile.fire) ? fireTile.fire.intensity : fireState.intensity;
    const stokeThreshold = seasonState.isWinter ? 65 : 50;
    if (currentIntensity < stokeThreshold && campfireStock.wood > 0) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'stoke_fire');
      return;
    }

    // 1.5 FÜRORGE & HEILUNG: Verletzte oder Kranke schonen sich am Feuer / in der Hütte,
    // solange das Feuer brennt!
    if ((this.injuredTimer > 0 || this.sickTimer > 0) && fireExists) {
      this.seekShelterOrFire(map, humans);
      return;
    }

    // 2. HÜTTEN-WARTUNG: Wenn eine Hütte baufällig wird (< 65% Haltbarkeit), ausbessern!
    let damagedShelter = null;
    let totalShelterCapacity = 0;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map[y][x];
        if (t.type === 'shelter') {
          const cond = t.shelter ? t.shelter.condition : 100;
          if (cond > 15) {
            totalShelterCapacity += (t.shelter?.capacity || SHELTER_CONFIG.capacity);
          }
          if (cond < SHELTER_CONFIG.repairThreshold && !damagedShelter) {
            damagedShelter = { x, y };
          }
        }
      }
    }

    if (damagedShelter && campfireStock.wood >= 1) {
      this.setMoveTarget(map, damagedShelter.x, damagedShelter.y, 'repair_shelter');
      return;
    }

    // 3. HÜTTEN-KAPAZITÄT (Max 2 Personen pro Hütte):
    // Braucht der Clan weitere Hütten, weil die Population gewachsen ist?
    const livingClanSize = humans.filter(h => h.isAlive).length;
    const inConstruction = humans.filter(h => h.isAlive && (h.actionIntent === 'build_shelter' || h.state === 'building')).length;
    const projectedCapacity = totalShelterCapacity + (inConstruction * SHELTER_CONFIG.capacity);

    if (projectedCapacity < livingClanSize && fireExists) {
      if (campfireStock.wood >= 2 && campfireStock.stone >= 1) {
        const freeSpot = this.findFreeShelterSpot(map, humans);
        if (freeSpot) {
          this.setMoveTarget(map, freeSpot.x, freeSpot.y, 'build_shelter');
          return;
        }
      }
    }

    // Wenn Steine knapp sind (< 3): Steine vom Felsen sammeln!
    if (campfireStock.stone < 3) {
      const rock = this.findNearestTile(map, 'rock');
      if (rock) {
        this.setMoveTarget(map, rock.x, rock.y, 'mine_rock');
        return;
      }
    }

    // Wenn Brennholz knapp wird (im Herbst/Winter höhere Bevorratung: 8 statt 5): Holz hacken!
    const targetWoodStock = (seasonState.isAutumn || seasonState.isWinter) ? 8 : 5;
    if (campfireStock.wood < targetWoodStock) {
      const tree = this.findNearestAdultTree(map);
      if (tree) {
        this.setMoveTarget(map, tree.x, tree.y, 'chop_tree');
        return;
      }
    }

    const targetFoodStock = (seasonState.isAutumn || seasonState.isWinter) ? 9 : 6;
    if (campfireStock.food < targetFoodStock) {
      // 1. Reife Beeren ernten
      const bush = findNearestBushWithBerries(map, this.x, this.y);
      if (bush) {
        this.setMoveTarget(map, bush.x, bush.y, 'haul_food');
        return;
      }
      // 2. Fischen am Fluss (ab 12 Jahren)
      if (this.ageYears >= 12) {
        const fishSpot = findNearestFishingSpot(map, this.x, this.y);
        if (fishSpot) {
          this.setMoveTarget(map, fishSpot.x, fishSpot.y, 'fish_river');
          return;
        }
      }
      // 3. Wurzeln/Knollen graben
      const rootSpot = findNearestRootDigSpot(map, this.x, this.y);
      if (rootSpot) {
        this.setMoveTarget(map, rootSpot.x, rootSpot.y, 'dig_roots');
        return;
      }
      // 4. Jagd auf Tiere (falls Jäger/Erwachsener)
      if (this.ageYears >= 12 && animals && animals.some(a => a.isAlive)) {
        this.seekHunt(animals, map);
        return;
      }
    }

    if (campfireStock.water < 4) {
      const shoreTile = findNearestShoreTile(map, this.x, this.y);
      if (shoreTile) {
        this.setMoveTarget(map, shoreTile.x, shoreTile.y, 'haul_water');
        return;
      }
    }

    this.wander(map);
  },

  wander(map) {
    const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
    const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
    if (map[ry] && map[ry][rx] && (map[ry][rx].type !== 'water' || map[ry][rx].isFord)) {
      this.setMoveTarget(map, rx, ry, 'idle');
    }
  },

  wanderNearCamp(map) {
    const rx = Math.max(1, Math.min(MAP_SIZE - 2, CAMP_CENTER.x + Math.floor((Math.random() - 0.5) * 8)));
    const ry = Math.max(1, Math.min(MAP_SIZE - 2, CAMP_CENTER.y + Math.floor((Math.random() - 0.5) * 8)));
    if (isTileWalkable(map, rx, ry)) {
      this.setMoveTarget(map, rx, ry, 'explore');
    }
  },

  // Kompatibilitäts-Delegationen auf zentrale Suchfunktionen in foraging.js
  findNearestTile(map, type) {
    return findNearestTile(map, this.x, this.y, type);
  },

  findNearestBushWithBerries(map) {
    return findNearestBushWithBerries(map, this.x, this.y);
  },

  findNearestAdultTree(map) {
    return findNearestAdultTree(map, this.x, this.y);
  },

  isNearLitFire(map) {
    return isPositionNearLitFire(map, this.x, this.y);
  },

  findNearestLitFire(map) {
    return findNearestLitFireTile(map, this.x, this.y);
  },

  findFreeShelterSpot(map, humans = []) {
    return findFreeShelterSpotNearCamp(map, humans);
  }
};
