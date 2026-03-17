# Login Routing Completion — Phase 3

Phase 3 completes the login-path contract introduced by phases 1 and 2.

## Goal

When a user authenticates into a cafe, the app must now carry the resolved `database_key` forward as part of the active runtime context, instead of resolving it only at login time and then forgetting it.

## What was added

### 1. Operational DB cookie

A dedicated cookie now stores the active `database_key` after:
- owner login
- staff login
- device-gate activation

This keeps the active operational database attached to the browser runtime context.

### 2. Runtime operational route helper

`apps/web/src/lib/operational-db/runtime.ts` resolves the current operational route from:
- runtime session
- control-plane binding
- operational DB cookie

### 3. Read-only authz route

`/api/authz/operational-route`

This route exposes the current resolved operational route for the logged-in runtime session.

## Contract

- login must set runtime session + gate state + operational DB cookie together
- runtime requests can now inspect current operational routing state
- future routed runtime handlers can consume the same helper instead of re-resolving from slug each time

## Scope boundary

This phase still does **not** move every operational route to full per-request multi-db runtime routing.
It completes the login-path and active-session propagation contract so later route migrations can happen safely and incrementally.
