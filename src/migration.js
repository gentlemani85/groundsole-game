// =========================================================================
// NOMADIC MIGRATION & ECOLOGICAL PRESSURE (Weiterzug ins neue Land)
// =========================================================================
// Homo heidelbergensis (Acheuléen): Obligatorische Wanderjäger und Sammler.
// Wenn das Tal überweidet, Beeren kahl und Holz erschöpft ist, bricht
// die Horde geschlossen auf und zieht in ein neues Flusstal weiter.
// =========================================================================

import { MAP_SIZE, CAMP_CENTER } from './config.js';
import { createMap } from './map.js';
import { maybeSpawnWildAnimal } from './wildlife.js';

export const migrationState = {
  isMigrating: false,
  phase: 'idle', // 'idle' | 'gathering' | 'marching' | 'transitioning'
  timer: 0,
  pressure: 0,
  pressureDetails: { food: 0, wood: 0, hunger: 0 },
  migrationsCount: 0,
  announcement: null,
  announcementTimer: 0
};

/**
 * Berechnet den biophysikalischen Druck auf das Tal (0 bis 100%).
 * Berücksichtigt transparent: Feuer-Status, akuten Hunger, Vorratsleere und
 * Erschöpfung des direkten Lager-Umfelds (Radius 6.5 Kacheln).
 */
export function computeEcologicalPressure(map, humans, animals, campfireStock, fireState = null) {
  const livingHumans = humans.filter(h => h.isAlive);
  if (livingHumans.length === 0) return 0;

  // 1. Feuer-Kälte & Erlöschen (max. 35 Punkte)
  // Das Lagerfeuer ist das Herz des Acheuléen-Clans (Wärme, Schutz, Braten).
  let fireScore = 0;
  const currentFire = (fireState && typeof fireState.intensity === 'number') ? fireState.intensity : 100;
  if (currentFire <= 0) {
    fireScore = 35; // Feuer völlig erloschen! Tödliche Kälte und Raubtiergefahr.
  } else if (currentFire < 35) {
    fireScore = Math.round(((35 - currentFire) / 35) * 35);
  }

  // 2. Akuter Hunger im Stamm (max. 30 Punkte)
  const hungryCount = livingHumans.filter(h => h.needs.food < 45).length;
  const starvingCount = livingHumans.filter(h => h.needs.food < 25).length;
  const hungerSeverity = (hungryCount * 0.5 + starvingCount * 0.5) / livingHumans.length;
  const hungerScore = Math.min(30, Math.round(hungerSeverity * 30));

  // 3. Lager-Leere am Feuer (max. 25 Punkte)
  let stockScore = 0;
  if (campfireStock.wood === 0) stockScore += 13; // Kein Brennholz am Lager!
  else if (campfireStock.wood <= 1) stockScore += 6;

  if (campfireStock.food === 0) stockScore += 12; // Keine Nahrung am Lager!
  else if (campfireStock.food <= 2) stockScore += 5;

  // 4. Karge Lager-Lichtung (eng gefasster Radius 4.5 Kacheln) & Hütten-Mangel
  let localBerries = 0;
  let localTrees = 0;
  let localFish = 0;
  let localShelters = 0;

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const dist = Math.hypot(x - CAMP_CENTER.x, y - CAMP_CENTER.y);
      if (dist <= 4.5) {
        const t = map[y][x];
        if (t.plant) {
          if (t.plant.type === 'bush' && !t.plant.isRootstock) {
            localBerries += (t.plant.berries || 0);
          } else if (t.plant.type === 'tree' && t.plant.stage === 3) {
            localTrees++;
          }
        }
        if (t.type === 'water' && t.fishStock && t.fishStock > 0) {
          localFish += t.fishStock;
        }
        if (t.type === 'shelter' && t.shelter && t.shelter.condition > 20) {
          localShelters++;
        }
      }
    }
  }

  // Schutzhütten-Not: Ohne Hütte ist der Stamm Wind und Wetter schutzlos ausgeliefert
  let shelterScore = 0;
  if (localShelters === 0) {
    shelterScore = 25; // Keine einzige Schutzhütte mehr im Lager!
  } else if (localShelters === 1) {
    shelterScore = 10;
  }

  // Kahl geschlagene Nahzone
  let localDepletionScore = 0;
  if (localTrees === 0) localDepletionScore += 15; // Alle Bäume in der Lager-Lichtung gefällt!
  else if (localTrees <= 1) localDepletionScore += 8;

  if (localBerries === 0) localDepletionScore += 10; // Alle Beeren in Lagernähe abgeerntet!
  else if (localBerries <= 2) localDepletionScore += 5;

  if (localFish === 0) localDepletionScore += 5;
  else if (localFish <= 1) localDepletionScore += 2;

  // 5. AKUTE KÄLTEFALLE (Pleistozäne Todesfalle):
  // Wenn das Feuer erloschen ist UND weder Holz am Lager liegt NOCH Bäume in Lagernähe existieren,
  // kann das Feuer nie wieder brennen -> Sofortige Kältefalle (+20 Extra-Punkte)
  let coldTrapScore = 0;
  if (currentFire <= 0 && campfireStock.wood === 0 && localTrees === 0) {
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

/**
 * Löst den geordneten Aufbruch der Horde aus.
 */
export function startMigration(humans, logEvent) {
  if (migrationState.isMigrating) return;

  migrationState.isMigrating = true;
  migrationState.phase = 'gathering';
  migrationState.timer = 4.0;
  migrationState.announcement = "⛺ DIE HORDE BRICHT AUF: Die Ressourcen des Tals sind erschöpft. Der Stamm formiert sich zum Weiterzug!";
  migrationState.announcementTimer = 7.0;

  logEvent(`⛺ AUFBRUCH! Der Clan packt Faustkeile und Vorräte. Mütter nehmen die Kinder huckepack. Das Tal wird verlassen.`);

  // Alle lebenden Hominiden sammeln sich am Lagerfeuer
  for (const h of humans) {
    if (h.isAlive) {
      h.state = 'migrating';
      h.targetX = CAMP_CENTER.x + (Math.random() * 2 - 1);
      h.targetY = CAMP_CENTER.y + (Math.random() * 2 - 1);
    }
  }
}

/**
 * Aktualisiert den Migrations-Ablauf.
 */
export function updateMigration(dt, map, humans, animals, campfireStock, fireState, advanceYearCallback, logEvent) {
  if (migrationState.announcementTimer > 0) {
    migrationState.announcementTimer -= dt;
    if (migrationState.announcementTimer <= 0) {
      migrationState.announcement = null;
    }
  }

  if (!migrationState.isMigrating) {
    // Automatischer Druck-Trigger: Wenn die Belastung anhaltend hoch ist (>= 75%)
    if (migrationState.pressure >= 75 && Math.random() < 0.08 * dt) {
      startMigration(humans, logEvent);
    }
    return map;
  }

  migrationState.timer -= dt;

  if (migrationState.phase === 'gathering') {
    if (migrationState.timer <= 0) {
      migrationState.phase = 'marching';
      migrationState.timer = 5.0;
      logEvent(`🚶 Geschlossener Zug: Die Horde wandert gemeinsam dem östlichen Bergpass entgegen.`);
      // Alle marschieren zum Kartenrand (x = MAP_SIZE - 1)
      for (const h of humans) {
        if (h.isAlive) {
          h.state = 'migrating';
          h.targetX = MAP_SIZE - 1;
          h.targetY = 12 + (Math.random() * 4 - 2);
        }
      }
    }
  } else if (migrationState.phase === 'marching') {
    if (migrationState.timer <= 0) {
      migrationState.phase = 'transitioning';
      // Ankunft im neuen Tal!
      return executeMigrationArrival(map, humans, animals, campfireStock, fireState, advanceYearCallback, logEvent);
    }
  }

  return map;
}

// Biome-Rotationsfolge beim Weiterzug
const BIOME_SEQUENCE = ['river_valley', 'steppe', 'forest', 'karst_canyon'];

/**
 * Vollzieht die Ankunft in einem neuen, unberührten Tal:
 * Generiert eine frische Karte mit völlig neuem Landschaftstyp, setzt Hominiden um, übernimmt Feuerglut.
 */
export function executeMigrationArrival(oldMap, humans, animals, campfireStock, fireState, advanceYearCallback, logEvent) {
  migrationState.migrationsCount++;
  migrationState.isMigrating = false;
  migrationState.phase = 'idle';

  // 1. Nächstes Biom aus der Rotationsfolge wählen
  const curBiomeId = oldMap.biomeId || 'river_valley';
  const curIdx = BIOME_SEQUENCE.indexOf(curBiomeId);
  const nextBiomeId = BIOME_SEQUENCE[(curIdx + 1) % BIOME_SEQUENCE.length];
  const newMap = createMap(nextBiomeId);

  // 2. Zeitrechnung um 1 Wanderungsjahr voranschreiten lassen
  if (typeof advanceYearCallback === 'function') {
    advanceYearCallback(1);
  }

  // 3. Feuerglut-Kontinuität (Acheuléen-Feuerbewahrung im Zunderpilz)
  const oldFireTile = oldMap[CAMP_CENTER.y] && oldMap[CAMP_CENTER.y][CAMP_CENTER.x];
  const oldIntensity = (oldFireTile && oldFireTile.fire) ? oldFireTile.fire.intensity : fireState.intensity;

  const newCenterTile = newMap[CAMP_CENTER.y][CAMP_CENTER.x];
  if (oldIntensity > 15) {
    // Glut gerettet!
    newCenterTile.type = 'fire';
    newCenterTile.plant = null;
    newCenterTile.fire = {
      intensity: 95,
      woodBurnTimer: 0,
      wood: 2,
      isCampCenter: true
    };
    fireState.intensity = 95;
    logEvent(`🔥 DIE GLUT HAT ÜBERLEBT! Der im Zunderpilz gehütete Funke entfacht sofort das neue Stammesfeuer.`);
  } else {
    // Feuer war im alten Tal bereits erloschen
    newCenterTile.type = 'grass';
    newCenterTile.fire = null;
    fireState.intensity = 0;
    logEvent(`❄️ KALTES LAGER: Der Clan hatte keine Glut mehr. Das Feuer muss mühsam neu geschlagen werden.`);
  }

  // 4. Hominiden am westlichen Rand des neuen Tals platzieren
  const livingHumans = humans.filter(h => h.isAlive);
  for (let i = 0; i < livingHumans.length; i++) {
    const h = livingHumans[i];
    h.x = 2 + (i % 3);
    h.y = 11 + Math.floor(i / 3);
    h.targetX = CAMP_CENTER.x;
    h.targetY = CAMP_CENTER.y;
    h.state = 'idle';
    h.actionIntent = 'explore';
    // Wanderung hat etwas Hunger gekostet, aber Lebenswille ist hoch
    h.needs.food = Math.max(35, h.needs.food - 15);
    h.needs.energy = Math.max(45, h.needs.energy - 10);
    h.ageYears += 1.0; // 1 Jahr Reisezeit
  }

  // 5. Frische Fauna im neuen Tal ansiedeln
  animals.length = 0;
  for (let i = 0; i < 3; i++) {
    maybeSpawnWildAnimal(animals, livingHumans, () => {});
  }

  // 6. Vorräte leicht aufstocken durch Wegzehrung
  campfireStock.wood = Math.max(2, campfireStock.wood);
  campfireStock.food = Math.max(3, campfireStock.food);
  campfireStock.stone = Math.max(2, campfireStock.stone);

  const biome = newMap.biome;
  migrationState.announcement = `🌄 NEUES LAND: ${biome.icon} ${biome.name} erreicht! ${biome.desc}`;
  migrationState.announcementTimer = 9.0;
  logEvent(`🌄 NEUES LAND: Der Clan betritt das Biom "${biome.name}" (${biome.icon}). ${biome.desc}`);

  return newMap;
}
