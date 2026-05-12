import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedTransporter;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(body: string, link: string) {
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br/>");
  const linkHtml = link
    ? `<p style="margin-top:24px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;background:#1a1a1a;color:white;text-decoration:none;border-radius:8px;font-weight:600">인터뷰 시작하기</a></p>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
    <div>${bodyHtml}</div>
    ${linkHtml}
  </div>`;
}

const extMime: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  html: "text/html",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  hwp: "application/x-hwp",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

function detectContentType(filename: string, browserType?: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extMime[ext]) return extMime[ext];
  if (browserType && browserType !== "application/octet-stream") return browserType;
  return "application/octet-stream";
}

type BlobAttachmentRef = { url: string; filename: string; contentType?: string };

async function fetchBlobAttachment(ref: BlobAttachmentRef) {
  const res = await fetch(ref.url);
  if (!res.ok) throw new Error(`첨부 다운로드 실패 (${res.status}): ${ref.filename}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    filename: ref.filename,
    content: buf,
    contentType: detectContentType(ref.filename, ref.contentType),
  };
}

export async function POST(req: Request) {
  let email = "";
  let title = "";
  let body = "";
  let link = "";
  let attachments: { filename: string; content: Buffer; contentType?: string }[] = [];

  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      email = String(form.get("email") ?? "").trim();
      title = String(form.get("title") ?? "").trim();
      body = String(form.get("body") ?? "");
      link = String(form.get("link") ?? "").trim();

      const files = form.getAll("attachments");
      for (const f of files) {
        if (f instanceof File && f.size > 0) {
          const buf = Buffer.from(await f.arrayBuffer());
          attachments.push({
            filename: f.name,
            content: buf,
            contentType: detectContentType(f.name, f.type),
          });
        }
      }
    } else {
      const payload = await req.json();
      email = String(payload.email ?? "").trim();
      title = String(payload.title ?? "").trim();
      body = String(payload.body ?? "");
      link = String(payload.link ?? "").trim();

      const refs = Array.isArray(payload.attachments) ? (payload.attachments as BlobAttachmentRef[]) : [];
      if (refs.length > 0) {
        attachments = await Promise.all(refs.map(fetchBlobAttachment));
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Invalid request body" }, { status: 400 });
  }

  if (!email || !title) {
    return NextResponse.json({ error: "email, title 필수" }, { status: 400 });
  }

  try {
    const transporter = getTransporter();
    const from = process.env.GMAIL_FROM || process.env.GMAIL_USER!;
    const textBody = link ? `${body}\n\n인터뷰 시작하기: ${link}` : body;

    await transporter.sendMail({
      from,
      to: email,
      subject: title,
      text: textBody,
      html: buildHtml(body, link),
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
