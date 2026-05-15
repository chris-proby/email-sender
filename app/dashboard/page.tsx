import Link from "next/link";
import { listSends, type SendRecord } from "@/lib/tracking";
import { hasRedisConfig } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(ts?: number) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    hour12: false,
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function summary(records: SendRecord[]) {
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
}

export default async function Dashboard() {
  if (!hasRedisConfig()) {
    return (
      <main style={{ maxWidth: 1100, margin: "40px auto", padding: "0 20px" }}>
        <h1>대시보드</h1>
        <p style={{ color: "#c00" }}>
          Upstash Redis가 설정되지 않았습니다. Vercel 프로젝트 Storage 탭에서 Upstash Redis를 연결한 후 재배포해주세요.
        </p>
      </main>
    );
  }

  const records = await listSends(500);
  const s = summary(records);

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>발송 대시보드</h1>
        <Link href="/" style={{ fontSize: 14 }}>← 발송 페이지로</Link>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20 }}>
        <Stat label="총 발송" value={`${s.total}건`} />
        <Stat label="오픈" value={`${s.opened}건 (${s.openRate}%)`} hint="고유 수신자 기준" />
        <Stat label="Proby CTA 클릭" value={`${s.clicked}건 (${s.clickRate}%)`} hint="인터뷰 시작하기 버튼" />
        <Stat label="첨부 다운로드 클릭" value={`${s.downloaded}건 (${s.downloadRate}%)`} hint="본문 내 다운로드 링크" />
      </section>

      <p style={{ marginTop: 16, fontSize: 12, color: "#888" }}>
        ⓘ 오픈 추적은 트래킹 픽셀 기반입니다. Gmail의 이미지 차단 정책으로 인해 일부 오픈은 집계되지 않을 수 있고, Apple Mail은 사전 로딩으로 과대 집계될 수 있습니다. 클릭 추적이 더 정확합니다. · 모든 시각은 한국 표준시(KST) 기준
      </p>

      <section style={{ marginTop: 20, overflowX: "auto" }}>
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
            {records.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888" }}>아직 발송 기록이 없습니다.</td></tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{fmt(r.sentAt)}</td>
                  <td style={td}>{r.email}</td>
                  <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</td>
                  <td style={{ ...td, textAlign: "center", color: r.opens > 0 ? "#0a7" : "#aaa", fontWeight: 600 }}>{r.opens}</td>
                  <td style={{ ...td, textAlign: "center", color: r.clicks > 0 ? "#06c" : "#aaa", fontWeight: 600 }}>{r.clicks}</td>
                  <td style={{ ...td, textAlign: "center", color: r.downloadClicks > 0 ? "#a60" : "#aaa", fontWeight: 600 }}>{r.downloadClicks}</td>
                  <td style={td}>{fmt(r.firstOpenedAt)}</td>
                  <td style={td}>{fmt(r.firstClickedAt)}</td>
                  <td style={td}>{fmt(r.firstDownloadAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
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

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: 12, color: "#444" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
