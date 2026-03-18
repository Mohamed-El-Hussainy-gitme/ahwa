-- Run on the control-plane database only (db0001).
-- This does NOT create a new control-plane schema. It only registers a newly provisioned
-- operational database so the platform can bind future cafes to it.

select public.control_register_operational_database(
  p_super_admin_user_id      => '<SUPER_ADMIN_USER_ID>'::uuid,
  p_database_key             => 'ops-db-02',
  p_display_name             => 'قاعدة التشغيل 02',
  p_description              => 'fresh operational database after applying database/baselines/operational/0001_fresh_operational_baseline.sql',
  p_is_active                => true,
  p_is_accepting_new_cafes   => true
);
