select public.control_register_operational_database(
  p_super_admin_user_id      => '8066fc4e-7478-4265-8f81-ba9f8ec892b5'::uuid,
  p_database_key             => 'ops-db-03',
  p_display_name             => 'قاعدة التشغيل 03',
  p_description              => 'fresh operational database after applying operational baseline',
  p_is_active                => true,
  p_is_accepting_new_cafes   => true
);