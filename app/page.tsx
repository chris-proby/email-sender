"use client";

import { useState } from "react";
import Papa from "papaparse";

type Row = { email: string; title: string; body: string; link: string };

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

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setResults([]);
    setProgress(0);

    Papa.parse<Row>(file, {
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
        const cleaned = r.data
          .map((row) => ({
            email: String(row.email ?? "").trim(),
            title: String(row.title ?? "").trim(),
            body: String(row.body ?? ""),
            link: String(row.link ?? "").trim(),
          }))
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
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
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
        CSV 컬럼: <code>email, title, body, link</code> · Gmail SMTP로 1초 간격 순차 발송
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

      {rows.length > 0 && (
        <section style={card}>
          <label style={{ fontWeight: 600 }}>2. 미리보기 (앞 3건)</label>
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {rows.slice(0, 3).map((row, idx) => (
              <div key={idx} style={preview}>
                <div style={{ fontSize: 12, color: "#888" }}>To: {row.email}</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>{row.title}</div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 14 }}>{row.body}</div>
                {row.link && (
                  <div style={{ marginTop: 8, fontSize: 14 }}>
                    🔗 <a href={row.link} target="_blank" rel="noreferrer">{row.link}</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section style={card}>
          <label style={{ fontWeight: 600 }}>3. 발송</label>
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
