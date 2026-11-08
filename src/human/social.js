// =========================================================================
// HUMAN SOCIAL & DEMOGRAPHICS (Lagerfeuer-Kreis, Peer-Play, Geburt & Zuzug)
// =========================================================================
import { MAP_SIZE, CAMP_CENTER } from '../config.js';
import { isTileWalkable } from '../pathfinding.js';

let nextId = 4;

export function allocNextHumanId() {
  return nextId++;
}

export const FEMALE_NAMES = [
  'Nyx', 'Kora', 'Vana', 'Sula', 'Eila', 'Mira', 'Tala', 'Rhea', 'Ayla',
  'Sunita', 'Brena', 'Zaya', 'Ona', 'Yara', 'Nesta', 'Luma', 'Dara', 'Saga', 'Thora'
];

export const MALE_NAMES = [
  'Einar', 'Dagan', 'Krag', 'Toruk', 'Boran', 'Alok', 'Jaro', 'Bran', 'Tark',
  'Vorn', 'Raban', 'Korm', 'Hagan', 'Wulf', 'Gorm'
];

export const humanSocialMethods = {
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
  },

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
  },

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
  },

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

    const HumanClass = this.constructor;
    const baby = new HumanClass(allocNextHumanId(), babyName, babyGender, 'Säugling / Tragling', this.x + 0.1, this.y + 0.1, babyTint, 0.0);
    baby.motherId = this.id;
    humans.push(baby);
    logEvent(`👶 Geburt! ${babyGender === 'm' ? 'Junge' : 'Mädchen'} ${babyName} wird von Mutter ${this.name} getragen.`);
  }
};
