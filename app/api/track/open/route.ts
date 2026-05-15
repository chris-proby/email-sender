import { after } from "next/server";
import { recordOpen } from "@/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    after(async () => {
      try {
        await recordOpen(id);
      } catch {}
    });
  }
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
