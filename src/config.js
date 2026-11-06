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
