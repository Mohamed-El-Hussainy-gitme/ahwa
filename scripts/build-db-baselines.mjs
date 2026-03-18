import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'database', 'migrations');
const baselinesDir = path.join(root, 'database', 'baselines');

const operationalCutoff = 33;
const controlPlaneCutoff = 38;

function migrationNumber(name) {
  const match = /^(\d{4})_/.exec(name);
  return match ? Number(match[1]) : null;
}

async function listMigrations() {
  const names = await fs.readdir(migrationsDir);
  return names
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

async function readBundle(maxNumber) {
  const migrations = await listMigrations();
  const selected = migrations.filter((name) => {
    const num = migrationNumber(name);
    return num !== null && num <= maxNumber;
  });

  const chunks = [];
  for (const name of selected) {
    const fullPath = path.join(migrationsDir, name);
    const content = await fs.readFile(fullPath, 'utf8');
    chunks.push(`-- >>> ${name}\n${content.trim()}\n-- <<< ${name}\n`);
  }

  return {
    selected,
    content: [
      '-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.',
      '-- Regenerate with: npm run build:db-baselines',
      '',
      ...chunks,
      '',
    ].join('\n'),
  };
}

async function writeBaseline(relativePath, content) {
  const target = path.join(baselinesDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

const operational = await readBundle(operationalCutoff);
const controlPlane = await readBundle(controlPlaneCutoff);

await writeBaseline('operational/0001_fresh_operational_baseline.sql', operational.content);
await writeBaseline('control-plane/0001_fresh_control_plane_baseline.sql', controlPlane.content);
await writeBaseline(
  'README.md',
  [
    '# Fresh database baselines',
    '',
    '- `operational/0001_fresh_operational_baseline.sql`: fresh operational database install bundle (canonical history 0001-0033).',
    '- `control-plane/0001_fresh_control_plane_baseline.sql`: fresh control-plane install bundle (canonical history 0001-0038).',
    '',
    'These files are generated from `database/migrations/*` and are meant for **new empty databases only**.',
    'Live databases must continue to move forward through the historical migration chain.',
    '',
    'Regenerate after any migration change with:',
    '',
    '```bash',
    'npm run build:db-baselines',
    '```',
    '',
    `Operational bundle includes: ${operational.selected.join(', ')}`,
    '',
    `Control-plane bundle includes: ${controlPlane.selected.join(', ')}`,
    '',
  ].join('\n'),
);

console.log('[OK] generated fresh database baselines');
