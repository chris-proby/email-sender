"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SendRecord } from "@/lib/tracking";
import { renderBody } from "@/lib/markdown";

type Props = {
  records: SendRecord[];
  events: { open: number[]; cta: number[]; download: number[] };
  since: number;
};

const HOUR_MS = 60 * 60 * 1000;
const KST = "Asia/Seoul";

function fmtKST(ts?: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("ko-KR", {
    hour12: false,
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtKSTShort(ts: number) {
  return new Date(ts).toLocaleString("ko-KR", {
    hour12: false,
    timeZone: KST,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
}

function bucketByHour(timestamps: number[]) {
  const out = new Map<number, number>();
  for (const ts of timestamps) {
    const hour = Math.floor(ts / HOUR_MS) * HOUR_MS;
    out.set(hour, (out.get(hour) ?? 0) + 1);
  }
  return out;
}

type Filter = "any" | "yes" | "no";

export default function DashboardClient({ records, events, since }: Props) {
  const [openFilter, setOpenFilter] = useState<Filter>("any");
  const [ctaFilter, setCtaFilter] = useState<Filter>("any");
  const [downloadFilter, setDownloadFilter] = useState<Filter>("any");
  const [search, setSearch] = useState("");
  const [showResend, setShowResend] = useState(false);

  const chartData = useMemo(() => {
    const opens = bucketByHour(events.open);
    const ctas = bucketByHour(events.cta);
    const downloads = bucketByHour(events.download);
    const hours = new Set<number>([
      ...opens.keys(),
      ...ctas.keys(),
      ...downloads.keys(),
    ]);
    if (hours.size === 0) return [];
    const earliest = Math.max(since, Math.min(...hours) - HOUR_MS);
    const latest = Math.max(...hours) + HOUR_MS;
    const series: { hour: number; label: string; opens: number; cta: number; download: number }[] = [];
    for (let h = Math.floor(earliest / HOUR_MS) * HOUR_MS; h <= latest; h += HOUR_MS) {
      series.push({
        hour: h,
        label: fmtKSTShort(h),
        opens: opens.get(h) ?? 0,
        cta: ctas.get(h) ?? 0,
        download: downloads.get(h) ?? 0,
      });
    }
    return series;
  }, [events, since]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (openFilter === "yes" && r.opens === 0) return false;
      if (openFilter === "no" && r.opens > 0) return false;
      if (ctaFilter === "yes" && r.clicks === 0) return false;
      if (ctaFilter === "no" && r.clicks > 0) return false;
      if (downloadFilter === "yes" && r.downloadClicks === 0) return false;
      if (downloadFilter === "no" && r.downloadClicks > 0) return false;
      if (q && !r.email.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, openFilter, ctaFilter, downloadFilter, search]);

  const summary = useMemo(() => {
    const total = records.length;
    const opened = records.filter((r) => r.opens > 0).length;
    const clicked = records.filter((r) => r.clicks > 0).length;
    const downloaded = records.filter((r) => r.downloadClicks > 0).length;
    return {
      total,
      opened,
      clicked,
      downloaded,
      openRate: total ? Math.round((opened / total) * 100) : 0,
      clickRate: total ? Math.round((clicked / total) * 100) : 0,
      downloadRate: total ? Math.round((downloaded / total) * 100) : 0,
    };
  }, [records]);

  const nonOpenerEmails = useMemo(
    () => records.filter((r) => r.opens === 0).map((r) => r.email).filter(Boolean),
    [records],
  );

  return (
    <main style={{ maxWidth: 1200, margin: "32px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>발송 대시보드</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={() => setShowResend(true)} style={primaryBtn}>
            ✉️ 재발송
          </button>
          <Link href="/" style={{ fontSize: 14 }}>← 발송 페이지로</Link>
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20 }}>
        <Stat label="총 발송" value={`${summary.total}건`} />
        <Stat label="오픈" value={`${summary.opened}건 (${summary.openRate}%)`} hint="고유 수신자 기준" />
        <Stat label="Proby CTA 클릭" value={`${summary.clicked}건 (${summary.clickRate}%)`} hint="인터뷰 시작하기 버튼" />
        <Stat label="첨부 다운로드 클릭" value={`${summary.downloaded}건 (${summary.downloadRate}%)`} hint="본문 내 다운로드 링크" />
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>시간별 이벤트 (최근 7일, KST)</h2>
          <div style={{ fontSize: 12, color: "#888" }}>{events.open.length + events.cta.length + events.download.length}개 이벤트</div>
        </div>
        {chartData.length === 0 ? (
          <div style={{ color: "#888", fontSize: 13, padding: "24px 0", textAlign: "center" }}>아직 이벤트가 없습니다.</div>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="opens" name="오픈" stroke="#0a7" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cta" name="CTA" stroke="#06c" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="download" name="다운로드" stroke="#a60" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <FilterSelect label="오픈" value={openFilter} onChange={setOpenFilter} />
          <FilterSelect label="CTA 클릭" value={ctaFilter} onChange={setCtaFilter} />
          <FilterSelect label="다운로드 클릭" value={downloadFilter} onChange={setDownloadFilter} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="수신자/제목 검색"
            style={{
              padding: "6px 10px",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 13,
              minWidth: 200,
            }}
          />
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>
            {filtered.length} / {records.length}건 표시
          </div>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
          ⓘ 오픈 추적은 트래킹 픽셀 기반입니다. Gmail은 이미지 차단 정책으로 일부 오픈이 누락되고 Apple Mail은 사전 로딩으로 과대 집계될 수 있습니다. 클릭 추적이 더 정확합니다. · 모든 시각은 KST 기준.
        </p>

        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "white" }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>발송시각</th>
                <th style={th}>수신자</th>
                <th style={th}>제목</th>
                <th style={{ ...th, textAlign: "center" }}>오픈</th>
                <th style={{ ...th, textAlign: "center" }}>CTA</th>
                <th style={{ ...th, textAlign: "center" }}>다운로드</th>
                <th style={th}>최초 오픈</th>
                <th style={th}>최초 CTA</th>
                <th style={th}>최초 다운로드</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888" }}>조건에 맞는 기록이 없습니다.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={td}>{fmtKST(r.sentAt)}</td>
                    <td style={td}>{r.email}</td>
                    <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</td>
                    <td style={{ ...td, textAlign: "center", color: r.opens > 0 ? "#0a7" : "#aaa", fontWeight: 600 }}>{r.opens}</td>
                    <td style={{ ...td, textAlign: "center", color: r.clicks > 0 ? "#06c" : "#aaa", fontWeight: 600 }}>{r.clicks}</td>
                    <td style={{ ...td, textAlign: "center", color: r.downloadClicks > 0 ? "#a60" : "#aaa", fontWeight: 600 }}>{r.downloadClicks}</td>
                    <td style={td}>{fmtKST(r.firstOpenedAt)}</td>
                    <td style={td}>{fmtKST(r.firstClickedAt)}</td>
                    <td style={td}>{fmtKST(r.firstDownloadAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showResend && (
        <ResendModal
          onClose={() => setShowResend(false)}
          nonOpenerEmails={nonOpenerEmails}
        />
      )}
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <span style={{ color: "#555" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Filter)}
        style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
      >
        <option value="any">전체</option>
        <option value="yes">예</option>
        <option value="no">미발생</option>
      </select>
    </label>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ResendModal({
  onClose,
  nonOpenerEmails,
}: {
  onClose: () => void;
  nonOpenerEmails: string[];
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ email: string; status: "ok" | "error"; message?: string }[]>([]);
  const [progress, setProgress] = useState(0);

  const recipients = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of recipientsText.split(/[\s,;]+/)) {
      const e = raw.trim();
      if (!e || seen.has(e.toLowerCase())) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
      seen.add(e.toLowerCase());
      out.push(e);
    }
    return out;
  }, [recipientsText]);

  function addNonOpeners() {
    if (nonOpenerEmails.length === 0) return;
    setRecipientsText((cur) => {
      const have = new Set(
        cur
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
      const fresh = nonOpenerEmails.filter((e) => !have.has(e.toLowerCase()));
      if (fresh.length === 0) return cur;
      const sep = cur.trim().length > 0 ? "\n" : "";
      return cur + sep + fresh.join("\n");
    });
  }

  async function send() {
    if (sending || recipients.length === 0 || !title || !body) return;
    setSending(true);
    setResults([]);
    setProgress(0);
    const collected: typeof results = [];
    for (let i = 0; i < recipients.length; i++) {
      const email = recipients[i];
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            title,
            body,
            link,
            baseUrl: typeof window !== "undefined" ? window.location.origin : "",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          collected.push({ email, status: "error", message: data.error ?? "발송 실패" });
        } else {
          collected.push({ email, status: "ok" });
        }
      } catch (err: any) {
        collected.push({ email, status: "error", message: err?.message ?? String(err) });
      }
      setResults([...collected]);
      setProgress(i + 1);
      if (i < recipients.length - 1) await new Promise((r) => setTimeout(r, 1000));
    }
    setSending(false);
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>재발송</h2>
          <button onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div>
            <label style={fieldLabel}>제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={input}
              placeholder="메일 제목"
            />
            <label style={{ ...fieldLabel, marginTop: 12 }}>CTA 링크 (선택)</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              style={input}
              placeholder="https://..."
            />
            <label style={{ ...fieldLabel, marginTop: 12 }}>본문 (마크다운 지원)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ ...input, height: 240, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 13 }}
              placeholder="**굵게** *기울임* 등 마크다운 사용 가능"
            />
          </div>
          <div>
            <label style={fieldLabel}>미리보기</label>
            <div style={previewBox}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{title || "(제목 없음)"}</div>
              {body ? (
                <div
                  style={{ fontSize: 14, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: renderBody(body) }}
                />
              ) : (
                <div style={{ color: "#aaa", fontSize: 13 }}>본문을 입력하세요</div>
              )}
              {link && (
                <div style={{ marginTop: 16 }}>
                  <span style={ctaBtn}>인터뷰 시작하기</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={fieldLabel}>수신자 ({recipients.length}명)</label>
            <button onClick={addNonOpeners} style={secondaryBtn} disabled={nonOpenerEmails.length === 0}>
              미오픈자 일괄 추가 ({nonOpenerEmails.length}명)
            </button>
          </div>
          <textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            style={{ ...input, height: 100, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 13 }}
            placeholder="이메일을 한 줄에 하나씩 입력하거나, 쉼표·세미콜론으로 구분"
          />
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 12, maxHeight: 160, overflow: "auto", fontSize: 12, border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ color: r.status === "ok" ? "#0a7" : "#c00", padding: "2px 0" }}>
                {r.status === "ok" ? "✓" : "✗"} {r.email}{r.message ? ` — ${r.message}` : ""}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={secondaryBtn}>취소</button>
          <button
            onClick={send}
            disabled={sending || recipients.length === 0 || !title || !body}
            style={{ ...primaryBtn, opacity: (sending || recipients.length === 0 || !title || !body) ? 0.5 : 1 }}
          >
            {sending ? `발송 중… (${progress}/${recipients.length})` : `${recipients.length}건 발송`}
          </button>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
};

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: 12, color: "#444" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };

const primaryBtn: React.CSSProperties = {
  background: "#1a1a1a",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 600,
};

const secondaryBtn: React.CSSProperties = {
  background: "white",
  color: "#333",
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 28,
  cursor: "pointer",
  color: "#666",
  lineHeight: 1,
  padding: "0 4px",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: 20,
};

const modal: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 1000,
  maxHeight: "90vh",
  overflow: "auto",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#555",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const previewBox: React.CSSProperties = {
  background: "#fafafa",
  border: "1px solid #eee",
  borderRadius: 6,
  padding: 16,
  minHeight: 280,
  fontSize: 14,
};

const ctaBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#1a1a1a",
  color: "white",
  textDecoration: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
};
