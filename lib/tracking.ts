import { redis, hasRedisConfig } from "./redis";

export type SendRecord = {
  id: string;
  email: string;
  title: string;
  link: string;
  sentAt: number;
  opens: number;
  clicks: number;
  firstOpenedAt?: number;
  lastOpenedAt?: number;
  firstClickedAt?: number;
  lastClickedAt?: number;
};

export function newSendId() {
  return (globalThis.crypto?.randomUUID() ?? `${Date.now()}-${Math.random()}`)
    .replace(/-/g, "")
    .slice(0, 16);
}

export async function recordSend(id: string, data: { email: string; title: string; link: string }) {
  if (!hasRedisConfig()) return;
  const now = Date.now();
  await redis.hset(`send:${id}`, {
    email: data.email,
    title: data.title,
    link: data.link,
    sentAt: now,
    opens: 0,
    clicks: 0,
  });
  await redis.zadd("sends:index", { score: now, member: id });
}

export async function recordOpen(id: string) {
  if (!hasRedisConfig()) return;
  const exists = await redis.exists(`send:${id}`);
  if (!exists) return;
  const now = Date.now();
  await redis.hincrby(`send:${id}`, "opens", 1);
  await redis.hsetnx(`send:${id}`, "firstOpenedAt", now);
  await redis.hset(`send:${id}`, { lastOpenedAt: now });
}

export async function recordClick(id: string) {
  if (!hasRedisConfig()) return;
  const exists = await redis.exists(`send:${id}`);
  if (!exists) return;
  const now = Date.now();
  await redis.hincrby(`send:${id}`, "clicks", 1);
  await redis.hsetnx(`send:${id}`, "firstClickedAt", now);
  await redis.hset(`send:${id}`, { lastClickedAt: now });
}

export async function listSends(limit = 500): Promise<SendRecord[]> {
  if (!hasRedisConfig()) return [];
  const ids = (await redis.zrange<string[]>("sends:index", 0, limit - 1, { rev: true })) ?? [];
  if (ids.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.hgetall(`send:${id}`);
  const results = (await pipeline.exec()) as (Record<string, string | number> | null)[];

  return ids.map((id, i) => {
    const r = results[i] ?? {};
    const toNum = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
    return {
      id,
      email: String(r.email ?? ""),
      title: String(r.title ?? ""),
      link: String(r.link ?? ""),
      sentAt: Number(r.sentAt ?? 0),
      opens: Number(r.opens ?? 0),
      clicks: Number(r.clicks ?? 0),
      firstOpenedAt: toNum(r.firstOpenedAt),
      lastOpenedAt: toNum(r.lastOpenedAt),
      firstClickedAt: toNum(r.firstClickedAt),
      lastClickedAt: toNum(r.lastClickedAt),
    };
  });
}
