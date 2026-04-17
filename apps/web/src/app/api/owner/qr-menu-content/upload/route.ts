import { NextResponse } from 'next/server';
import { requireOpsActorContext, requireOwnerRole } from '@/app/api/ops/_helpers';
import { revalidatePublicMenuForCafeId } from '@/lib/public-ordering';
import {
  PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES,
  PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES,
  uploadPublicMenuProductImage,
} from '@/lib/public-menu-content';

function formatUploadError(code: string) {
  if (code === 'PUBLIC_MENU_IMAGE_TYPE_NOT_ALLOWED') {
    return `نوع الصورة غير مدعوم. الأنواع المسموحة: ${PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES.join(', ')}`;
  }
  if (code === 'PUBLIC_MENU_IMAGE_TOO_LARGE') {
    return `حجم الصورة يجب أن يكون أقل من ${Math.round(PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES / (1024 * 1024))}MB.`;
  }
  if (code === 'PRODUCT_NOT_FOUND') {
    return 'الصنف المحدد غير موجود.';
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const ctx = requireOwnerRole(await requireOpsActorContext());
    const formData = await request.formData();
    const productId = String(formData.get('productId') ?? '').trim();
    const file = formData.get('file');

    if (!productId || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_INPUT', message: 'يجب تحديد الصنف وملف الصورة.' } }, { status: 400 });
    }

    const item = await uploadPublicMenuProductImage({
      cafeId: ctx.cafeId,
      databaseKey: ctx.databaseKey,
      actorOwnerId: ctx.actorOwnerId,
      productId,
      file,
    });

    await revalidatePublicMenuForCafeId(ctx.cafeId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PUBLIC_MENU_IMAGE_UPLOAD_FAILED';
    return NextResponse.json({ ok: false, error: { code, message: formatUploadError(code) } }, { status: 400 });
  }
}
