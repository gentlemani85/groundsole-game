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
4. **Feuer vs. Hütte:**
   * **Feuer:** Zwingende Wärmequelle (Verbrauch: 1 Holz alle ~24s). Fällt es unter 20%, herrscht Kälte (+65% Stoffwechsel). Autonomes Nachlegen & Funken-Schlagen bei Erlöschen.
   * **Hütte:** Reiner mechanischer Wind- und Schlaffschutz (+85% Energie-Regeneration). Erzeugt NULL Wärme.
   * **Nahrung:** Rohe Beeren (+55%), Kaltkost (+65%), Gegartes Fleisch/Essen am Feuer (+100% Sättigung + 15% Energieschub).
5. **Genpool:** Echte Namensvielfalt; Zuzug fremder Frauen nur bei lebenden Männern und ohne Frauenüberhang.

---

## 3. Nächste geplante Ausbaustufen
* Dynamisches Wetter (Regen- und Trockenzeiten, Anschwellen/Rückgang des Flusses).
* Jagdwaffen (Vom Faustkeil zum Wurfspeer).
* Ahnenkult & Mohan-Rituale an Steinhügeln.
