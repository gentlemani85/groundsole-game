import { campfireStock, fireState, MAP_SIZE, CAMP_CENTER, SHELTER_CONFIG } from './config.js?v=4';

let nextId = 4;

const FEMALE_NAMES = [
  'Nyx', 'Kora', 'Vana', 'Sula', 'Eila', 'Mira', 'Tala', 'Rhea', 'Ayla', 
  'Sunita', 'Brena', 'Zaya', 'Ona', 'Yara', 'Nesta', 'Luma', 'Dara', 'Saga', 'Thora'
];

const MALE_NAMES = [
  'Einar', 'Dagan', 'Krag', 'Toruk', 'Boran', 'Alok', 'Jaro', 'Bran', 'Tark', 
  'Vorn', 'Raban', 'Korm', 'Hagan', 'Wulf', 'Gorm'
];

export class Human {
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

    this.ageYears = ageYears;
    this.maxAgeYears = 58 + Math.random() * 14;
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
    this.nursingTimer = 0; // Stillpause nach Geburt

    this.state = 'idle';
    this.stateTimer = 0;
  }

  update(dt, map, humans, animals, logEvent) {
    if (!this.isAlive || dt === 0) return;

    // 1. Alterung & präzise Todesursachen-Ermittlung
    this.ageYears += (dt / 50);

    if (this.needs.water <= 0) {
      this.die('verdurstet (Wassermangel)', logEvent);
      return;
    }
    if (this.needs.food <= 0) {
      this.die('verhungert (Nahrungsentzug)', logEvent);
      return;
    }
    if (this.ageYears >= this.maxAgeYears) {
      this.die('biologisches Alterungsmaximum erreicht', logEvent);
      return;
    }

    // 2. Biophysikalischer Stoffwechsel & Kälte
    // ECHTE TRENNUNG: Die Hütte isoliert nur passiv. Strahlungswärme liefert AUSSCHLIESSLICH das Feuer!
    // Kälte herrscht, wenn man nicht im Wärmeradius eines brennenden Feuers steht!
    const nearLitFire = this.isNearLitFire(map);
    const isCold = !nearLitFire;
    const inShelter = (this.state === 'resting' && this.actionIntent === 'rest_shelter');
    let coldPenalty = 1.0;

    if (isCold) {
      coldPenalty = inShelter ? 1.25 : 1.65; // Hütte schützt vor Windfrost, heizt aber nicht!
    }

    this.needs.water = Math.max(0, this.needs.water - dt * 0.75);
    this.needs.food = Math.max(0, this.needs.food - dt * (0.45 * coldPenalty));
    this.needs.energy = Math.max(0, this.needs.energy - dt * (0.25 * coldPenalty));
    this.needs.bladder = Math.min(100, this.needs.bladder + dt * 0.8);

    // Stillzeit läuft ab
    if (this.nursingTimer > 0) {
      this.nursingTimer -= dt;
    }

    // Paarungstrieb
    if (this.ageYears >= 15 && this.ageYears <= 48 && this.needs.water > 45 && this.needs.food > 45 && this.nursingTimer <= 0) {
      this.needs.libido = Math.min(100, this.needs.libido + dt * 1.6);
    } else {
      this.needs.libido = Math.max(0, this.needs.libido - dt * 0.5);
    }

    // Schwangerschaft
    if (this.pregnancyTimer > 0) {
      this.pregnancyTimer -= dt;
      if (this.pregnancyTimer <= 0) {
        this.giveBirth(humans, logEvent);
      }
    }

    // 3. Autonome Prioritäten (Vorausschauend trinken & essen vor akutem Kollaps)
    if (this.state === 'idle') {
      if (this.needs.bladder > 85) {
        this.seekRelief(map);
      } else if (this.needs.water < 55) { // Trinkt bereits ab 55% Mangel (nicht erst bei 35%)
        this.seekWater(map);
      } else if (this.needs.food < 50) {  // Isst bereits ab 50% Mangel
        this.seekFood(map);
      } else if (this.needs.energy < 25) {
        this.seekShelterOrFire(map, humans);
      } 
      // Jäger sucht Wild
      else if (this.role.includes('Jäger') && animals.length > 0) {
        this.seekHunt(animals);
      }
      // Fortpflanzung
      else if (this.needs.libido > 65 && this.gender === 'm') {
        this.seekMate(humans);
      } 
      // Nutzen & Lager-Aufbau
      else if (this.needs.water > 60 && this.needs.food > 60) {
        this.seekProductiveTask(map, humans, animals);
      } else {
        this.wander(map);
      }
    }

    // 4. Bewegung & Hetzjagd mit Furt-Physik
    if (this.state === 'moving') {
      // ECHTE HETZJAGD: Jäger verfolgt das flüchtende Wild dynamisch!
      if (this.actionIntent === 'hunt_animal' && this.huntTarget) {
        if (!this.huntTarget.isAlive) {
          this.state = 'idle';
          this.actionIntent = 'idle';
          this.huntTarget = null;
          return;
        }

        // Zielposition stetig an die aktuelle Hirsch-Position anpassen
        this.targetX = this.huntTarget.x;
        this.targetY = this.huntTarget.y;

        // Hetzjagd verbraucht zusätzliche Energie und Wasser (Sprint)
        this.needs.energy = Math.max(0, this.needs.energy - dt * 0.4);
        this.needs.water = Math.max(0, this.needs.water - dt * 0.3);

        // Schlagdistanz erreicht? (Nahkampf mit Faustkeil / Stangen-Speer)
        const distToTarget = Math.hypot(this.huntTarget.x - this.x, this.huntTarget.y - this.y);
        if (distToTarget <= 1.25) {
          this.x = this.huntTarget.x;
          this.y = this.huntTarget.y;
          this.huntTarget.isAlive = false;
          this.carried = '🥩 Wildbret';
          this.targetX = CAMP_CENTER.x;
          this.targetY = CAMP_CENTER.y;
          this.state = 'moving';
          this.actionIntent = 'deliver_stock';
          this.huntTarget = null;
          this.utilityContributed += 35;
          logEvent(`🏹 ${this.name} hat den flüchtenden Ur-Hirsch im Sprint eingeholt und erlegt! Frisches Fleisch fürs Lager.`);
          return;
        }

        // Wenn Jäger entkräftet ist (< 15% Energie): Jagd abbrechen
        if (this.needs.energy < 15) {
          this.state = 'idle';
          this.actionIntent = 'idle';
          this.huntTarget = null;
          logEvent(`😮‍💨 ${this.name} muss die Hetzjagd vor Erschöpfung abbrechen.`);
          return;
        }
      }

      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);

      const cx = Math.round(this.x);
      const cy = Math.round(this.y);
      const curTile = (map[cy] && map[cy][cx]);
      const onPath = (curTile && curTile.type === 'path');
      const inWater = (curTile && curTile.type === 'water');

      // Seichtes Wasser bremst etwas ab, Pfad beschleunigt, Jagd gibt Sprint-Bonus
      let terrainFactor = 1.0;
      if (onPath) terrainFactor = 1.6;
      else if (inWater) terrainFactor = 0.65; // Waten bremst

      const isHuntingSprint = (this.actionIntent === 'hunt_animal');
      const sprintFactor = isHuntingSprint ? 1.45 : 1.0;
      const speed = terrainFactor * sprintFactor * (this.ageYears > 50 ? 0.75 : 1.0) * dt;

      if (dist < speed) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.onArrived(map, humans, animals, logEvent);
      } else {
        const nextX = this.x + (dx / dist) * speed;
        const nextY = this.y + (dy / dist) * speed;
        const tX = Math.round(nextX);
        const tY = Math.round(nextY);
        const targetTile = map[tY] && map[tY][tX];

        // WASSER-FURT-REGEL:
        // Wasser ist passierbar WENN waterWidth <= 2 (Furt).
        // Ist waterWidth >= 3 (tiefes Wasser), wird blockiert!
        if (targetTile && targetTile.type === 'water' && !targetTile.isFord) {
          this.state = 'idle'; // Tiefes Wasser blockiert
        } else {
          this.x = nextX;
          this.y = nextY;
        }
      }
    }

    // 5. Aktions-Timer
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.finishAction(map, animals, logEvent);
      }
    }
  }

  die(cause, logEvent) {
    this.isAlive = false;
    this.state = 'dead';
    this.deathCause = cause;
    this.tint = '#4b5563';
    logEvent(`🪦 ${this.name} ist mit ${Math.floor(this.ageYears)} Jahren gestorben: ${cause}.`);
  }

  seekHunt(animals) {
    const deer = animals.find(a => a.isAlive);
    if (deer) {
      this.targetX = deer.x;
      this.targetY = deer.y;
      this.state = 'moving';
      this.actionIntent = 'hunt_animal';
      this.huntTarget = deer;
    }
  }

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
      this.targetX = bestTarget.x;
      this.targetY = bestTarget.y;
      this.state = 'moving';
      this.actionIntent = 'relieve';
    }
  }

  seekWater(map) {
    if (campfireStock.water > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 6) {
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'drink_stock';
      return;
    }
    // Ufer-Kachel suchen (Grasfeld, das direkt an Wasser grenzt – nicht das Wasser selbst betreten!)
    let shoreTile = null;
    let minDist = 9999;
    for (let y = 1; y < MAP_SIZE - 1; y++) {
      for (let x = 1; x < MAP_SIZE - 1; x++) {
        if (map[y][x].type === 'grass' || map[y][x].type === 'path') {
          // Prüfen, ob Wasser-Nachbar vorhanden ist
          const hasWaterNeighbor = (
            map[y-1][x].type === 'water' || map[y+1][x].type === 'water' ||
            map[y][x-1].type === 'water' || map[y][x+1].type === 'water'
          );
          if (hasWaterNeighbor) {
            const d = Math.hypot(x - this.x, y - this.y);
            if (d < minDist) {
              minDist = d;
              shoreTile = { x, y };
            }
          }
        }
      }
    }

    if (shoreTile) {
      this.targetX = shoreTile.x;
      this.targetY = shoreTile.y;
      this.state = 'moving';
      this.actionIntent = 'drink_source';
    } else {
      this.wander(map);
    }
  }

  seekFood(map) {
    if (campfireStock.food > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 6) {
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'eat_stock';
      return;
    }
    let nearestBush = null;
    let minDist = 9999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const p = map[y][x].plant;
        if (p && p.type === 'bush' && p.berries > 0) {
          const d = Math.hypot(x - this.x, y - this.y);
          if (d < minDist) {
            minDist = d;
            nearestBush = { x, y };
          }
        }
      }
    }
    if (nearestBush) {
      this.targetX = nearestBush.x;
      this.targetY = nearestBush.y;
      this.state = 'moving';
      this.actionIntent = 'eat_bush';
    } else {
      this.wander(map);
    }
  }

  seekShelterOrFire(map, humans = []) {
    // 1. Suche freie Schutzhütte (Kapazität: Max 2 Personen pro Hütte!)
    const availableShelters = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map[y][x];
        if (t.type === 'shelter' && (!t.shelter || t.shelter.condition > 15)) {
          // Prüfen wie viele Personen aktuell in dieser Hütte schlafen
          const occupants = humans.filter(h => h.isAlive && h.state === 'resting' && h.actionIntent === 'rest_shelter' && Math.round(h.x) === x && Math.round(h.y) === y).length;
          const cap = t.shelter?.capacity || SHELTER_CONFIG.capacity;
          if (occupants < cap) {
            availableShelters.push({ x, y, dist: Math.hypot(x - this.x, y - this.y) });
          }
        }
      }
    }

    if (availableShelters.length > 0) {
      availableShelters.sort((a, b) => a.dist - b.dist);
      this.targetX = availableShelters[0].x;
      this.targetY = availableShelters[0].y;
      this.state = 'moving';
      this.actionIntent = 'rest_shelter';
      return;
    }

    // Wenn alle Hütten voll sind oder keine steht: Rast an einer warmen Feuerstelle
    const fire = this.findNearestLitFire(map);
    if (fire) {
      this.targetX = fire.x;
      this.targetY = fire.y;
      this.state = 'moving';
      this.actionIntent = 'rest_fire';
      return;
    }

    this.wander(map);
  }

  seekMate(humans) {
    const mate = humans.find(h => h.isAlive && h.gender === 'f' && h.ageYears >= 15 && h.ageYears <= 48 && h.pregnancyTimer === 0 && h.nursingTimer <= 0 && h.needs.libido > 40);
    if (mate) {
      this.targetX = Math.round(mate.x);
      this.targetY = Math.round(mate.y);
      this.state = 'moving';
      this.actionIntent = 'approach_mate';
      this.mateTarget = mate;
    }
  }

  seekProductiveTask(map, humans = [], animals = []) {
    if (this.role.includes('Sadhu')) {
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'bless_camp';
      return;
    }

    // 1. OBERSTE PRIORITÄT: FEUER ENTFALEN ODER HÜTEN!
    // Ohne Feuer herrscht Kälte und rohes Essen. Feuer hat absoluten Vorrang vor der Hütte!
    const fireTile = map[CAMP_CENTER.y] && map[CAMP_CENTER.y][CAMP_CENTER.x];
    const fireExists = (fireTile && fireTile.type === 'fire' && (fireTile.fire?.intensity > 15 || fireState.intensity > 15));

    if (!fireExists && campfireStock.wood > 0) {
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'rekindle_fire';
      return;
    }

    // Wenn Feuer brennt, aber schwach wird (< 50%): Nachlegen
    const currentIntensity = (fireTile && fireTile.fire) ? fireTile.fire.intensity : fireState.intensity;
    if (currentIntensity < 50 && campfireStock.wood > 0) {
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'stoke_fire';
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
      this.targetX = damagedShelter.x;
      this.targetY = damagedShelter.y;
      this.state = 'moving';
      this.actionIntent = 'repair_shelter';
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
          this.targetX = freeSpot.x;
          this.targetY = freeSpot.y;
          this.state = 'moving';
          this.actionIntent = 'build_shelter';
          return;
        }
      }
    }

    // Wenn Steine knapp sind (< 3): Steine vom Felsen sammeln!
    if (campfireStock.stone < 3) {
      const rock = this.findNearestTile(map, 'rock');
      if (rock) {
        this.targetX = rock.x;
        this.targetY = rock.y;
        this.state = 'moving';
        this.actionIntent = 'mine_rock';
        return;
      }
    }

    // Wenn Brennholz knapp wird (< 4): Holz hacken hat hohe Priorität!
    if (campfireStock.wood < 5) {
      let tree = this.findNearestAdultTree(map);
      if (tree) {
        this.targetX = tree.x;
        this.targetY = tree.y;
        this.state = 'moving';
        this.actionIntent = 'chop_tree';
        return;
      }
    }

    if (campfireStock.food < 5) {
      let bush = this.findNearestBushWithBerries(map);
      if (bush) {
        this.targetX = bush.x;
        this.targetY = bush.y;
        this.state = 'moving';
        this.actionIntent = 'haul_food';
        return;
      }
    }

    if (campfireStock.water < 4) {
      // Wasser holen am Ufer
      let shoreTile = null;
      let minDist = 9999;
      for (let y = 1; y < MAP_SIZE - 1; y++) {
        for (let x = 1; x < MAP_SIZE - 1; x++) {
          if (map[y][x].type === 'grass' || map[y][x].type === 'path') {
            const hasWaterNeighbor = (
              map[y-1][x].type === 'water' || map[y+1][x].type === 'water' ||
              map[y][x-1].type === 'water' || map[y][x+1].type === 'water'
            );
            if (hasWaterNeighbor) {
              const d = Math.hypot(x - this.x, y - this.y);
              if (d < minDist) {
                minDist = d;
                shoreTile = { x, y };
              }
            }
          }
        }
      }
      if (shoreTile) {
        this.targetX = shoreTile.x;
        this.targetY = shoreTile.y;
        this.state = 'moving';
        this.actionIntent = 'haul_water';
        return;
      }
    }

    this.wander(map);
  }

  wander(map) {
    const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
    const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
    if (map[ry] && map[ry][rx] && map[ry][rx].type !== 'water') {
      this.targetX = rx;
      this.targetY = ry;
      this.state = 'moving';
      this.actionIntent = 'idle';
    }
  }

  onArrived(map, humans, animals, logEvent) {
    if (this.actionIntent === 'hunt_animal') {
      if (this.huntTarget && this.huntTarget.isAlive) {
        this.state = 'hunting';
        this.stateTimer = 2.5;
      } else {
        this.state = 'idle';
      }
    } else if (this.actionIntent === 'relieve') {
      this.state = 'relieving';
      this.stateTimer = 3.0;
    } else if (this.actionIntent === 'drink_source') {
      this.state = 'drinking';
      this.stateTimer = 2.5;
    } else if (this.actionIntent === 'drink_stock') {
      if (campfireStock.water > 0) campfireStock.water--;
      this.needs.water = 100;
      this.state = 'idle';
    } else if (this.actionIntent === 'eat_bush') {
      const tile = map[Math.round(this.y)][Math.round(this.x)];
      if (tile && tile.plant && tile.plant.berries > 0) {
        tile.plant.berries--;
        this.state = 'foraging';
        this.stateTimer = 3.0;
        // Rohe Beeren direkt vom Strauch: Mäßige Sättigung (nur +55%), weil unaufbereitet
        this.needs.food = Math.min(100, this.needs.food + 55);
      } else {
        this.state = 'idle';
      }
    } else if (this.actionIntent === 'eat_stock') {
      if (campfireStock.food > 0) {
        campfireStock.food--;
        // ECHTE TRENNUNG: Am brennenden Feuer gegarte Nahrung sättigt zu 100% und spendet Energie!
        if (fireState.intensity > 20) {
          this.needs.food = 100;
          this.needs.energy = Math.min(100, this.needs.energy + 15); // Gegarte Kalorien entlasten den Magen
        } else {
          // Kaltes Lager: Nahrung ist kalt, zäh und sättigt schlechter (+65%)
          this.needs.food = Math.min(100, this.needs.food + 65);
        }
      }
      this.state = 'idle';
    } else if (this.actionIntent === 'mine_rock') {
      this.state = 'mining';
      this.stateTimer = 4.0;
    } else if (this.actionIntent === 'chop_tree') {
      this.state = 'chopping';
      this.stateTimer = 4.5;
    } else if (this.actionIntent === 'haul_food') {
      const tile = map[Math.round(this.y)][Math.round(this.x)];
      if (tile && tile.plant && tile.plant.berries > 0) {
        tile.plant.berries--;
        this.carried = '🍇 Beeren';
        this.targetX = CAMP_CENTER.x;
        this.targetY = CAMP_CENTER.y;
        this.state = 'moving';
        this.actionIntent = 'deliver_stock';
      } else {
        this.state = 'idle';
      }
    } else if (this.actionIntent === 'haul_water') {
      this.carried = '💧 Wasser';
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'deliver_stock';
    } else if (this.actionIntent === 'build_shelter') {
      this.state = 'building';
      this.stateTimer = 6.0;
    } else if (this.actionIntent === 'repair_shelter') {
      this.state = 'repairing';
      this.stateTimer = 4.0;
    } else if (this.actionIntent === 'stoke_fire') {
      if (campfireStock.wood > 0) {
        campfireStock.wood--;
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        const fTile = map[gy] && map[gy][gx];
        if (fTile && fTile.type === 'fire') {
          if (!fTile.fire) fTile.fire = { intensity: 50, woodBurnTimer: 0, wood: 0, isCampCenter: (gx === CAMP_CENTER.x && gy === CAMP_CENTER.y) };
          fTile.fire.intensity = Math.min(100, fTile.fire.intensity + 45);
          if (fTile.fire.isCampCenter) fireState.intensity = fTile.fire.intensity;
        } else {
          fireState.intensity = Math.min(100, fireState.intensity + 45);
        }
        this.utilityContributed += 15;
        logEvent(`🔥 ${this.name} hat Holz nachgelegt und das Feuer geschürt!`);
      }
      this.state = 'idle';
    } else if (this.actionIntent === 'rekindle_fire') {
      // Wenn das Feuer komplett aus war: Aufwändiges Feuer-Bohren / Schlagen (Faustkeil & Zunder)
      if (campfireStock.wood > 0) {
        campfireStock.wood--;
        const gx = Math.round(this.x);
        const gy = Math.round(this.y);
        if (map[gy] && map[gy][gx]) {
          map[gy][gx].type = 'fire';
          map[gy][gx].plant = null;
          map[gy][gx].fire = {
            intensity: 85,
            woodBurnTimer: 0,
            wood: 0,
            isCampCenter: (gx === CAMP_CENTER.x && gy === CAMP_CENTER.y)
          };
        }
        fireState.intensity = 85;
        this.utilityContributed += 35;
        logEvent(`✨ ${this.name} hat mit Faustkeilen Funken geschlagen und das Stammesfeuer entfacht!`);
      }
      this.state = 'idle';
    } else if (this.actionIntent === 'deliver_stock') {
      if (this.carried === '🪨 Stein') {
        campfireStock.stone++;
        this.utilityContributed += 15;
      } else if (this.carried === '🪵 Holz') {
        campfireStock.wood++;
        this.utilityContributed += 12;
      } else if (this.carried === '🍇 Beeren') {
        campfireStock.food++;
        this.utilityContributed += 8;
      } else if (this.carried === '💧 Wasser') {
        campfireStock.water++;
        this.utilityContributed += 8;
      } else if (this.carried === '🥩 Wildbret') {
        campfireStock.food += 5;
        this.utilityContributed += 35;
        logEvent(`🍖 ${this.name} bringt frisches Fleisch ins Lager! Vorrat +5.`);
      }
      this.carried = null;
      this.state = 'idle';
    } else if (this.actionIntent === 'rest_shelter') {
      this.state = 'resting';
      this.stateTimer = 5.0;
      // Hütte bietet mechanischen Schutz & Windstille -> Schnelle Energie-Regeneration (Tiefschlaf)
      this.needs.energy = Math.min(100, this.needs.energy + 85);
    } else if (this.actionIntent === 'rest_fire') {
      this.state = 'resting';
      this.stateTimer = 5.0;
      // Am offenen Feuer: Wärme, aber unruhigerer Schlaf als in der geschützten Hütte
      this.needs.energy = Math.min(100, this.needs.energy + 50);
    } else if (this.actionIntent === 'approach_mate') {
      this.state = 'mating';
      this.stateTimer = 4.0;
      if (this.mateTarget) {
        this.mateTarget.state = 'mating';
        this.mateTarget.stateTimer = 4.0;
      }
    } else if (this.actionIntent === 'bless_camp') {
      this.state = 'resting';
      this.stateTimer = 5.0;
      for (const h of humans) {
        if (h.isAlive && Math.hypot(h.x - CAMP_CENTER.x, h.y - CAMP_CENTER.y) < 5) {
          h.needs.energy = Math.min(100, h.needs.energy + 25);
        }
      }
      this.utilityContributed += 5;
    } else {
      this.state = 'idle';
    }
  }

  finishAction(map, animals, logEvent) {
    if (this.state === 'hunting') {
      if (this.huntTarget) {
        this.huntTarget.isAlive = false;
        this.carried = '🥩 Wildbret';
        this.targetX = CAMP_CENTER.x;
        this.targetY = CAMP_CENTER.y;
        this.state = 'moving';
        this.actionIntent = 'deliver_stock';
        logEvent(`🏹 ${this.name} hat den Ur-Hirsch erlegt! Er trägt das Fleisch ins Lager.`);
        return;
      }
    } else if (this.state === 'relieving') {
      this.needs.bladder = 0;
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      if (map[gy] && map[gy][gx]) {
        map[gy][gx].poop = { timer: 30.0, seed: true };
        logEvent(`💩 ${this.name} hat sich am Rand erleichtert.`);
      }
    } else if (this.state === 'drinking') {
      this.needs.water = 100;
    } else if (this.state === 'foraging') {
      this.needs.food = 100;
    } else if (this.state === 'mining') {
      this.carried = '🪨 Stein';
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'deliver_stock';
      return;
    } else if (this.state === 'chopping') {
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      const t = map[gy][gx];
      if (t && t.plant && t.plant.type === 'tree') {
        t.plant.woodStock--;
        if (t.plant.woodStock <= 0) t.plant = null;
      }
      this.carried = '🪵 Holz';
      this.targetX = CAMP_CENTER.x;
      this.targetY = CAMP_CENTER.y;
      this.state = 'moving';
      this.actionIntent = 'deliver_stock';
      return;
    } else if (this.state === 'building') {
      campfireStock.stone = Math.max(0, campfireStock.stone - 1);
      campfireStock.wood = Math.max(0, campfireStock.wood - 2);
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      if (map[gy] && map[gy][gx]) {
        map[gy][gx].type = 'shelter';
        map[gy][gx].plant = null;
        map[gy][gx].shelter = { condition: 100, capacity: SHELTER_CONFIG.capacity };
      }
      this.utilityContributed += 40;
      logEvent(`⛺ Schutzhütte errichtet (Platz für 2)!`);
    } else if (this.state === 'repairing') {
      if (campfireStock.wood > 0) campfireStock.wood--;
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      if (map[gy] && map[gy][gx] && map[gy][gx].type === 'shelter') {
        if (!map[gy][gx].shelter) map[gy][gx].shelter = { condition: 100, capacity: SHELTER_CONFIG.capacity };
        else map[gy][gx].shelter.condition = 100;
        this.utilityContributed += 20;
        logEvent(`🔨 ${this.name} hat die Schutzhütte ausgebessert und gewartet.`);
      }
    } else if (this.state === 'mating') {
      this.needs.libido = 0;
      if (this.gender === 'f') {
        this.pregnancyTimer = 22.0;
        logEvent(`❤️ ${this.name} erwartet Nachwuchs.`);
      } else if (this.mateTarget) {
        this.mateTarget.needs.libido = 0;
        this.mateTarget.pregnancyTimer = 22.0;
      }
    }
    this.state = 'idle';
  }

  giveBirth(humans, logEvent) {
    const babyGender = Math.random() < 0.5 ? 'm' : 'f';
    const pool = babyGender === 'm' ? MALE_NAMES : FEMALE_NAMES;
    const babyName = pool[Math.floor(Math.random() * pool.length)];
    const babyTint = babyGender === 'm' ? '#ea580c' : '#0ea5e9';

    this.nursingTimer = 18.0;

    const baby = new Human(nextId++, babyName, babyGender, 'Kind / Nachwuchs', CAMP_CENTER.x, CAMP_CENTER.y, babyTint, 0.5);
    humans.push(baby);
    logEvent(`👶 Geburt! Kind ${babyName} erweitert den Klan.`);
  }

  findNearestTile(map, type) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (map[y][x].type === type) {
          const d = Math.hypot(x - this.x, y - this.y);
          if (d < minDist) {
            minDist = d;
            nearest = { x, y };
          }
        }
      }
    }
    return nearest;
  }

  findNearestBushWithBerries(map) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const p = map[y][x].plant;
        if (p && p.type === 'bush' && p.berries > 0) {
          const d = Math.hypot(x - this.x, y - this.y);
          if (d < minDist) {
            minDist = d;
            nearest = { x, y };
          }
        }
      }
    }
    return nearest;
  }

  findNearestAdultTree(map) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const p = map[y][x].plant;
        if (p && p.type === 'tree' && p.stage >= 2) {
          const d = Math.hypot(x - this.x, y - this.y);
          if (d < minDist) {
            minDist = d;
            nearest = { x, y };
          }
        }
      }
    }
    return nearest;
  }

  isNearLitFire(map) {
    // Prüfen, ob der Hominide im Wärmeradius (4.5 Kacheln) eines brennenden Feuers steht
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map[y][x];
        if (t.type === 'fire') {
          const intensity = t.fire ? t.fire.intensity : (x === CAMP_CENTER.x && y === CAMP_CENTER.y ? fireState.intensity : 100);
          if (intensity > 15) {
            const d = Math.hypot(x - this.x, y - this.y);
            if (d <= 4.5) return true;
          }
        }
      }
    }
    return false;
  }

  findNearestLitFire(map) {
    let nearest = null;
    let minDist = 99999;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const t = map[y][x];
        if (t.type === 'fire') {
          const intensity = t.fire ? t.fire.intensity : (x === CAMP_CENTER.x && y === CAMP_CENTER.y ? fireState.intensity : 100);
          if (intensity > 15) {
            const d = Math.hypot(x - this.x, y - this.y);
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

  findFreeShelterSpot(map, humans = []) {
    // Sucht einen ebenen Platz im Umkreis des Lagers (Radius 1 bis 4)
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const sx = CAMP_CENTER.x + dx;
            const sy = CAMP_CENTER.y + dy;
            if (sx >= 1 && sx < MAP_SIZE - 1 && sy >= 1 && sy < MAP_SIZE - 1) {
              const t = map[sy][sx];
              // Freies Grasland ohne Bauten, Pflanzen oder Felsen
              if ((t.type === 'grass' || t.type === 'path') && !t.plant && t.type !== 'fire' && t.type !== 'shelter') {
                const alreadyTargeted = humans.some(h => h.isAlive && h.actionIntent === 'build_shelter' && Math.round(h.targetX) === sx && Math.round(h.targetY) === sy);
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
}

// Spawnt nur dann eine fremde Frau, wenn der Clan lebt, mindestens 1 erwachsener Mann da ist
// und kein dramatischer Frauenüberschuss herrscht!
export function maybeSpawnForeignWanderer(humans, logEvent) {
  const livingHumans = humans.filter(h => h.isAlive);
  if (livingHumans.length === 0) return; // Tal der Toten: Niemand zieht hierher!

  const livingMales = livingHumans.filter(h => h.gender === 'm' && h.ageYears >= 15);
  const livingFemales = livingHumans.filter(h => h.gender === 'f');

  // Wenn keine Männer mehr leben oder schon deutlicher Frauenüberhang da ist: KEIN Zuzug!
  if (livingMales.length === 0 || livingFemales.length >= livingMales.length * 2) {
    return;
  }

  if (livingHumans.length >= 12 || Math.random() > 0.002) return;

  const name = FEMALE_NAMES[Math.floor(Math.random() * FEMALE_NAMES.length)];
  const edgeX = Math.random() < 0.5 ? 1 : MAP_SIZE - 2;
  const edgeY = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;

  const wanderer = new Human(nextId++, name, 'f', 'Wanderin (Neue DNA)', edgeX, edgeY, '#10b981', 18 + Math.floor(Math.random() * 6));
  humans.push(wanderer);
  logEvent(`🚶‍♀️ Eine wandernde Hominidin (${name}, ${Math.floor(wanderer.ageYears)} J.) schließt sich dem Lager an! Neue Gene.`);
}

export function createInitialHumans() {
  return [
    new Human(1, 'Einar', 'm', 'Jäger / Steinklopfer', CAMP_CENTER.x - 1, CAMP_CENTER.y - 1, '#d97706', 24),
    new Human(2, 'Halla', 'f', 'Sammlerin & Hüterin', CAMP_CENTER.x, CAMP_CENTER.y + 1, '#0284c7', 21),
    new Human(3, 'Bruder Mohan', 'm', 'Sadhu / Ältester', CAMP_CENTER.x + 1, CAMP_CENTER.y, '#7c3aed', 54)
  ];
}
