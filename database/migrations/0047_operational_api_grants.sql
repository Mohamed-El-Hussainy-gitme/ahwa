begin;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to anon, authenticated, service_role;
grant usage on schema ops to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema ops to authenticated, service_role;
grant usage, select on all sequences in schema ops to authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema ops to anon, authenticated, service_role;

alter default privileges in schema ops
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema ops
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

alter default privileges in schema app
  grant execute on functions to anon, authenticated, service_role;

alter default privileges in schema ops
  grant execute on functions to anon, authenticated, service_role;

commit;
