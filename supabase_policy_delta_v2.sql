-- Policy delta v2: restrict supervisor ("مشرف") from kitchen permissions
-- Fixes Postgres 42P13 param-name issue by dropping dependent policies first.

begin;

-- 0) Drop any policies that reference can_update_kitchen_item
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND (
        coalesce(qual,'') ilike '%can_update_kitchen_item%'
        OR coalesce(with_check,'') ilike '%can_update_kitchen_item%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 1) Drop the function (no CASCADE needed now)
DROP FUNCTION IF EXISTS public.can_update_kitchen_item(text);

-- 2) Update kitchen permission helper: supervisor is NOT kitchen now
CREATE OR REPLACE FUNCTION public.can_kitchen()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner()
     OR public.has_shift_role('barista')
     OR public.has_shift_role('shisha')
$$;

-- 3) Recreate can_update_kitchen_item WITHOUT supervisor
-- NOTE: we intentionally avoid param-name mismatches by keeping the signature (text),
-- and using $1 inside the body.
CREATE OR REPLACE FUNCTION public.can_update_kitchen_item(text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner()
      OR ($1 = 'barista' AND public.has_shift_role('barista'))
      OR ($1 = 'shisha'  AND public.has_shift_role('shisha'))
$$;

-- 4) Recreate the update-kitchen policy
DROP POLICY IF EXISTS order_items_update_kitchen ON public.order_items;

CREATE POLICY order_items_update_kitchen
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  cafe_id = public.current_cafe_id()
  AND public.can_update_kitchen_item(assigned_to::text)
)
WITH CHECK (
  cafe_id = public.current_cafe_id()
  AND public.can_update_kitchen_item(assigned_to::text)
);

commit;
