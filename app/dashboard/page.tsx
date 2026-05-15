import { listSends, getEventTimestamps } from "@/lib/tracking";
import { hasRedisConfig } from "@/lib/redis";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

  const since = Date.now() - SEVEN_DAYS_MS;
  const [records, openTs, ctaTs, downloadTs] = await Promise.all([
    listSends(1000),
    getEventTimestamps("open", since),
    getEventTimestamps("cta", since),
    getEventTimestamps("download", since),
  ]);

  return (
    <DashboardClient
      records={records}
      events={{ open: openTs, cta: ctaTs, download: downloadTs }}
      since={since}
    />
  );
}
