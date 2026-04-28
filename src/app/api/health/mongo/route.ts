import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongo/client";

// Auth-gated by middleware (no entry in PUBLIC_PATH_PREFIXES).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    // Skip index ensure on health checks — keep this endpoint minimal so
    // a slow first-time index creation can't inflate ping_ms or surface
    // unrelated failures.
    const db = await getMongoDb({ skipIndexEnsure: true });
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, ping_ms: Date.now() - started });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        ping_ms: Date.now() - started,
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 503 },
    );
  }
}
