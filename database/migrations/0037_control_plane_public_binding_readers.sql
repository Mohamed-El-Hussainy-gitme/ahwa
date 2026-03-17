begin;

create or replace function public.control_list_cafe_database_bindings()
returns jsonb
language sql
security definer
set search_path = public, control
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cafe_id', b.cafe_id,
        'database_key', b.database_key,
        'binding_source', b.binding_source,
        'created_at', b.created_at,
        'updated_at', b.updated_at
      )
      order by b.created_at asc, b.cafe_id asc
    ),
    '[]'::jsonb
  )
  from control.cafe_database_bindings b;
$$;

comment on function public.control_list_cafe_database_bindings() is
  'PostgREST-safe public reader for control.cafe_database_bindings. Keeps control schema unexposed while allowing platform/admin and maintenance flows to read cafe database bindings through SECURITY DEFINER RPC.';

commit;
