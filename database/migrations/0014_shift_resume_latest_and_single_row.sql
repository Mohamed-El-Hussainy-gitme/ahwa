begin;

set local search_path = public, ops;

-- =========================================================
-- 0014_shift_resume_latest_and_single_row.sql
--
-- الهدف:
-- 1) تثبيت قاعدة: صف واحد فقط لكل (cafe_id, shift_kind, business_date)
-- 2) جعل فتح الوردية ذكيًا:
--    - ينشئ وردية جديدة إذا لم توجد
--    - يكمل على نفس الوردية إذا كانت مفتوحة
--    - يعيد متابعة نفس الوردية إذا أُغلقت بالخطأ ولم يبدأ الشيفت التالي
-- 3) حذف snapshot المؤقت عند استكمال وردية مغلقة بالخطأ
-- 4) العمل بشكل آمن حتى لو كان القيد الجديد موجودًا بالفعل
-- =========================================================

-- ---------------------------------------------------------
-- 1) إزالة القيد القديم إن كان موجودًا
-- ---------------------------------------------------------
alter table ops.shifts
  drop constraint if exists shifts_cafe_id_shift_kind_business_date_status_key;

-- ---------------------------------------------------------
-- 2) فحص آمن: لو توجد بيانات مكررة حاليًا لنفس اليوم/النوع/القهوة
--    نوقف المايجريشن برسالة واضحة بدل أي دمج خطر
-- ---------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from ops.shifts
    group by cafe_id, shift_kind, business_date
    having count(*) > 1
  ) then
    raise exception 'duplicate_shift_rows_exist_for_same_cafe_kind_business_date';
  end if;
end $$;

-- ---------------------------------------------------------
-- 3) تثبيت القيد الجديد فقط إذا لم يكن موجودًا بالفعل
-- ---------------------------------------------------------
do $$
declare
  v_constraint_exists boolean;
  v_relkind "char";
begin
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'ops.shifts'::regclass
      and conname = 'shifts_cafe_id_shift_kind_business_date_key'
  )
  into v_constraint_exists;

  if v_constraint_exists then
    raise notice 'constraint shifts_cafe_id_shift_kind_business_date_key already exists, skipping';
    return;
  end if;

  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'ops'
    and c.relname = 'shifts_cafe_id_shift_kind_business_date_key'
  limit 1;

  if v_relkind = 'i' then
    execute 'drop index if exists ops.shifts_cafe_id_shift_kind_business_date_key';
  elsif v_relkind is not null then
    raise exception 'relation shifts_cafe_id_shift_kind_business_date_key exists but is not an index';
  end if;

  execute $sql$
    alter table ops.shifts
      add constraint shifts_cafe_id_shift_kind_business_date_key
      unique (cafe_id, shift_kind, business_date)
      deferrable initially immediate
  $sql$;
end $$;

-- ---------------------------------------------------------
-- 4) لم نعد نحتاج reopen عام كدالة مستقلة
--    لو كانت موجودة من محاولة قديمة احذفها بهدوء
-- ---------------------------------------------------------
drop function if exists public.ops_reopen_shift(uuid, uuid, text);

-- ---------------------------------------------------------
-- 5) فتح الوردية الذكي
-- ---------------------------------------------------------
create or replace function public.ops_open_shift(
  p_cafe_id uuid,
  p_shift_kind text,
  p_business_date date,
  p_opened_by_owner_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ops
as $$
declare
  v_same_shift_id uuid;
  v_same_shift_status text;
  v_any_open_shift_id uuid;
  v_has_next_shift boolean := false;
  v_new_shift_id uuid;
  v_current_rank integer;
begin
  if p_cafe_id is null then
    raise exception 'cafe_id_required';
  end if;

  if p_shift_kind not in ('morning', 'evening') then
    raise exception 'invalid_shift_kind';
  end if;

  if p_business_date is null then
    raise exception 'business_date_required';
  end if;

  if p_opened_by_owner_id is null then
    raise exception 'opened_by_owner_id_required';
  end if;

  v_current_rank :=
    case p_shift_kind
      when 'morning' then 1
      when 'evening' then 2
      else 99
    end;

  -- نفس الوردية لنفس اليوم/النوع
  select s.id, s.status
  into v_same_shift_id, v_same_shift_status
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.shift_kind = p_shift_kind
    and s.business_date = p_business_date
  limit 1;

  -- أي وردية مفتوحة حاليًا لهذا المقهى
  select s.id
  into v_any_open_shift_id
  from ops.shifts s
  where s.cafe_id = p_cafe_id
    and s.status = 'open'
  order by s.opened_at desc nulls last, s.id desc
  limit 1;

  -- الحالة 1: نفس الوردية مفتوحة بالفعل => كمل عليها
  if v_same_shift_id is not null and v_same_shift_status = 'open' then
    return jsonb_build_object(
      'shift_id', v_same_shift_id,
      'mode', 'resumed_open'
    );
  end if;

  -- الحالة 2: توجد وردية مفتوحة أخرى => ممنوع
  if v_any_open_shift_id is not null then
    raise exception 'another_shift_is_already_open';
  end if;

  -- الحالة 3: نفس الوردية موجودة ولكن مغلقة
  -- نسمح باستكمالها فقط إذا لم يبدأ بعدها الشيفت التالي
  if v_same_shift_id is not null and v_same_shift_status = 'closed' then
    select exists (
      select 1
      from ops.shifts s2
      where s2.cafe_id = p_cafe_id
        and s2.id <> v_same_shift_id
        and (
          s2.business_date > p_business_date
          or (
            s2.business_date = p_business_date
            and (
              case s2.shift_kind
                when 'morning' then 1
                when 'evening' then 2
                else 99
              end
            ) > v_current_rank
          )
        )
    )
    into v_has_next_shift;

    if v_has_next_shift then
      raise exception 'cannot_resume_shift_after_next_shift_started';
    end if;

    -- حذف snapshot السابق لهذه الوردية لأنها ستُستكمل ثم تُغلق لاحقًا نهائيًا
    if to_regclass('ops.shift_snapshots') is not null then
      execute 'delete from ops.shift_snapshots where shift_id = $1'
      using v_same_shift_id;
    elsif to_regclass('ops.shift_snapshot') is not null then
      execute 'delete from ops.shift_snapshot where shift_id = $1'
      using v_same_shift_id;
    end if;

    update ops.shifts
    set
      status = 'open',
      closed_at = null,
      closed_by_owner_id = null,
      notes = case
        when p_notes is null or btrim(p_notes) = '' then notes
        when notes is null or btrim(notes) = '' then p_notes
        else notes || E'\n' || p_notes
      end
    where id = v_same_shift_id;

    return jsonb_build_object(
      'shift_id', v_same_shift_id,
      'mode', 'resumed_closed'
    );
  end if;

  -- الحالة 4: لا توجد وردية لهذا اليوم/النوع => أنشئ واحدة جديدة
  insert into ops.shifts (
    cafe_id,
    shift_kind,
    business_date,
    status,
    opened_by_owner_id,
    notes
  ) values (
    p_cafe_id,
    p_shift_kind,
    p_business_date,
    'open',
    p_opened_by_owner_id,
    p_notes
  )
  returning id into v_new_shift_id;

  return jsonb_build_object(
    'shift_id', v_new_shift_id,
    'mode', 'created'
  );
end;
$$;

commit;