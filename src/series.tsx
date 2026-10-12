import { useEffect, useRef, useState } from "react";
import { IMG, api, cached, useVotes, ratingRows, VoteButtons, TrailerBox, PageHead, Extras } from "./shared";

const hue = (r: number) => `hsl(${Math.round(((Math.min(Math.max(r, 4), 9.5) - 4) / 5.5) * 125)} 68% 36%)`;
const avgOf = (a: (number | null)[]) => { const v = a.filter((x): x is number => !!x); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "TBA");

export default function SeriesPage({ id, autoPlay, go, wl, toggle }: { id: string; autoPlay: boolean; go: (to: string) => void; wl: string[]; toggle: (k: string, item?: any) => void }) {
  const c0 = cached(`mode=series&id=${id}`);
  const [d, setD] = useState<any>(c0 && c0.seasons ? c0 : null);
  const [sn, setSn] = useState(c0 && c0.seasons ? (c0.seasons.find((s: any) => s.n > 0)?.n ?? c0.seasons[0]?.n ?? 1) : 1);
  const [hl, setHl] = useState<number | null>(null);
  const [tv, setTv] = useState(false);
  const epsRef = useRef<HTMLDivElement>(null);
  const { vt, cast } = useVotes("tv", id);

  useEffect(() => {
    document.title = "Binge";
    api(`mode=series&id=${id}`).then((x) => {
      if (x && x.seasons) { setD(x); setSn(x.seasons.find((s: any) => s.n > 0)?.n ?? x.seasons[0]?.n ?? 1); document.title = x.title + " · Binge"; }
      else setD({ fail: true });
    });
    return () => { document.title = "Binge"; };
  }, [id]);
  useEffect(() => { if (autoPlay && d?.trailer) setTv(true); }, [d]);

  const head = <PageHead go={go} />;

  if (!d) return <>{head}<div className="sp"><div className="sk" style={{ height: 320 }} /><p className="mu">Loading series…</p></div></>;
  if (d.fail) return <>{head}<div className="sp"><p className="mu">Couldn't load this series. Check your connection and try again.</p></div></>;

  const key = "tv" + d.id, { rows, avg } = ratingRows(d.ratings, vt);
  const real = d.seasons.filter((s: any) => s.n > 0);
  const maxEp = Math.max(0, ...real.map((s: any) => s.episodes.length));
  const season = d.seasons.find((s: any) => s.n === sn) || d.seasons[0];
  const sAvg = (s: any) => avgOf(s.episodes.map((e: any) => e.rating));
  const best = season ? [...season.episodes].filter((e: any) => e.rating).sort((a: any, b: any) => b.rating - a.rating)[0] : null;
  const pick = (s: number, e: number) => { setSn(s); setHl(e); setTimeout(() => epsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const item = { id: d.id, media: "tv", title: d.title, year: d.year, poster: d.poster, backdrop: d.backdrop, rating: d.rating };
  const meta = [d.year ? d.year + (d.endYear && d.endYear !== d.year ? "–" + d.endYear : d.endYear ? "" : "–") : null, d.status, d.numSeasons ? `${d.numSeasons} season${d.numSeasons > 1 ? "s" : ""}` : null, d.numEpisodes ? `${d.numEpisodes} episodes` : null, d.runtime ? `${d.runtime} min` : null].filter(Boolean);

  return (<>
    {head}
    <div className="sp">
      <section className="sp-hero" style={d.backdrop ? { backgroundImage: `linear-gradient(90deg,#121212 12%,#121212cc 45%,#12121266),url(${IMG}w1280${d.backdrop})` } : undefined}>
        <img className="sp-poster" src={IMG + "w500" + d.poster} alt={d.title} />
        <div className="sp-info">
          <h1>{d.title}</h1>
          {d.tagline && <p className="sp-tag">“{d.tagline}”</p>}
          <div className="mu">{meta.join(" · ")}</div>
          {d.tvmaze?.next && <div className="nextep"><i className="live" /><b>Next episode</b> S{d.tvmaze.next.season}·E{d.tvmaze.next.number}{d.tvmaze.next.name ? ` “${d.tvmaze.next.name}”` : ""} · {fmt(d.tvmaze.next.airdate)}{d.tvmaze.next.airtime ? " at " + d.tvmaze.next.airtime : ""}</div>}
          <div className="chips">{d.genres.map((g: string) => <span key={g}>{g}</span>)}</div>
          <p className="sp-over">{d.overview}</p>
          <div className="sp-tiles">
            <div className="tile big"><b>{avg}</b><small>Combined</small></div>
            {rows.map(([n, w, t]: any) => <div className={"tile" + (n === "Binge" ? " bg" : "")} key={n}><b>{t || "N/A"}</b><small>{n}</small></div>)}
          </div>
          <VoteButtons vt={vt} cast={cast} />
          <div className="sp-act">
            <button className="btn" onClick={() => toggle(key, item)}>{wl.includes(key) ? "✓ In watchlist" : "+ Watchlist"}</button>
            {d.trailer && <button className="btn o" onClick={() => setTv(true)}>▶ Watch Trailer</button>}
          </div>
        </div>
      </section>

      <section className="sp-sec">
        <h2>Episode ratings</h2>
        <p className="mu tiny">Every episode of every season. Tap a cell to jump to that episode.</p>
        <div className="heat">
          <div className="hrow hh"><span className="hl" />{Array.from({ length: maxEp }).map((_, i) => <span className="hc hn" key={i}>E{i + 1}</span>)}</div>
          {real.map((s: any) => (
            <div className="hrow" key={s.n}>
              <span className={"hl" + (s.n === sn ? " on" : "")} onClick={() => setSn(s.n)}>S{s.n}<small>{sAvg(s) ? sAvg(s)!.toFixed(1) : "–"}</small></span>
              {Array.from({ length: maxEp }).map((_, i) => {
                const e = s.episodes.find((x: any) => x.n === i + 1);
                return e
                  ? <span key={i} className={"hc" + (e.rating ? "" : " na")} style={e.rating ? { background: hue(e.rating) } : undefined} title={`S${s.n}·E${e.n} — ${e.name}${e.rating ? " ★ " + e.rating : ""}`} onClick={() => pick(s.n, e.n)}>{e.rating ? e.rating.toFixed(1) : "–"}</span>
                  : <span key={i} className="hc none" />;
              })}
            </div>
          ))}
        </div>
        <div className="legend"><span>Low</span><i /><span>High</span></div>
      </section>

      <section className="sp-sec" ref={epsRef}>
        <h2>Seasons &amp; episodes</h2>
        <div className="stabs">{d.seasons.map((s: any) => <button key={s.n} className={s.n === sn ? "on" : ""} onClick={() => { setSn(s.n); setHl(null); }}>{s.n === 0 ? "Specials" : "S" + s.n}</button>)}</div>
        {season && <>
          <div className="sinfo">
            <div><b>{season.name}</b><span className="mu"> · {season.air ? season.air.slice(0, 4) : "TBA"} · {season.episodes.length} episodes</span></div>
            {sAvg(season) && <span className="spill" style={{ background: hue(sAvg(season)!) }}>★ {sAvg(season)!.toFixed(1)} avg</span>}
          </div>
          {season.overview && <p className="mu sover">{season.overview}</p>}
          <div className="eps">
            {season.episodes.map((e: any) => (
              <div className={"ep" + (hl === e.n ? " hl" : "")} key={e.n}>
                <div className="ep-img">{e.still ? <img src={IMG + "w300" + e.still} alt="" loading="lazy" /> : <div className="ep-no">E{e.n}</div>}<span className="ep-n">E{e.n}</span></div>
                <div className="ep-b">
                  <div className="ep-t"><b>{e.name}</b>{best && best.n === e.n && <em>Top episode</em>}</div>
                  <div className="mu tiny">{fmt(e.air)}{e.runtime ? ` · ${e.runtime} min` : ""}</div>
                  {e.overview && <p className="ep-o">{e.overview}</p>}
                </div>
                <div className="ep-r" style={e.rating ? { background: hue(e.rating) } : undefined} title={e.src === "imdb" ? "IMDb rating" : e.src === "tmdb" ? "TMDB rating" : "No rating yet"}>{e.rating ? <>★ {e.rating.toFixed(1)}<small>{e.src === "imdb" ? "IMDb" : "TMDB"}</small></> : "–"}</div>
              </div>
            ))}
          </div>
        </>}
      </section>

      {d.cast.length > 0 && <section className="sp-sec">
        <h2>Cast</h2>
        <div className="cast">{d.cast.map((c: any, i: number) => (
          <div className="cm" key={i}>
            {c.photo ? <img src={IMG + "w185" + c.photo} alt="" loading="lazy" /> : <div className="cm-no">{c.name[0]}</div>}
            <b>{c.name}</b><span className="mu tiny">{c.role || ""}</span>{c.eps ? <span className="mu tiny">{c.eps} ep{c.eps > 1 ? "s" : ""}</span> : null}
          </div>))}
        </div>
      </section>}

      <Extras d={d} go={go} />

      <section className="sp-sec sp-facts">
        {d.creators.length > 0 && <div><span className="mu">Created by</span><b>{d.creators.join(", ")}</b></div>}
        {d.awards && <div><span className="mu">Awards</span><b>{d.awards}</b></div>}
        {d.networks.length > 0 && <div><span className="mu">Network</span><b>{d.networks.join(", ")}</b></div>}
        <div><span className="mu">Where to watch</span><b>{d.providers.length ? [...new Set(d.providers)].join(", ") : "Not listed"}</b></div>
      </section>
      <p className="mu tiny sp-foot">Episode ratings come from IMDb where available, otherwise TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
    {tv && d.trailer && <TrailerBox title={d.title} k={d.trailer} onClose={() => setTv(false)} />}
  </>);
}