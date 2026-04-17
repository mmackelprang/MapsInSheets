const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const LIB = path.join(SRC, 'lib');
const DIST = path.join(ROOT, 'dist');

function stripModuleFooter(code) {
  // Remove a trailing block of the form: if (typeof module !== 'undefined') { ... }
  return code.replace(/\n?\s*if\s*\(\s*typeof\s+module\s*!==?\s*['"]undefined['"]\s*\)\s*\{[\s\S]*?\}\s*$/m, '\n');
}

function stripLocalRequires(code) {
  // Remove top-level `const/let/var ... = require('./xxx.js');` lines. These are
  // Node-only; in Apps Script, the names are provided by shared script scope.
  return code.replace(/^[ \t]*(?:const|let|var)\s+.+?=\s*require\(['"]\.\/[^'"]+['"]\)[ \t]*;?\s*\n/gm, '');
}

function writeOut(rel, data) {
  const dst = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, data);
  console.log('  wrote', path.relative(ROOT, dst));
}

function buildOne(srcPath, outName) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  const cleaned = stripLocalRequires(stripModuleFooter(raw));
  writeOut(outName, cleaned);
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  console.log('Building MapsInSheets dist/');
  writeOut('appsscript.json', fs.readFileSync(path.join(SRC, 'appsscript.json')));
  writeOut('Map.html', fs.readFileSync(path.join(SRC, 'Map.html')));
  buildOne(path.join(SRC, 'Code.js'), 'Code.gs');

  for (const f of fs.readdirSync(LIB)) {
    if (!f.endsWith('.js')) continue;
    const base = path.basename(f, '.js').replace(/[^a-zA-Z0-9]+/g, '_');
    buildOne(path.join(LIB, f), 'lib_' + base + '.gs');
  }

  console.log('Done.');
}

main();
