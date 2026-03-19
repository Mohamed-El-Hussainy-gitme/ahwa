#!/usr/bin/env node
import process from 'node:process';
import {
  buildTierPlan,
  envString,
  parseArgs,
  platformBootstrapAndLogin,
  provisionCafeFixture,
  randomSuffix,
  resolveLoadProfile,
  writeJsonFile,
} from './common.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl ?? envString('AHWA_LOAD_BASE_URL', 'http://127.0.0.1:3000')).replace(/\/$/, '');
  const profilePath = String(args.profile ?? envString('AHWA_LOAD_PROFILE_PATH', ''));
  const profile = await resolveLoadProfile(profilePath);
  const outputPath = String(args.output ?? envString('AHWA_LOAD_FIXTURE_PATH', 'tmp/load/ops-fixtures.json'));
  const installToken = envString('AHWA_E2E_INSTALL_TOKEN', envString('AHWA_INSTALL_TOKEN', ''));
  const pairingCode = envString('AHWA_E2E_PAIRING_CODE', envString('AHWA_DEVICE_PAIRING_CODE', installToken));
  const platformEmail = envString('AHWA_E2E_PLATFORM_EMAIL', `load-admin-${randomSuffix(6)}@example.com`);
  const platformDisplayName = envString('AHWA_E2E_PLATFORM_DISPLAY_NAME', 'Load Admin');
  const platformPassword = envString('AHWA_E2E_PLATFORM_PASSWORD', 'LoadAdmin!123');
  const platformJar = await platformBootstrapAndLogin({
    baseUrl,
    installToken,
    email: platformEmail,
    displayName: platformDisplayName,
    password: platformPassword,
  });

  const fixtures = [];
  const slugPrefix = envString('AHWA_LOAD_SLUG_PREFIX', 'load');
  const displayPrefix = envString('AHWA_LOAD_CAFE_PREFIX', 'Load Cafe');
  const ownerPrefix = envString('AHWA_LOAD_OWNER_PREFIX', 'Load Owner');
  const tierPlan = buildTierPlan(profile);

  for (const plan of tierPlan) {
    for (let index = 0; index < plan.cafes; index += 1) {
      const fixture = await provisionCafeFixture({
        baseUrl,
        platformJar,
        pairingCode,
        cafeLoadTier: plan.tier,
        slugPrefix,
        displayPrefix,
        ownerNamePrefix: ownerPrefix,
        tierIndex: index,
      });
      fixtures.push(fixture);
      process.stdout.write(`Provisioned ${fixture.cafeSlug} (${plan.tier}) on ${fixture.databaseKey || 'unbound'}\n`);
    }
  }

  await writeJsonFile(outputPath, {
    generatedAt: new Date().toISOString(),
    baseUrl,
    profile,
    platform: {
      email: platformEmail,
      displayName: platformDisplayName,
      password: platformPassword,
    },
    fixtures,
  });

  process.stdout.write(`Saved ${fixtures.length} fixture(s) to ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
