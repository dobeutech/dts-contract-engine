import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongo/client";

// Auth-gated by middleware (no entry in PUBLIC_PATH_PREFIXES).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const db = await getMongoDb();
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
