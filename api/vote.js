// Community votes (like / dislike) for Binge. One vote per visitor per title; tap again to undo, tap the other to switch.
// Storage: Upstash Redis (free). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// (or the KV_REST_API_URL / KV_REST_API_TOKEN that Vercel adds when you connect Upstash).
// Without them it falls back to in-memory storage, which is fine for local testing but resets often.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = (globalThis.__bingeVotes ||= { votes: new Map(), tally: new Map() });
mem.rl ||= new Map();
const HAS_DB = !!(URL_ && TOKEN);
// on the live site, votes need a real database (in-memory storage is wiped constantly on serverless)
const PROD_NO_DB = process.env.VERCEL_ENV === "production" && !HAS_DB;
// vote-stuffing protection: max writes per IP per window  [seconds, max]
const LIMITS = [[60, 20], [3600, 120]];


const run = async (cmds) => {
  const r = await fetch(`${URL_}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).map((x) => x.result);
};

const store = URL_ && TOKEN ? {
  async read(k, voter) {
    const [flat, mine] = await run([["HGETALL", `binge:tally:${k}`], ["HGET", `binge:votes:${k}`, voter]]);
    const t = {}; for (let i = 0; i < (flat || []).length; i += 2) t[flat[i]] = Number(flat[i + 1]);
    return { up: Math.max(t.up || 0, 0), down: Math.max(t.down || 0, 0), mine: Number(mine) || 0 };
  },
  async write(k, voter, vote) {
    const [prev] = await run([["HGET", `binge:votes:${k}`, voter]]);
    const p = Number(prev) || 0;
    if (p === vote) return;
    const cmds = [vote === 0 ? ["HDEL", `binge:votes:${k}`, voter] : ["HSET", `binge:votes:${k}`, voter, String(vote)]];
    if (p === 1) cmds.push(["HINCRBY", `binge:tally:${k}`, "up", -1]);
    if (p === -1) cmds.push(["HINCRBY", `binge:tally:${k}`, "down", -1]);
    if (vote === 1) cmds.push(["HINCRBY", `binge:tally:${k}`, "up", 1]);
    if (vote === -1) cmds.push(["HINCRBY", `binge:tally:${k}`, "down", 1]);
    await run(cmds);
  },
} : {
  async read(k, voter) {
    const t = mem.tally.get(k) || { up: 0, down: 0 };
    return { ...t, mine: mem.votes.get(k + "|" + voter) || 0 };
  },
  async write(k, voter, vote) {
    const p = mem.votes.get(k + "|" + voter) || 0;
    if (p === vote) return;
    const t = { ...(mem.tally.get(k) || { up: 0, down: 0 }) };
    if (p === 1) t.up--; if (p === -1) t.down--;
    if (vote === 1) t.up++; if (vote === -1) t.down++;
    mem.tally.set(k, t);
    vote === 0 ? mem.votes.delete(k + "|" + voter) : mem.votes.set(k + "|" + voter, vote);
  },
};

const allowWrite = async (ip) => {
  if (HAS_DB) {
    const cmds = LIMITS.flatMap(([w]) => [["SET", `binge:rl:${w}:${ip}`, "0", "EX", w, "NX"], ["INCR", `binge:rl:${w}:${ip}`]]);
    const r = await run(cmds);
    return LIMITS.every(([, max], i) => Number(r[i * 2 + 1]) <= max);
  }
  const now = Date.now();
  return LIMITS.every(([w, max]) => {
    const k = w + "|" + ip, e = mem.rl.get(k);
    if (!e || now > e.reset) { mem.rl.set(k, { n: 1, reset: now + w * 1000 }); return true; }
    return ++e.n <= max;
  });
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (PROD_NO_DB) return res.status(503).json({ error: "voting is not configured" });
  try {
    let b = req.method === "POST" ? req.body : req.query;
    if (typeof b === "string") b = JSON.parse(b || "{}");
    const { media, id, voter } = b || {};
    if (!["movie", "tv"].includes(media) || !/^\d{1,9}$/.test(String(id)) || !/^[\w-]{6,64}$/.test(String(voter || "")))
      return res.status(400).json({ error: "bad request" });
    const k = `${media}:${id}`;
    if (req.method === "POST") {
      const vote = Number(b.vote);
      if (![1, -1, 0].includes(vote)) return res.status(400).json({ error: "bad vote" });
      const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim().replace(/[^\w.:-]/g, "_").slice(0, 64);
      if (!(await allowWrite(ip))) return res.status(429).json({ error: "too many votes, slow down" });
      await store.write(k, voter, vote);
    }
    res.json(await store.read(k, voter));
  } catch (e) { console.error("vote api error:", e); res.status(500).json({ error: "server error" }); }
}