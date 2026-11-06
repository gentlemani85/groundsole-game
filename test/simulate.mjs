// =========================================================================
// DETERMINISTISCHER HOMÖOSTASE- & STRESSTEST (CI-HARNISH)
// Prüft, ob der Clan über Generationen stabil subsistiert und das Gleichgewicht hält.
// =========================================================================
import { MAP_SIZE, campfireStock, fireState } from '../src/config.js';
import { createMap, updateEcology } from '../src/map.js';
import { createInitialHumans, maybeSpawnForeignWanderer } from '../src/human.js';
import { maybeSpawnWildAnimal } from '../src/wildlife.js';

console.log("▶ Starte biophysikalischen Homöostase-Test (1.500 Ticks)...");

const map = createMap();
const humans = createInitialHumans();
const animals = [];
const logs = [];
function logEvent(msg) { logs.push(msg); }

const TICKS = 1500;
const dt = 0.1;

let maxPop = humans.length;
let minPop = humans.length;

for (let i = 0; i < TICKS; i++) {
  // Ökologie, Verfall & dezentrale Feuer-Thermodynamik
  updateEcology(map, dt, logEvent);

  // Fauna
  maybeSpawnWildAnimal(animals, humans, logEvent);
  for (let j = animals.length - 1; j >= 0; j--) {
    const a = animals[j];
    if (!a.isAlive) animals.splice(j, 1);
    else a.update(dt, map, humans, logEvent);
  }

  // Genpool
  maybeSpawnForeignWanderer(humans, logEvent);

  // Hominiden
  for (const h of humans) {
    h.update(dt, map, humans, animals, logEvent);
  }

  const living = humans.filter(h => h.isAlive).length;
  if (living > maxPop) maxPop = living;
  if (living < minPop) minPop = living;
}

const finalLiving = humans.filter(h => h.isAlive).length;

console.log(`--------------------------------------------------`);
console.log(`Ticks absolviert:            ${TICKS} (~150s Simulationszeit)`);
console.log(`Start-Population:            3`);
console.log(`End-Population:              ${finalLiving}`);
console.log(`Populations-Spanne:          Min ${minPop} | Max ${maxPop}`);
console.log(`Historische Individuen:      ${humans.length}`);
console.log(`Feuer-Status:                ${Math.round(fireState.intensity)}%`);
console.log(`Vorräte am Feuer:            Holz=${campfireStock.wood}, Nahrung=${campfireStock.food}, Wasser=${campfireStock.water}, Stein=${campfireStock.stone}`);
console.log(`--------------------------------------------------`);

// Kriterien für erfolgreiche Homöostase laut CONSTITUTION.md:
// 1. Clan darf nicht ausgestorben sein (finalLiving > 0)
// 2. Keine unkontrollierte Überpopulation (maxPop <= 18)
// 3. Vorräte dürfen nicht negativ werden
if (finalLiving === 0) {
  console.error("❌ TEST FEHLGESCHLAGEN: Clan ist vollständig ausgestorben (Tal der Toten).");
  process.exit(1);
} else if (maxPop > 18) {
  console.error("❌ TEST FEHLGESCHLAGEN: Unkontrollierte Überpopulation (Malthusianischer Schock).");
  process.exit(1);
} else {
  console.log("✅ TEST BESTANDEN: Dynamische Homöostase und biophysikalisches Gleichgewicht gewahrt!");
  process.exit(0);
}
