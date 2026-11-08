// =========================================================================
// HUMAN ACTIONS (Ankunfts-Auslösung onArrived & Abschluss-Logik finishAction)
// =========================================================================
import { campfireStock, fireState, CAMP_CENTER, SHELTER_CONFIG } from '../config.js';
import { spookWildlife } from '../wildlife.js';

export const humanActionMethods = {
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
          // Kaltes Lager: Nahrung ist kalt, zäh, sättigt schlechter (+65%) und birgt Parasiten-Risiko!
          this.needs.food = Math.min(100, this.needs.food + 65);
          if (this.sickTimer <= 0 && Math.random() < 0.20) {
            this.sickTimer = 22.0;
            logEvent(`🤢 ${this.name} hat ungegartes Essen aus dem kalten Lager gegessen und leidet an Magenparasiten!`);
          }
        }
      }
      this.state = 'idle';
    } else if (this.actionIntent === 'mine_rock') {
      this.state = 'mining';
      this.stateTimer = 4.0;
    } else if (this.actionIntent === 'chop_tree') {
      this.state = 'chopping';
      this.stateTimer = 4.5;
    } else if (this.actionIntent === 'dig_roots') {
      this.state = 'digging';
      this.stateTimer = 3.2;
    } else if (this.actionIntent === 'fish_river') {
      this.state = 'fishing';
      this.stateTimer = 4.0;
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
      } else if (this.carried === '🥔 Wurzelknollen') {
        campfireStock.food += 2;
        this.utilityContributed += 10;
        logEvent(`🥔 ${this.name} liefert nahrhafte Knollen/Wurzeln (+2 Vorrat).`);
      } else if (this.carried === '🐟 Flussfisch') {
        campfireStock.food += 2;
        this.utilityContributed += 12;
        logEvent(`🐟 ${this.name} bringt frischen Fisch ans Lagerfeuer (+2 Vorrat).`);
      } else if (this.carried === '💧 Wasser') {
        campfireStock.water++;
        this.utilityContributed += 8;
      } else if (this.carried === '🥩 Wildbret') {
        const yieldAmt = this.lastMeatYield || 5;
        campfireStock.food += yieldAmt;
        this.utilityContributed += (yieldAmt * 5);
        logEvent(`🍖 ${this.name} bringt frisches Fleisch ins Lager! Vorrat +${yieldAmt}.`);
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
      const peersAtFire = humans.filter(
        h => h.id !== this.id && h.isAlive && h.state === 'socializing' && Math.hypot(h.x - CAMP_CENTER.x, h.y - CAMP_CENTER.y) < 3.2
      );
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
  },

  finishAction(map, animals, logEvent) {
    if (this.state === 'hunting') {
      if (this.huntTarget) {
        const meat = this.huntTarget.meatYield || 5;
        const aName = this.huntTarget.name || 'Wild';
        this.huntTarget.isAlive = false;
        this.carried = '🥩 Wildbret';
        this.lastMeatYield = meat;
        spookWildlife(90.0);
        this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
        logEvent(`🏹 ${this.name} hat ein ${aName} erlegt! Er trägt das Fleisch (${meat} Vorrat) ins Lager.`);
        return;
      }
    } else if (this.state === 'digging') {
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      const t = map[gy] && map[gy][gx];
      if (t) {
        t.roots = Math.max(0, (t.roots || 1) - 1);
      }
      this.carried = '🥔 Wurzelknollen';
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
      logEvent(`🥔 ${this.name} hat nahrhafte Wurzelknollen ausgegraben.`);
      return;
    } else if (this.state === 'fishing') {
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      const neighbors = [
        map[gy - 1] && map[gy - 1][gx],
        map[gy + 1] && map[gy + 1][gx],
        map[gy] && map[gy][gx - 1],
        map[gy] && map[gy][gx + 1]
      ];
      const wTile = neighbors.find(n => n && n.type === 'water' && (n.fishStock === undefined || n.fishStock > 0));
      if (wTile && typeof wTile.fishStock === 'number') {
        wTile.fishStock = Math.max(0, wTile.fishStock - 1);
        if (wTile.fishStock === 0) {
          logEvent(`🐟 ${this.name} hat den letzten Fisch an dieser Stelle erbeutet! (Überfischt)`);
        } else {
          logEvent(`🐟 ${this.name} hat am Flussufer einen Fisch erbeutet!`);
        }
      } else {
        logEvent(`🐟 ${this.name} hat am Flussufer einen Fisch erbeutet!`);
      }
      this.carried = '🐟 Flussfisch';
      this.setMoveTarget(map, CAMP_CENTER.x, CAMP_CENTER.y, 'deliver_stock');
      return;
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
      const gx = Math.round(this.x);
      const gy = Math.round(this.y);
      const t = map[gy] && map[gy][gx];
      if (t && t.type === 'rock') {
        if (typeof t.stoneStock !== 'number') {
          t.stoneStock = 8;
          t.maxStoneStock = 8;
        }
        t.stoneStock--;
        if (t.stoneStock <= 0) {
          t.type = 'grass';
          t.stoneStock = 0;
          logEvent(`🪨 Ein Felsen bei [${gx}, ${gy}] ist durch steten Abbau zu Schotter abgetragen.`);
        }
      }
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
};
