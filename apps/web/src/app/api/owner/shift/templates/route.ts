import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsActorContext, requireOwnerOrManager } from '@/app/api/ops/_helpers';
import {
  deleteShiftAssignmentTemplate,
  listShiftAssignmentTemplates,
  saveShiftAssignmentTemplate,
} from '@/lib/ops/owner-admin';

const ShiftKind = z.enum(['morning', 'evening']);
const TemplateAssignments = z.array(
  z.object({
    userId: z.string().uuid(),
    role: z.enum(['supervisor', 'waiter', 'barista', 'shisha', 'american_waiter']),
    actorType: z.enum(['staff', 'owner']).optional(),
  }),
);

const SaveInput = z.object({
  kind: ShiftKind,
  assignments: TemplateAssignments.min(1),
});

const DeleteInput = z.object({
  kind: ShiftKind,
});

function templateErrorMessage(code: string) {
  return code === 'supervisor_required'
    ? 'يجب تحديد مشرف واحد فقط داخل النمط المحفوظ.'
    : code === 'multiple_baristas_not_allowed'
      ? 'لا يمكن حفظ أكثر من باريستا واحد داخل النمط.'
      : code === 'duplicate_shift_assignment'
        ? 'لا يمكن تكرار نفس الشخص داخل النمط المحفوظ.'
        : code;
}

export async function GET() {
  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());
    const templates = await listShiftAssignmentTemplates({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
    });
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_TEMPLATES_FAILED';
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = SaveInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());
    const template = await saveShiftAssignmentTemplate({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      kind: parsed.data.kind,
      assignments: parsed.data.assignments,
    });

    return NextResponse.json({
      ok: true,
      template,
      message: parsed.data.kind === 'morning' ? 'تم حفظ النمط الصباحي.' : 'تم حفظ النمط المسائي.',
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_TEMPLATE_SAVE_FAILED';
    return NextResponse.json({ ok: false, error: { code, message: templateErrorMessage(code) } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = DeleteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const ctx = requireOwnerOrManager(await requireOpsActorContext());
    await deleteShiftAssignmentTemplate({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      kind: parsed.data.kind,
    });

    return NextResponse.json({
      ok: true,
      message: parsed.data.kind === 'morning' ? 'تم حذف النمط الصباحي.' : 'تم حذف النمط المسائي.',
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SHIFT_TEMPLATE_DELETE_FAILED';
    return NextResponse.json({ ok: false, error: { code, message: templateErrorMessage(code) } }, { status: 400 });
  }
}
