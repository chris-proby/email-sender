"use client";

import { useState } from "react";
import Papa from "papaparse";

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
  const [attachments, setAttachments] = useState<File[]>([]);

  function handleAttachments(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setAttachments(Array.from(files));
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
        const form = new FormData();
        form.append("email", rendered.email);
        form.append("title", rendered.title);
        form.append("body", rendered.body);
        form.append("link", rendered.link);
        for (const f of attachments) {
          form.append("attachments", f, f.name);
        }
        const res = await fetch("/api/send", {
          method: "POST",
          body: form,
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
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>이메일 일괄 발송</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        필수 컬럼: <code>email, title, body, link</code> · 추가 컬럼은 <code>{`{컬럼명}`}</code> 또는 <code>{`{{컬럼명}}`}</code>로 title/body에 치환 (예: <code>{`{name}`}</code>, <code>{`{candidate}`}</code>, 한글 변수명도 지원)
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
        <label style={{ fontWeight: 600 }}>2. 첨부파일 (선택, 모든 수신자 공통)</label>
        <input
          type="file"
          multiple
          onChange={handleAttachments}
          style={{ display: "block", marginTop: 12 }}
        />
        {attachments.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
              {attachments.length}개 · 총 {formatSize(totalAttachmentSize)}
              {totalAttachmentSize > 4 * 1024 * 1024 && (
                <span style={{ color: "#c00", marginLeft: 8 }}>
                  ⚠ 4MB 이상은 Vercel 함수 제한으로 실패할 수 있음
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
                  <span>📎 {f.name} <span style={{ color: "#888" }}>({formatSize(f.size)})</span></span>
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
            <button onClick={sendAll} disabled={sending} style={primaryBtn(sending)}>
              {sending ? `발송 중… (${progress}/${rows.length})` : `${rows.length}건 발송`}
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
