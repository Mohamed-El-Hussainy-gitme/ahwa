import { ok, jsonError, requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { supabaseAdmin } from '@/lib/supabase/admin';

function ops() {
  return supabaseAdmin().schema('ops');
}

export async function GET() {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());

    const [sectionsRes, productsRes, staffRes, shiftRes] = await Promise.all([
      ops().from('menu_sections').select('id', { count: 'exact', head: true }).eq('cafe_id', ctx.cafeId).eq('is_active', true),
      ops().from('menu_products').select('id', { count: 'exact', head: true }).eq('cafe_id', ctx.cafeId).eq('is_active', true),
      ops().from('staff_members').select('id', { count: 'exact', head: true }).eq('cafe_id', ctx.cafeId).eq('employment_status', 'active').eq('is_active', true),
      ops().from('shifts').select('id', { count: 'exact', head: false }).eq('cafe_id', ctx.cafeId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (sectionsRes.error) throw sectionsRes.error;
    if (productsRes.error) throw productsRes.error;
    if (staffRes.error) throw staffRes.error;
    if (shiftRes.error) throw shiftRes.error;

    const openShiftId = shiftRes.data ? String(shiftRes.data.id) : null;
    let assignmentsCount = 0;
    if (openShiftId) {
      const assignmentsRes = await ops()
        .from('shift_role_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('cafe_id', ctx.cafeId)
        .eq('shift_id', openShiftId)
        .eq('is_active', true);
      if (assignmentsRes.error) throw assignmentsRes.error;
      assignmentsCount = assignmentsRes.count ?? 0;
    }

    const sectionsCount = sectionsRes.count ?? 0;
    const productsCount = productsRes.count ?? 0;
    const staffCount = staffRes.count ?? 0;
    const hasOpenShift = !!openShiftId;
    const hasAssignments = assignmentsCount > 0;

    const steps = [
      {
        key: 'menu',
        shortLabel: 'المنيو',
        title: 'أنشئ المنيو',
        description: 'أضف الأقسام والأصناف والأسعار حتى تظهر للويتر والشيشة والمطبخ.',
        done: sectionsCount > 0 && productsCount > 0,
      },
      {
        key: 'staff',
        shortLabel: 'الموظفون',
        title: 'أضف الموظفين',
        description: 'أدخل الموظفين برمز PIN حتى يصبحوا جاهزين للتعيين والعمل.',
        done: staffCount > 0,
      },
      {
        key: 'shift',
        shortLabel: 'الوردية',
        title: 'افتح وردية',
        description: 'افتح وردية صباحي أو مسائي لبدء التشغيل الفعلي داخل القهوة.',
        done: hasOpenShift,
      },
      {
        key: 'roles',
        shortLabel: 'الأدوار',
        title: 'حدّد الأدوار',
        description: 'عيّن الويتر والباريستا والشيشة والمشرف داخل الوردية المفتوحة.',
        done: hasOpenShift && hasAssignments,
      },
    ] as const;

    return ok({
      intro:
        'ابدأ بإنشاء المنيو ثم أضف الموظفين، وبعدها افتح وردية وعيّن الأدوار. الويتر يأخذ الطلبات من الزبائن ويسلمها للمطبخ أو الشيشة، وبعد التجهيز يستلم الجاهز ويسلمه للزبائن، ثم يتم الحساب الفردي لكل شخص داخل جلسته، وبعدها تظهر التقارير والآجل تلقائيًا.',
      sectionsCount,
      productsCount,
      staffCount,
      hasOpenShift,
      roleAssignmentsCount: assignmentsCount,
      totalCount: steps.length,
      completedCount: steps.filter((step) => step.done).length,
      readyToRun: steps.every((step) => step.done),
      steps,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
