import { fireState, MAP_SIZE, CAMP_CENTER, seasonState } from './config.js';
import { findPath, isTileWalkable } from './pathfinding.js';
import { findNearestRootDigSpot } from './foraging.js';
import { spookWildlife } from './wildlife.js';
import { humanTaskMethods } from './human/tasks.js';
import { humanActionMethods } from './human/actions.js';
import { humanSocialMethods, FEMALE_NAMES, MALE_NAMES, allocNextHumanId } from './human/social.js';

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
    // Paläoanthropologischer Befund (Atapuerca / Sima de los Huesos, ~430.000 v. Chr.):
    // Homo heidelbergensis erreichte selten mehr als 42 bis 55 Jahre (Zahnabschliff & Verschleiß).
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
    this.nursingTimer = 0; // Stillpause nach Geburt
    this.injuredTimer = 0; // Jagdtrauma / Knochenprellung (Humpeln)
    this.sickTimer = 0;    // Wundfieber / Magenparasiten (durch rohes Fleisch oder Winterfrost)

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

    // 2. Biophysikalischer Stoffwechsel, Jahreszeiten-Kälte & Heilung
    // ECHTE TRENNUNG: Die Hütte isoliert nur passiv. Strahlungswärme liefert AUSSCHLIESSLICH das Feuer!
    // Kälte herrscht, wenn man nicht im Wärmeradius eines brennenden Feuers steht!
    const nearLitFire = this.isNearLitFire(map);
    const isCold = !nearLitFire;
    const inShelter = (this.state === 'resting' && this.actionIntent === 'rest_shelter');
    let coldPenalty = 1.0;

    if (isCold) {
      if (seasonState.isWinter) {
        // Eisiger Pleistozän-Winter: Ohne Feuer droht rapider Kalorien- und Wärmeverlust!
        coldPenalty = inShelter ? 1.40 : 1.95;
      } else if (seasonState.isAutumn) {
        coldPenalty = inShelter ? 1.30 : 1.72;
      } else {
        coldPenalty = inShelter ? 1.20 : 1.55;
      }
    }

    // Heilung von Jagdverletzungen & Krankheit (am warmen Feuer oder in der Hütte doppelt so schnell!)
    const healRate = (nearLitFire || inShelter) ? 1.8 : 0.75;
    if (this.injuredTimer > 0) {
      this.injuredTimer = Math.max(0, this.injuredTimer - dt * healRate);
    }
    if (this.sickTimer > 0) {
      this.sickTimer = Math.max(0, this.sickTimer - dt * healRate);
    }

    // Unterkühlungs-Erkrankung im tiefen Winter ohne Feuer
    if (seasonState.isWinter && isCold && !inShelter && this.needs.energy < 22 && this.sickTimer <= 0 && Math.random() < 0.015 * dt) {
      this.sickTimer = 22.0;
      logEvent(`🤒 ${this.name} hat sich in der eisigen Winterkälte ohne Feuer stark verkühlt!`);
    }

    // Kinder verbrauchen biophysikalisch weniger Kalorien & Wasser als schwere Erwachsene
    const bodyScale = this.ageYears < 13 ? 0.55 : 1.0;
    const isSocializing = (this.state === 'socializing');
    const sickPenalty = (this.sickTimer > 0) ? 1.25 : 1.0;
    const energyMod = isSocializing ? -2.2 : (0.25 * coldPenalty * sickPenalty); // Regeneriert im Sozialzustand!

    this.needs.water = Math.max(0, this.needs.water - dt * (0.75 * bodyScale * sickPenalty));
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

    // 2.5 Migration des Stammes: Alle ziehen geschlossen zum Treffpunkt / Rand
    if (this.state === 'migrating') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = 1.25 * dt;
      if (dist <= speed) {
        this.x = this.targetX;
        this.y = this.targetY;
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
      }
      return;
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

        // 2. Gelegentlicher Beitrag älterer Kinder (8 bis 12 Jahre)
        if (this.ageYears >= 8) {
          // Jugendliche jagen wendige Feldhasen als Vorbereitung auf die Großwildjagd!
          const hare = animals.find(a => a.isAlive && a.species === 'hare');
          if (hare && Math.random() < 0.35) {
            this.setMoveTarget(map, hare.x, hare.y, 'hunt_animal', hare);
            return;
          }
          // Knollen graben oder Beeren sammeln
          if (Math.random() < 0.40) {
            const rootSpot = findNearestRootDigSpot(map, this.x, this.y);
            if (rootSpot) {
              this.setMoveTarget(map, rootSpot.x, rootSpot.y, 'dig_roots');
              return;
            }
          }
        }

        // 3. Beeren sammeln in Lagernähe
        if (Math.random() < 0.35) {
          const bush = this.findNearestBushWithBerries(map);
          if (bush && Math.hypot(bush.x - CAMP_CENTER.x, bush.y - CAMP_CENTER.y) < 8) {
            this.setMoveTarget(map, bush.x, bush.y, 'gather_berries');
            return;
          }
        }

        // 4. Neugieriges Herumtoben in Lagernähe
        this.wanderNearCamp(map);
        return;
      }

      if (this.needs.bladder > 85) {
        this.seekRelief(map);
      } else if (this.needs.water < 55) {
        this.seekWater(map);
      } else if (this.needs.food < 50) {
        this.seekFood(map, animals);
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

        // Schlagdistanz erreicht? (Nahkampf mit Faustkeil / Holzlanze)
        const distToTarget = Math.hypot(this.huntTarget.x - this.x, this.huntTarget.y - this.y);
        if (distToTarget <= 1.25) {
          this.x = this.huntTarget.x;
          this.y = this.huntTarget.y;
          const meat = this.huntTarget.meatYield || 5;
          const aIcon = this.huntTarget.icon || '🦌';
          const aName = this.huntTarget.name || 'Wildtier';
          const species = this.huntTarget.species || 'deer';

          // Kooperationsjagd prüfen: Ist ein zweiter Klan-Jäger im Umkreis von 5 Kacheln dabei?
          const backupHunter = humans.find(
            h => h.id !== this.id && h.isAlive && h.ageYears >= 12 && Math.hypot(h.x - this.x, h.y - this.y) <= 5.0
          );

          // Wehrhaftes Großwild (Ur-Bison & Keiler): Alleinjagd birgt reales Verletzungsrisiko!
          let injuryRisk = 0;
          if (species === 'bison') injuryRisk = backupHunter ? 0.04 : 0.28;
          else if (species === 'boar') injuryRisk = backupHunter ? 0.03 : 0.18;

          this.huntTarget.isAlive = false;
          this.carried = '🥩 Wildbret';
          this.lastMeatYield = meat;
          this.huntTarget = null;
          this.utilityContributed += (meat * 5);
          if (backupHunter) backupHunter.utilityContributed += 10;
          spookWildlife(90.0);

          if (Math.random() < injuryRisk) {
            this.injuredTimer = 26.0;
            this.needs.energy = Math.max(10, this.needs.energy - 25);
            logEvent(`🩸 ${this.name} hat ${aIcon} ${aName} allein erlegt, wurde aber im Nahkampf verwundet und humpelt!`);
          } else if (backupHunter && (species === 'bison' || species === 'boar')) {
            logEvent(`🏹🤝 Kooperationsjagd! ${this.name} und ${backupHunter.name} erlegen gemeinsam ${aIcon} ${aName} (+${meat} Fleisch)!`);
          } else {
            logEvent(`🏹 ${this.name} hat ${aIcon} ${aName} erlegt! (+${meat} Fleisch fürs Lager)`);
          }
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

      // Trampelpfad-Mechanik: Nur freie Wiese ohne Bäume, Sträucher, Felsen oder Bauten wird zum Pfad!
      // Sträucher und Bäume werden NIEMALS durch Schritte zertrampelt oder gelöscht.
      if (curTile) {
        if (!curTile.plant && curTile.type !== 'rock' && curTile.type !== 'fire' && curTile.type !== 'shelter') {
          curTile.trample = Math.min(100, (curTile.trample || 0) + dt * 16);
          if (curTile.type === 'grass' && curTile.trample >= 55) {
            curTile.type = 'path';
            curTile.isDesirePath = true;
            curTile.flowerDots = [];
          }
        } else if (curTile.plant) {
          // Kachel mit Pflanze bleibt vor Pfad-Überprägung geschützt
          curTile.trample = 0;
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
      const injuryFactor = (this.injuredTimer > 0) ? 0.55 : 1.0; // Humpeln bei Jagdverletzung
      const speed = terrainFactor * sprintFactor * infantSpeedFactor * injuryFactor * (this.ageYears > 40 ? 0.78 : 1.0) * dt;

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
}

Object.assign(
  Human.prototype,
  humanTaskMethods,
  humanActionMethods,
  humanSocialMethods
);

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

  const wanderer = new Human(allocNextHumanId(), name, spawnGender, role, edgeX, edgeY, tint, 18 + Math.floor(Math.random() * 5));
  humans.push(wanderer);
  logEvent(`🚶 ${spawnGender === 'm' ? 'Ein wandernder Jäger' : 'Eine wandernde Sammlerin'} (${name}, ${Math.floor(wanderer.ageYears)} J.) schließt sich dem Klan an!`);
}

export function createInitialHumans() {
  return [
    new Human(1, 'Einar', 'm', 'Jäger / Steinklopfer', CAMP_CENTER.x - 1, CAMP_CENTER.y - 1, '#d97706', 22),
    new Human(2, 'Halla', 'f', 'Sammlerin & Hüterin', CAMP_CENTER.x, CAMP_CENTER.y + 1, '#0284c7', 20),
    new Human(3, 'Bruder Mohan', 'm', 'Ältester / Feuerhüter', CAMP_CENTER.x + 1, CAMP_CENTER.y, '#7c3aed', 38),
    new Human(4, 'Sula', 'f', 'Junge Sammlerin', CAMP_CENTER.x - 1, CAMP_CENTER.y + 1, '#10b981', 18)
  ];
}
