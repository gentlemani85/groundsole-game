import { campfireStock, fireState, MAP_SIZE, CAMP_CENTER, SHELTER_CONFIG } from './config.js';
import { findPath, isTileWalkable } from './pathfinding.js';

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
    this.motherId = null; // Für Säuglinge (< 4 Jahre)

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
    this.path = [];
  }

  setMoveTarget(map, tx, ty, intent, huntTarget = null) {
    this.targetX = tx;
    this.targetY = ty;
    this.actionIntent = intent;
    this.huntTarget = huntTarget;

    const p = findPath(map, this.x, this.y, tx, ty);
    if (!p) {
      this.path = [];
      this.state = 'idle';
      this.actionIntent = 'idle';
      this.huntTarget = null;
      return false;
    }

    if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) {
      p.shift();
    }
    this.path = p;
    this.state = 'moving';
    return true;
  }

  update(dt, map, humans, animals, logEvent) {
    if (!this.isAlive) {
      if (dt > 0) {
        this.timeSinceDeathYears = (this.timeSinceDeathYears || 0) + (dt / 50);
      }
      return;
    }

    // 1. Alterung & präzise Todesursachen-Ermittlung
    const prevAge = this.ageYears;
    this.ageYears += (dt / 50);

    // Entwicklungsübergang mit 4 Jahren (vom Tragling zum freilaufenden Kind)
    if (prevAge < 4 && this.ageYears >= 4) {
      this.role = 'Kind (Heranwachsend)';
      logEvent(`🧒 ${this.name} ist 4 Jahre alt geworden und erkundet nun spielerisch das Lager!`);
    }
    // Entwicklungsübergang mit 12 Jahren (volle Arbeitsfähigkeit wie Erwachsene)
    if (prevAge < 12 && this.ageYears >= 12 && this.role.includes('Kind')) {
      this.role = (this.gender === 'm') ? 'Jäger / Steinklopfer' : 'Sammlerin & Hüterin';
      logEvent(`✨ ${this.name} hat das 12. Lebensjahr erreicht und arbeitet nun vollwertig für den Klan.`);
    }

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

    // ==========================================
    // SÄUGLING / TRAGLING (< 4 Jahre)
    // Bleibt immer bei der Mutter, trägt nichts bei, saugt Muttermilch.
    // ==========================================
    if (this.ageYears < 4) {
      this.role = 'Säugling / Tragling';
      this.carried = null;

      // Finde lebende Mutter oder Allomutter
      let mother = humans.find(h => h.id === this.motherId && h.isAlive);
      if (!mother) {
        mother = humans.find(h => h.isAlive && h.gender === 'f' && h.ageYears >= 13);
        if (mother) this.motherId = mother.id;
      }

      if (mother) {
        // Säugling ist physisch bei der Mutter
        this.x = mother.x + 0.12;
        this.y = mother.y + 0.08;
        this.state = (mother.state === 'moving') ? 'moving' : 'resting';
        this.actionIntent = 'with_mother';
        this.path = [];

        // Wird durch Laktation versorgt
        this.needs.water = Math.max(this.needs.water, 75);
        this.needs.food = Math.max(this.needs.food, 75);
        this.needs.energy = Math.max(this.needs.energy, 70);
        this.needs.libido = 0;

        // Mutter stillt das Kind
        mother.needs.water = Math.max(0, mother.needs.water - dt * 0.12);
        mother.needs.food = Math.max(0, mother.needs.food - dt * 0.10);
        mother.nursingTimer = 5.0; // Verhindert erneute Empfängnis während Laktation
      } else {
        // Waise wartet am Feuer im Lager
        this.x = CAMP_CENTER.x;
        this.y = CAMP_CENTER.y;
        this.state = 'resting';
      }
      return; // Keine Erwachsenen-Tasks für Säuglinge!
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

    // Kinder verbrauchen biophysikalisch weniger Kalorien & Wasser als schwere Erwachsene
    const bodyScale = this.ageYears < 13 ? 0.55 : 1.0;
    const isSocializing = (this.state === 'socializing');
    const energyMod = isSocializing ? -2.2 : (0.25 * coldPenalty); // Regeneriert im Sozialzustand!

    this.needs.water = Math.max(0, this.needs.water - dt * (0.75 * bodyScale));
    this.needs.food = Math.max(0, this.needs.food - dt * (0.45 * coldPenalty * bodyScale * (isSocializing ? 0.6 : 1.0)));
    this.needs.energy = Math.min(100, Math.max(0, this.needs.energy - dt * energyMod));
    this.needs.bladder = Math.min(100, this.needs.bladder + dt * 0.8);

    // Stillzeit läuft ab
    if (this.nursingTimer > 0) {
      this.nursingTimer -= dt;
    }

    // Paarungstrieb (Geschlechtsreife ab 13 Jahren im Paläolithikum)
    if (this.ageYears >= 13 && this.ageYears <= 48 && this.needs.water > 40 && this.needs.food > 40 && this.nursingTimer <= 0) {
      this.needs.libido = Math.min(100, this.needs.libido + dt * 2.2);
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
      // Höchste logistische Priorität: Getragene Beute / Rohstoffe sofort ins Lager bringen!
      if (this.carried) {
        this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
        return;
      }

      // ==========================================
      // KINDER (4 bis 12 Jahre)
      // Helfen nur wenig mit, spielen meist zusammen (Peer-Play)
      // ==========================================
      if (this.ageYears < 12) {
        if (this.needs.bladder > 85) {
          this.seekRelief(map);
          return;
        }
        if (this.needs.water < 55) {
          this.seekWater(map);
          return;
        }
        if (this.needs.food < 50) {
          this.seekFood(map);
          return;
        }
        if (this.needs.energy < 25) {
          this.seekShelterOrFire(map, humans);
          return;
        }

        // 1. Peer-Play: Spielen mit anderen Kindern (4 bis 12 Jahre)
        const peers = humans.filter(h => h.id !== this.id && h.isAlive && h.ageYears >= 4 && h.ageYears < 12);
        if (peers.length > 0 && Math.random() < 0.72) {
          const friend = peers[Math.floor(Math.random() * peers.length)];
          this.playWithPeer(friend, map, logEvent);
          return;
        }

        // 2. Gelegentlicher leichter Beitrag (Beeren sammeln am Lager)
        if (Math.random() < 0.35) {
          const bush = this.findNearestBushWithBerries(map);
          if (bush && Math.hypot(bush.x - CAMP_CENTER.x, bush.y - CAMP_CENTER.y) < 8) {
            this.setMoveTarget(map, bush.x, bush.y, 'gather_berries');
            return;
          }
        }

        // 3. Neugieriges Herumtoben in Lagernähe
        this.wanderNearCamp(map);
        return;
      }

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
        this.seekHunt(animals, map);
      } 
      // Fortpflanzung (ab 50% Libido)
      else if (this.needs.libido > 50 && this.gender === 'm') {
        this.seekMate(humans, map);
      } 
      // Nutzen, soziales Miteinander & Lager-Aufbau
      else if (this.needs.water > 55 && this.needs.food > 55) {
        // 1. Soziales Beisammensein am wärmenden Lagerfeuer (Klan-Kreis)
        if (fireState.intensity > 15 && Math.random() < 0.45) {
          if (this.seekCampfireCircle(map, humans, logEvent)) return;
        }

        // 2. Kurze Begegnung & Plaudern mit Artgenossen in Gehweite
        const nearbyPeer = humans.find(h => h.id !== this.id && h.isAlive && h.state === 'idle' && Math.hypot(h.x - this.x, h.y - this.y) < 1.8);
        if (nearbyPeer && Math.random() < 0.35) {
          this.chatWithPeer(nearbyPeer, logEvent);
          return;
        }

        this.seekProductiveTask(map, humans, animals);
      } else {
        this.wander(map);
      }
    }

    // 4. Bewegung & Hetzjagd mit deterministischer BFS-Pfadfindung
    if (this.state === 'moving') {
      // ECHTE HETZJAGD: Jäger verfolgt das flüchtende Wild dynamisch!
      if (this.actionIntent === 'hunt_animal' && this.huntTarget) {
        if (!this.huntTarget.isAlive) {
          this.state = 'idle';
          this.actionIntent = 'idle';
          this.huntTarget = null;
          this.path = [];
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
          this.huntTarget = null;
          this.utilityContributed += 35;
          logEvent(`🏹 ${this.name} hat den flüchtenden Ur-Hirsch im Sprint eingeholt und erlegt! Frisches Fleisch fürs Lager.`);
          this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
          return;
        }

        // Pfad bei flüchtendem Wild bei Bedarf nachjustieren
        const lastWp = this.path && this.path[this.path.length - 1];
        if (!lastWp || Math.hypot(this.huntTarget.x - lastWp.x, this.huntTarget.y - lastWp.y) > 2) {
          const p = findPath(map, this.x, this.y, this.huntTarget.x, this.huntTarget.y);
          if (p) {
            if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) p.shift();
            this.path = p;
          } else {
            this.state = 'idle';
            this.actionIntent = 'idle';
            this.huntTarget = null;
            this.path = [];
            return;
          }
        }

        // Überlebenssicherung: Wenn Jäger entkräftet ist oder Hunger/Durst droht, Jagd abbrechen!
        if (this.needs.energy < 18 || this.needs.food < 28 || this.needs.water < 28) {
          this.state = 'idle';
          this.actionIntent = 'idle';
          this.huntTarget = null;
          this.path = [];
          logEvent(`😮‍💨 ${this.name} bricht die Jagd rechtzeitig ab, um nicht zu entkräften.`);
          return;
        }
      }

      // Vorrats-Lieferung: Sobald man im Umkreis des Lagers (1.5 Kacheln) ist, abladen!
      if (this.actionIntent === 'deliver_stock' && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) <= 1.5) {
        this.path = [];
        this.onArrived(map, humans, animals, logEvent);
        return;
      }

      // Falls kein Pfad vorhanden oder Wegpunkte abgearbeitet sind
      if (!this.path || this.path.length === 0) {
        const distToEnd = Math.hypot(this.targetX - this.x, this.targetY - this.y);
        if (distToEnd <= 0.4) {
          this.x = this.targetX;
          this.y = this.targetY;
          this.onArrived(map, humans, animals, logEvent);
        } else {
          const p = findPath(map, this.x, this.y, this.targetX, this.targetY);
          if (p && p.length > 0) {
            if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) p.shift();
            this.path = p;
          } else {
            this.state = 'idle';
            this.actionIntent = 'idle';
            this.path = [];
          }
        }
        return;
      }

      const targetWp = this.path[0];
      // Hindernis-Check: Wurde die Kachel zwischenzeitlich geflutet?
      if (!isTileWalkable(map, targetWp.x, targetWp.y)) {
        const p = findPath(map, this.x, this.y, this.targetX, this.targetY);
        if (p && p.length > 0) {
          if (p.length > 1 && Math.hypot(p[0].x - this.x, p[0].y - this.y) < 0.4) p.shift();
          this.path = p;
        } else {
          this.state = 'idle';
          this.actionIntent = 'idle';
          this.path = [];
        }
        return;
      }

      const dx = targetWp.x - this.x;
      const dy = targetWp.y - this.y;
      const dist = Math.hypot(dx, dy);

      const cx = Math.round(this.x);
      const cy = Math.round(this.y);
      const curTile = (map[cy] && map[cy][cx]);
      const onPath = (curTile && curTile.type === 'path');
      const inWater = (curTile && curTile.type === 'water');

      // Trampelpfad-Mechanik: Viel begangene Kacheln werden organisch zu Pfaden
      if (curTile) {
        curTile.trample = Math.min(100, (curTile.trample || 0) + dt * 16);
        if (curTile.type === 'grass' && curTile.trample >= 55) {
          curTile.type = 'path';
          curTile.isDesirePath = true;
          curTile.plant = null;
          curTile.flowerDots = [];
        }
      }

      let terrainFactor = 1.0;
      if (onPath) terrainFactor = 1.6;
      else if (inWater) terrainFactor = 0.65;

      // Mutter ist durch das Tragen eines Säuglings (< 4 Jahre) langsamer
      const hasInfant = humans.some(h => h.isAlive && h.motherId === this.id && h.ageYears < 4);
      const infantSpeedFactor = hasInfant ? 0.72 : 1.0;

      const isHuntingSprint = (this.actionIntent === 'hunt_animal');
      const sprintFactor = isHuntingSprint ? 1.45 : 1.0;
      const speed = terrainFactor * sprintFactor * infantSpeedFactor * (this.ageYears > 50 ? 0.75 : 1.0) * dt;

      if (dist <= speed) {
        this.x = targetWp.x;
        this.y = targetWp.y;
        this.path.shift();
        if (this.path.length === 0) {
          this.onArrived(map, humans, animals, logEvent);
        }
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
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
    this.timeSinceDeathYears = 0;
    this.tint = '#4b5563';
    logEvent(`🪦 ${this.name} ist mit ${Math.floor(this.ageYears)} Jahren gestorben: ${cause}.`);
  }

  seekHunt(animals, map) {
    const deer = animals.find(a => a.isAlive);
    if (deer) {
      this.setMoveTarget(map, deer.x, deer.y, 'hunt_animal', deer);
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
      this.setMoveTarget(map, bestTarget.x, bestTarget.y, 'relieve');
    }
  }

  seekWater(map) {
    if (campfireStock.water > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 6) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'drink_stock');
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
      this.setMoveTarget(map, shoreTile.x, shoreTile.y, 'drink_source');
    } else {
      this.wander(map);
    }
  }

  seekFood(map) {
    if (campfireStock.food > 0 && Math.hypot(this.x - CAMP_CENTER.x, this.y - CAMP_CENTER.y) < 6) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'eat_stock');
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
      this.setMoveTarget(map, nearestBush.x, nearestBush.y, 'eat_bush');
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
  }

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
  }

  seekProductiveTask(map, humans = [], animals = []) {
    if (this.role.includes('Sadhu')) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'bless_camp');
      return;
    }

    // 1. OBERSTE PRIORITÄT: FEUER ENTFALEN ODER HÜTEN!
    // Ohne Feuer herrscht Kälte und rohes Essen. Feuer hat absoluten Vorrang vor der Hütte!
    const fireTile = map[CAMP_CENTER.y] && map[CAMP_CENTER.y][CAMP_CENTER.x];
    const fireExists = (fireTile && fireTile.type === 'fire' && (fireTile.fire?.intensity > 15 || fireState.intensity > 15));

    if (!fireExists && campfireStock.wood > 0) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'rekindle_fire');
      return;
    }

    // Wenn Feuer brennt, aber schwach wird (< 50%): Nachlegen
    const currentIntensity = (fireTile && fireTile.fire) ? fireTile.fire.intensity : fireState.intensity;
    if (currentIntensity < 50 && campfireStock.wood > 0) {
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'stoke_fire');
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

    // Wenn Brennholz knapp wird (< 4): Holz hacken hat hohe Priorität!
    if (campfireStock.wood < 5) {
      let tree = this.findNearestAdultTree(map);
      if (tree) {
        this.setMoveTarget(map, tree.x, tree.y, 'chop_tree');
        return;
      }
    }

    if (campfireStock.food < 5) {
      let bush = this.findNearestBushWithBerries(map);
      if (bush) {
        this.setMoveTarget(map, bush.x, bush.y, 'haul_food');
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
        this.setMoveTarget(map, shoreTile.x, shoreTile.y, 'haul_water');
        return;
      }
    }

    this.wander(map);
  }

  wander(map) {
    const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
    const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
    if (map[ry] && map[ry][rx] && (map[ry][rx].type !== 'water' || map[ry][rx].isFord)) {
      this.setMoveTarget(map, rx, ry, 'idle');
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
        this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
      } else {
        this.state = 'idle';
      }
    } else if (this.actionIntent === 'haul_water') {
      this.carried = '💧 Wasser';
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
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
    } else if (this.actionIntent === 'sit_campfire') {
      this.state = 'socializing';
      this.stateTimer = 10.0 + Math.random() * 8.0;
      // Gibt es Artgenossen am Feuer?
      const peersAtFire = humans.filter(h => h.id !== this.id && h.isAlive && h.state === 'socializing' && Math.hypot(h.x - CAMP_CENTER.x, h.y - CAMP_CENTER.y) < 3.2);
      if (peersAtFire.length > 0 && Math.random() < 0.4) {
        logEvent(`🔥 ${this.name} gesellt sich zu ${peersAtFire[0].name} ans Feuer. Sie wärmen sich und teilen Laute.`);
      }
    } else if (this.actionIntent === 'play') {
      this.state = 'playing';
      this.stateTimer = 4.0 + Math.random() * 3.0;
    } else if (this.actionIntent === 'explore') {
      this.state = 'idle';
    } else {
      this.state = 'idle';
    }
  }

  finishAction(map, animals, logEvent) {
    if (this.state === 'hunting') {
      if (this.huntTarget) {
        this.huntTarget.isAlive = false;
        this.carried = '🥩 Wildbret';
        this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
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
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
      return;
    } else if (this.state === 'chopping') {
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      const t = map[gy] && map[gy][gx];
      if (t && t.plant && t.plant.type === 'tree') {
        t.plant.woodStock--;
        if (t.plant.woodStock <= 0) {
          // 45% Chance auf Stockausschlag / natürlicher Neuaustrieb am Wurzelstock
          if (Math.random() < 0.45) {
            t.plant = {
              type: 'tree',
              stage: 1,
              growthTimer: 0,
              woodStock: 3,
              seedVariance: Math.random(),
              maxAge: 900 + Math.random() * 600,
              ageTimer: 0
            };
            logEvent(`🌱 Baumstumpf treibt neu aus (Stockausschlag) bei [${gx}, ${gy}].`);
          } else {
            t.plant = null;
          }
        }
      }
      this.carried = '🪵 Holz';
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
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
        this.pregnancyTimer = 14.0;
        logEvent(`❤️ ${this.name} erwartet Nachwuchs.`);
      } else if (this.mateTarget) {
        this.mateTarget.needs.libido = 0;
        this.mateTarget.pregnancyTimer = 14.0;
      }
    } else if (this.state === 'playing') {
      this.needs.energy = Math.min(100, this.needs.energy + 10);
    } else if (this.state === 'socializing') {
      this.needs.energy = Math.min(100, this.needs.energy + 12);
      this.utilityContributed += 2;
    }
    this.state = 'idle';
  }

  seekCampfireCircle(map, humans, logEvent) {
    const candidates = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.hypot(dx, dy);
        if (d >= 1.0 && d <= 2.2) {
          const tx = CAMP_CENTER.x + dx;
          const ty = CAMP_CENTER.y + dy;
          if (isTileWalkable(map, tx, ty)) {
            const occupied = humans.some(h => h.isAlive && Math.hypot(h.x - tx, h.y - ty) < 0.6);
            if (!occupied) {
              candidates.push({ x: tx, y: ty });
            }
          }
        }
      }
    }
    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      return this.setMoveTarget(map, chosen.x, chosen.y, 'sit_campfire');
    }
    return false;
  }

  chatWithPeer(peer, logEvent) {
    this.state = 'socializing';
    this.actionIntent = 'chat';
    this.stateTimer = 4.0 + Math.random() * 3.0;

    peer.state = 'socializing';
    peer.actionIntent = 'chat';
    peer.stateTimer = this.stateTimer;
    peer.path = [];

    this.needs.energy = Math.min(100, this.needs.energy + 8);
    peer.needs.energy = Math.min(100, peer.needs.energy + 8);

    if (Math.random() < 0.35) {
      logEvent(`🗣️ ${this.name} und ${peer.name} halten inne und tauschen Laute aus.`);
    }
  }

  playWithPeer(friend, map, logEvent) {
    const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(friend.x + (Math.random() - 0.5) * 4)));
    const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(friend.y + (Math.random() - 0.5) * 4)));
    if (isTileWalkable(map, rx, ry)) {
      this.setMoveTarget(map, rx, ry, 'play');
      this.needs.energy = Math.min(100, this.needs.energy + 5);
      if (Math.random() < 0.2) {
        logEvent(`🧒 ${this.name} und ${friend.name} spielen ausgelassen Fangen im Lager.`);
      }
    }
  }

  wanderNearCamp(map) {
    const rx = Math.max(1, Math.min(MAP_SIZE - 2, CAMP_CENTER.x + Math.floor((Math.random() - 0.5) * 8)));
    const ry = Math.max(1, Math.min(MAP_SIZE - 2, CAMP_CENTER.y + Math.floor((Math.random() - 0.5) * 8)));
    if (isTileWalkable(map, rx, ry)) {
      this.setMoveTarget(map, rx, ry, 'explore');
    }
  }

  giveBirth(humans, logEvent) {
    // Fisherian Sex Ratio: Ausgleichende Geburtenrate zur Vermeidung von Geschlechter-Extremen
    const living = humans.filter(h => h.isAlive);
    const mCount = living.filter(h => h.gender === 'm').length;
    const fCount = living.filter(h => h.gender === 'f').length;

    let boyChance = 0.5;
    if (mCount < fCount) boyChance = 0.65;
    else if (fCount < mCount) boyChance = 0.35;

    const babyGender = Math.random() < boyChance ? 'm' : 'f';
    const pool = babyGender === 'm' ? MALE_NAMES : FEMALE_NAMES;
    const babyName = pool[Math.floor(Math.random() * pool.length)];
    const babyTint = babyGender === 'm' ? '#ea580c' : '#0ea5e9';

    // Natürlicher Geburtenabstand (Laktationspause)
    this.nursingTimer = 50.0;

    const baby = new Human(nextId++, babyName, babyGender, 'Säugling / Tragling', this.x + 0.1, this.y + 0.1, babyTint, 0.0);
    baby.motherId = this.id;
    humans.push(baby);
    logEvent(`👶 Geburt! ${babyGender === 'm' ? 'Junge' : 'Mädchen'} ${babyName} wird von Mutter ${this.name} getragen.`);
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

// Zuzug fremder Hominiden (Genfluss & demografischer Ausgleich)
// Zieht gezielt das fehlende Geschlecht an, um Männchen-/Weibchen-Überschuss auszugleichen
export function maybeSpawnForeignWanderer(humans, logEvent, map = null) {
  const livingHumans = humans.filter(h => h.isAlive);
  if (livingHumans.length === 0) return; // Tal der Toten: Niemand zieht hierher

  // Maximale Tragfähigkeit des Tals (~13 Personen)
  if (livingHumans.length >= 13 || Math.random() > 0.0035) return;

  const livingMales = livingHumans.filter(h => h.gender === 'm' && h.ageYears >= 13);
  const livingFemales = livingHumans.filter(h => h.gender === 'f' && h.ageYears >= 13);

  // Demografische Balance: Wer fehlt im Klan?
  let spawnGender = 'f';
  if (livingMales.length < livingFemales.length) {
    spawnGender = 'm'; // Männer-Mangel: Ein junger Jäger zieht zu!
  } else if (livingFemales.length < livingMales.length) {
    spawnGender = 'f'; // Frauen-Mangel: Eine junge Sammlerin zieht zu!
  } else {
    spawnGender = Math.random() < 0.5 ? 'm' : 'f';
  }

  const pool = spawnGender === 'm' ? MALE_NAMES : FEMALE_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];
  let edgeX = Math.random() < 0.5 ? 1 : MAP_SIZE - 2;
  let edgeY = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;

  if (map && !isTileWalkable(map, edgeX, edgeY)) {
    for (let tryY = 1; tryY < MAP_SIZE - 1; tryY++) {
      if (isTileWalkable(map, edgeX, tryY)) {
        edgeY = tryY;
        break;
      }
    }
  }

  const role = spawnGender === 'm' ? 'Wanderer (Neuer Jäger)' : 'Wanderin (Neue DNA)';
  const tint = spawnGender === 'm' ? '#d97706' : '#10b981';

  const wanderer = new Human(nextId++, name, spawnGender, role, edgeX, edgeY, tint, 18 + Math.floor(Math.random() * 5));
  humans.push(wanderer);
  logEvent(`🚶 ${spawnGender === 'm' ? 'Ein wandernder Jäger' : 'Eine wandernde Sammlerin'} (${name}, ${Math.floor(wanderer.ageYears)} J.) schließt sich dem Klan an!`);
}

export function createInitialHumans() {
  return [
    new Human(1, 'Einar', 'm', 'Jäger / Steinklopfer', CAMP_CENTER.x - 1, CAMP_CENTER.y - 1, '#d97706', 22),
    new Human(2, 'Halla', 'f', 'Sammlerin & Hüterin', CAMP_CENTER.x, CAMP_CENTER.y + 1, '#0284c7', 20),
    new Human(3, 'Bruder Mohan', 'm', 'Sadhu / Ältester', CAMP_CENTER.x + 1, CAMP_CENTER.y, '#7c3aed', 50),
    new Human(4, 'Sula', 'f', 'Junge Sammlerin', CAMP_CENTER.x - 1, CAMP_CENTER.y + 1, '#10b981', 18)
  ];
}
