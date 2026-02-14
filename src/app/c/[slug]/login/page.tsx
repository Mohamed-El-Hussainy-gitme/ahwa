import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ParamsObj = { slug: string };
type PageProps = { params: Promise<ParamsObj> | ParamsObj };

function isPromise<T>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as { then?: unknown }).then === "function";
}

function escapeLikeExact(s: string) {
  // Prevent % and _ from acting as wildcards in ILIKE
  return s.replace(/[%_]/g, "\\$&");
}

export default async function Page({ params }: PageProps) {
  const resolved = isPromise<ParamsObj>(params) ? await params : params;

  const slug = String(resolved.slug ?? "").trim().toLowerCase();
  if (!slug) redirect("/login?e=cafe_not_found");

  // Validate cafe exists before showing login.
  const admin = supabaseAdmin();
  const cafeRes = await admin
    .from("cafes")
    .select("id,is_active")
    .ilike("slug", escapeLikeExact(slug))
    .maybeSingle();

  if (cafeRes.error || !cafeRes.data?.id || !cafeRes.data?.is_active) {
    redirect("/login?e=cafe_not_found");
  }

  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-50" />}>
      <LoginClient cafeSlug={slug} />
    </Suspense>
  );
}
