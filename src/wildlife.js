import { MAP_SIZE, campfireStock } from './config.js?v=6';

let nextAnimalId = 1;

export class WildAnimal {
  constructor(x, y) {
    this.id = nextAnimalId++;
    this.name = 'Ur-Hirsch';
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.state = 'grazing'; // grazing, moving, fleeing, exhausted, dead
    this.stateTimer = 4.0;
    this.isAlive = true;
    this.meatYield = 5;
    this.stamina = 100;     // Ausdauer für Hetzjagd-Simulation
    this.maxStamina = 100;
  }

  update(dt, map, humans, logEvent) {
    if (!this.isAlive || dt === 0) return;

    // Prüfen, ob Mensch in der Nähe ist (Panik & Flucht!)
    let nearestHumanDist = 999;
    let predator = null;
    for (const h of humans) {
      if (h.isAlive) {
        const d = Math.hypot(h.x - this.x, h.y - this.y);
        if (d < nearestHumanDist) {
          nearestHumanDist = d;
          predator = h;
        }
      }
    }

    // Wenn ein Jäger aktiv Jagd auf diesen Hirsch macht, wittert er ihn schon aus größerer Distanz (6.5 Kacheln)
    const isTargeted = humans.some(h => h.isAlive && h.actionIntent === 'hunt_animal' && h.huntTarget === this);
    const fleeThreshold = isTargeted ? 6.5 : 4.5;

    if (nearestHumanDist < fleeThreshold && this.state !== 'fleeing' && this.state !== 'exhausted') {
      this.state = 'fleeing';
      // Flieht in die Gegenrichtung des Verfolgers
      const angle = Math.atan2(this.y - predator.y, this.x - predator.x);
      const fX = this.x + Math.cos(angle) * 5;
      const fY = this.y + Math.sin(angle) * 5;
      this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fX)));
      this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(fY)));
      logEvent(`🦌 Der Ur-Hirsch wittert ${predator.name} und flieht in Panik!`);
    }

    // Flucht- & Hetzjagd-Bewegung mit Ausdauer-Verbrauch
    if (this.state === 'fleeing') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);

      // Hetzjagd-Dynamik: Hirsch verbraucht Ausdauer beim schnellen Sprint
      let speed;
      if (this.stamina > 20) {
        speed = 2.4 * dt;
        this.stamina = Math.max(0, this.stamina - dt * 14); // Ausdauer schwindet
      } else {
        // Erschöpfter Galopp: Hirsch wird spürbar langsamer
        speed = 1.25 * dt;
        this.stamina = Math.max(0, this.stamina - dt * 6);
      }

      if (this.stamina <= 3) {
        // Völlig erschöpft: Hirsch muss anhalten und nach Luft schnappen!
        this.state = 'exhausted';
        this.stateTimer = 2.5;
        logEvent(`🦌 Der Ur-Hirsch ist von der Hetzjagd völlig erschöpft und verlangsamt!`);
      } else if (dist < speed) {
        this.x = this.targetX;
        this.y = this.targetY;

        // Wenn Verfolger noch da ist, weiter fliehen
        if (nearestHumanDist < 5.0 && predator) {
          const angle = Math.atan2(this.y - predator.y, this.x - predator.x);
          const fX = this.x + Math.cos(angle) * 4;
          const fY = this.y + Math.sin(angle) * 4;
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
      this.stamina = Math.min(100, this.stamina + dt * 8);
      if (this.stateTimer <= 0) {
        this.state = 'fleeing';
        // Erneuter Fluchtversuch
        if (predator) {
          const angle = Math.atan2(this.y - predator.y, this.x - predator.x);
          this.targetX = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + Math.cos(angle) * 4)));
          this.targetY = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + Math.sin(angle) * 4)));
        }
      }
    }

    // Äsen / Weiden & normale Bewegung
    if (this.state === 'moving') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = 0.8 * dt;

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
      this.stamina = Math.min(100, this.stamina + dt * 10);
      this.stateTimer -= dt;
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

// Spawnt selten ein Tier am unbewachten Rand
export function maybeSpawnWildAnimal(animals, humans, logEvent) {
  if (animals.length >= 2 || Math.random() > 0.003) return;

  // Rand-Kachel wählen
  const side = Math.floor(Math.random() * 4);
  let sx = 1, sy = 1;
  if (side === 0) { sx = Math.floor(Math.random() * MAP_SIZE); sy = 1; }
  else if (side === 1) { sx = Math.floor(Math.random() * MAP_SIZE); sy = MAP_SIZE - 2; }
  else if (side === 2) { sx = 1; sy = Math.floor(Math.random() * MAP_SIZE); }
  else { sx = MAP_SIZE - 2; sy = Math.floor(Math.random() * MAP_SIZE); }

  // Prüfen, ob Mensch in der Nähe ist
  for (const h of humans) {
    if (h.isAlive && Math.hypot(h.x - sx, h.y - sy) < 8) {
      return; // Nicht spawnen, wenn Menschen dort stehen!
    }
  }

  const deer = new WildAnimal(sx, sy);
  animals.push(deer);
  logEvent(`🦌 Ein wilder Ur-Hirsch hat am Rand das Tal betreten!`);
}
