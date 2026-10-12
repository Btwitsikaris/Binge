import { useEffect, useState } from "react";
import { IMG, api, cached, useVotes, ratingRows, VoteButtons, TrailerBox, PageHead, Extras } from "./shared";

const money = (n?: number) => (n ? "$" + (n >= 1e9 ? (n / 1e9).toFixed(2) + " B" : n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n.toLocaleString()) : null);
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null);

export default function MoviePage({ id, autoPlay, go, wl, toggle }: { id: string; autoPlay: boolean; go: (to: string) => void; wl: string[]; toggle: (k: string, item?: any) => void }) {
  const c0 = cached(`mode=movie&id=${id}`);
  const [d, setD] = useState<any>(c0 && c0.title ? c0 : null);
  const [tv, setTv] = useState(false);
  const { vt, cast } = useVotes("movie", id);

  useEffect(() => {
    document.title = "Binge";
    api(`mode=movie&id=${id}`).then((x) => { if (x && x.title) { setD(x); document.title = x.title + " · Binge"; } else setD({ fail: true }); });
    return () => { document.title = "Binge"; };
  }, [id]);
  useEffect(() => { if (autoPlay && d?.trailer) setTv(true); }, [d]);

  const head = <PageHead go={go} />;
  if (!d) return <>{head}<div className="sp"><div className="sk" style={{ height: 320 }} /><p className="mu">Loading movie…</p></div></>;
  if (d.fail) return <>{head}<div className="sp"><p className="mu">Couldn't load this movie. Check your connection and try again.</p></div></>;

  const key = "movie" + d.id, { rows, avg } = ratingRows(d.ratings, vt);
  const item = { id: d.id, media: "movie", title: d.title, year: d.year, poster: d.poster, backdrop: d.backdrop, rating: d.rating };
  const meta = [d.year, d.cert, d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : null, d.language].filter(Boolean);
  const facts: [string, string | null][] = [
    ["Directed by", d.directors.join(", ") || null], ["Written by", d.writers.join(", ") || null], ["Release date", fmt(d.release)], ["Status", d.status],
    ["Budget", money(d.budget)], ["Box office", money(d.revenue) || d.boxOffice || null], ["Awards", d.awards || null], ["Part of", d.collection || null], ["Country", d.countries.join(", ") || null],
    ["Where to watch", d.providers.length ? [...new Set<string>(d.providers)].join(", ") : "Not listed"],
  ];

  return (<>
    {head}
    <div className="sp">
      <section className="sp-hero" style={d.backdrop ? { backgroundImage: `linear-gradient(90deg,#121212 12%,#121212cc 45%,#12121266),url(${IMG}w1280${d.backdrop})` } : undefined}>
        <img className="sp-poster" src={IMG + "w500" + d.poster} alt={d.title} />
        <div className="sp-info">
          <h1>{d.title}</h1>
          {d.tagline && <p className="sp-tag">“{d.tagline}”</p>}
          <div className="mu">{meta.join(" · ")}</div>
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

      {d.cast.length > 0 && <section className="sp-sec">
        <h2>Cast</h2>
        <div className="cast">{d.cast.map((c: any, i: number) => (
          <div className="cm" key={i}>
            {c.photo ? <img src={IMG + "w185" + c.photo} alt="" loading="lazy" /> : <div className="cm-no">{c.name[0]}</div>}
            <b>{c.name}</b><span className="mu tiny">{c.role || ""}</span>
          </div>))}
        </div>
      </section>}

      <Extras d={d} go={go} />

      <section className="sp-sec sp-facts">
        {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="mu">{k}</span><b>{v}</b></div>)}
      </section>
      <p className="mu tiny sp-foot">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
    {tv && d.trailer && <TrailerBox title={d.title} k={d.trailer} onClose={() => setTv(false)} />}
  </>);
}