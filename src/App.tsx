import { useEffect, useRef, useState } from "react";
import { IMG, cached, api, prefetch, pct, ringColor, Logo, TrailerBox } from "./shared";
import SeriesPage from "./series";
import MoviePage from "./Movie";
import Intro from "./Intro";
type M = any;
const okT = (m: any) => m.thumb && !String(m.thumb).includes("ytimg");
const pick = (x: any[]) => { for (const k of ["thumb", "backdrop"]) { const b = x.filter((m) => (k === "thumb" ? okT(m) : m[k])); if (b.length >= 4) return b.slice(0, 9); } return x.slice(0, 9); };
const bd = (m: any) => (okT(m) ? m.thumb : null) || (m.backdrop ? IMG + "w1280" + m.backdrop : IMG + "w780" + m.poster);
const fb = (m: any) => (m.backdrop ? IMG + "w1280" + m.backdrop : IMG + "w780" + m.poster);
function Ring({ r }: { r: number }) {
  const p = pct(r);
  return <div className="ring" style={{ ["--p" as any]: p, ["--c" as any]: ringColor(p) }}><b>{p ? p : "NR"}{p ? <sup>%</sup> : null}</b></div>;
}

function Card({ m, onOpen, i }: { m: M; onOpen: (m: M) => void; i: number }) {
  return (
    <div className="card" style={{ animationDelay: i * 50 + "ms" }} onClick={() => onOpen(m)} onMouseEnter={() => prefetch(m)} onTouchStart={() => prefetch(m)}>
      <div className="pw">
        <img src={IMG + "w342" + m.poster} alt={m.title} loading="lazy" />
        <Ring r={m.rating} />
      </div>
      <div className="meta"><b>{m.title}</b><span className="mu">{m.year}</span></div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="fin">
        <div className="fr">
          <div className="fb">BINGE</div>
          <p>Discover movies and series, check ratings, and find your next watch.</p>
        </div>
        <div className="fc">
          <span className="fl">Contact</span>
          <p className="fd">Designed by <b>Aniket Majumdar</b></p>
          <a className="fm" href="mailto:aniketmajumdar2006@gmail.com">aniketmajumdar2006@gmail.com</a>
          <p className="fs">for questions, bugs, or feedback</p>
        </div>
      </div>
      <div className="fcp">🍿 Find it. Rate it. Binge it.</div>
    </footer>
  );
}
function Row({ title, sub, items, onOpen, rank }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: true });
  const upd = () => { const e = ref.current; if (e) setEdge({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 }); };
  useEffect(() => { upd(); window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd); }, [items]);
  const move = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: "smooth" });
  if (!items?.length) return null;
  const chev = (d: string) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  return (
    <section className="row">
      <h3>{title}{sub && <small>{sub}</small>}</h3>
      <div className="railw">
        {edge.l && <button className="rbtn l" aria-label="Scroll back" onClick={() => move(-1)}>{chev("M15 5l-7 7 7 7")}</button>}
        <div className="rail" ref={ref} onScroll={upd}>{items.map((m: M, i: number) => rank
          ? <div className="t10" key={m.media + m.id}><span className="rk">{i + 1}</span><Card m={m} i={i} onOpen={onOpen} /></div>
          : <div className="rc" key={m.media + m.id}><Card m={m} i={i} onOpen={onOpen} /></div>)}</div>
        {edge.r && <button className="rbtn r" aria-label="Scroll forward" onClick={() => move(1)}>{chev("M9 5l7 7-7 7")}</button>}
      </div>
    </section>
  );
}
function Bw({ d, onOpen, sub, last, err, retry }: { d: any; onOpen: (m: M) => void; sub: string; last: string; err: string; retry: () => void }) {
  if (!d && err) return <div className="bwerr"><b>Couldn't load this section.</b><code>{err}</code><button onClick={retry}>Try again</button></div>;
  if (!d) return <div className="grid">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="sk" />)}</div>;
  return (<>
    <Row title="Top 10 trending" sub={sub} items={d.top} onOpen={onOpen} rank />
    <Row title="Recommended for you" sub={d.personal ? "based on your watchlist" : "top rated picks"} items={d.rec} onOpen={onOpen} />
    {d.popular?.length ? <section className="row"><h3>{last}</h3><div className="grid">{d.popular.map((m: M, i: number) => <Card key={m.media + m.id} m={m} i={i} onOpen={onOpen} />)}</div></section> : null}
  </>);
}

export default function App() {
  const [tab, setTab] = useState("trending"), [bw, setBw] = useState("movies"), [bwd, setBwd] = useState<any>(null), [bwErr, setBwErr] = useState(""), [wf, setWf] = useState("all"), [bwTry, setBwTry] = useState(0), [intro, setIntro] = useState(() => { try { return location.pathname === "/" && (/[?&]intro/.test(location.search) || !sessionStorage.getItem("intro")); } catch { return location.pathname === "/"; } }), [q, setQ] = useState(""), [list, setList] = useState<M[]>(() => cached("mode=trending") || []), [loading, setLoading] = useState(true), [err, setErr] = useState(false);
  const [heroT, setHero] = useState<M[]>(() => pick(cached("mode=trending") || [])), [ci, setCi] = useState(0);
  const [wl, setWl] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("wl") || "[]"); } catch { return []; } });
  const [saved, setSaved] = useState<M[]>(() => { try { return JSON.parse(localStorage.getItem("wlm") || "[]"); } catch { return []; } });
  const [route, setRoute] = useState(() => location.pathname + location.search);
  const saveY = useRef(0);
  const [trl, setTrl] = useState<{ title: string; k?: string; state: "loading" | "ready" | "none" | "error"; year?: string } | null>(null);
  const rm = route.match(/^\/(series|movie)\/(\d+)/), pk = rm ? rm[1] : null, pid = rm ? rm[2] : null, sid = rm ? rm[1] + "/" + rm[2] : null, autoP = /[?&]play=1/.test(route);

  useEffect(() => { api("mode=trending").then((x) => Array.isArray(x) && setHero(pick(x))); }, []);
  useEffect(() => {
    if (["trending", "movies", "series", "bollywood", "anime"].includes(tab) && !q) { setLoading(false); return; }
    if (tab === "watch" && !q) { setLoading(false); return setList(saved); }
    const key = q ? "mode=search&q=" + encodeURIComponent(q) : "mode=" + (tab === "bollywood" ? "bollywood" + bw : tab);
    const c = cached(key);
    setList(Array.isArray(c) ? c : []);
    setLoading(true);
    const t = setTimeout(() => api(key).then((x) => { setList(Array.isArray(x) ? x : []); setErr(!Array.isArray(x)); setLoading(false); }), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [tab, bw, q, saved]);
  useEffect(() => {
    if (!["trending", "movies", "series", "bollywood", "anime"].includes(tab)) return;
    const tk = tab + (tab === "bollywood" || tab === "anime" ? bw : "");
    let key: string;
    if (tab === "bollywood" || tab === "anime") {
      const media = bw === "movies" ? "movie" : "tv";
      key = `mode=${tab}&media=${media}&ids=${saved.filter((m) => m.media === media).slice(-4).map((m) => m.id).join(",")}`;
    } else {
      const media = tab === "trending" ? "all" : tab === "movies" ? "movie" : "tv";
      key = `mode=home&media=${media}&ids=${saved.slice(-5).map((m) => m.media + ":" + m.id).join(",")}`;
    }
    const c = cached(key);
    setBwd(c && c.top ? { ...c, _k: tk } : null); setBwErr("");
    let stale = false;
    api(key).then((x) => {
      if (stale) return;
      if (x && x.top) return setBwd({ ...x, _k: tk });
      setBwd(null);
      fetch("/api/tmdb?" + key).then((r) => r.text()).then((t) => !stale && setBwErr(t.slice(0, 220) || "Empty response from /api/tmdb")).catch(() => !stale && setBwErr("Can't reach /api/tmdb. If you're running locally, start the site with `npx vercel dev`."));
    });
    return () => { stale = true; };
  }, [tab, bw, bwTry]);
  useEffect(() => { if (sid) return; const t = setInterval(() => setCi((c) => c + 1), 4000); return () => clearInterval(t); }, [ci, sid]);

  const toggle = (k: string, item?: M) => {
    const has = wl.includes(k);
    const w = has ? wl.filter((x) => x !== k) : [...wl, k];
    const all = [...(item ? [item] : []), ...list, ...hero, ...saved];
    const s = has ? saved.filter((m) => m.media + m.id !== k) : [...saved, all.find((m) => m.media + m.id === k)!].filter(Boolean);
    setWl(w); setSaved(s);
    try { localStorage.setItem("wl", JSON.stringify(w)); localStorage.setItem("wlm", JSON.stringify(s)); } catch {}
  };
  const tk = tab + (tab === "bollywood" || tab === "anime" ? bw : "");
  // hero banner follows the section: Movies / Series / Anime / Bollywood each show their own trending titles; Trending shows the mix
  const hero: M[] = tab === "trending" || tab === "watch" ? heroT : (bwd?._k === tk && bwd.top?.length ? pick(bwd.top) : []);
  const shown = tab === "watch" && !q ? list.filter((m) => wf === "all" || m.media === wf) : list;
  const n = hero.length;
  const cur = n ? ((ci % n) + n) % n : 0;
  const [so, setSo] = useState(false);
  const sref = useRef<HTMLInputElement>(null);
  const openS = () => { setSo(true); setTimeout(() => sref.current?.focus(), 50); };
  const closeS = () => { setQ(""); setSo(false); };
  const go = (to: string) => { if (!sid) saveY.current = window.scrollY; history.pushState({}, "", to); setRoute(to); window.scrollTo(0, 0); };
  useEffect(() => { const h = () => setRoute(location.pathname + location.search); window.addEventListener("popstate", h); return () => window.removeEventListener("popstate", h); }, []);
  useEffect(() => { if (!sid) setTimeout(() => window.scrollTo(0, saveY.current), 0); }, [sid]);
  const playTrailer = async (m: M) => {
    console.log("[binge] play clicked", m.title, "trailer key:", m.trailer);
    if (m.trailer) { setTrl({ title: m.title, k: m.trailer, state: "ready" }); return; } // already known: play instantly
    setTrl({ title: m.title, year: m.year, state: "loading" });
    const x = await api(`mode=detail&media=${m.media === "tv" ? "tv" : "movie"}&id=${m.id}`);
    setTrl((cur) => (cur && cur.title === m.title ? (x?.trailer ? { title: m.title, k: x.trailer, state: "ready" } : { title: m.title, year: m.year, state: x ? "none" : "error" }) : cur));
  };
  const openM = (m: M, p = false) => go(`/${m.media === "tv" ? "series" : "movie"}/${m.id}${p ? "?play=1" : ""}`);

  if (pid) return <>{pk === "movie" ? <MoviePage key={sid!} id={pid} autoPlay={autoP} go={go} wl={wl} toggle={toggle} /> : <SeriesPage key={sid!} id={pid} autoPlay={autoP} go={go} wl={wl} toggle={toggle} />}<Footer /></>;


  return (<>
    {intro && <Intro onDone={() => setIntro(false)} />}
    <header>
      <Logo />
      <nav>{[["trending", "Trending"], ["movies", "Movies"], ["series", "Series"], ["bollywood", "Bollywood"], ["anime", "Anime"], ["watch", "Watchlist"]].map(([k, l]) =>
        <button key={k} className={tab === k && !q ? "on" : ""} onClick={() => { closeS(); setTab(k); }}>{l}</button>)}</nav>
      <button className={"sbtn" + (so ? " on" : "")} aria-label={so ? "Close search" : "Search"} onMouseDown={(e) => e.preventDefault()} onClick={() => (so ? closeS() : openS())}>
        {so
          ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>}
        <span>{so ? "Close" : "Search"}</span>
      </button>
      <div className={"sbar" + (so ? " open" : "")}>
        <input ref={sref} className="search" placeholder="Search any movie or series…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && closeS()} onBlur={() => !q && setSo(false)} />
      </div>
    </header>
    {trl?.state === "ready" && trl.k && <TrailerBox title={trl.title} k={trl.k} onClose={() => setTrl(null)} />}
    {trl && trl.state !== "ready" && <div className="tv" onClick={() => setTrl(null)}><div className="tvbox" onClick={(e) => e.stopPropagation()}>
      <div className="tvt">{trl.title} <span className="mu">· {trl.state === "loading" ? "Loading trailer…" : trl.state === "error" ? "Couldn't load the trailer info" : "No trailer listed yet"}</span></div>
      {trl.state !== "loading" && <a className="btn o" target="_blank" rel="noreferrer" href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(`${trl.title} ${trl.year || ""} official trailer`)}>▶ Search trailer on YouTube</a>}
    </div></div>}
    {tab !== "watch" && <section className="featured">
      {n === 0 ? <div className="hero" /> : <div className="hero" onMouseEnter={() => prefetch(hero[cur])}>
      {hero.map((m, i) => <img key={m.id} className={"bg" + (i === cur ? " on" : "")} src={bd(m)} alt={i === cur ? m.title : ""} onClick={() => openM(hero[cur])}
        onError={(e) => { const t = e.currentTarget; if (!t.dataset.f) { t.dataset.f = "1"; t.src = fb(m); } }}
        onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth < 400 && !t.dataset.f) { t.dataset.f = "1"; t.src = fb(m); } }} />)}
      <button className="hnav l" aria-label="Previous" onClick={() => setCi((c) => c - 1)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg></button>
      <button className="hnav r" aria-label="Next" onClick={() => setCi((c) => c + 1)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg></button>
      <div className="hbar">
        <div className="hp" onClick={() => openM(hero[cur])}>
          {hero.map((m, i) => { const o = ((((i - ci) % n) + n + n / 2) % n) - n / 2, a = Math.abs(o);
            return <img key={m.id} src={IMG + "w342" + m.poster} alt=""
              style={{ transform: `translateX(${o * 45}%) translateZ(${-a * 80}px) rotateY(${o > 0 ? -65 : o < 0 ? 65 : 0}deg)`, opacity: a ? 0 : 1, zIndex: 10 - a }} />; })}
          <button className={"bm" + (wl.includes(hero[cur]?.media + hero[cur]?.id) ? " on" : "")} aria-label="Toggle watchlist"
            onClick={(e) => { e.stopPropagation(); toggle(hero[cur].media + hero[cur].id); }}>{wl.includes(hero[cur]?.media + hero[cur]?.id) ? "✓" : "+"}</button>
        </div>
        <button className="pbtn" aria-label="Play trailer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); playTrailer(hero[cur]); }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <div className="hinfo">
          <div className="ht">{hero[cur]?.title}</div>
          <div className="hs">▶ Watch the Trailer<span className="mu"> · {hero[cur]?.year} · ★ {hero[cur]?.rating?.toFixed(1)}</span></div>
        </div>
      </div></div>}
      {n > 3 && <aside className="upnext">
        <div className="uph"><span><i className="live" />Coming up</span>
          <div className="dots">{hero.map((_, i) => <i key={i} className={i === cur ? "on" : ""} onClick={() => setCi(ci + i - cur)} />)}</div></div>
        {[1, 2, 3].map((k) => { const x = hero[(cur + k) % n], pc = pct(x.rating); return (
          <div className="un" key={x.id} onClick={() => setCi(ci + k)}>
            <img src={IMG + "w185" + x.poster} alt="" loading="lazy" />
            <div className="unt">
              <b>{x.title}</b>
              <div className="unm"><span className="pill">{x.media === "tv" ? "Series" : "Movie"}</span><span className="mu tiny">{x.year}</span>
                <span className="sc" style={{ color: ringColor(pc) }}>★ {x.rating?.toFixed(1)}</span></div>
            </div>
            <span className="num">0{k}</span>
            {k === 1 && <u key={cur} className="prog" />}
          </div>); })}
        <a className="browse" onClick={() => document.querySelector("main")?.scrollIntoView({ behavior: "smooth" })}>Browse all ↓</a>
      </aside>}
    </section>}
    {tab === "watch" && !q && <section className="wlhead">
      <div className="wlt"><h1>My List</h1><p>Everything you saved to watch later, kept on this device.</p></div>
      <div className="wls">
        <div><b>{saved.length}</b><span>Saved</span></div>
        <div><b>{saved.filter((m) => m.media === "movie").length}</b><span>Movies</span></div>
        <div><b>{saved.filter((m) => m.media === "tv").length}</b><span>Series</span></div>
      </div>
    </section>}
    <main>
      {!(tab === "watch" && !q) && <h2>{q ? `Results for “${q}”` : { trending: "Discover", movies: "Movies", series: "TV Series", bollywood: bw === "movies" ? "Bollywood Movies" : "Bollywood Series", anime: bw === "movies" ? "Anime Movies" : "Anime Series", watch: "Your watchlist" }[tab]}</h2>}
      {tab === "watch" && !q && saved.length > 0 && <div className="stabs">{[["all", "All"], ["movie", "Movies"], ["tv", "Series"]].map(([k, l]) => <button key={k} className={wf === k ? "on" : ""} onClick={() => setWf(k)}>{l}</button>)}<button className="clr" onClick={() => { if (confirm("Remove everything from your list?")) { setWl([]); setSaved([]); try { localStorage.setItem("wl", "[]"); localStorage.setItem("wlm", "[]"); } catch {} } }}>Clear all</button></div>}
      {(tab === "bollywood" || tab === "anime") && !q && <div className="stabs">{[["movies", "Movies"], ["series", "Series"]].map(([k, l]) => <button key={k} className={bw === k ? "on" : ""} onClick={() => setBw(k)}>{l}</button>)}</div>}
      {["trending", "movies", "series", "bollywood", "anime"].includes(tab) && !q ? <Bw d={bwd?._k === tk ? bwd : null} err={bwErr} retry={() => setBwTry((n) => n + 1)} onOpen={openM} sub={tab === "bollywood" ? "in India right now" : tab === "anime" ? "new & trending" : "this week"} last={tab === "movies" ? "Top rated movies" : tab === "series" ? "Top rated series" : tab === "trending" ? "Popular right now" : "Popular"} /> : tab === "watch" && !q && !saved.length ? <div className="wlempty"><div className="wle">+</div><h3>Your list is empty</h3><p>Tap the + on any movie or series to save it here for later.</p><button onClick={() => setTab("trending")}>Browse trending</button></div> : loading && !list.length ? <div className="grid">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="sk" />)}</div> : shown.length ? <div className="grid">{shown.map((m, i) => <Card key={m.media + m.id} m={m} i={i} onOpen={openM} />)}</div> : <p className="mu">{err ? "Couldn't reach the server. Check your connection and try again." : q ? `No results for “${q}”.` : tab === "watch" ? "Nothing here in this filter yet." : "Nothing to show yet. Refresh in a moment."}</p>}
    </main>
    <Footer />
  </>);
}