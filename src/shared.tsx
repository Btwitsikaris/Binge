import { useEffect, useState } from "react";

export const IMG = "https://image.tmdb.org/t/p/";
export const cached = (p: string): any => { try { return JSON.parse(localStorage.getItem("c2:" + p) || "null"); } catch { return null; } };
const fetchApi = async (p: string): Promise<any> => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch("/api/tmdb?" + p);
      const j = await r.json();
      if (r.ok) { try { localStorage.setItem("c2:" + p, JSON.stringify(j)); } catch {} return j; }
    } catch {}
    await new Promise((res) => setTimeout(res, 500));
  }
  try { const c = localStorage.getItem("c2:" + p); if (c) return JSON.parse(c); } catch {}
  return null;
};

const inflight = new Map<string, Promise<any>>();
export const api = (p: string): Promise<any> => {
  let r = inflight.get(p);
  if (!r) { r = fetchApi(p).finally(() => inflight.delete(p)); inflight.set(p, r); }
  return r;
};
// warm the cache for a title (called on hover) so its page opens instantly
export const prefetch = (m: any) => { if (m && m.id) api(`mode=${m.media === "tv" ? "series" : "movie"}&id=${m.id}`).catch(() => {}); };

let _vid = "";
export const voterId = () => { try { let v = localStorage.getItem("vid"); if (!v) { v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^\w-]/g, ""); localStorage.setItem("vid", v); } return v; } catch { return _vid || (_vid = Math.random().toString(36).slice(2) + Date.now().toString(36)); } };
export const pct = (r: number) => Math.round((r || 0) * 10);
export const ringColor = (p: number) => (p >= 70 ? "#21d07a" : p >= 40 ? "#d2d531" : "#db2360");

export type Votes = { up: number; down: number; mine: number; off?: boolean };
export function useVotes(media: string, id: number | string) {
  const [vt, setVt] = useState<Votes | null>(null);
  useEffect(() => {
    setVt(null);
    fetch(`/api/vote?media=${media}&id=${id}&voter=${voterId()}`).then((r) => r.json())
      .then((j) => setVt(typeof j.up === "number" ? j : { up: 0, down: 0, mine: 0, off: true })).catch(() => setVt({ up: 0, down: 0, mine: 0, off: true }));
  }, [media, id]);
  const cast = (v: number) => {
    if (!vt || vt.off) return;
    const nv = vt.mine === v ? 0 : v, prev = vt;
    let up = vt.up, down = vt.down;
    if (vt.mine === 1) up--; if (vt.mine === -1) down--; if (nv === 1) up++; if (nv === -1) down++;
    setVt({ up, down, mine: nv });
    fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, id, voter: voterId(), vote: nv }) })
      .then((r) => r.json()).then((j) => (typeof j.up === "number" ? setVt(j) : setVt(prev))).catch(() => setVt(prev));
  };
  return { vt, cast };
}

// [label, bar width 0-100 | null, text]
export function ratingRows(r: any, vt: Votes | null) {
  const rows: any[] = r ? [["IMDb", r.imdb && r.imdb * 10, r.imdb && r.imdb + "/10"], ["Rotten Tomatoes", r.rt, r.rt && r.rt + "%"],
    ["Metacritic", r.meta, r.meta], ["TMDB", r.tmdb && r.tmdb * 10, r.tmdb && r.tmdb.toFixed(1) + "/10"]] : [];
  const X: [string, string, (n: number) => string][] = [["tomatoesaudience", "RT Audience", (n) => n + "%"], ["letterboxd", "Letterboxd", (n) => (n / 10).toFixed(1) + "/10"],
    ["metacriticuser", "Metacritic User", (n) => (n / 10).toFixed(1) + "/10"], ["trakt", "Trakt", (n) => n + "%"], ["rogerebert", "Roger Ebert", (n) => (n / 10).toFixed(1) + "/10"], ["myanimelist", "MyAnimeList", (n) => (n / 10).toFixed(1) + "/10"]];
  if (r) for (const [k, label, f] of X) { const v = r.extra?.[k]; if (v) rows.push([label, v, f(v)]); }
  const tot = vt ? vt.up + vt.down : 0, likePct = tot ? Math.round((vt!.up / tot) * 100) : 0;
  if (r) rows.push(["Binge", tot ? Math.max(likePct, 1) : null, tot ? `${likePct}% (${tot})` : "No votes yet"]);
  const vals = rows.filter((x) => x[0] !== "Binge" || tot >= 5).map((x) => x[1] as number).filter(Boolean);
  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length / 10).toFixed(1) : "–";
  return { rows, avg };
}

const THUMB_UP = "M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z";
const THUMB_DN = "M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z";
export function VoteButtons({ vt, cast }: { vt: Votes | null; cast: (v: number) => void }) {
  const ic = (d: string, on: boolean) => <svg viewBox="0 0 24 24" width="20" height="20" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  return (
    <div className="vote"><span className="mu">Did you like it?</span>
      <button className={"vb" + (vt?.mine === 1 ? " on" : "")} disabled={!vt || vt.off} onClick={() => cast(1)} aria-label="Like">{ic(THUMB_UP, vt?.mine === 1)}{vt?.up ?? 0}</button>
      <button className={"vb dn" + (vt?.mine === -1 ? " on" : "")} disabled={!vt || vt.off} onClick={() => cast(-1)} aria-label="Dislike">{ic(THUMB_DN, vt?.mine === -1)}{vt?.down ?? 0}</button>
      {vt?.off && <span className="mu tiny">Voting is unavailable right now</span>}
    </div>
  );
}

export function TrailerBox({ title, k, onClose }: { title: string; k: string; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  return (
    <div className="tv" onClick={onClose}>
      <button className="x tvx" aria-label="Close trailer" onClick={onClose}>✕</button>
      <div className="tvbox" onClick={(e) => e.stopPropagation()}>
        <div className="tvt">{title} <span className="mu">· Trailer</span></div>
        <div className="tvf"><iframe src={"https://www.youtube-nocookie.com/embed/" + k + "?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=" + encodeURIComponent(location.origin)} title={title + " trailer"} referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
        <a className="mu tiny" style={{ display: "inline-block", marginTop: 10 }} href={"https://www.youtube.com/watch?v=" + k} target="_blank" rel="noreferrer">Video not playing? Watch on YouTube ↗</a>
      </div>
    </div>
  );
}

export function Logo() {
  return <div className="brand"><div className="logo">BINGE</div><span className="tag">Movies · Series · Ratings</span></div>;
}

export function PageHead({ go }: { go: (to: string) => void }) {
  return (
    <header className="sh">
      <div onClick={() => go("/")} style={{ cursor: "pointer", justifySelf: "start" }}><Logo /></div>
      <button className="sbtn" onClick={() => (history.length > 1 ? history.back() : go("/"))}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg><span>Back</span>
      </button>
    </header>
  );
}

export function Extras({ d, go }: { d: any; go: (to: string) => void }) {
  return (<>
    {d.keywords?.length > 0 && <section className="sp-sec"><h2>Tags</h2><div className="chips kw">{d.keywords.map((k: string) => <span key={k}>{k}</span>)}</div></section>}
    {d.reviews?.length > 0 && <section className="sp-sec"><h2>Reviews</h2>
      <div className="revs">{d.reviews.map((r: any, i: number) => (
        <div className="rev" key={i}>
          <div className="rev-h"><b>{r.author}</b>{r.rating ? <span className="rev-r" style={{ background: ringColor(r.rating * 10) }}>★ {r.rating}/10</span> : null}<span className="mu tiny">{r.date}</span></div>
          <p>{r.text}{r.text.length >= 700 ? "…" : ""}</p>
          {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer">Read full review ↗</a>}
        </div>))}
      </div></section>}
    {d.gallery?.length > 0 && <section className="sp-sec"><h2>Gallery</h2>
      <div className="gal">{d.gallery.map((g: string) => <a key={g} href={IMG + "original" + g} target="_blank" rel="noopener noreferrer"><img src={IMG + "w500" + g} alt="" loading="lazy" /></a>)}</div></section>}
    {d.similar?.length > 0 && <section className="sp-sec"><h2>More like this</h2>
      <div className="sim">{d.similar.map((x: any) => (
        <div className="sm" key={x.media + x.id} onClick={() => go(`/${x.media === "tv" ? "series" : "movie"}/${x.id}`)}>
          <img src={IMG + "w342" + x.poster} alt={x.title} loading="lazy" />
          <b>{x.title}</b><span className="mu tiny">{x.year}{x.rating ? ` · ★ ${x.rating.toFixed(1)}` : ""}</span>
        </div>))}
      </div></section>}
  </>);
}