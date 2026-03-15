# Phase B-4 — Idempotency for sensitive mutations

This phase adds lightweight idempotency to the highest-risk runtime mutations without changing the domain model.

## Covered mutations
- settle selected quantities
- defer selected quantities
- record repayment
- add manual deferred debt
- mark ready / partial-ready
- deliver quantities
- request remake
- close shift

## Implementation
- client requests now send `x-ahwa-idempotency-key` for sensitive mutations
- duplicate in-flight requests from the same UI fingerprint reuse the same pending promise on the client
- server stores request keys in `ops.idempotency_keys`
- repeated requests with the same key and same payload replay the cached success response
- repeated requests with the same key but a different payload are rejected
- failed requests release the pending key so a clean retry is possible

## Notes
- this phase is intentionally limited to high-risk writes only
- workspace reads remain unchanged
- no runtime domain behavior changed
