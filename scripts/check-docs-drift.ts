import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface DriftCheckResult {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  summary: string;
  details: string[];
}

const ROOT = process.cwd();
const IGNORED_SERVER_ENV_VARS = new Set([
  'NODE_ENV',
  'NGINX_PORT',
  'DEFAULT_APP_PORT',
  'DISABLE_HMR',
  'NODE_OPTIONS',
]);

function readText(relPath: string): string | null {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function parseArgs(argv: string[]) {
  return {
    strict: argv.includes('--strict'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp() {
  console.log(`
DieCut.Room — Zero-Dependency Documentation Drift Checker (Node 22+)

Usage:
  node scripts/check-docs-drift.ts [--strict] [--help]
  npm run docs:check
  npm run docs:check -- --strict

Checks performed (zero node_modules required):
  1. Git Commit Drift    : Compares verified_at_commit in docs/STATUS.md against HEAD (gracefully skipped if .git absent)
  2. API Route Drift     : Scans all single-line & multi-line /api/* routes in server.ts vs docs/06-API-REFERENCE.md
  3. SQLite Schema Drift : Scans CREATE TABLE & ensureUsersColumn in server.ts vs docs/STATUS.md & docs/04-DEVELOPER-ARCHITECTURE.md
  4. Runtime Env Drift   : Scans process.env.* in server.ts vs .env.example & docs/STATUS.md
  5. Scripts & Docker    : Scans package.json scripts vs docs/STATUS.md and verifies scripts/admin-reset.ts in Dockerfile

Options:
  --strict   Exit with code 1 if any FAIL drift is detected
  --help     Show this usage message
`);
}

function checkGitDrift(statusDoc: string): DriftCheckResult {
  const shaMatch = statusDoc.match(/^verified_at_commit:\s*(.+)$/m);
  const recordedRef = shaMatch ? shaMatch[1].trim() : '';

  try {
    const insideGit = execSync('git rev-parse --is-inside-work-tree', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();

    if (insideGit !== 'true') {
      return {
        name: '1. Git Commit Drift',
        status: 'SKIP',
        summary: 'Not inside a Git work tree — skipped gracefully.',
        details: [],
      };
    }

    const headSha = execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();

    if (!recordedRef) {
      return {
        name: '1. Git Commit Drift',
        status: 'WARN',
        summary: `docs/STATUS.md is missing verified_at_commit (current HEAD: ${headSha}).`,
        details: ['Set verified_at_commit in docs/STATUS.md frontmatter after committing.'],
      };
    }

    // Validate whether recordedRef resolves in git history
    let refExists = false;
    try {
      execSync(`git cat-file -e ${recordedRef}^{commit}`, {
        cwd: ROOT,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      refExists = true;
    } catch {
      refExists = false;
    }

    if (!refExists) {
      return {
        name: '1. Git Commit Drift',
        status: 'WARN',
        summary: `verified_at_commit (${recordedRef}) is a working-tree placeholder or unknown SHA (HEAD: ${headSha}).`,
        details: [`Update verified_at_commit to ${headSha} on your next git commit.`],
      };
    }

    const commitsRaw = execSync(
      `git log --oneline ${recordedRef}..HEAD -- . ':!*.md' ':!docs'`,
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
    ).trim();

    if (!commitsRaw) {
      return {
        name: '1. Git Commit Drift',
        status: 'PASS',
        summary: `No code-touching commits newer than verified_at_commit (${recordedRef}, HEAD ${headSha}).`,
        details: [],
      };
    }

    const commitLines = commitsRaw.split('\n').filter(Boolean);
    return {
      name: '1. Git Commit Drift',
      status: 'WARN',
      summary: `${commitLines.length} code-touching commit(s) since verified_at_commit (${recordedRef}..${headSha}).`,
      details: commitLines.slice(0, 10),
    };
  } catch {
    return {
      name: '1. Git Commit Drift',
      status: 'SKIP',
      summary: 'Git metadata unavailable in this environment — skipped gracefully.',
      details: recordedRef ? [`Recorded verified_at_commit: ${recordedRef}`] : [],
    };
  }
}

function checkApiRoutesDrift(serverSrc: string, apiDoc: string): DriftCheckResult {
  // Multi-line aware matcher capturing both single-line and formatted multi-line Express routes
  const routeRegex = /\bapp\.(get|post|put|patch|delete|all)\(\s*['"](\/api\/[^'"]+)['"]/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(serverSrc)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    found.add(`${method} ${routePath}`);
  }

  const missing: string[] = [];
  for (const sig of Array.from(found).sort()) {
    const [method, routePath] = sig.split(' ');
    // Check either exact "METHOD /api/..." or explicit path mention with method
    const exactPattern = new RegExp(`\\b${method}\\s+${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-])`);
    if (!exactPattern.test(apiDoc)) {
      missing.push(sig);
    }
  }

  if (missing.length === 0) {
    return {
      name: '2. API Route Drift (Multi-line)',
      status: 'PASS',
      summary: `All ${found.size} Express /api/* routes in server.ts are documented in docs/06-API-REFERENCE.md.`,
      details: [],
    };
  }

  return {
    name: '2. API Route Drift (Multi-line)',
    status: 'FAIL',
    summary: `${missing.length} of ${found.size} route(s) missing from docs/06-API-REFERENCE.md.`,
    details: missing.map((r) => `Undocumented route: ${r}`),
  };
}

function checkSchemaDrift(
  serverSrc: string,
  statusDoc: string,
  archDoc: string
): DriftCheckResult {
  const tableRegex = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g;
  const colRegex = /ensureUsersColumn\(\s*['"]([a-zA-Z0-9_]+)['"]/g;

  const tables = new Set<string>();
  const userCols = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(serverSrc)) !== null) tables.add(m[1]);
  while ((m = colRegex.exec(serverSrc)) !== null) userCols.add(m[1]);

  const missing: string[] = [];
  for (const tbl of Array.from(tables).sort()) {
    if (!statusDoc.includes(tbl)) missing.push(`Table '${tbl}' missing in docs/STATUS.md`);
    if (!archDoc.includes(tbl)) missing.push(`Table '${tbl}' missing in docs/04-DEVELOPER-ARCHITECTURE.md`);
  }
  for (const col of Array.from(userCols).sort()) {
    if (!statusDoc.includes(col)) missing.push(`users column '${col}' missing in docs/STATUS.md`);
    if (!archDoc.includes(col)) missing.push(`users column '${col}' missing in docs/04-DEVELOPER-ARCHITECTURE.md`);
  }

  if (missing.length === 0) {
    return {
      name: '3. SQLite Schema Drift',
      status: 'PASS',
      summary: `All ${tables.size} SQLite tables and ${userCols.size} migration columns are documented.`,
      details: [],
    };
  }

  return {
    name: '3. SQLite Schema Drift',
    status: 'FAIL',
    summary: `${missing.length} SQLite schema item(s) undocumented.`,
    details: missing,
  };
}

function checkEnvVarDrift(
  serverSrc: string,
  envExample: string,
  statusDoc: string
): DriftCheckResult {
  const envRegex = /process\.env\.([A-Z][A-Z0-9_]+)/g;
  const envVars = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = envRegex.exec(serverSrc)) !== null) {
    const key = m[1];
    if (!IGNORED_SERVER_ENV_VARS.has(key)) {
      envVars.add(key);
    }
  }

  const missing: string[] = [];
  for (const key of Array.from(envVars).sort()) {
    const keyPattern = new RegExp(`(^|\\n)#?\\s*${key}=`);
    if (!keyPattern.test(envExample)) {
      missing.push(`Env var '${key}' missing in .env.example`);
    }
    if (!statusDoc.includes(key)) {
      missing.push(`Env var '${key}' missing in docs/STATUS.md`);
    }
  }

  if (missing.length === 0) {
    return {
      name: '4. Runtime Env Var Drift',
      status: 'PASS',
      summary: `All ${envVars.size} runtime process.env variables are covered in .env.example and docs/STATUS.md.`,
      details: [],
    };
  }

  return {
    name: '4. Runtime Env Var Drift',
    status: 'FAIL',
    summary: `${missing.length} runtime env var reference(s) missing.`,
    details: missing,
  };
}

function checkScriptsAndDockerParity(
  pkgRaw: string,
  statusDoc: string,
  dockerfile: string | null
): DriftCheckResult {
  const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
  const scriptKeys = Object.keys(pkg.scripts || {});
  const issues: string[] = [];

  for (const key of scriptKeys) {
    if (!statusDoc.includes(`\`${key}\``)) {
      issues.push(`package.json script '${key}' missing in docs/STATUS.md`);
    }
  }

  if (pkg.scripts?.['admin:reset'] && dockerfile) {
    if (!dockerfile.includes('scripts/admin-reset.ts') && !dockerfile.includes('./scripts')) {
      issues.push('Dockerfile runner stage does not copy scripts/admin-reset.ts (npm run admin:reset would fail in Docker)');
    }
  }

  if (issues.length === 0) {
    return {
      name: '5. Scripts & Docker Parity',
      status: 'PASS',
      summary: `All ${scriptKeys.length} npm scripts documented and Dockerfile runner includes scripts/admin-reset.ts.`,
      details: [],
    };
  }

  return {
    name: '5. Scripts & Docker Parity',
    status: 'FAIL',
    summary: `${issues.length} script/Docker parity issue(s) found.`,
    details: issues,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const serverSrc = readText('server.ts');
  const statusDoc = readText('docs/STATUS.md');
  const apiDoc = readText('docs/06-API-REFERENCE.md');
  const archDoc = readText('docs/04-DEVELOPER-ARCHITECTURE.md');
  const envExample = readText('.env.example');
  const pkgRaw = readText('package.json');
  const dockerfile = readText('Dockerfile');

  const missingFiles = [
    ['server.ts', serverSrc],
    ['docs/STATUS.md', statusDoc],
    ['docs/06-API-REFERENCE.md', apiDoc],
    ['docs/04-DEVELOPER-ARCHITECTURE.md', archDoc],
    ['.env.example', envExample],
    ['package.json', pkgRaw],
  ].filter(([, content]) => content === null);

  if (missingFiles.length > 0) {
    console.error(
      `Missing required project files: ${missingFiles.map(([name]) => name).join(', ')}`
    );
    process.exit(1);
  }

  const results: DriftCheckResult[] = [
    checkGitDrift(statusDoc!),
    checkApiRoutesDrift(serverSrc!, apiDoc!),
    checkSchemaDrift(serverSrc!, statusDoc!, archDoc!),
    checkEnvVarDrift(serverSrc!, envExample!, statusDoc!),
    checkScriptsAndDockerParity(pkgRaw!, statusDoc!, dockerfile),
  ];

  console.log('=== DieCut.Room Documentation Drift Report ===');
  let failCount = 0;
  let warnCount = 0;

  for (const res of results) {
    console.log(`[${res.status}] ${res.name}: ${res.summary}`);
    for (const d of res.details) {
      console.log(`       - ${d}`);
    }
    if (res.status === 'FAIL') failCount++;
    if (res.status === 'WARN') warnCount++;
  }

  console.log(
    `\nSummary: ${results.length - failCount - warnCount} clean, ${warnCount} warning(s), ${failCount} failure(s).`
  );

  if (args.strict && failCount > 0) {
    process.exit(1);
  }
}

main();
