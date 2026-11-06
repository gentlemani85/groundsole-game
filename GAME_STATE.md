# Acheuléen-Diorama (~400.000 v. Chr.)

**Standort:** `apps/isometrie-game/`  
**Webserver:** `http://localhost:8080` (oder via `python3 -m http.server 8080 -d apps/isometrie-game`)

---

## 1. Architektur (Modulare Single-Source-of-Truth)
* `index.html`: UI-Gerüst, Werkzeugleiste, Personen-Inspektor.
* `style.css`: Minimalistisches, dunkles Dashboard & Layout.
* `src/config.js`: Spielfeld (26x26), Koordinaten (`CAMP_CENTER`), Vorräte, `fireState`.
* `src/isometric.js`: Mathematisch kalibrierte 2:1 Projektion & Screen-to-Grid Umkehrung.
* `src/map.js`: NPK-Bodenökologie, Magerrasen-Blumen, Kot-Zerfall, Windwurf-Keimung, Wasserfurten (1-2 Kacheln passierbar).
* `src/human.js`: Stoffwechsel, Alterung, Libido/Stillzeit, Feuer schüren/neu entfachen, Hüttenbau, Female Dispersal.
* `src/wildlife.js`: Ur-Hirsch-KI, Heranpirschen, Fluchtverhalten, Jagdertrag (Fleisch).
* `src/render.js`: Occlusion-Rendering (Tiefensortierung: Bäume & Sträucher verdecken Figuren), animiertes Wasser, plastische Hütte & Felsen.
* `src/main.js`: Game-Loop, Zeitraffer (1x, 2x, 5x, 10x Mega), Event-Handling.

---

## 2. Etablierte biophysikalische Kausalitäten
1. **Wasser:** Furten bis 2 Kacheln Breite sind passierbar (bremsen leicht ab); ab 3 Kacheln unpassierbar. Trinken am Ufer.
2. **Boden & NPK:** Karger Boden = bunte Wildblumen. Hoher NPK (durch Kot/Bakterien) = sattes Grün, schnelles Baum-/Strauchwachstum.
3. **Pflanzen:** Wachsen in 3 Stufen; vermehren sich durch Kot-Samen UND autonomen Windwurf.
4. **Feuer-System (Dezentral & Authentisch):**
   * **Autarkie:** Jede Feuerstelle auf der Karte ist eine eigenständige Instanz mit individuellem Brennstoff und Intensität (kein globales Singleton-Feuer).
   * **Optik:** Echtes Flammen-Rendering mit züngelnden Bézier-Flammenzungen (Glutbett, Funkenflug, Rauchfahne, pulsierender Wärmelichthof).
   * **Wärmeradius:** Spendet in 4.5 Kacheln Umkreis aktive Wärme; Kälte erhöht den Stoffwechselverbrauch.
5. **Schutzhütten-Ökologie (Kapazität & Verfall):**
   * **Kapazität:** Jede Hütte bietet Platz für maximal 2 Hominiden. Bei Populationswachstum baut der Klan selbstständig zusätzliche Hütten im Lagerumkreis.
   * **Verfall & Wartung:** Wind und Wetter nagen an den Hütten (Haltbarkeit sinkt). Unter 65% reparieren die Bewohner die Hütte mit Holz. Stirbt der Klan aus, zerfallen alle Hütten nach einiger Zeit vollständig zu Grasland.
6. **Hetzjagd (Persistence Hunting):**
   * **Ausdauer-Physik:** Der Ur-Hirsch flieht bei Gefahr, ermüdet jedoch bei anhaltender Hetzjagd (Ausdauerverbrauch, Hecheln, Verlangsamung).
   * **Verfolgung:** Jäger heften sich aktiv an die Fersen des Wildes, sprinten hinterher und erlegen es im Nahkampf, sobald sie auf 1.2 Kacheln herangekommen sind.
7. **Genpool:** Echte Namensvielfalt; Zuzug fremder Frauen nur bei lebenden Männern und ohne Frauenüberhang.

---

## 3. Nächste geplante Ausbaustufen
* Dynamisches Wetter (Regen- und Trockenzeiten, Anschwellen/Rückgang des Flusses).
* Jagdwaffen (Vom Faustkeil zum Wurfspeer).
* Ahnenkult & Mohan-Rituale an Steinhügeln.
