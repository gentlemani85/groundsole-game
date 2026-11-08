# Acheuléen-Diorama (-600.000 v. Chr.)

**Standort:** `apps/isometrie-game/`  
**Webserver:** `http://localhost:8080` (oder via `python3 -m http.server 8080 -d apps/isometrie-game`)

---

## 1. Architektur (Modulare Single-Source-of-Truth)
> **Schnelleinstieg für KI-Agenten:** Lies zuerst [`AGENTS.md`](AGENTS.md) (Rezeptbuch & Build-Pflicht) und [`CODE_MAP.md`](CODE_MAP.md) (automatischer Zeilen-Index aller Funktionen). Nach jeder Änderung in `src/` zwingend `npm run build && npm test` ausführen!

* `index.html`: UI-Gerüst, Werkzeugleiste, Weltzeit-Anzeige, Migrations-Leiste, Klan-Demographie, Personen-Inspektor (lädt `bundle.js`).
* `style.css`: Minimalistisches, dunkles Dashboard, Demographie-Karten & Klick-Animationen.
* `src/config.js`: Spielfeld (26x26), Start-Zeitrechnung (`START_YEAR = -600000`), Koordinaten (`CAMP_CENTER`), Vorrats-Limits (`STORAGE_LIMITS`), `SHELTER_CONFIG`, `SPOILAGE_CONFIG`, `fireState`.
* `src/isometric.js`: Mathematisch kalibrierte 2:1 Projektion & Screen-to-Grid Umkehrung (`Camera`).
* `src/pathfinding.js`: Deterministische BFS-Wegfindung (`findPath`) & Begehbarkeits-Prüfung (`isTileWalkable` inkl. Wasserfurten).
* `src/foraging.js`: Zentrale Karten-Suchfunktionen (Beerensträucher, Wurzelknollen, Fischgründe, fällbare Bäume, Felsen, Uferkacheln, brennendes Feuer, freie Hüttenplätze, globale Nahrungsbilanz).
* `src/map.js`: 4 Biome (`BIOMES`), prozedurale Tal-Generierung (`createMap`), NPK-Bodenökologie, Pflanzen-Seneszenz & Stockausschlag, dezentrale Feuer-Thermodynamik (`updateEcology`).
* `src/wildlife.js`: 4 Wildtier-Arten (`ANIMAL_SPECIES`: Ur-Hirsch, Wildschwein, Ur-Bison, Feldhase), Jagdscheu (`spookedTimer`), Flucht-/Grasungs-KI (`WildAnimal`).
* `src/migration.js`: Ökologischer Druck-Index (`computeEcologicalPressure`) & nomadischer Aufbruch in ein neues Flusstal (`startMigration`, `updateMigration`).
* `src/human.js`: Hominiden-Kernklasse (`Human`: Konstruktor, BFS-Bewegung, Hetzjagd, Stoffwechsel-Loop, Alterung) & Wanderer-Zuzug (`maybeSpawnForeignWanderer`).
  * `src/human/tasks.js`: Entscheidungsbaum & Zielsuche (`seekFood`, `seekWater`, `seekProductiveTask`, `seekShelterOrFire`, `seekHunt`, `seekMate`).
  * `src/human/actions.js`: Aktions-Zustandsautomat bei Ankunft (`onArrived`) und Abschluss (`finishAction`).
  * `src/human/social.js`: Soziale Rituale (`seekCampfireCircle`, `chatWithPeer`, `playWithPeer`) & Geburt (`giveBirth`).
* `src/render.js`: Haupt-Renderer & Y+X Tiefensortierung (Occlusion).
  * `src/render/environment.js`: Zeichnung von Boden, Wasserwellen, Blumen, Kot, Sträuchern, Bäumen, schrumpfenden Felsen, Hütten & Bézier-Feuer.
  * `src/render/animals.js`: Prozedurale Vollkörper-Vektorgrafik der 4 Tierarten (`drawAnimal`).
  * `src/render/humans.js`: Prozedurale Hominiden-Figuren, Werkzeuge, Traglinge & Status-Icons (`drawHuman`).
* `src/main.js`: Game-Loop, synchroner Weltzeit-Fortschritt, Demographie-Tracking, Sprite-Hit-Erkennung, stotterfreie DOM-Synchronisation, Event-Handling.

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
8. **Weltzeit & biologische Synchronisation:**
   * **Startzeit:** -600.000 v. Chr. (Altpaläolithikum).
   * **Zeittakt:** Die Weltzeit schreitet exakt synchron zum biologischen Alterungstakt voran (50 Sekunden Simulationszeit = 1 Lebensjahr = 1 Weltjahr).
   * **Jahreslauf:** Dynamische Anzeige des aktuellen Jahres (z. B. `-599.988 v. Chr.`), der verstrichenen Klan-Jahre sowie der 4 Jahreszeiten (Frühling 🌱, Sommer ☀️, Herbst 🍂, Winter ❄️).
9. **Klan-Demographie & Populations-Statistik:**
   * **Echtzeit-Indikatoren:** Gesamtanzahl lebender und historisch verstorbener Klanmitglieder.
   * **Geschlechterverteilung:** Absolutzahlen und prozentuale Verteilung (♂ / ♀).
   * **Altersstruktur:** Reales Durchschnittsalter sowie Minimum/Maximum-Altersspanne.
   * **Listen-Hygiene:** Verstorbene verbleiben nach ihrem Ableben für 1 Spieljahr (50s) zur Information über die Todesursache im Inspektor und lösen sich danach auf (biologische Verwesung / Begräbnisritus), um die Liste schlank zu halten. Die Gesamtstatistik zählt sie weiter als historisch verstorben mit.
10. **Direkte Hominiden-Fokussierung (Screen-to-Inspector):**
   * **Sprite-Hitbox:** Präzise Klick-Erkennung auf Kopf-, Torso- und Fußbereich im isometrischen Raum.
   * **Mauszeiger:** Wechselt über Figuren organisch zu `cursor: pointer`.
   * **Automatischer Sprung:** Ein Klick auf die Figur springt in der Sidebar via weichem Scrollen (`scrollIntoView`) direkt zur Personenkarte und lässt diese kurz bernsteinfarben aufleuchten (`flash-highlight`).
   * **DOM-Schutz:** Chirurgische Node-Updates verhindern DOM-Neuerstellungen im 60Hz-Takt und sichern flüssiges Scrollen.
11. **Trampelfade (Desire Paths) & Renaturierung:**
   * **Emergenz:** Viel begangene Kacheln (z. B. zwischen Feuer, Beerensträuchern und Fluss) verdichten sich durch Fußtritte organisch zu Pfaden (`path`). Auf Pfaden bewegen sich Hominiden 1.6-mal schneller.
   * **Pflanzen-Immunität:** Bäume und Sträucher werden niemals durch Schritte zertrampelt oder gelöscht. Ein Pfad kann ausschließlich auf offener Wiese ohne Gehölze entstehen. Wird ein Strauch auf einen bisherigen Pfad gepflanzt, wird der Pfad an dieser Stelle dauerhaft blockiert.
   * **Sukzession:** Wird ein Pfad über ~2-3 Spieljahre nicht mehr betreten, baut sich der Trampeldruck ab; die Grasnarbe schließt sich und die Wiese erobert den Weg vollständig zurück (inkl. Wildblumen bei magerem NPK).
12. **Säuglinge & Mutterbindung (0 bis 4 Jahre):**
   * **Traglinge:** Säuglinge bleiben bis zum 4. Lebensjahr fest bei ihrer Mutter, werden getragen und über Muttermilch versorgt. Sie verrichten keinerlei Arbeiten.
   * **Mutter-Last:** Mütter mit Säugling bewegen sich durch das Tragegewicht ca. 28% langsamer (`0.72x` Tempo).
   * **Homöostase:** Eine verlängerte Laktationspause verhindert unkontrollierte Folgeschwangerschaften, wodurch Übersterblichkeit vollständig ausgeschlossen wird.
13. **Kinder-Entwicklung & Peer-Play (4 bis 12 Jahre):**
   * **Ablösung:** Mit 4 Jahren lösen sich Kinder aus der Traglings-Bindung und erkunden selbstständig das Lagerumfeld.
   * **Soziales Spiel:** Treffen mehrere Kinder (4–12 J.) aufeinander, spielen sie zu ~70% zusammen (Fangen, Toben), was Energie regeneriert.
   * **Leichte Subsistenz:** Kinder helfen nur geringfügig mit (gelegentliches Beerensammeln in Lagernähe); schwere Arbeiten (Bäume fällen, Felsen schlagen, Großwildjagd) sind ausgeschlossen.
   * **Erwachsenen-Übergang:** Ab dem 12. Lebensjahr übernehmen sie vollwertige Pflichten im Klan.
14. **Soziale Rituale & Lagerfeuer-Kreis (`socializing`):**
   * **Gemeinschaftliches Verweilen:** Hominiden setzen sich nach erledigter Arbeit im Umkreis von 1–2 Kacheln ans brennende Feuer oder halten bei Begegnungen für einen kurzen Lautaustausch an.
   * **Biophysikalische Wirkung:** Energie regeneriert sich im Sozialzustand signifikant schneller; das Wärmebudget und der Huddling-Effekt senken den Grundumsatz (metabolische Ersparnis).
   * **Optische Repräsentation:** Sitzende Hominiden hocken tiefer (Sitzpose) und zeigen dezente Kommunikations-Icons (`🔥` am Feuer, `🗣️` beim Plaudern). Im Inspektor wird der Zustand transparent als `am Feuer 🔥` bzw. `plaudert 🗣️` ausgewiesen.
15. **Physikalische Pleistozän-Jahreszeiten (`seasonState`):**
   * **Herbst (`autumn`):** Gold- und rostrote Laubfärbung; 1.3x schnellere Beerenreife; der Klan stockt seine Vorratsziele vorausschauend auf 8 Holz und 9 Nahrung auf.
   * **Winter (`winter`):** Schneedecke über Boden, Baumkronen, Felsen und Hüttendächern – außer im geschmolzenen Wärmekreis (Radius 3.5 Kacheln) rund um das brennende Stammesfeuer. Vegetations- und Beerenwachstum pausieren; das Feuer verbraucht 1.35x mehr Holz; außerhalb des Feuerradius steigt der Kalorienverbrauch stark an (`1.95x`). Gleichzeitig wirkt der Winterfrost als **Natur-Kühlschrank** (Fäulnis-Verderb im Vorratslager = 0).
16. **Paläo-Traumata, Kooperationsjagd & Infektionen (`injuredTimer` / `sickTimer`):**
   * **Wehrhaftes Großwild:** Alleinjagd auf Ur-Bison (28% Risiko) oder Wildschwein-Keiler (18% Risiko) kann im Nahkampf zu Verletzungen führen (`🩸`, 45% langsameres Humpeln, Schonung am Feuer). Jagt ein zweiter Klan-Jäger im Umkreis von 5 Kacheln mit (**Kooperationsjagd** `🏹🤝`), sinkt das Verletzungsrisiko auf 3–4%.
   * **Rohkost-Parasiten & Unterkühlung:** Verzehr von kaltem/ungegartem Lager-Essen bei erloschenem Feuer (20% Risiko) oder schwere Auskühlung im Winter ohne Feuer führt zu Krankheit (`🤒`, erhöhter Wasser-/Energieverbrauch; heilt am warmen Feuer doppelt so schnell).
17. **Historische Altersstruktur (*Homo heidelbergensis*, Atapuerca-Befund):**
   * **Lebenserwartung:** Realistische Altersspanne von **42 bis 55 Jahren** (Ältesten-Status & ergrautes Haar ab 40 Jahren; Rolle `Ältester / Feuerhüter`).

---

## 3. Nächste geplante Ausbaustufen
* Dynamisches Wetter (Regen- und Trockenzeiten, Anschwellen/Rückgang des Flusses).
* Jagdwaffen (Vom Faustkeil zum Wurfspeer).
* Ahnenkult & Mohan-Rituale an Steinhügeln.
