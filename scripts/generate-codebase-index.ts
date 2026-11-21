import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_REL = 'docs/CODEBASE_INDEX.md';

interface FileEntry {
  relPath: string;
  lines: number;
  exports: string[];
  sections: Array<{ line: number; label: string }>;
}

function walkSourceFiles(dirRel: string, results: string[] = []): string[] {
  const full = path.join(ROOT, dirRel);
  if (!fs.existsSync(full)) return results;
  const entries = fs.readdirSync(full, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    const childRel = path.posix.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(childRel, results);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(childRel);
    }
  }
  return results;
}

function analyzeFile(relPath: string): FileEntry {
  const full = path.join(ROOT, relPath);
  const content = fs.readFileSync(full, 'utf8');
  const linesArr = content.split('\n');
  const exportsSet = new Set<string>();
  const sections: Array<{ line: number; label: string }> = [];

  const exportPatterns = [
    /^export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
    /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
    /^export\s+(?:const|let|class)\s+([A-Za-z0-9_]+)/,
    /^export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/,
  ];

  for (let i = 0; i < linesArr.length; i++) {
    const lineNum = i + 1;
    const trimmed = linesArr[i].trim();

    for (const pat of exportPatterns) {
      const m = trimmed.match(pat);
      if (m) {
        exportsSet.add(m[1]);
        if (linesArr.length >= 400 && (trimmed.startsWith('export function ') || trimmed.startsWith('export async function ') || trimmed.startsWith('export default function '))) {
          sections.push({ line: lineNum, label: `export ${m[1]}` });
        }
        break;
      }
    }

    // Capture major top-level helper functions or handlers in large files (>400 lines) for instant line jumps
    if (linesArr.length >= 400) {
      const fnMatch = linesArr[i].match(/^(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
      if (fnMatch && !exportsSet.has(fnMatch[1])) {
        sections.push({ line: lineNum, label: `fn ${fnMatch[1]}` });
      }
      const handlerMatch = linesArr[i].match(/^  const\s+(handle[A-Z][A-Za-z0-9_]*|setCameraPreset)\s*=\s*(?:async\s*)?\(/);
      if (handlerMatch) {
        sections.push({ line: lineNum, label: handlerMatch[1] });
      }
    }
  }

  return {
    relPath,
    lines: linesArr.length,
    exports: Array.from(exportsSet),
    sections,
  };
}

function extractServerRoutes(serverContent: string): Array<{ line: number; method: string; route: string }> {
  const routes: Array<{ line: number; method: string; route: string }> = [];
  const regex = /\bapp\.(get|post|put|patch|delete|all)\(\s*['"](\/api\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(serverContent)) !== null) {
    const line = serverContent.slice(0, m.index).split('\n').length;
    routes.push({
      line,
      method: m[1].toUpperCase(),
      route: m[2],
    });
  }
  return routes;
}

function extractSqliteTables(serverContent: string): Array<{ line: number; table: string }> {
  const tables: Array<{ line: number; table: string }> = [];
  const regex = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(serverContent)) !== null) {
    const line = serverContent.slice(0, m.index).split('\n').length;
    tables.push({ line, table: m[1] });
  }
  return tables;
}

export function buildCodebaseIndexMarkdown(): string {
  const sourceFiles = [
    'server.ts',
    ...walkSourceFiles('scripts'),
    ...walkSourceFiles('src'),
  ].filter((p) => fs.existsSync(path.join(ROOT, p)));

  const analyzed = sourceFiles.map(analyzeFile);
  const totalLines = analyzed.reduce((acc, f) => acc + f.lines, 0);

  const serverContent = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const routes = extractServerRoutes(serverContent);
  const tables = extractSqliteTables(serverContent);

  const out: string[] = [
    '# DieCut.Room — Auto-Generated Codebase Index (Credit-Saver Map)',
    '',
    '> **Do not edit manually.** Regenerate anytime with `npm run index:build` (`node scripts/generate-codebase-index.ts`, zero dependencies).',
    '> AI Agents: Read this index FIRST to jump directly to target line ranges without scanning multi-thousand-line files.',
    '',
    `- **Indexed Files**: ${analyzed.length} TypeScript/TSX modules (${totalLines.toLocaleString('en-US')} total lines)`,
    `- **Backend API Endpoints**: ${routes.length} routes in \`server.ts\``,
    `- **SQLite Tables**: ${tables.length} tables (${tables.map((t) => `\`${t.table}\` L${t.line}`).join(', ')})`,
    '',
    '---',
    '',
    '## 1. Module & Export Map',
    '',
    '| File | Lines | Key Exports |',
    '| :--- | ---: | :--- |',
  ];

  for (const f of analyzed) {
    const expList =
      f.exports.length === 0
        ? '*(entry / side-effect)*'
        : f.exports.slice(0, 12).map((e) => `\`${e}\``).join(', ') +
          (f.exports.length > 12 ? `, *+${f.exports.length - 12} more*` : '');
    out.push(`| \`${f.relPath}\` | ${f.lines} | ${expList} |`);
  }

  out.push(
    '',
    '---',
    '',
    '## 2. Large File Section Jump-Table (>= 400 lines)',
    '',
    'Jump straight to these line anchors using targeted `StartLine`/`EndLine` reads to save tokens/credits:',
    ''
  );

  for (const f of analyzed.filter((item) => item.lines >= 400 && item.sections.length > 0)) {
    const anchors = f.sections
      .slice(0, 28)
      .map((s) => `\`L${s.line}\` ${s.label}`)
      .join(' · ');
    out.push(`- **\`${f.relPath}\` (${f.lines} lines)**: ${anchors}`);
  }

  out.push(
    '',
    '---',
    '',
    '## 3. Express API Route Line Map (`server.ts`)',
    '',
    '| Line | Method | Path |',
    '| ---: | :--- | :--- |'
  );

  for (const r of routes) {
    out.push(`| \`L${r.line}\` | \`${r.method}\` | \`${r.route}\` |`);
  }

  out.push('');
  return out.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
DieCut.Room — Zero-Dependency Codebase Indexer (Node 22+)

Usage:
  node scripts/generate-codebase-index.ts [--check] [--help]
  npm run index:build

Options:
  --check   Verify docs/CODEBASE_INDEX.md matches current code without writing (exit 1 if stale)
  --help    Show this help message
`);
    process.exit(0);
  }

  const nextContent = buildCodebaseIndexMarkdown();
  const outPath = path.join(ROOT, OUTPUT_REL);

  if (argv.includes('--check')) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (current !== nextContent) {
      console.error(`[FAIL] ${OUTPUT_REL} is out of date. Run 'npm run index:build' to refresh.`);
      process.exit(1);
    }
    console.log(`[PASS] ${OUTPUT_REL} is up to date.`);
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, nextContent, 'utf8');
  console.log(`Generated ${OUTPUT_REL} (${nextContent.split('\n').length} lines).`);
}

main();
