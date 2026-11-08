# KI-Einstiegs-Anker & Architektur-Kompass – Acheuléen-Diorama (`isometrie-game`)

> **Oberstes Ziel (Token-Hygiene):** Lies niemals ganze Dateien auf Verdacht und lies **NIEMALS** `bundle.js` oder `preview_animal.html`!
> 1. Öffne zuerst **`CODE_MAP.md`**: Dort stehen alle Module in `src/` samt **exakter Zeilennummer** jeder Funktion.
> 2. Lies mit `read_file(Path, StartLine, EndLine)` gezielt nur den benötigten Zeilenbereich (30–80 Zeilen).

---

## 1. Zwingender Entwicklungs- & Build-Zyklus (Nach JEDER Code-Änderung)

`index.html` lädt im Browser ausschließlich die gebündelte Datei `bundle.js`. Änderungen in `src/**/*.js` werden erst durch den Build wirksam!

1. **Nur in `src/**/*.js` editieren** (chirurgisch via `edit_file`).
2. **Build & Code-Map aktualisieren:**
   ```bash
   npm run build
   ```
   *(Aktualisiert automatisch `CODE_MAP.md` und bündelt `src/main.js` nach `bundle.js`).*
3. **Homöostase-Stresstest (1.500 Ticks + Migrations-Test) ausführen:**
   ```bash
   npm test
   ```
   *(Prüft deterministisch via `test/simulate.mjs`, ob der Klan überlebt, nicht explodiert und die Migration funktioniert).*

---

## 2. Rezeptbuch: Wo muss ich für welchen User-Wunsch anfassen?

### A. Neue Hominiden-Tätigkeit / Verhalten hinzufügen (5 Touchpoints)
Wenn ein Mensch eine neue Aufgabe ausführen soll (z. B. neues Sammelgut, Werkzeugbau, Ritual):
1. **Karten-Suchfunktion (falls neuer Ort gesucht wird):** In `src/foraging.js` anlegen und exportieren.
2. **Entscheidung & Zielwahl (`actionIntent` setzen):**
   - Für Nahrungssuche bei Hunger: `seekFood()` in `src/human/tasks.js`
   - Für Lager-Arbeit / Vorräte: `seekProductiveTask()` in `src/human/tasks.js`
   - Für Kinder (4–12 J.): im Kinder-Block von `update()` in `src/human.js`
3. **Ankunft am Zielort (`state` & `stateTimer` starten):** `onArrived()` in `src/human/actions.js`
4. **Abschluss der Tätigkeit & Ertrag (`carried` setzen / Lager-Lieferung):** `finishAction()` in `src/human/actions.js` (und Abgabe unter `deliver_stock` in `onArrived()`).
5. **Sichtbarkeit in UI & Grafik:**
   - Text-Label für die Personenkarte: `getStatusLabel(h)` in `src/main.js`
   - Icon über dem Kopf / getragener Gegenstand / Handwerkzeug: `drawHuman()` in `src/render/humans.js`

### B. Grafik / Aussehen ändern (Prozedurales Canvas-Rendering)
Alle Grafiken werden ohne externe Bilder direkt per Canvas-2D gezeichnet:
- **Bodenkacheln, Wasserwellen, Blumen, Kot, Büsche, Bäume, Felsen, Hütten, Lagerfeuer:** `src/render/environment.js`
- **Wildtiere (Ur-Bison, Wildschwein, Feldhase, Ur-Hirsch):** `drawAnimal(a)` in `src/render/animals.js`
- **Menschen (Körperbau, Kleidung, Werkzeuge, Traglinge, Icons):** `drawHuman(h)` in `src/render/humans.js`
- **Tiefensortierung (Verdeckung hinter Bäumen/Felsen):** `render()` in `src/render.js`

### C. Neue Tierart oder Jagd-/Fluchtverhalten ändern
1. **Werte & Eigenschaften (Tempo, Fleisch-Ertrag, Fluchtdistanz):** `ANIMAL_SPECIES` in `src/wildlife.js`
2. **Tier-KI & Bewegung:** `WildAnimal.update()` und `maybeSpawnWildAnimal()` in `src/wildlife.js`
3. **Optik:** `drawAnimal(a)` in `src/render/animals.js`

### D. Ökologie, Pflanzenwachstum, Feuer-Thermodynamik & Biome
1. **Grundparameter & Limits:** `src/config.js` (`SHELTER_CONFIG`, `STORAGE_LIMITS`, `SPOILAGE_CONFIG`, `campfireStock`)
2. **Biom-Generierung (Fluss-Aue, Mammut-Steppe, Urwald, Karst-Schlucht):** `BIOMES` & `createMap()` in `src/map.js`
3. **Laufende Ökologie (NPK, Baum-Seneszenz, Stockausschlag, Feuer-Abbrand, Hütten-Verfall, Trampelpfade):** `updateEcology()` in `src/map.js`
4. **Ökologischer Druck & Nomadische Migration in ein neues Tal:** `src/migration.js`

### E. Neues Umwelt-Werkzeug in der rechten Sidebar
1. **Button ergänzen:** `.tool-grid` in `index.html` (`data-tool="..."`)
2. **Klick-Wirkung auf Kachel:** `applyToolAtScreen(sx, sy)` in `src/main.js`
3. **Begehbarkeit für BFS-Wegfindung:** `isTileWalkable(map, x, y)` in `src/pathfinding.js`
4. **Zeichnung:** `src/render/environment.js` und `src/render.js`

---

## 3. Verfassungs-Invarianten (`CONSTITUTION.md`)
- **Hütte vs. Feuer:** Eine Hütte (`shelter`) bietet nur Wind-/Tiefschlafschutz, erzeugt aber **keine** Wärme. Nur ein brennendes Feuer (`fire`, Radius 4.5 Kacheln) schützt vor Kälte-Stoffwechselverlust und gart Nahrung zu 100 % Sättigung.
- **Pflanzen-Schutz:** Trampelpfade (`path`) entstehen nur auf freier Wiese; Bäume und Sträucher werden niemals durch Schritte gelöscht.
- **Epoche:** Altpaläolithikum (~600.000 bis 400.000 v. Chr., Acheuléen). Keine Anachronismen (kein Ackerbau, keine Keramik, kein Metall, kein Pfeil & Bogen).
