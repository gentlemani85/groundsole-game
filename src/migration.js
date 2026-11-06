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
 */
export function computeEcologicalPressure(map, humans, animals, campfireStock) {
  const livingHumans = humans.filter(h => h.isAlive);
  if (livingHumans.length === 0) return 0;

  // 1. Nahrungsverfügbarkeit
  let availableBerries = 0;
  let availableRoots = 0;
  let adultTrees = 0;

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const t = map[y][x];
      if (t.plant) {
        if (t.plant.type === 'bush' && !t.plant.isRootstock) {
          availableBerries += (t.plant.berries || 0);
        } else if (t.plant.type === 'tree' && t.plant.stage === 3) {
          adultTrees++;
        }
      }
      if (t.roots && t.roots > 0) availableRoots += t.roots;
    }
  }

  const livingAnimals = animals.filter(a => a.isAlive).length;

  // Hunger-Quote im Clan
  const hungryCount = livingHumans.filter(h => (100 - h.needs.food) > 60).length;
  const hungerRatio = hungryCount / livingHumans.length;

  // Berechne Teil-Scores (0 - 100)
  // Wenig Vorrat & Beeren & Knollen
  const totalFoodScore = Math.max(0, 100 - (campfireStock.food * 12 + availableBerries * 6 + availableRoots * 4 + livingAnimals * 10));
  // Wenig Holz
  const woodScore = Math.max(0, 100 - (campfireStock.wood * 10 + adultTrees * 6));
  // Hunger im Stamm
  const hungerScore = Math.min(100, Math.round(hungerRatio * 100));

  const weightedPressure = Math.min(100, Math.round(
    totalFoodScore * 0.45 +
    hungerScore * 0.40 +
    woodScore * 0.15
  ));

  migrationState.pressure = weightedPressure;
  migrationState.pressureDetails = {
    food: totalFoodScore,
    hunger: hungerScore,
    wood: woodScore,
    berries: availableBerries,
    trees: adultTrees,
    animals: livingAnimals
  };

  return weightedPressure;
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
    // Automatischer Druck-Trigger: Wenn die Belastung anhaltend extrem ist (>88%)
    if (migrationState.pressure >= 88 && Math.random() < 0.05 * dt) {
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
