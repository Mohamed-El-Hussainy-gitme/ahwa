import 'server-only';
import crypto from 'node:crypto';
import { adminOps } from '@/app/api/ops/_server';
import { supabaseAdminForDatabase } from '@/lib/supabase/admin';

export const PUBLIC_MENU_IMAGE_BUCKET = 'public-menu-images';
export const PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;
export const PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PublicMenuProductContentRow = {
  id: string;
  productId: string;
  publicDescription: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  updatedAt: string;
};

export type PublicMenuProductContentView = PublicMenuProductContentRow & {
  imageUrl: string | null;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizePublicMenuDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!normalized) return null;
  return normalized.slice(0, 320);
}

export function normalizePublicMenuImageAlt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  return normalized.slice(0, 160);
}

function mapContentRow(row: any): PublicMenuProductContentRow {
  return {
    id: String(row.id),
    productId: String(row.menu_product_id),
    publicDescription: typeof row.public_description === 'string' ? row.public_description : null,
    imagePath: typeof row.image_path === 'string' ? row.image_path : null,
    imageAlt: typeof row.image_alt === 'string' ? row.image_alt : null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function ensurePublicMenuImageBucket(databaseKey: string) {
  const admin = supabaseAdminForDatabase(databaseKey);
  const current = await admin.storage.getBucket(PUBLIC_MENU_IMAGE_BUCKET);
  if (current.error && !String(current.error.message ?? '').toLowerCase().includes('not found')) {
    throw current.error;
  }

  if (!current.data) {
    const created = await admin.storage.createBucket(PUBLIC_MENU_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: [...PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES],
    });

    if (created.error && !String(created.error.message ?? '').toLowerCase().includes('already')) {
      throw created.error;
    }
    return;
  }

  const needsUpdate = !current.data.public
    || Number(current.data.file_size_limit ?? PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES) !== PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES
    || JSON.stringify([...(current.data.allowed_mime_types ?? [])].sort()) !== JSON.stringify([...PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES].sort());

  if (!needsUpdate) return;

  const updated = await admin.storage.updateBucket(PUBLIC_MENU_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES,
    allowedMimeTypes: [...PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES],
  });

  if (updated.error) {
    throw updated.error;
  }
}

function resolveImageExtension(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function buildPublicMenuImagePath(cafeId: string, productId: string, mimeType: string) {
  const extension = resolveImageExtension(mimeType);
  const stamp = Date.now();
  return `${cafeId}/${productId}/${stamp}-${crypto.randomUUID()}.${extension}`;
}

export async function resolvePublicMenuImageUrl(databaseKey: string, imagePath: string | null | undefined) {
  const normalized = String(imagePath ?? '').trim();
  if (!normalized) return null;
  const admin = supabaseAdminForDatabase(databaseKey);
  const { data } = admin.storage.from(PUBLIC_MENU_IMAGE_BUCKET).getPublicUrl(normalized);
  return String(data.publicUrl ?? '').trim() || null;
}

export async function listPublicMenuProductContent(
  cafeId: string,
  databaseKey: string,
  productIds?: readonly string[] | null,
): Promise<PublicMenuProductContentView[]> {
  let query = adminOps(databaseKey)
    .from('public_menu_product_content')
    .select('id, menu_product_id, public_description, image_path, image_alt, updated_at')
    .eq('cafe_id', cafeId)
    .order('updated_at', { ascending: false });

  const normalizedProductIds = (productIds ?? []).map((value) => String(value).trim()).filter(Boolean);
  if (normalizedProductIds.length) {
    query = query.in('menu_product_id', normalizedProductIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => mapContentRow(row));
  const imageUrlEntries = await Promise.all(
    rows.map(async (row) => [row.productId, await resolvePublicMenuImageUrl(databaseKey, row.imagePath)] as const),
  );
  const imageUrlByProductId = new Map(imageUrlEntries);

  return rows.map((row) => ({
    ...row,
    imageUrl: imageUrlByProductId.get(row.productId) ?? null,
  }));
}

export async function getPublicMenuProductContent(
  cafeId: string,
  databaseKey: string,
  productId: string,
): Promise<PublicMenuProductContentView | null> {
  const items = await listPublicMenuProductContent(cafeId, databaseKey, [productId]);
  return items[0] ?? null;
}

export async function assertCafeProductExists(cafeId: string, databaseKey: string, productId: string) {
  const { data, error } = await adminOps(databaseKey)
    .from('menu_products')
    .select('id')
    .eq('cafe_id', cafeId)
    .eq('id', productId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('PRODUCT_NOT_FOUND');
  }
}

export async function savePublicMenuProductMetadata(params: {
  cafeId: string;
  databaseKey: string;
  actorOwnerId: string;
  productId: string;
  publicDescription: string | null;
  imageAlt: string | null;
}) {
  await assertCafeProductExists(params.cafeId, params.databaseKey, params.productId);

  const admin = adminOps(params.databaseKey);
  const { data: current, error: currentError } = await admin
    .from('public_menu_product_content')
    .select('id, image_path, public_description, image_alt')
    .eq('cafe_id', params.cafeId)
    .eq('menu_product_id', params.productId)
    .maybeSingle();
  if (currentError) throw currentError;

  const hasAnyPayload = !!params.publicDescription || !!params.imageAlt || !!String(current?.image_path ?? '').trim();
  if (!hasAnyPayload) {
    if (current?.id) {
      const { error } = await admin
        .from('public_menu_product_content')
        .delete()
        .eq('cafe_id', params.cafeId)
        .eq('id', String(current.id));
      if (error) throw error;
    }
    return null;
  }

  if (current?.id) {
    const { error } = await admin
      .from('public_menu_product_content')
      .update({
        public_description: params.publicDescription,
        image_alt: params.imageAlt,
        updated_at: new Date().toISOString(),
        updated_by_owner_id: params.actorOwnerId,
      })
      .eq('cafe_id', params.cafeId)
      .eq('id', String(current.id));

    if (error) throw error;
  } else {
    const { error } = await admin.from('public_menu_product_content').insert({
      cafe_id: params.cafeId,
      menu_product_id: params.productId,
      public_description: params.publicDescription,
      image_alt: params.imageAlt,
      updated_by_owner_id: params.actorOwnerId,
    });

    if (error) throw error;
  }

  return getPublicMenuProductContent(params.cafeId, params.databaseKey, params.productId);
}

export async function uploadPublicMenuProductImage(params: {
  cafeId: string;
  databaseKey: string;
  actorOwnerId: string;
  productId: string;
  file: File;
}) {
  await assertCafeProductExists(params.cafeId, params.databaseKey, params.productId);
  await ensurePublicMenuImageBucket(params.databaseKey);

  const mimeType = String(params.file.type ?? '').trim().toLowerCase();
  if (!PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES.includes(mimeType as (typeof PUBLIC_MENU_IMAGE_ALLOWED_MIME_TYPES)[number])) {
    throw new Error('PUBLIC_MENU_IMAGE_TYPE_NOT_ALLOWED');
  }

  if (params.file.size > PUBLIC_MENU_IMAGE_FILE_SIZE_LIMIT_BYTES) {
    throw new Error('PUBLIC_MENU_IMAGE_TOO_LARGE');
  }

  const admin = adminOps(params.databaseKey);
  const { data: current, error: currentError } = await admin
    .from('public_menu_product_content')
    .select('id, image_path, public_description, image_alt')
    .eq('cafe_id', params.cafeId)
    .eq('menu_product_id', params.productId)
    .maybeSingle();
  if (currentError) throw currentError;

  const nextPath = buildPublicMenuImagePath(params.cafeId, params.productId, mimeType);
  const storage = supabaseAdminForDatabase(params.databaseKey).storage.from(PUBLIC_MENU_IMAGE_BUCKET);
  const upload = await storage.upload(nextPath, params.file, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  });

  if (upload.error) {
    throw upload.error;
  }

  try {
    if (current?.id) {
      const { error } = await admin
        .from('public_menu_product_content')
        .update({
          image_path: nextPath,
          updated_at: new Date().toISOString(),
          updated_by_owner_id: params.actorOwnerId,
        })
        .eq('cafe_id', params.cafeId)
        .eq('id', String(current.id));
      if (error) throw error;
    } else {
      const { error } = await admin.from('public_menu_product_content').insert({
        cafe_id: params.cafeId,
        menu_product_id: params.productId,
        image_path: nextPath,
        updated_by_owner_id: params.actorOwnerId,
      });
      if (error) throw error;
    }
  } catch (error) {
    await storage.remove([nextPath]);
    throw error;
  }

  const previousPath = String(current?.image_path ?? '').trim();
  if (previousPath && previousPath !== nextPath) {
    await storage.remove([previousPath]);
  }

  return getPublicMenuProductContent(params.cafeId, params.databaseKey, params.productId);
}

export async function removePublicMenuProductImage(params: {
  cafeId: string;
  databaseKey: string;
  actorOwnerId: string;
  productId: string;
}) {
  await assertCafeProductExists(params.cafeId, params.databaseKey, params.productId);

  const admin = adminOps(params.databaseKey);
  const { data: current, error: currentError } = await admin
    .from('public_menu_product_content')
    .select('id, public_description, image_path, image_alt')
    .eq('cafe_id', params.cafeId)
    .eq('menu_product_id', params.productId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current?.id) {
    return null;
  }

  const previousPath = String(current.image_path ?? '').trim();
  const stillHasPayload = !!normalizePublicMenuDescription(current.public_description) || !!normalizePublicMenuImageAlt(current.image_alt);

  if (stillHasPayload) {
    const { error } = await admin
      .from('public_menu_product_content')
      .update({
        image_path: null,
        updated_at: new Date().toISOString(),
        updated_by_owner_id: params.actorOwnerId,
      })
      .eq('cafe_id', params.cafeId)
      .eq('id', String(current.id));
    if (error) throw error;
  } else {
    const { error } = await admin
      .from('public_menu_product_content')
      .delete()
      .eq('cafe_id', params.cafeId)
      .eq('id', String(current.id));
    if (error) throw error;
  }

  if (previousPath) {
    await supabaseAdminForDatabase(params.databaseKey).storage.from(PUBLIC_MENU_IMAGE_BUCKET).remove([previousPath]);
  }

  return getPublicMenuProductContent(params.cafeId, params.databaseKey, params.productId);
}
