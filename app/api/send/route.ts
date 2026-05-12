import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendBody = {
  email: string;
  title: string;
  body: string;
  link: string;
};

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
  let payload: SendBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, title, body, link } = payload;
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
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
