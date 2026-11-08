# CODE_MAP – Deterministischer Zeilen-Index (Auto-Generated)

> **Für KI-Agenten:** Nutze diese Tabelle, um gezielt per `read_file(Path, StartLine, EndLine)` nur die benötigte Funktion zu lesen, statt ganze Dateien zu scannen. Wird bei `npm run build` automatisch aktualisiert.

## 1. Datei-Übersicht (`src/`)

| Datei | Zeilen | Zuständigkeit |
| :--- | ---: | :--- |
| `src/config.js` | 113 | Globale Konstanten, Vorrats-Startwerte, Hütten- & Fäulnis-Parameter |
| `src/isometric.js` | 35 | 2:1 Isometrie-Projektion (gridToScreen / screenToGrid) & Kamera |
| `src/pathfinding.js` | 99 | Deterministische BFS-Wegfindung & Begehbarkeits-Prüfung (Wasserfurten) |
| `src/foraging.js` | 255 | Karten-Suchfunktionen (Beeren, Wurzeln, Fischgründe, Bäume, Felsen, Ufer, Feuer, Hüttenplatz) |
| `src/map.js` | 563 | Biom-Definitionen, prozedurale Karten-Generierung & NPK-/Pflanzen-/Feuer-Ökologie-Tick |
| `src/wildlife.js` | 294 | Tier-Spezies (Hirsch, Wildschwein, Bison, Feldhase), Flucht-/Grasungs-KI & Spawn |
| `src/migration.js` | 283 | Ökologischer Druck-Rechner & nomadischer Tal-Wechsel (Migration) |
| `src/human.js` | 628 | Hominiden-Kernklasse (Konstruktor, BFS-Bewegung, Hetzjagd, Stoffwechsel-Loop) & Zuzug |
| `src/human/tasks.js` | 329 | Hominiden-Entscheidungsbaum & Zielsuche (seekFood, seekWater, seekProductiveTask, ...) |
| `src/human/actions.js` | 342 | Hominiden-Aktionsausführung bei Ankunft (onArrived) & Abschluss (finishAction) |
| `src/human/social.js` | 103 | Soziale Rituale (Lagerfeuer-Kreis, Plaudern, Kinderspiel) & Geburt (giveBirth) |
| `src/render.js` | 119 | Haupt-Renderer & Y+X Tiefensortierung (Occlusion) |
| `src/render/environment.js` | 874 | Canvas-Zeichnung für Boden, Wasser, Blumen, Sträucher, Bäume, Felsen, Hütten & Feuer |
| `src/render/animals.js` | 340 | Prozedurale Vektor-Zeichnung der 4 Wildtier-Arten (drawAnimal) |
| `src/render/humans.js` | 209 | Prozedurale Vektor-Zeichnung der Hominiden, Werkzeuge, Traglinge & Icons (drawHuman) |
| `src/main.js` | 618 | Browser-Einstieg, Game-Loop, DOM-Inspektor-Karten, Hitbox-Klick & Umwelt-Werkzeuge |

## 2. Exakte Zeilennummern aller Funktionen, Klassen & Exporte

### `src/config.js` (113 Zeilen)
- **L4**: `export const TILE_W = 64;`
- **L5**: `export const TILE_H = 32;`
- **L6**: `export const MAP_SIZE = 26;`
- **L9**: `export const START_YEAR = -600000;`
- **L12**: `export const CAMP_CENTER = { x: 12, y: 12 };`
- **L14**: `export const campfireStock =`
- **L22**: `export const fireState =`
- **L28**: `export const SHELTER_CONFIG =`
- **L35**: `export const STORAGE_LIMITS =`
- **L42**: `export const SPOILAGE_CONFIG =`
- **L51**: `export const SEASONS = [`
- **L58**: `export const seasonState =`
- **L71**: `export function advanceSeasonClock(dtSec, logEvent = null)`

### `src/isometric.js` (35 Zeilen)
- **L3**: `export class Camera`
- **L4**: `constructor(canvas)`
- **L11**: `gridToScreen(gx, gy)`
- **L20**: `screenToGrid(sx, sy)`

### `src/pathfinding.js` (99 Zeilen)
- **L8**: `export function isTileWalkable(map, x, y)`
- **L21**: `export function findPath(map, startX, startY, goalX, goalY)`

### `src/foraging.js` (255 Zeilen)
- **L12**: `export function findNearestBushWithBerries(map, fromX, fromY)`
- **L34**: `export function findNearestRootDigSpot(map, fromX, fromY)`
- **L57**: `export function findNearestFishingSpot(map, fromX, fromY)`
- **L89**: `export function countGlobalAvailableFood(map, animals)`
- **L121**: `export function findNearestTile(map, fromX, fromY, type)`
- **L141**: `export function findNearestAdultTree(map, fromX, fromY)`
- **L162**: `export function findNearestShoreTile(map, fromX, fromY)`
- **L188**: `export function isPositionNearLitFire(map, fromX, fromY)`
- **L207**: `export function findNearestLitFireTile(map, fromX, fromY)`
- **L231**: `export function findFreeShelterSpotNearCamp(map, humans = [])`

### `src/map.js` (563 Zeilen)
- **L9**: `export const BIOMES =`
- **L40**: `export function createMap(biomeId = 'river_valley')`
- **L321**: `export function updateEcology(map, dtSec, logEvent)`

### `src/wildlife.js` (294 Zeilen)
- **L13**: `export let spookedTimer = 0;`
- **L15**: `export function spookWildlife(seconds = 90.0)`
- **L19**: `export function updateSpookTimer(dt)`
- **L25**: `export const ANIMAL_SPECIES =`
- **L76**: `export class WildAnimal`
- **L77**: `constructor(x, y, speciesKey = 'deer')`
- **L101**: `update(dt, map, humans, logEvent)`
- **L242**: `export function maybeSpawnWildAnimal(animals, humans, logEvent, map = null)`

### `src/migration.js` (283 Zeilen)
- **L13**: `export const migrationState =`
- **L29**: `export function computeEcologicalPressure(map, humans, animals, campfireStock, fireState = null)`
- **L134**: `export function startMigration(humans, logEvent)`
- **L158**: `export function updateMigration(dt, map, humans, animals, campfireStock, fireState, advanceYearCallback, logEvent)`
- **L208**: `export function executeMigrationArrival(oldMap, humans, animals, campfireStock, fireState, advanceYearCallback, logEvent)`

### `src/human.js` (628 Zeilen)
- **L9**: `export class Human`
- **L10**: `constructor(id, name, gender, role, x, y, tint, ageYears = 24)`
- **L50**: `setMoveTarget(map, tx, ty, intent, huntTarget = null)`
- **L73**: `update(dt, map, humans, animals, logEvent)`
- **L559**: `die(cause, logEvent)`
- **L578**: `export function maybeSpawnForeignWanderer(humans, logEvent, map = null)`
- **L620**: `export function createInitialHumans()`

### `src/human/tasks.js` (329 Zeilen)
- **L18**: `export const humanTaskMethods =`
- **L19**: `seekHunt(animals, map)`
- **L28**: `seekRelief(map)`
- **L47**: `seekWater(map)`
- **L60**: `seekFood(map, animals = [])`
- **L108**: `seekShelterOrFire(map, humans = [])`
- **L143**: `seekMate(humans, map)`
- **L159**: `seekProductiveTask(map, humans = [], animals = [])`
- **L288**: `wander(map)`
- **L296**: `wanderNearCamp(map)`
- **L305**: `findNearestTile(map, type)`
- **L309**: `findNearestBushWithBerries(map)`
- **L313**: `findNearestAdultTree(map)`
- **L317**: `isNearLitFire(map)`
- **L321**: `findNearestLitFire(map)`
- **L325**: `findFreeShelterSpot(map, humans = [])`

### `src/human/actions.js` (342 Zeilen)
- **L7**: `export const humanActionMethods =`
- **L8**: `onArrived(map, humans, animals, logEvent)`
- **L197**: `finishAction(map, animals, logEvent)`

### `src/human/social.js` (103 Zeilen)
- **L9**: `export function allocNextHumanId()`
- **L13**: `export const FEMALE_NAMES = [`
- **L18**: `export const MALE_NAMES = [`
- **L23**: `export const humanSocialMethods =`
- **L24**: `seekCampfireCircle(map, humans, logEvent)`
- **L48**: `chatWithPeer(peer, logEvent)`
- **L66**: `playWithPeer(friend, map, logEvent)`
- **L78**: `giveBirth(humans, logEvent)`

### `src/render.js` (119 Zeilen)
- **L6**: `export class Renderer`
- **L7**: `constructor(ctx, camera)`
- **L13**: `render(map, humans, animals, hoveredGrid, selectedHumanId, dtSec, fireIntensity = 100)`

### `src/render/environment.js` (874 Zeilen)
- **L7**: `function blend4RGB(cSpring, cSummer, cAutumn, cWinter, w)`
- **L15**: `function getLocalSeasonWeights(gx, gy)`
- **L38**: `export const environmentRenderMethods =`
- **L39**: `drawGround(tile, gx, gy)`
- **L166**: `drawFootprints(cx, cy, footprints, w)`
- **L213**: `drawWaterWaves(cx, cy)`
- **L233**: `drawNaturalFlowers(cx, cy, dots, flowerScale = 1.0)`
- **L248**: `drawOrganicPoop(cx, cy)`
- **L263**: `drawOrganicBush(cx, cy, plant)`
- **L372**: `drawOrganicTree(cx, cy, plant)`
- **L519**: `drawNaturalRock(cx, cy, gx = 0, gy = 0, stoneStock = 8, maxStoneStock = 8)`
- **L597**: `drawPrimitiveShelter(cx, cy, shelterData = null)`
- **L696**: `drawCampfire(gx, gy, cx, cy, fireIntensity = 100)`
- **L852**: `drawHoverCursor(gx, gy)`

### `src/render/animals.js` (340 Zeilen)
- **L6**: `export const animalRenderMethods =`
- **L7**: `drawAnimal(a)`

### `src/render/humans.js` (209 Zeilen)
- **L6**: `export const humanRenderMethods =`
- **L7**: `drawHuman(h, selectedHumanId)`

### `src/main.js` (618 Zeilen)
- **L41**: `function logEvent(msg)`
- **L59**: `function resizeCanvas()`
- **L72**: `function getStatusLabel(h)`
- **L91**: `function renderOrUpdateCards(humanList)`
- **L225**: `function updateUI()`
- **L323**: `function selectHuman(id, fromCardClick = false)`
- **L344**: `function findHumanAtScreen(sx, sy)`
- **L461**: `function applyToolAtScreen(sx, sy)`
- **L562**: `function loop(now)`

