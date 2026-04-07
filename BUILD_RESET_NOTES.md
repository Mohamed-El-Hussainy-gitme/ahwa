# Build reset applied

This package keeps the current application code, but resets the build baseline files to the last stable build where they were identical or known-stable:

- root `package.json`
- root `package-lock.json`
- `.nvmrc`
- `.gitignore`
- `.github/workflows/ci.yml`
- `apps/web/package.json`
- `apps/web/vercel.json`
- `apps/web/next.config.ts`
- `apps/web/tsconfig.json`

Generated artifacts were removed:

- `node_modules`
- `.next`
- `packages/shared/dist`
- `*.tsbuildinfo`
- local build logs

Important: if Vercel still builds from `apps/web`, that is a dashboard configuration issue outside the repository.
