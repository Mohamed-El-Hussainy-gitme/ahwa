import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Q = z.object({
  slug: z.string().min(1),
});

function escapeLikeExact(s: string) {
  // Prevent % and _ from acting as wildcards in ILIKE
  return s.replace(/[%_]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = Q.safeParse({ slug: url.searchParams.get("slug") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const slug = parsed.data.slug.trim().toLowerCase();
  const admin = supabaseAdmin();

  const cafeRes = await admin
    .from("cafes")
    .select("id,is_active")
    .ilike("slug", escapeLikeExact(slug))
    .maybeSingle();

  if (cafeRes.error) {
    return NextResponse.json({ ok: true, exists: false });
  }

  const exists = !!cafeRes.data?.id && !!cafeRes.data?.is_active;
  return NextResponse.json({ ok: true, exists });
}
