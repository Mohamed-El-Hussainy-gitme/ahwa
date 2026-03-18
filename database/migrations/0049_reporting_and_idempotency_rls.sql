begin;

alter table ops.idempotency_keys enable row level security;
drop policy if exists cafe_access_policy on ops.idempotency_keys;
create policy cafe_access_policy on ops.idempotency_keys
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.daily_snapshots enable row level security;
drop policy if exists cafe_access_policy on ops.daily_snapshots;
create policy cafe_access_policy on ops.daily_snapshots
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.weekly_summaries enable row level security;
drop policy if exists cafe_access_policy on ops.weekly_summaries;
create policy cafe_access_policy on ops.weekly_summaries
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.monthly_summaries enable row level security;
drop policy if exists cafe_access_policy on ops.monthly_summaries;
create policy cafe_access_policy on ops.monthly_summaries
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.yearly_summaries enable row level security;
drop policy if exists cafe_access_policy on ops.yearly_summaries;
create policy cafe_access_policy on ops.yearly_summaries
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.archive_execution_approvals enable row level security;
drop policy if exists cafe_access_policy on ops.archive_execution_approvals;
create policy cafe_access_policy on ops.archive_execution_approvals
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.deferred_customer_balances enable row level security;
drop policy if exists cafe_access_policy on ops.deferred_customer_balances;
create policy cafe_access_policy on ops.deferred_customer_balances
for all
using (app.can_access_cafe(cafe_id))
with check (app.can_access_cafe(cafe_id));

alter table ops.reporting_maintenance_runs enable row level security;
drop policy if exists cafe_access_policy on ops.reporting_maintenance_runs;
create policy cafe_access_policy on ops.reporting_maintenance_runs
for all
using (cafe_id is not null and app.can_access_cafe(cafe_id))
with check (cafe_id is not null and app.can_access_cafe(cafe_id));

commit;
