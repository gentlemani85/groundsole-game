// ==========================================
// SYSTEM-KONFIGURATION & GLOBALE WERTE
// ==========================================
export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_SIZE = 26;

// Start-Zeitrechnung: Acheuléen (-600.000 v. Chr.)
export const START_YEAR = -600000;

// Zentrales Stammeslager am Feuer (12, 12)
export const CAMP_CENTER = { x: 12, y: 12 };

export const campfireStock = {
  stone: 3,
  wood: 6,      // Brennholz-Vorrat
  food: 4,      // Beeren & Vorrat
  water: 3
};

// Das zentrale Feuer als thermodynamisches System
export const fireState = {
  intensity: 100, // Zu Beginn brennendes Stammesfeuer (100%)
  woodBurnTimer: 0
};

// Hütten-Parameter (Kapazität & Verfall)
export const SHELTER_CONFIG = {
  capacity: 2,             // Max 2 Personen pro Hütte
  decayRate: 0.22,          // Verfall pro Sekunde (hält ohne Wartung ca. 450s)
  repairThreshold: 65       // Reparatur-Bedarf ab unter 65% Haltbarkeit
};

// Vorrats-Limits & Fäulnis-Thermodynamik (Keine Konserven / offener Erdboden)
export const STORAGE_LIMITS = {
  maxFood: 28,             // Maximal 28 Einheiten auf offenem Waldboden
  maxWood: 35,
  maxStone: 25,
  maxWater: 20
};

export const SPOILAGE_CONFIG = {
  decayInterval: 12.0,     // Intervall für biologischen Fäulnis-Zerfall
  timer: 0
};

// ==========================================
// JAHRESZEITEN-PHYSIK (Pleistozän-Zyklus)
// 1 Spieljahr = 50s Simulationszeit (je 12.5s pro Jahreszeit)
// ==========================================
export const SEASONS = [
  { key: 'spring', label: 'Frühling 🌱' },
  { key: 'summer', label: 'Sommer ☀️' },
  { key: 'autumn', label: 'Herbst 🍂' },
  { key: 'winter', label: 'Winter ❄️' }
];

export const seasonState = {
  elapsedYears: 0,
  index: 0,
  key: 'spring',
  label: 'Frühling 🌱',
  isSpring: true,
  isSummer: false,
  isAutumn: false,
  isWinter: false
};

export function advanceSeasonClock(dtSec, logEvent = null) {
  if (dtSec <= 0) return;
  const prevIndex = seasonState.index;
  seasonState.elapsedYears += (dtSec / 50);
  const newIndex = Math.floor((seasonState.elapsedYears % 1) * 4) % 4;
  seasonState.index = newIndex;
  seasonState.key = SEASONS[newIndex].key;
  seasonState.label = SEASONS[newIndex].label;
  seasonState.isSpring = (newIndex === 0);
  seasonState.isSummer = (newIndex === 1);
  seasonState.isAutumn = (newIndex === 2);
  seasonState.isWinter = (newIndex === 3);

  if (newIndex !== prevIndex && logEvent) {
    if (newIndex === 0) {
      logEvent('🌱 Schneeschmelze im Tal! Der Frühling weckt neue Knospen und Wildblumen.');
    } else if (newIndex === 2) {
      logEvent('🍂 Der Herbst zieht ins Tal: Das Laub färbt sich golden – der Klan sammelt Wintervorräte.');
    } else if (newIndex === 3) {
      logEvent('❄️ Der eisige Pleistozän-Winter bricht herein! Beeren rasten, Schnee bedeckt das Land.');
    }
  }
}
