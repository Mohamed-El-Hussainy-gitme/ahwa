# Phase 28 — Control-plane scale discipline

This phase adds shard-aware admission control and load-tier metadata on top of the existing multi-database control plane.

## Added concepts

- `cafe_load_tier` on `control.cafe_database_bindings`
  - `small`
  - `medium`
  - `heavy`
  - `enterprise`
- `load_units` derived from tier
  - `small = 1`
  - `medium = 3`
  - `heavy = 8`
  - `enterprise = 15`
- per-database policy on `control.operational_databases`
  - `max_load_units`
  - `warning_load_percent`
  - `critical_load_percent`
  - `max_cafes`
  - `max_heavy_cafes`
  - `scale_notes`

## New control-plane functions

- `control_select_operational_database_key`
- `control_recommend_operational_database`
- `control_set_operational_database_scale_policy`
- `control_set_cafe_load_tier`
- updated:
  - `control_list_operational_databases`
  - `control_get_cafe_database_binding`
  - `control_list_cafe_database_bindings`
  - `control_assign_cafe_database`
  - `platform_create_cafe_with_owner`

## Product flow changes

- create-cafe now accepts `cafeLoadTier`
- platform create page shows:
  - recommended shard
  - current shard load score
  - heavy-cafe saturation
- platform settings page exposes per-shard scale policy editing

## Runtime constraint

These changes do not move history into runtime hot tables. Runtime remains archive-first and hot-path tables stay operational only.
