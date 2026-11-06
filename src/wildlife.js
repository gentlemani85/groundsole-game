import { MAP_SIZE, campfireStock } from './config.js';

let nextAnimalId = 1;

export class WildAnimal {
  constructor(x, y) {
    this.id = nextAnimalId++;
    this.name = 'Ur-Hirsch';
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.state = 'grazing'; // grazing, moving, fleeing, dead
    this.stateTimer = 4.0;
    this.isAlive = true;
    this.meatYield = 5;
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

    if (nearestHumanDist < 4.5 && this.state !== 'fleeing') {
      this.state = 'fleeing';
      // Flieht in die Gegenrichtung des Menschen
      const fX = this.x + (this.x - predator.x) * 3;
      const fY = this.y + (this.y - predator.y) * 3;
      this.targetX = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(fX)));
      this.targetY = Math.max(0, Math.min(MAP_SIZE - 1, Math.round(fY)));
      logEvent(`🦌 Ein Ur-Hirsch wittert Gefahr und flieht in Panik!`);
    }

    // Bewegung
    if (this.state === 'moving' || this.state === 'fleeing') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = (this.state === 'fleeing' ? 2.4 : 0.8) * dt;

      if (dist < speed) {
        this.x = this.targetX;
        this.y = this.targetY;

        // Wenn er am Kartenrand angekommen ist beim Fliehen: Entkommt er!
        if (this.state === 'fleeing' && (this.x <= 1 || this.x >= MAP_SIZE - 2 || this.y <= 1 || this.y >= MAP_SIZE - 2)) {
          this.isAlive = false;
          logEvent(`💨 Der Ur-Hirsch ist ins dichte Unterholz entkommen.`);
          return;
        }

        this.state = 'grazing';
        this.stateTimer = 3.0 + Math.random() * 4.0;
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
      }
    }

    // Äsen / Weiden
    if (this.state === 'grazing') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        // Ein paar Schritte weiterziehen
        const rx = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.x + (Math.random() * 4 - 2))));
        const ry = Math.max(1, Math.min(MAP_SIZE - 2, Math.round(this.y + (Math.random() * 4 - 2))));
        if (map[ry][rx].type !== 'water') {
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
