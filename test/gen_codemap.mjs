// =========================================================================
// DETERMINISTISCHER CODE-MAP GENERATOR (Token-Spar-Index für KI-Agenten)
// Erzeugt CODE_MAP.md mit exakten Zeilennummern aller Funktionen & Methoden.
// =========================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const outFile = path.join(rootDir, 'CODE_MAP.md');

const FILE_DESCRIPTIONS = {
  'src/config.js': 'Globale Konstanten, Vorrats-Startwerte, Hütten- & Fäulnis-Parameter',
  'src/isometric.js': '2:1 Isometrie-Projektion (gridToScreen / screenToGrid) & Kamera',
  'src/pathfinding.js': 'Deterministische BFS-Wegfindung & Begehbarkeits-Prüfung (Wasserfurten)',
  'src/foraging.js': 'Karten-Suchfunktionen (Beeren, Wurzeln, Fischgründe, Bäume, Felsen, Ufer, Feuer, Hüttenplatz)',
  'src/map.js': 'Biom-Definitionen, prozedurale Karten-Generierung & NPK-/Pflanzen-/Feuer-Ökologie-Tick',
  'src/wildlife.js': 'Tier-Spezies (Hirsch, Wildschwein, Bison, Feldhase), Flucht-/Grasungs-KI & Spawn',
  'src/migration.js': 'Ökologischer Druck-Rechner & nomadischer Tal-Wechsel (Migration)',
  'src/human.js': 'Hominiden-Kernklasse (Konstruktor, BFS-Bewegung, Hetzjagd, Stoffwechsel-Loop) & Zuzug',
  'src/human/tasks.js': 'Hominiden-Entscheidungsbaum & Zielsuche (seekFood, seekWater, seekProductiveTask, ...)',
  'src/human/actions.js': 'Hominiden-Aktionsausführung bei Ankunft (onArrived) & Abschluss (finishAction)',
  'src/human/social.js': 'Soziale Rituale (Lagerfeuer-Kreis, Plaudern, Kinderspiel) & Geburt (giveBirth)',
  'src/render.js': 'Haupt-Renderer & Y+X Tiefensortierung (Occlusion)',
  'src/render/environment.js': 'Canvas-Zeichnung für Boden, Wasser, Blumen, Sträucher, Bäume, Felsen, Hütten & Feuer',
  'src/render/animals.js': 'Prozedurale Vektor-Zeichnung der 4 Wildtier-Arten (drawAnimal)',
  'src/render/humans.js': 'Prozedurale Vektor-Zeichnung der Hominiden, Werkzeuge, Traglinge & Icons (drawHuman)',
  'src/main.js': 'Browser-Einstieg, Game-Loop, DOM-Inspektor-Karten, Hitbox-Klick & Umwelt-Werkzeuge'
};

function collectJsFiles(dir, base = 'src') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const e of entries) {
    const rel = path.posix.join(base, e.name);
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results = results.concat(collectJsFiles(full, rel));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      results.push({ rel, full });
    }
  }
  return results;
}

const files = collectJsFiles(srcDir);
// Sortiere nach logischer Reihenfolge aus FILE_DESCRIPTIONS
const orderKeys = Object.keys(FILE_DESCRIPTIONS);
files.sort((a, b) => {
  const ia = orderKeys.indexOf(a.rel);
  const ib = orderKeys.indexOf(b.rel);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
});

const symbolRegex = /^(?:export\s+(?:const|let|function|class)\s+([a-zA-Z0-9_]+)|(?:function|class)\s+([a-zA-Z0-9_]+)|\s{2}([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{)/;
const skipNames = new Set(['if', 'for', 'while', 'switch', 'catch']);

let md = `# CODE_MAP – Deterministischer Zeilen-Index (Auto-Generated)\n\n`;
md += `> **Für KI-Agenten:** Nutze diese Tabelle, um gezielt per \`read_file(Path, StartLine, EndLine)\` nur die benötigte Funktion zu lesen, statt ganze Dateien zu scannen. Wird bei \`npm run build\` automatisch aktualisiert.\n\n`;

md += `## 1. Datei-Übersicht (\`src/\`)\n\n`;
md += `| Datei | Zeilen | Zuständigkeit |\n`;
md += `| :--- | ---: | :--- |\n`;

const fileSymbols = [];

for (const f of files) {
  const content = fs.readFileSync(f.full, 'utf8');
  const lines = content.split('\n');
  const desc = FILE_DESCRIPTIONS[f.rel] || 'Modul';
  md += `| \`${f.rel}\` | ${lines.length} | ${desc} |\n`;

  const syms = [];
  lines.forEach((line, idx) => {
    const m = line.match(symbolRegex);
    if (m) {
      const name = m[1] || m[2] || m[3];
      if (!skipNames.has(name)) {
        const cleanLine = line.trim().replace(/\s*\{$/, '');
        syms.push({ line: idx + 1, sig: cleanLine });
      }
    }
  });
  fileSymbols.push({ rel: f.rel, totalLines: lines.length, syms });
}

md += `\n## 2. Exakte Zeilennummern aller Funktionen, Klassen & Exporte\n\n`;

for (const fsym of fileSymbols) {
  md += `### \`${fsym.rel}\` (${fsym.totalLines} Zeilen)\n`;
  for (const s of fsym.syms) {
    md += `- **L${s.line}**: \`${s.sig}\`\n`;
  }
  md += `\n`;
}

fs.writeFileSync(outFile, md, 'utf8');
console.log(`✅ CODE_MAP.md aktualisiert (${files.length} Module indiziert).`);
