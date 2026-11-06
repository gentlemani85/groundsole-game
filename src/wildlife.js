// =========================================================================
// FAUNA & WILDLIFE (Mittelpleistozän / -600.000 v. Chr. Acheuléen)
// =========================================================================
// Ur-Hirsch (Megaloceros/Cervus), Wildschwein (Sus scrofa), Ur-Bison (Bison priscus), Feldhase.
// =========================================================================

import { MAP_SIZE } from './config.js';

let nextAnimalId = 1;

export const ANIMAL_SPECIES = {
  deer: {
    species: 'deer',
    name: 'Ur-Hirsch',
    icon: '🦌',
    meatYield: 5,
    maxStamina: 100,
    speedRun: 2.3,
    speedWalk: 0.8,
    fleeDist: 5.5,
    toughness: 1, // Standard Hetzjagd
    habitat: 'all'
  },
  boar: {
    species: 'boar',
    name: 'Wildschwein',
    icon: '🐗',
    meatYield: 7,
    maxStamina: 120,
    speedRun: 1.85,
    speedWalk: 0.7,
    fleeDist: 4.5,
    toughness: 1, // Wühlt nach Eicheln/Wurzeln im Wald
    habitat: 'forest'
  },
  bison: {
    species: 'bison',
    name: 'Ur-Bison',
    icon: '🦬',
    meatYield: 15,
    maxStamina: 240,
    speedRun: 1.45,
    speedWalk: 0.55,
    fleeDist: 4.0,
    toughness: 2, // Sehr zäh! Benötigt 2 Jäger oder mehrfache Angriffe
    habitat: 'grass'
  },
  hare: {
    species: 'hare',
    name: 'Feldhase',
    icon: '🐇',
    meatYield: 2,
    maxStamina: 40,
    speedRun: 2.8,
    speedWalk: 0.9,
    fleeDist: 3.5,
    toughness: 1, // Wendig, schlägt Haken, ideal für Jugendliche
    habitat: 'grass'
  }
};

export class WildAnimal {
  constructor(x, y, speciesKey = 'deer') {
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
    this.state = 'grazing'; // grazing, moving, fleeing, exhausted, dead
    this.stateTimer = 3.0 + Math.random() * 3.0;
    this.isAlive = true;
    this.wounds = 0; // Für zähe Großtiere wie Ur-Bisons
  }

  update(dt, map, humans, logEvent) {
    if (!this.isAlive || dt === 0) return;

    // Prüfen, ob Mensch in der Nähe ist (Panik & Flucht!)
    let nearestHumanDist = 999;
    let predator = null;
    let hunterCount = 0;

    for (const h of humans) {
      if (h.isAlive) {
        const d = Math.hypot(h.x - this.x, h.y - this.y);
        if (d < nearestHumanDist) {
          nearestHumanDist = d;
          predator = h;
        }
        if (h.actionIntent === 'hunt_animal' && h.huntTarget === this && d < 7.0) {
          hunterCount++;
        }
      }
    }

    const isTargeted = hunterCount > 0;
    const effectiveFleeDist = isTargeted ? (this.fleeDist + 1.8) : this.fleeDist;

    // Fluchtauslösung
    if (nearestHumanDist < effectiveFleeDist && this.state !== 'fleeing' && this.state !== 'exhausted') {
      this.state = 'fleeing';
      // Flieht in die Gegenrichtung des Verfolgers (mit leichter Richtungsstreuung)
      const angle = Math.atan2(this.y - predator.y, this.x - predator.x) + (Math.random() - 0.5) * 0.4;
      const fX = this.x + Math.cos(angle) * (this.species === 'hare' ? 3.5 : 5.5);
      const fY = this.y + Math.sin(angle) * (this.species === 'hare' ? 3.5 : 5.5);
      this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fX)));
      this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fY)));
      logEvent(`${this.icon} ${this.name} wittert ${predator.name} und flieht in Panik!`);
    }

    // Flucht- & Hetzjagd-Bewegung mit Ausdauer-Verbrauch
    if (this.state === 'fleeing') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);

      let speed;
      if (this.stamina > 20) {
        speed = this.speedRun * dt;
        const drain = (this.species === 'hare' ? 18 : (this.species === 'bison' ? 8 : 13));
        this.stamina = Math.max(0, this.stamina - dt * drain);
      } else {
        // Erschöpfter Galopp
        speed = (this.speedRun * 0.55) * dt;
        this.stamina = Math.max(0, this.stamina - dt * 5);
      }

      if (this.stamina <= 3) {
        this.state = 'exhausted';
        this.stateTimer = (this.species === 'bison' ? 1.8 : 2.5);
        logEvent(`${this.icon} ${this.name} ist von der Hetzjagd völlig erschöpft und verlangsamt!`);
      } else if (dist < speed) {
        this.x = this.targetX;
        this.y = this.targetY;

        // Wenn Verfolger noch da ist, weiter fliehen
        if (nearestHumanDist < (this.fleeDist + 0.5) && predator) {
          const angle = Math.atan2(this.y - predator.y, this.x - predator.x) + (Math.random() - 0.5) * 0.5;
          const fX = this.x + Math.cos(angle) * 4.5;
          const fY = this.y + Math.sin(angle) * 4.5;
          this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fX)));
          this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fY)));
        } else {
          this.state = 'grazing';
          this.stateTimer = 3.0 + Math.random() * 3.0;
        }
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
      }
    }

    // Erschöpfungs-Pause (Gibt Jäger Chance einzuholen)
    if (this.state === 'exhausted') {
      this.stateTimer -= dt;
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * 8);
      if (this.stateTimer <= 0) {
        this.state = 'fleeing';
        if (predator) {
          const angle = Math.atan2(this.y - predator.y, this.x - predator.x);
          this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + Math.cos(angle) * 4)));
          this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + Math.sin(angle) * 4)));
        }
      }
    }

    // Äsen / Weiden / Wühlen & normale Bewegung
    if (this.state === 'moving') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = this.speedWalk * dt;

      if (dist < speed) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.state = 'grazing';
        this.stateTimer = 3.0 + Math.random() * 4.0;
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
      }
    }

    if (this.state === 'grazing') {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * 10);
      this.stateTimer -= dt;

      // Verbiss durch Wildtiere: Hirsch & Hase knabbern an Sträuchern, Schwein wühlt im Humus
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      const curTile = map[gy] && map[gy][gx];
      if (curTile) {
        if (this.species === 'boar') {
          // Wildschwein wühlt im Boden, lockert Humus auf
          if (curTile.npk < 50 && Math.random() < 0.05 * dt) {
            curTile.npk = Math.min(60, curTile.npk + 2);
          }
        } else if (curTile.plant && curTile.plant.type === 'bush' && curTile.plant.berries > 0) {
          if (Math.random() < 0.12 * dt) {
            curTile.plant.berries--;
          }
        }
      }

      if (this.stateTimer <= 0) {
        const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
        const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
        if (map[ry] && map[ry][rx] && map[ry][rx].type !== 'water') {
          this.targetX = rx;
          this.targetY = ry;
          this.state = 'moving';
        }
      }
    }
  }
}

/**
 * Spawnt Fauna passend zur ökologischen Nische.
 * Hält bis zu 4 Tiere auf der Karte aktiv.
 */
export function maybeSpawnWildAnimal(animals, humans, logEvent) {
  if (animals.length >= 4 || Math.random() > 0.004) return;

  // Rand-Kachel wählen
  const side = Math.floor(Math.random() * 4);
  let sx = 1, sy = 1;
  if (side === 0) { sx = Math.floor(Math.random() * MAP_SIZE); sy = 1; }
  else if (side === 1) { sx = Math.floor(Math.random() * MAP_SIZE); sy = MAP_SIZE - 2; }
  else if (side === 2) { sx = 1; sy = Math.floor(Math.random() * MAP_SIZE); }
  else { sx = MAP_SIZE - 2; sy = Math.floor(Math.random() * MAP_SIZE); }

  // Prüfen, ob Menschen zu nah am Spawn-Punkt stehen
  for (const h of humans) {
    if (h.isAlive && Math.hypot(h.x - sx, h.y - sy) < 7) {
      return;
    }
  }

  // Ausgewogene Arten-Wahrscheinlichkeit nach Acheuléen-Fauna:
  // 35% Ur-Hirsch, 25% Wildschwein, 20% Ur-Bison, 20% Feldhase
  const roll = Math.random();
  let speciesKey = 'deer';
  if (roll < 0.35) speciesKey = 'deer';
  else if (roll < 0.60) speciesKey = 'boar';
  else if (roll < 0.80) speciesKey = 'bison';
  else speciesKey = 'hare';

  const animal = new WildAnimal(sx, sy, speciesKey);
  animals.push(animal);
  logEvent(`${animal.icon} Ein wildes Exemplar (${animal.name}) betritt das Flusstal!`);
}
