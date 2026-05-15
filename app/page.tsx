"use client";

import { useState } from "react";
import Papa from "papaparse";
import { upload } from "@vercel/blob/client";

const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024;
// Above this raw total, attachments are sent as download links in the
// email body instead of being attached (Gmail outbound caps at ~25MB
// encoded, ~19MB raw after base64+MIME overhead).
const INLINE_ATTACHMENT_THRESHOLD = 19 * 1024 * 1024;

type BlobAttachment = {
  url: string;
  filename: string;
  contentType?: string;
  size: number;
};

type Row = {
  email: string;
  title: string;
  body: string;
  link: string;
  extras: Record<string, string>;
};

function substitute(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{\{\s*([^\s{}]+)\s*\}\}/g, (_, key) => (vars[key] != null ? vars[key] : ""))
    .replace(/\{\s*([^\s{}]+)\s*\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function renderRow(row: Row) {
  const vars = { email: row.email, link: row.link, ...row.extras };
  return {
    email: row.email,
    title: substitute(row.title, vars),
    body: substitute(row.body, vars),
    link: row.link,
  };
}

type SendResult = {
  email: string;
  status: "ok" | "error";
  message?: string;
};

export default function HomePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [attachments, setAttachments] = useState<BlobAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ filename: string; pct: number } | null>(null);

  async function handleAttachments(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = input.files;
    if (!files || files.length === 0) return;

    setUploadError("");
    const next: BlobAttachment[] = [];
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(`${file.name}: 500MB 초과`);
        }
      }
      for (const file of Array.from(files)) {
        setUploadProgress({ filename: file.name, pct: 0 });
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/upload-url",
          onUploadProgress: (e: { percentage: number }) => {
            setUploadProgress({ filename: file.name, pct: Math.round(e.percentage) });
          },
        });
        next.push({
          url: blob.url,
          filename: file.name,
          contentType: file.type || undefined,
          size: file.size,
        });
      }
      setAttachments((prev) => [...prev, ...next]);
    } catch (err: any) {
      setUploadError(err?.message ?? "업로드 실패");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      input.value = "";
    }
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  const totalAttachmentSize = attachments.reduce((sum, f) => sum + f.size, 0);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setResults([]);
    setProgress(0);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const required = ["email", "title", "body", "link"];
        const fields = r.meta.fields ?? [];
        const missing = required.filter((c) => !fields.includes(c));
        if (missing.length) {
          setParseError(`누락된 컬럼: ${missing.join(", ")}`);
          setRows([]);
          return;
        }
        const reserved = new Set(["email", "title", "body", "link"]);
        const cleaned: Row[] = r.data
          .map((row) => {
            const extras: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) {
              if (!reserved.has(k) && k) extras[k] = String(v ?? "").trim();
            }
            return {
              email: String(row.email ?? "").trim(),
              title: String(row.title ?? "").trim(),
              body: String(row.body ?? ""),
              link: String(row.link ?? "").trim(),
              extras,
            };
          })
          .filter((row) => row.email);
        setRows(cleaned);
      },
      error: (err) => setParseError(err.message),
    });
  }

  async function sendAll() {
    if (rows.length === 0 || sending) return;
    setSending(true);
    setResults([]);
    setProgress(0);

    const collected: SendResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rendered = renderRow(row);
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...rendered,
            baseUrl: typeof window !== "undefined" ? window.location.origin : "",
            attachments: attachments.map((a) => ({
              url: a.url,
              filename: a.filename,
              contentType: a.contentType,
              size: a.size,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          collected.push({ email: row.email, status: "error", message: data.error ?? "발송 실패" });
        } else {
          collected.push({ email: row.email, status: "ok" });
        }
      } catch (err: any) {
        collected.push({ email: row.email, status: "error", message: err?.message ?? String(err) });
      }
      setResults([...collected]);
      setProgress(i + 1);
      if (i < rows.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    setSending(false);
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  const errCount = results.filter((r) => r.status === "error").length;

  return (
    <main style={{ maxWidth: 880, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>이메일 일괄 발송</h1>
        <a href="/dashboard" style={{ fontSize: 14 }}>📊 발송 대시보드 →</a>
      </div>
      <p style={{ color: "#666", marginTop: 0 }}>
        필수 컬럼: <code>email, title, body, link</code> · 추가 컬럼은 <code>{`{컬럼명}`}</code> 또는 <code>{`{{컬럼명}}`}</code>로 title/body에 치환 (예: <code>{`{name}`}</code>, <code>{`{candidate}`}</code>, <code>{`{code}`}</code>, 한글 변수명도 지원)
      </p>

      <section style={card}>
        <label style={{ fontWeight: 600 }}>1. CSV 업로드</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          style={{ display: "block", marginTop: 12 }}
        />
        {fileName && <div style={{ marginTop: 8, fontSize: 14, color: "#555" }}>📄 {fileName}</div>}
        {parseError && <div style={{ marginTop: 8, color: "#c00" }}>{parseError}</div>}
        {rows.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 14 }}>
            ✅ {rows.length}건 파싱됨
          </div>
        )}
      </section>

      <section style={card}>
        <label style={{ fontWeight: 600 }}>2. 첨부파일 (선택 · 합계 19MB 초과 시 본문 다운로드 링크로 자동 전환)</label>
        <input
          type="file"
          multiple
          disabled={uploading}
          onChange={handleAttachments}
          style={{ display: "block", marginTop: 12 }}
        />
        {uploadProgress && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#555" }}>
            ⬆ {uploadProgress.filename} 업로드 중… {uploadProgress.pct}%
          </div>
        )}
        {uploadError && <div style={{ marginTop: 8, color: "#c00", fontSize: 13 }}>{uploadError}</div>}
        {attachments.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
              {attachments.length}개 · 총 {formatSize(totalAttachmentSize)}
              {totalAttachmentSize > INLINE_ATTACHMENT_THRESHOLD && (
                <span style={{ color: "#06c", marginLeft: 8 }}>
                  ↪ 본문 다운로드 링크로 전송됨
                </span>
              )}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {attachments.map((f, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "#fafafa",
                    border: "1px solid #eee",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <span>📎 {f.filename} <span style={{ color: "#888" }}>({formatSize(f.size)})</span></span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#c00",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    제거
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section style={card}>
          <label style={{ fontWeight: 600 }}>3. 미리보기 (앞 3건)</label>
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {rows.slice(0, 3).map((row, idx) => {
              const r = renderRow(row);
              return (
                <div key={idx} style={preview}>
                  <div style={{ fontSize: 12, color: "#888" }}>To: {r.email}</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{r.title}</div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 14 }}>{r.body}</div>
                  {r.link && (
                    <div style={{ marginTop: 12 }}>
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          padding: "10px 18px",
                          background: "#1a1a1a",
                          color: "white",
                          textDecoration: "none",
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        인터뷰 시작하기
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section style={card}>
          <label style={{ fontWeight: 600 }}>4. 발송</label>
          <div style={{ marginTop: 12 }}>
            <button onClick={sendAll} disabled={sending || uploading} style={primaryBtn(sending || uploading)}>
              {sending ? `발송 중… (${progress}/${rows.length})` : uploading ? "업로드 중…" : `${rows.length}건 발송`}
            </button>
          </div>
          {results.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14 }}>
                성공 {okCount} · 실패 {errCount}
              </div>
              <div style={{ marginTop: 8, maxHeight: 240, overflow: "auto", fontSize: 13 }}>
                {results.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "4px 0",
                      borderBottom: "1px solid #eee",
                      color: r.status === "ok" ? "#0a7" : "#c00",
                    }}
                  >
                    {r.status === "ok" ? "✓" : "✗"} {r.email}
                    {r.message ? ` — ${r.message}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
  border: "1px solid #e5e5e5",
};

const preview: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 12,
  background: "#fafafa",
};

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "#999" : "#1a1a1a",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 15,
  cursor: disabled ? "not-allowed" : "pointer",
});
