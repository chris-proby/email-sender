import { listSends, getEvents } from "@/lib/tracking";
import { hasRedisConfig } from "@/lib/redis";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KST = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function todayKstYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftKstYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function parseKstYmdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - KST_OFFSET_MS;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
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

  const sp = await searchParams;
  const today = todayKstYmd();
  const defaultFromYmd = shiftKstYmd(today, -6);
  const fromYmd = YMD_RE.test(sp.from ?? "") ? sp.from! : defaultFromYmd;
  const toYmdRaw = YMD_RE.test(sp.to ?? "") ? sp.to! : today;
  const toYmd = toYmdRaw < fromYmd ? fromYmd : toYmdRaw;

  const fromMs = parseKstYmdToUtcMs(fromYmd);
  const untilMs = parseKstYmdToUtcMs(shiftKstYmd(toYmd, 1));

  const [allRecords, openEv, ctaEv, downloadEv] = await Promise.all([
    listSends(1000),
    getEvents("open", fromMs, untilMs),
    getEvents("cta", fromMs, untilMs),
    getEvents("download", fromMs, untilMs),
  ]);

  const records = allRecords.filter((r) => r.sentAt >= fromMs && r.sentAt < untilMs);

  return (
    <DashboardClient
      records={records}
      events={{ open: openEv, cta: ctaEv, download: downloadEv }}
      since={fromMs}
      until={untilMs}
      fromYmd={fromYmd}
      toYmd={toYmd}
    />
  );
}
