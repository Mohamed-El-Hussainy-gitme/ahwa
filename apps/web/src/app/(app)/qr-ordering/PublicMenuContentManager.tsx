'use client';

import { useEffect, useMemo, useState } from 'react';

type StationCode = 'barista' | 'shisha';

type Section = {
  id: string;
  title: string;
  stationCode: StationCode;
  sortOrder: number;
  isActive?: boolean;
};

type Product = {
  id: string;
  sectionId: string;
  name: string;
  stationCode: StationCode;
  unitPrice: number;
  sortOrder: number;
  isActive?: boolean;
  publicDescription: string | null;
  publicImageUrl: string | null;
  publicImageAlt: string | null;
};

type WorkspaceResponse = {
  ok: true;
  sections: Section[];
  products: Product[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value);
}

function ProductContentCard({
  product,
  sectionTitle,
  onUpdated,
}: {
  product: Product;
  sectionTitle: string;
  onUpdated: (productId: string, patch: Partial<Product>) => void;
}) {
  const [publicDescription, setPublicDescription] = useState(product.publicDescription ?? '');
  const [imageAlt, setImageAlt] = useState(product.publicImageAlt ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [savingText, setSavingText] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPublicDescription(product.publicDescription ?? '');
    setImageAlt(product.publicImageAlt ?? '');
  }, [product.publicDescription, product.publicImageAlt]);

  async function saveTextContent() {
    setSavingText(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/owner/qr-menu-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          publicDescription,
          imageAlt,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'تعذر حفظ الوصف الآن.');
      }

      onUpdated(product.id, {
        publicDescription: payload.item?.publicDescription ?? null,
        publicImageAlt: payload.item?.imageAlt ?? null,
      });
      setPublicDescription(payload.item?.publicDescription ?? '');
      setImageAlt(payload.item?.imageAlt ?? '');
      setMessage('تم حفظ النص الخاص بصفحة QR.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الوصف الآن.');
    } finally {
      setSavingText(false);
    }
  }

  async function uploadImage() {
    if (!selectedFile) return;
    setUploadingImage(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.set('productId', product.id);
      formData.set('file', selectedFile);

      const response = await fetch('/api/owner/qr-menu-content/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'تعذر رفع الصورة الآن.');
      }

      onUpdated(product.id, {
        publicImageUrl: payload.item?.imageUrl ?? null,
        publicImageAlt: payload.item?.imageAlt ?? null,
      });
      setImageAlt(payload.item?.imageAlt ?? '');
      setSelectedFile(null);
      setMessage('تم رفع الصورة الخاصة بصفحة QR.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'تعذر رفع الصورة الآن.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function removeImage() {
    setRemovingImage(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/owner/qr-menu-content/image', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'تعذر حذف الصورة الآن.');
      }

      onUpdated(product.id, {
        publicImageUrl: null,
        publicImageAlt: payload.item?.imageAlt ?? null,
      });
      setImageAlt(payload.item?.imageAlt ?? '');
      setMessage('تم حذف الصورة من صفحة QR.');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'تعذر حذف الصورة الآن.');
    } finally {
      setRemovingImage(false);
    }
  }

  return (
    <article className="rounded-[24px] border border-[#e5d8c8] bg-white/90 p-4 shadow-sm lg:p-5">
      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="xl:shrink-0">
          <div className="overflow-hidden rounded-[22px] border border-[#eadfce] bg-[#f8f2ea]">
            {product.publicImageUrl ? (
              <img
                src={product.publicImageUrl}
                alt={product.publicImageAlt || product.name}
                className="h-[180px] w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-[180px] items-center justify-center px-4 text-center text-xs leading-6 text-[#8d7662]">
                لا توجد صورة مخصصة لهذا الصنف في صفحة QR.
              </div>
            )}
          </div>

          <div className="mt-3 text-xs leading-6 text-[#7b6552]">
            <div className="font-bold text-[#1e1712]">{sectionTitle}</div>
            <div>{product.stationCode === 'shisha' ? 'محطة الشيشة' : 'محطة الباريستا'}</div>
            <div>{formatMoney(product.unitPrice)} ج.م</div>
            {product.isActive === false ? (
              <div className="mt-2 inline-flex rounded-full border border-[#e9c9b0] bg-[#fff4ec] px-3 py-1 font-semibold text-[#a95a2a]">
                الصنف غير نشط داخل التشغيل حاليًا
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-xl font-black text-[#1e1712]">{product.name}</h3>
            <p className="mt-1 text-sm leading-7 text-[#6d5848]">
              هذا المحتوى يظهر داخل صفحة الزبون عبر QR فقط، ولن يغيّر منيو التشغيل الداخلي.
            </p>
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#1e1712]">وصف الصنف في QR</span>
              <textarea
                value={publicDescription}
                onChange={(event) => setPublicDescription(event.target.value)}
                rows={4}
                placeholder="مثال: عصير مانجو - فلفر جوز هند - آيس كريم فانيليا"
                className="min-h-[112px] w-full rounded-[18px] border border-[#dccdbb] bg-[#fffdf9] px-4 py-3 text-sm text-[#1e1712] outline-none transition focus:border-[#b8864c]"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold text-[#1e1712]">النص البديل للصورة</span>
              <input
                value={imageAlt}
                onChange={(event) => setImageAlt(event.target.value)}
                placeholder="مثال: كوب مانجو كولادا"
                className="w-full rounded-[18px] border border-[#dccdbb] bg-[#fffdf9] px-4 py-3 text-sm text-[#1e1712] outline-none transition focus:border-[#b8864c]"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveTextContent}
              disabled={savingText}
              className="inline-flex items-center rounded-[16px] bg-[#1e1712] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingText ? 'جارٍ الحفظ...' : 'حفظ النص'}
            </button>
          </div>

          <div className="rounded-[20px] border border-dashed border-[#dccdbb] bg-[#fff8f0] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="block min-w-[220px] text-sm text-[#6d5848] file:mr-3 file:rounded-[14px] file:border-0 file:bg-[#ead7bf] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#5f3a1c]"
              />
              <button
                type="button"
                onClick={uploadImage}
                disabled={!selectedFile || uploadingImage}
                className="inline-flex items-center rounded-[16px] border border-[#c79c6b] bg-[#fff3e4] px-4 py-2.5 text-sm font-semibold text-[#7b4f22] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadingImage ? 'جارٍ الرفع...' : 'رفع الصورة'}
              </button>
              {product.publicImageUrl ? (
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={removingImage}
                  className="inline-flex items-center rounded-[16px] border border-[#e6c3b8] bg-white px-4 py-2.5 text-sm font-semibold text-[#a3462f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {removingImage ? 'جارٍ الحذف...' : 'حذف الصورة'}
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-6 text-[#7b6552]">
              الأنواع المدعومة: JPG / PNG / WEBP — الحد الأقصى: 2MB للصورة الواحدة.
            </p>
          </div>

          {message ? <div className="rounded-[16px] bg-[#eef8f0] px-4 py-3 text-sm text-[#246a32]">{message}</div> : null}
          {error ? <div className="rounded-[16px] bg-[#fff1ee] px-4 py-3 text-sm text-[#b33c1f]">{error}</div> : null}
        </div>
      </div>
    </article>
  );
}

export function PublicMenuContentManager() {
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/owner/qr-menu-content')
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error?.message || 'تعذر تحميل محتوى QR الآن.');
        }
        if (!cancelled) {
          const data = payload as WorkspaceResponse;
          setSections(data.sections);
          setProducts(data.products);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل محتوى QR الآن.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sectionsWithProducts = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        products: products
          .filter((product) => product.sectionId === section.id)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'ar')),
      }))
      .filter((section) => section.products.length > 0)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ar'));
  }, [products, sections]);

  function handleProductUpdated(productId: string, patch: Partial<Product>) {
    setProducts((current) => current.map((product) => (product.id === productId ? { ...product, ...patch } : product)));
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-[#dccdbb] bg-white p-5 shadow-[0_18px_40px_rgba(30,23,18,0.06)] lg:p-6">
        <div className="text-[11px] font-semibold tracking-[0.24em] text-[#9b6b2e]">PUBLIC QR CONTENT</div>
        <h2 className="mt-2 text-[24px] font-black text-[#1e1712]">صور ووصف أصناف صفحة QR</h2>
        <p className="mt-2 text-sm leading-7 text-[#6b5a4c]">
          من هنا تدير المحتوى المرئي والتوصيف النصي الذي يراه الزبون عند فتح منيو QR. هذا القسم لا يغيّر شاشات التشغيل الداخلية.
        </p>
      </div>

      {loading ? <div className="rounded-[24px] border border-[#dccdbb] bg-[#fffaf4] p-5 text-sm text-[#6b5a4c]">جارٍ تحميل أصناف QR...</div> : null}
      {error ? <div className="rounded-[24px] border border-[#f0c7bd] bg-[#fff4f1] p-5 text-sm text-[#b33c1f]">{error}</div> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          {sectionsWithProducts.map((section) => (
            <div key={section.id} className="space-y-3">
              <div className="rounded-[22px] border border-[#ead7bf] bg-[#fff8ef] px-4 py-3">
                <div className="text-base font-black text-[#1e1712]">{section.title}</div>
                <div className="text-xs leading-6 text-[#7b6552]">
                  {section.stationCode === 'shisha' ? 'أصناف محطة الشيشة' : 'أصناف محطة الباريستا'}
                </div>
              </div>

              <div className="space-y-4">
                {section.products.map((product) => (
                  <ProductContentCard key={product.id} product={product} sectionTitle={section.title} onUpdated={handleProductUpdated} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
