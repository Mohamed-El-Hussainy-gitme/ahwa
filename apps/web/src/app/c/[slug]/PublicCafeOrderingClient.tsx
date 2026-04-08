'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProductAddonPicker, type ProductAddonOption } from '@/ui/ProductAddonPicker';
import type { PublicMenuPayload } from '@/lib/public-ordering';

type StationCode = 'barista' | 'shisha';
type Section = { id: string; title: string; stationCode: StationCode; sortOrder: number };
type Product = { id: string; sectionId: string; name: string; stationCode: StationCode; unitPrice: number; sortOrder: number };
type Addon = { id: string; name: string; stationCode: StationCode; unitPrice: number; sortOrder: number };
type ProductAddonLink = { productId: string; addonId: string };
type BillingSettings = { taxEnabled: boolean; taxRate: number; serviceEnabled: boolean; serviceRate: number };
type MenuPayload = PublicMenuPayload & {
  cafe: { cafeId: string; cafeSlug: string; cafeName: string; databaseKey: string };
  menu: { sections: Section[]; products: Product[]; addons: Addon[]; productAddonLinks: ProductAddonLink[]; billingSettings: BillingSettings };
};

type CartEntry = { product: Product; quantity: number; addonIds: string[]; addonOptions: ProductAddonOption[]; addonUnitTotal: number };

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value);
}

export function PublicCafeOrderingClient({ slug, initialMenu }: { slug: string; initialMenu?: MenuPayload | null }) {
  const [menu, setMenu] = useState<MenuPayload | null>(initialMenu ?? null);
  const [loading, setLoading] = useState(!initialMenu);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedAddons, setSelectedAddons] = useState<Record<string, string[]>>({});
  const [addonPickerProductId, setAddonPickerProductId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialMenu) {
      setMenu(initialMenu);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/public/cafes/${encodeURIComponent(slug)}/menu`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error?.message || 'تعذر تحميل المنيو الآن.');
        }
        if (!cancelled) {
          setMenu(payload as MenuPayload & { ok: true });
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'تعذر تحميل المنيو الآن.');
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
  }, [initialMenu, slug]);

  const addonOptionsByProductId = useMemo(() => {
    if (!menu) return new Map<string, ProductAddonOption[]>();
    const addonMap = new Map(menu.menu.addons.map((addon) => [addon.id, addon]));
    const map = new Map<string, ProductAddonOption[]>();
    for (const link of menu.menu.productAddonLinks) {
      const addon = addonMap.get(link.addonId);
      if (!addon) continue;
      const current = map.get(link.productId);
      const option = { id: addon.id, name: addon.name, unitPrice: addon.unitPrice } satisfies ProductAddonOption;
      if (current) current.push(option);
      else map.set(link.productId, [option]);
    }
    return map;
  }, [menu]);

  const sectionsWithProducts = useMemo(() => {
    if (!menu) return [] as Array<Section & { products: Product[] }>;
    return menu.menu.sections
      .map((section) => ({
        ...section,
        products: menu.menu.products.filter((product) => product.sectionId === section.id),
      }))
      .filter((section) => section.products.length > 0);
  }, [menu]);

  const cartEntries = useMemo<CartEntry[]>(() => {
    if (!menu) return [];
    return Object.entries(cart)
      .map(([productId, quantity]) => {
        const product = menu.menu.products.find((item) => item.id === productId);
        if (!product || quantity <= 0) return null;
        const addonIds = selectedAddons[productId] ?? [];
        const addonOptions = (addonOptionsByProductId.get(productId) ?? []).filter((addon) => addonIds.includes(addon.id));
        const addonUnitTotal = addonOptions.reduce((sum, addon) => sum + addon.unitPrice, 0);
        return { product, quantity, addonIds, addonOptions, addonUnitTotal } satisfies CartEntry;
      })
      .filter((entry): entry is CartEntry => entry !== null);
  }, [addonOptionsByProductId, cart, menu, selectedAddons]);

  const totals = useMemo(() => {
    const subtotal = cartEntries.reduce((sum, entry) => sum + (entry.product.unitPrice + entry.addonUnitTotal) * entry.quantity, 0);
    const settings = menu?.menu.billingSettings;
    const taxAmount = settings?.taxEnabled ? subtotal * (settings.taxRate / 100) : 0;
    const serviceAmount = settings?.serviceEnabled ? subtotal * (settings.serviceRate / 100) : 0;
    const total = subtotal + taxAmount + serviceAmount;
    return { subtotal, taxAmount, serviceAmount, total };
  }, [cartEntries, menu?.menu.billingSettings]);

  function changeQuantity(productId: string, delta: number) {
    setSuccessMessage(null);
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[productId] ?? 0) + delta;
      if (quantity <= 0) {
        delete next[productId];
        setSelectedAddons((currentAddons) => {
          const copy = { ...currentAddons };
          delete copy[productId];
          return copy;
        });
      } else {
        next[productId] = quantity;
      }
      return next;
    });
  }

  async function submitOrder() {
    if (!customerName.trim()) {
      setError('من فضلك اكتب اسمك قبل إرسال الطلب.');
      return;
    }
    if (!cartEntries.length) {
      setError('أضف صنفًا واحدًا على الأقل.');
      return;
    }

    setSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/public/cafes/${encodeURIComponent(slug)}/order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerName,
          tableLabel,
          notes,
          items: cartEntries.map((entry) => ({ productId: entry.product.id, quantity: entry.quantity, addonIds: entry.addonIds })),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'تعذر إرسال الطلب.');
      }

      setCart({});
      setSelectedAddons({});
      setNotes('');
      setSuccessMessage(`تم إرسال طلبك بنجاح. رقم الجلسة: ${payload.sessionLabel || payload.sessionId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر إرسال الطلب.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="ahwa-page-shell min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row">
        <section className="flex-1 space-y-5">
          <div className="ahwa-card p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--brand-muted)]">الطلب الذاتي عبر QR</p>
                <h1 className="mt-1 text-3xl font-black text-[var(--brand-ink)]">
                  {menu?.cafe.cafeName ?? 'المنيو'}
                </h1>
                <p className="mt-2 text-sm text-[var(--brand-muted)]">
                  اختر أصنافك ثم أرسل الطلب مباشرة إلى الطاقم.
                </p>
              </div>
              <span className="ahwa-pill-accent">/{slug}</span>
            </div>
          </div>

          {loading ? <div className="ahwa-card p-6 text-sm text-[var(--brand-muted)]">جاري تحميل المنيو...</div> : null}
          {error ? <div className="ahwa-card p-4 text-sm text-[var(--status-danger)]">{error}</div> : null}
          {successMessage ? <div className="ahwa-card p-4 text-sm text-[var(--status-success)]">{successMessage}</div> : null}

          {!loading && !error ? (
            <div className="space-y-4">
              {sectionsWithProducts.map((section) => (
                <div key={section.id} className="ahwa-card p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-[var(--brand-ink)]">{section.title}</h2>
                      <p className="text-xs text-[var(--brand-muted)]">
                        {section.stationCode === 'shisha' ? 'محطة الشيشة' : 'محطة الباريستا'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {section.products.map((product) => {
                      const quantity = cart[product.id] ?? 0;
                      return (
                        <div key={product.id} className="ahwa-card-soft p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="text-lg font-bold text-[var(--brand-ink)]">{product.name}</h3>
                                  <p className="mt-1 text-sm text-[var(--brand-muted)]">{formatMoney(product.unitPrice)} ج.م</p>
                                </div>
                                {addonOptionsByProductId.get(product.id)?.length ? (
                                  <button className="ahwa-btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => setAddonPickerProductId(product.id)} type="button">إضافات</button>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button className="ahwa-btn-secondary min-w-10 px-3 py-2" onClick={() => changeQuantity(product.id, -1)} type="button">-</button>
                              <span className="min-w-8 text-center text-lg font-bold">{quantity}</span>
                              <button className="ahwa-btn-accent min-w-10 px-3 py-2" onClick={() => changeQuantity(product.id, 1)} type="button">+</button>
                            </div>
                          </div>
                          {addonOptionsByProductId.get(product.id)?.length ? (
                            <div className="mt-3 flex items-center justify-end gap-3 border-t border-[var(--brand-border)] pt-3">
                              {(selectedAddons[product.id]?.length ?? 0) > 0 ? (
                                <span className="text-xs font-semibold text-[var(--brand-accent-strong)]">+{selectedAddons[product.id]!.length} إضافة</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="w-full lg:sticky lg:top-4 lg:w-[360px] lg:self-start">
          <div className="ahwa-card space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-black text-[var(--brand-ink)]">راجع الطلب</h2>
              <p className="mt-1 text-sm text-[var(--brand-muted)]">اكتب اسمك ثم أرسل الطلب مباشرة.</p>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">الاسم</span>
              <input className="ahwa-input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="مثال: محمد" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">رقم الطاولة (اختياري)</span>
              <input className="ahwa-input" value={tableLabel} onChange={(event) => setTableLabel(event.target.value)} placeholder="مثال: T3" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">ملاحظة</span>
              <textarea className="ahwa-textarea min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="بدون سكر / سريع لو سمحت" />
            </label>

            <div className="ahwa-card-dashed space-y-3 p-4">
              {cartEntries.length ? cartEntries.map((entry) => (
                <div key={entry.product.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold">{entry.product.name}</p>
                    <p className="text-[var(--brand-muted)]">{entry.quantity} × {formatMoney(entry.product.unitPrice + entry.addonUnitTotal)}</p>
                    {entry.addonOptions.length ? <p className="mt-1 text-xs text-[var(--brand-accent-strong)]">{entry.addonOptions.map((addon) => addon.name).join(' + ')}</p> : null}
                  </div>
                  <strong>{formatMoney((entry.product.unitPrice + entry.addonUnitTotal) * entry.quantity)} ج.م</strong>
                </div>
              )) : <p className="text-sm text-[var(--brand-muted)]">السلة فارغة.</p>}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>الإجمالي الفرعي</span><strong>{formatMoney(totals.subtotal)} ج.م</strong></div>
              {menu?.menu.billingSettings.taxEnabled ? <div className="flex items-center justify-between"><span>ضريبة</span><strong>{formatMoney(totals.taxAmount)} ج.م</strong></div> : null}
              {menu?.menu.billingSettings.serviceEnabled ? <div className="flex items-center justify-between"><span>خدمة</span><strong>{formatMoney(totals.serviceAmount)} ج.م</strong></div> : null}
              <div className="flex items-center justify-between border-t border-[var(--brand-border)] pt-2 text-base font-black"><span>الإجمالي</span><strong>{formatMoney(totals.total)} ج.م</strong></div>
            </div>

            <button className="ahwa-btn-success w-full justify-center" disabled={sending || !cartEntries.length} onClick={submitOrder} type="button">
              {sending ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب'}
            </button>
          </div>
        </aside>
      </div>
      <ProductAddonPicker
        open={Boolean(addonPickerProductId && menu)}
        title={menu?.menu.products.find((product) => product.id === addonPickerProductId)?.name ?? ''}
        options={addonPickerProductId ? (addonOptionsByProductId.get(addonPickerProductId) ?? []) : []}
        selectedIds={addonPickerProductId ? (selectedAddons[addonPickerProductId] ?? []) : []}
        onClose={() => setAddonPickerProductId(null)}
        onSave={(nextIds) => {
          if (addonPickerProductId) {
            setSelectedAddons((current) => ({ ...current, [addonPickerProductId]: nextIds }));
          }
          setAddonPickerProductId(null);
        }}
      />
    </main>
  );
}
