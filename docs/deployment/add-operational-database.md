# Add a new operational database

Use this flow whenever you provision `db02`, `db03`, or any later operational database.

## 1) Create the new operational database

Create an empty database instance for runtime traffic.

## 2) Apply the fresh operational baseline

Run only:

```sql
\i database/baselines/operational/0001_fresh_operational_baseline.sql
```

This step prepares the runtime schema for the new operational database.
It does **not** touch the control plane.

## 3) Register the new database in the control plane (`db0001`)

Run the saved contract on the control-plane database:

```sql
\i database/control-plane/register-operational-database.sql
```

Or call the RPC directly:

```sql
select public.control_register_operational_database(
  p_super_admin_user_id    => '<SUPER_ADMIN_USER_ID>'::uuid,
  p_database_key           => 'ops-db-02',
  p_display_name           => 'قاعدة التشغيل 02',
  p_description            => 'fresh operational database',
  p_is_active              => true,
  p_is_accepting_new_cafes => true
);
```

The control plane stays central and persistent. Only the new operational database is provisioned from the baseline.

## 4) Add the Vercel env group

Add a new env group using the existing contract:

- `AHWA_OPERATIONAL_DATABASE__OPS_DB_02__URL`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_02__PUBLISHABLE_KEY`
- `AHWA_OPERATIONAL_DATABASE__OPS_DB_02__SECRET_KEY`

## 5) Bind future cafes explicitly

After registration, the platform create-cafe flow can target the new `database_key` explicitly.
