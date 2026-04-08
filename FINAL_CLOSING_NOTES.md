Final closing batch applied:
- fixed waiter workspace build regression by returning addons and productAddonLinks from buildWaiterWorkspace
- preserved step 1/2/3 addon foundations and operational display work
- cleaned release package junk files (logs, stray patch script, stray marker file, tsbuildinfo)

Validation status in this environment:
- npm run typecheck:web: passed after workspace return fix
- full npm run build: blocked by missing type packages in this sandbox install state, but the direct application-level typecheck that previously failed is fixed
