import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: undefined,
        maximumSizeInBytes: 26 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({}),
      }),
      onUploadCompleted: async () => {
        // No-op; blobs are cleaned up after send (see /api/send and /api/cleanup)
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 400 });
  }
}
