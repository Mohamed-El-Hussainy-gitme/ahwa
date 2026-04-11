import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'database', 'migrations');
const baselinesDir = path.join(root, 'database', 'baselines');

const controlPlaneOnlyMigrations = new Set([34, 35, 36, 37, 38, 39, 41, 43, 44, 48, 50, 65]);

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

async function readBundle({ includeControlPlaneOnly }) {
  const migrations = await listMigrations();
  const selected = migrations.filter((name) => {
    const num = migrationNumber(name);
    if (num === null) return false;
    return includeControlPlaneOnly ? controlPlaneOnlyMigrations.has(num) : !controlPlaneOnlyMigrations.has(num);
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

const operational = await readBundle({ includeControlPlaneOnly: false });
const controlPlane = await readBundle({ includeControlPlaneOnly: true });

await writeBaseline('operational/0001_fresh_operational_baseline.sql', operational.content);
await writeBaseline('control-plane/0001_fresh_control_plane_baseline.sql', controlPlane.content);
await writeBaseline(
  'README.md',
  [
    '# Fresh database baselines',
    '',
    '- `operational/0001_fresh_operational_baseline.sql`: fresh operational database install bundle for **new operational shards only**.',
    '- `control-plane/0001_fresh_control_plane_baseline.sql`: control-plane-only bundle for the fixed control-plane database (for example `db01`).',
    '',
    'These files are generated from `database/migrations/*`.',
    'Use the operational bundle for newly provisioned runtime databases that do **not** host the control plane.',
    'Use the control-plane bundle only for the single database that owns the control/control-plane schema and registration flow.',
    'Live databases must continue to move forward through the historical migration chain.',
    '',
    '## Three-database topology',
    '',
    '- `db01`: apply `operational/0001_fresh_operational_baseline.sql` first, then apply `control-plane/0001_fresh_control_plane_baseline.sql` on the same database because it hosts both operational + control-plane schemas.',
    '- `db02`: apply `operational/0001_fresh_operational_baseline.sql` only.',
    '- `db03`: apply `operational/0001_fresh_operational_baseline.sql` only.',
    '',
    'For already-running databases, keep using the numbered migrations. For the current topology that means:',
    '',
    '1. Apply `0064_ops_runtime_presence_platform_reality.sql` to every operational database: `db01`, `db02`, and `db03`.',
    '2. Apply `0065_control_plane_runtime_presence_platform_reality.sql` to `db01` only.',
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

console.log('[OK] generated operational + control-plane baselines');
