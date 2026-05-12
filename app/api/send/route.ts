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
    ? `<p style="margin-top:24px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:white;text-decoration:none;border-radius:6px">자세히 보기</a></p>
       <p style="margin-top:8px;font-size:12px;color:#888">${escapeHtml(link)}</p>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
    <div>${bodyHtml}</div>
    ${linkHtml}
  </div>`;
}

export async function POST(req: Request) {
  let email = "";
  let title = "";
  let body = "";
  let link = "";
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];

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
            contentType: f.type || undefined,
          });
        }
      }
    } else {
      const payload = await req.json();
      email = String(payload.email ?? "").trim();
      title = String(payload.title ?? "").trim();
      body = String(payload.body ?? "");
      link = String(payload.link ?? "").trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !title) {
    return NextResponse.json({ error: "email, title 필수" }, { status: 400 });
  }

  try {
    const transporter = getTransporter();
    const from = process.env.GMAIL_FROM || process.env.GMAIL_USER!;
    const textBody = link ? `${body}\n\n${link}` : body;

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
