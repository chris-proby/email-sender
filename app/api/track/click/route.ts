import { after } from "next/server";
import { recordClick } from "@/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const to = url.searchParams.get("to");

  if (id) {
    // Run AFTER the redirect is sent so the Redis round-trip can't be
    // lost when the function instance is reclaimed.
    after(async () => {
      try {
        await recordClick(id);
      } catch {}
    });
  }

  if (!to) {
    return new Response("Missing target URL", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(to);
  } catch {
    return new Response("Invalid target URL", { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("Unsupported scheme", { status: 400 });
  }

  return Response.redirect(target.toString(), 302);
}
