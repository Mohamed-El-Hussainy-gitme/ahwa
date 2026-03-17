# Phase 9 explicit operational binding

## Problem fixed

Phase 8 still allowed ops execution to depend on ambient request context. In practice this was brittle for Next.js route handlers and led to `UNBOUND_OPERATIONAL_DATABASE` even when the runtime session and control-plane bindings were valid.

## Canonical rule

- `databaseKey` is part of the runtime session contract.
- Route handlers must pass `ctx.databaseKey` explicitly into ops helpers.
- Ops helpers and workspace builders must pass `databaseKey` explicitly into lower-level queries and RPC calls.
- The ops core must not rely on `AsyncLocalStorage` or any other implicit request-scope binding to discover the operational database.

## Practical review checklist

- No bare `adminOps()` calls.
- No bare `ensureRuntimeContract('core')` or `ensureRuntimeContract('reporting')` calls.
- Workspace builders accept `(cafeId, databaseKey)`.
- Mutation helpers such as RPC wrappers, idempotency helpers, menu utilities, and reporting readers accept `databaseKey` explicitly.
