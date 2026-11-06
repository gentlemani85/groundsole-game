// ==========================================
// SYSTEM-KONFIGURATION & GLOBALE WERTE
// ==========================================
export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_SIZE = 26;

// Zentrales Stammeslager am Feuer (12, 12)
export const CAMP_CENTER = { x: 12, y: 12 };

export const campfireStock = {
  stone: 3,
  wood: 6,      // Brennholz-Vorrat
  food: 4,      // Beeren & Vorrat
  water: 3
};

// Das Feuer als thermodynamisches System
export const fireState = {
  intensity: 0, // ZU BEGINN ERLOSCHEN (0%): Der Clan muss erst das Feuer entfachen!
  woodBurnTimer: 0
};
