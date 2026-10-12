// Vercel serverless function: keeps API keys secret + caches responses
const T = "https://api.themoviedb.org/3";
const card = (r) => ({ id: r.id, media: r.media_type || (r.title ? "movie" : "tv"), title: r.title || r.name,
  year: (r.release_date || r.first_air_date || "").slice(0, 4), poster: r.poster_path, backdrop: r.backdrop_path, rating: r.vote_average });


// ---- extra free sources (all optional; failures never break the page) ----
const mdbList = async (media, tid) => {
  const k = process.env.MDBLIST_KEY, out = {};
  if (!k) { out.__err = "MDBLIST_KEY not set"; return out; }
  try {
    const r = await fetch(`https://api.mdblist.com/tmdb/${media}/${tid}?apikey=${k}`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    if (!r.ok || j.error) { out.__err = `HTTP ${r.status} ${j.error || ""}`.trim(); return out; }
    for (const x of j.ratings || []) { const sc = Number(x.score), v = Number(x.value); if (x.source && (sc > 0 || v > 0)) out[x.source] = { score: sc > 0 ? Math.round(sc) : null, value: v > 0 ? v : null }; }
    if (!Object.keys(out).length) out.__err = "no ratings for this title yet";
  } catch (e) { out.__err = String(e.message || e); }
  return out;
};
const tvmaze = async (imdb) => {
  if (!imdb) return null;
  try {
    const s = await (await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${imdb}`, { signal: AbortSignal.timeout(4000) })).json();
    if (!s?.id) return null;
    const e = await (await fetch(`https://api.tvmaze.com/shows/${s.id}?embed[]=nextepisode`, { signal: AbortSignal.timeout(4000) })).json();
    const n = e._embedded?.nextepisode;
    return { status: e.status, next: n ? { name: n.name, season: n.season, number: n.number, airdate: n.airdate, airtime: n.airtime } : null };
  } catch { return null; }
};
// best YouTube video: official trailer > trailer > teaser > clip > anything
const pickTrailer = (results) => {
  const yt = (results || []).filter((v) => v.site === "YouTube");
  const by = (t, o) => yt.find((v) => v.type === t && (!o || v.official));
  return (by("Trailer", true) || by("Trailer") || by("Teaser", true) || by("Teaser") || by("Clip") || yt[0])?.key;
};
const VL = "&include_video_language=en,hi,null";
const clean = (v) => (v && v !== "N/A" ? v : null);
const extras = (d, isTv) => ({
  reviews: (d.reviews?.results || []).slice(0, 4).map((r) => ({ author: r.author, rating: r.author_details?.rating ?? null, text: (r.content || "").replace(/\s+/g, " ").slice(0, 700), url: /^https:\/\//.test(r.url || "") ? r.url : null, date: (r.created_at || "").slice(0, 10) })),
  similar: (d.recommendations?.results?.length ? d.recommendations.results : []).filter((x) => x.poster_path).slice(0, 12).map((x) => card({ ...x, media_type: isTv ? "tv" : "movie" })),
  keywords: ((isTv ? d.keywords?.results : d.keywords?.keywords) || []).slice(0, 14).map((k) => k.name),
  gallery: (d.images?.backdrops || []).slice(0, 12).map((b) => b.file_path),
});
const mergeRatings = (o, ex, tmdb) => {
  const rt = (o.Ratings || []).find((r) => r.Source === "Rotten Tomatoes")?.Value;
  const imdbMdb = ex.imdb ? (ex.imdb.value && ex.imdb.value <= 10 ? ex.imdb.value : ex.imdb.score ? ex.imdb.score / 10 : null) : null;
  const sc = (k) => ex[k]?.score || null;
  return {
    imdb: parseFloat(o.imdbRating) || imdbMdb || null, rt: parseInt(rt) || sc("tomatoes"), meta: parseInt(o.Metascore) || sc("metacritic"), tmdb: tmdb || null,
    extra: { tomatoesaudience: sc("tomatoesaudience"), letterboxd: sc("letterboxd"), metacriticuser: sc("metacriticuser"), trakt: sc("trakt"), rogerebert: sc("rogerebert"), myanimelist: sc("myanimelist") },
  };
};

export default async function handler(req, res) {
  const one = (v, d = "") => String(Array.isArray(v) ? v[0] : v ?? d);
  const mode = one(req.query.mode, "trending"), media = one(req.query.media, "movie"), id = one(req.query.id), q = one(req.query.q).slice(0, 100);
  const MODES = ["trending", "movies", "series", "search", "detail", "movie", "home", "bollywood", "anime"];
  const bad = (m) => { res.setHeader("Cache-Control", "no-store"); return res.status(400).json({ error: m }); };
  if (!MODES.includes(mode)) return bad("bad mode");
  if (!["movie", "tv", "all"].includes(media)) return bad("bad media");
  if (["detail", "movie", "series"].includes(mode) && !/^\d{1,9}$/.test(id)) return bad("bad id");
  if (mode === "detail" && media === "all") return bad("bad media");
  const key = process.env.TMDB_KEY;
  if (!key) { res.setHeader("Cache-Control", "no-store"); return res.status(500).json({ error: "Server is not configured" }); }
  const get = async (u) => {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`${T}${u}${u.includes("?") ? "&" : "?"}api_key=${key}`, { signal: AbortSignal.timeout(8000) });
        if (r.status === 429) throw new Error("TMDB rate limit");
        return await r.json();
      } catch (e) {
        if (i === 2) throw e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  };
  // cache ONLY successful responses (a temporary TMDB failure must never be cached)
  const ttl = ["detail", "movie", "series"].includes(mode) ? "s-maxage=86400, stale-while-revalidate=604800" : "s-maxage=3600, stale-while-revalidate=86400";
  const json = (d) => { res.setHeader("Cache-Control", ttl); return res.json(d); };
  try {
    // adds a text-free widescreen still (thumb) + trailer key to hero-banner items
    const enrich = (items) => Promise.all(items.map(async (c) => {
      try { c.trailer = pickTrailer((await get(`/${c.media}/${c.id}?append_to_response=videos${VL}`)).videos?.results); } catch {}
      try {
        const im = (await get(`/${c.media}/${c.id}/images?include_image_language=null`)).backdrops || [];
        const best = im.filter((b) => !b.iso_639_1 && b.aspect_ratio > 1.7 && b.width >= 1280)
          .sort((x, y) => y.vote_average - x.vote_average || y.vote_count - x.vote_count || y.width - x.width)[0];
        if (best) c.thumb = "https://image.tmdb.org/t/p/w1280" + best.file_path;
      } catch {}
    }));
    if (mode === "detail") {
      const d = await get(`/${media}/${id}?append_to_response=credits,videos,external_ids,watch/providers${VL}`);
      const imdb = d.external_ids?.imdb_id || d.imdb_id;
      let o = {};
      if (imdb && process.env.OMDB_KEY)
        o = await (await fetch(`https://www.omdbapi.com/?i=${imdb}&apikey=${process.env.OMDB_KEY}`)).json();
      const rt = (o.Ratings || []).find((r) => r.Source === "Rotten Tomatoes")?.Value;
      const vids = (d.videos?.results || []).filter((v) => v.site === "YouTube");
      const yt = vids.find((v) => v.type === "Trailer" && v.official) || vids.find((v) => v.type === "Trailer") || vids.find((v) => v.type === "Teaser");
      const wp = d["watch/providers"]?.results?.IN || d["watch/providers"]?.results?.US || {};
      return json({
        ...card({ ...d, media_type: media }), overview: d.overview, backdrop: d.backdrop_path,
        genres: (d.genres || []).map((g) => g.name), runtime: d.runtime || d.episode_run_time?.[0],
        cast: (d.credits?.cast || []).slice(0, 6).map((c) => c.name),
        director: (d.credits?.crew || []).find((c) => c.job === "Director")?.name || (d.created_by || []).map((c) => c.name).join(", "),
        trailer: pickTrailer(d.videos?.results), providers: [...(wp.flatrate || []), ...(wp.rent || [])].map((p) => p.provider_name),
        ratings: { imdb: parseFloat(o.imdbRating) || null, rt: parseInt(rt) || null, meta: parseInt(o.Metascore) || null, tmdb: d.vote_average || null },
      });
    }
    if (mode === "movie") {
      const d = await get(`/movie/${id}?append_to_response=credits,videos,external_ids,watch/providers,release_dates,reviews,recommendations,keywords,images&include_image_language=en,null${VL}`);
      if (!d || !d.id) throw new Error(d?.status_message || "Movie not found");
      const imdb = d.external_ids?.imdb_id || d.imdb_id;
      const [o, ex] = await Promise.all([
        imdb && process.env.OMDB_KEY ? fetch(`https://www.omdbapi.com/?i=${imdb}&apikey=${process.env.OMDB_KEY}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => ({})) : {},
        mdbList("movie", d.id),
      ]);
      const yt = (d.videos?.results || []).filter((v) => v.site === "YouTube");
      const tr = yt.find((v) => v.type === "Trailer" && v.official) || yt.find((v) => v.type === "Trailer") || yt.find((v) => v.type === "Teaser");
      const wp = d["watch/providers"]?.results?.IN || d["watch/providers"]?.results?.US || {};
      const crew = d.credits?.crew || [];
      const names = (jobs) => [...new Set(crew.filter((c) => jobs.includes(c.job)).map((c) => c.name))];
      const rel = d.release_dates?.results || [];
      const cert = ((rel.find((x) => x.iso_3166_1 === "IN") || rel.find((x) => x.iso_3166_1 === "US"))?.release_dates || []).map((x) => x.certification).find(Boolean) || "";
      return json({
        id: d.id, media: "movie", title: d.title, tagline: d.tagline, overview: d.overview, poster: d.poster_path, backdrop: d.backdrop_path,
        year: (d.release_date || "").slice(0, 4), release: d.release_date, runtime: d.runtime, status: d.status, cert: cert || (clean(o.Rated) || ""),
        genres: (d.genres || []).map((g) => g.name), rating: d.vote_average, budget: d.budget || null, revenue: d.revenue || null,
        language: d.spoken_languages?.[0]?.english_name, countries: (d.production_countries || []).map((c) => c.name),
        directors: names(["Director"]), writers: names(["Writer", "Screenplay", "Story"]).slice(0, 4),
        cast: (d.credits?.cast || []).slice(0, 18).map((c) => ({ name: c.name, role: c.character, photo: c.profile_path })),
        trailer: pickTrailer(d.videos?.results), providers: [...(wp.flatrate || []), ...(wp.rent || [])].map((p) => p.provider_name),
        ratings: mergeRatings(o, ex, d.vote_average), awards: clean(o.Awards), boxOffice: clean(o.BoxOffice), collection: d.belongs_to_collection?.name || null,
        ...extras(d, false),
      });
    }
    if (mode === "series") {
      const base = await get(`/tv/${id}?append_to_response=aggregate_credits,videos,external_ids,watch/providers,reviews,recommendations,keywords,images&include_image_language=en,null${VL}`);
      if (!base || !base.id) throw new Error(base?.status_message || "Series not found");
      const nums = (base.seasons || []).map((x) => x.season_number).filter((n) => n >= 0).slice(0, 40);
      // all seasons (with every episode) – TMDB lets us append up to 20 seasons per request
      const raw = {};
      const chunks = []; for (let i = 0; i < nums.length; i += 20) chunks.push(nums.slice(i, i + 20));
      const imdb = base.external_ids?.imdb_id, ok = process.env.OMDB_KEY;
      let o = {}; const om = {};
      // everything below runs in PARALLEL (was one-after-another, which made series pages slow)
      const seasonsP = Promise.all(chunks.map(async (ch) => {
        const j = await get(`/tv/${id}?append_to_response=${ch.map((n) => `season/${n}`).join(",")}`);
        ch.forEach((n) => { if (j[`season/${n}`]) raw[n] = j[`season/${n}`]; });
      }));
      const omdbP = (async () => {
        if (!imdb || !ok) return;
        const omdb = async (q) => { try { return await (await fetch(`https://www.omdbapi.com/?i=${imdb}${q}&apikey=${ok}`, { signal: AbortSignal.timeout(5000) })).json(); } catch { return {}; } };
        const [title, ...ss] = await Promise.all([omdb(""), ...nums.filter((n) => n > 0).slice(0, 25).map((n) => omdb(`&Season=${n}`).then((x) => [n, x]))]);
        o = title;
        ss.forEach(([n, x]) => (x.Episodes || []).forEach((e) => { const v = parseFloat(e.imdbRating); if (v) om[`${n}:${e.Episode}`] = v; }));
      })();
      const [ex, tvm] = await Promise.all([mdbList("show", base.id), tvmaze(imdb), seasonsP, omdbP]);
      const rt = (o.Ratings || []).find((r) => r.Source === "Rotten Tomatoes")?.Value;
      const yt = (base.videos?.results || []).filter((v) => v.site === "YouTube");
      const tr = yt.find((v) => v.type === "Trailer" && v.official) || yt.find((v) => v.type === "Trailer") || yt.find((v) => v.type === "Teaser");
      const wp = base["watch/providers"]?.results?.IN || base["watch/providers"]?.results?.US || {};
      const seasons = nums.map((n) => {
        const x = raw[n]; if (!x) return null;
        return { n, name: x.name, air: x.air_date, overview: x.overview, poster: x.poster_path, episodes: (x.episodes || []).map((e) => {
          const im = om[`${n}:${e.episode_number}`], tm = e.vote_count > 0 && e.vote_average ? Math.round(e.vote_average * 10) / 10 : null;
          return { n: e.episode_number, name: e.name, air: e.air_date, runtime: e.runtime, overview: e.overview, still: e.still_path, rating: im ?? tm, src: im ? "imdb" : tm ? "tmdb" : null };
        }) };
      }).filter((x) => x && x.episodes.length);
      return json({
        id: base.id, media: "tv", title: base.name, tagline: base.tagline, overview: base.overview, poster: base.poster_path, backdrop: base.backdrop_path,
        year: (base.first_air_date || "").slice(0, 4), endYear: base.in_production ? null : (base.last_air_date || "").slice(0, 4), status: base.status,
        networks: (base.networks || []).map((x) => x.name), genres: (base.genres || []).map((g) => g.name), runtime: base.episode_run_time?.[0],
        numSeasons: base.number_of_seasons, numEpisodes: base.number_of_episodes, creators: (base.created_by || []).map((c) => c.name), rating: base.vote_average,
        cast: (base.aggregate_credits?.cast || []).slice(0, 16).map((c) => ({ name: c.name, role: c.roles?.[0]?.character, eps: c.total_episode_count, photo: c.profile_path })),
        trailer: pickTrailer(base.videos?.results), providers: [...(wp.flatrate || []), ...(wp.rent || [])].map((p) => p.provider_name),
        ratings: mergeRatings(o, ex, base.vote_average), awards: clean(o.Awards), tvmaze: tvm,
        ...extras(base, true),
        seasons,
      });
    }
    if (mode === "home") {
      const m = ["all", "movie", "tv"].includes(media) ? media : "all", kinds = m === "all" ? ["movie", "tv"] : [m];
      const pairs = String(req.query.ids || "").split(",").map((x) => x.split(":")).filter(([k, i]) => (k === "movie" || k === "tv") && /^\d+$/.test(i)).slice(0, 5);
      const own = new Set(pairs.map(([k, i]) => k + i));
      const R = async (u) => { try { return (await get(u)).results || []; } catch { return []; } };
      const mix = (a = [], b = []) => { const o = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) o.push(a[i]); if (b[i]) o.push(b[i]); } return o; };
      const lists = async (kind, path, pages) => (await Promise.all(pages.map((p) => R(`${path}?page=${p}`)))).flat().map((r) => ({ ...r, media_type: kind }));
      const popPages = m === "all" ? [1, 2] : [1], topPages = m === "all" ? [1] : [1, 2];
      const [trending, popArr, topArr, recArr] = await Promise.all([
        R(`/trending/${m}/week`).then((a) => a.filter((r) => r.media_type !== "person").map((r) => ({ ...r, media_type: r.media_type || m }))),
        Promise.all(kinds.map((k) => lists(k, `/${k}/popular`, popPages))),
        Promise.all(kinds.map((k) => lists(k, `/${k}/top_rated`, topPages))),
        Promise.all(pairs.map(([k, i]) => R(`/${k}/${i}/recommendations`).then((a) => a.map((r) => ({ ...r, media_type: k }))))),
      ]);
      const seen = new Set();
      const take = (arr, n = 99, skipOwn = false) => { const o = []; for (const r of arr) { if (o.length >= n) break; const k = r.media_type + r.id; if (!r.poster_path || seen.has(k) || (skipOwn && own.has(k))) continue; seen.add(k); o.push(card(r)); } return o; };
      const top = take(trending, 10);
      const personal = take(mix(...recArr.slice(0, 2)).concat(recArr.slice(2).flat()), 20, true);
      const fallback = m === "all" ? mix(...topArr) : mix(...popArr), last = m === "all" ? mix(...popArr) : mix(...topArr);
      const rec = personal.length >= 4 ? personal : [...personal, ...take(fallback, 20 - personal.length, true)];
      if (m !== "all") await enrich(top); // Movies / Series tabs: banner shows trending of that type
      return json({ top, rec, popular: take(last, 40), personal: personal.length >= 4 });
    }
    if (mode === "bollywood" || mode === "anime") {
      const an = mode === "anime", tv = media === "tv", kind = tv ? "tv" : "movie";
      const since = new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10);
      const base = an ? `/discover/${kind}?with_genres=16&with_original_language=ja` : `/discover/${kind}?with_original_language=hi${tv ? "" : "&region=IN"}`;
      const okLang = (r) => (an ? r.original_language === "ja" && (r.genre_ids || []).includes(16) : r.original_language === "hi");
      const mine = String(req.query.ids || "").split(",").filter((x) => /^\d+$/.test(x)).slice(0, 4);
      const [recent, p1, p2, best, ...recs] = await Promise.all([
        get(`${base}&sort_by=popularity.desc&${tv ? "first_air_date" : "primary_release_date"}.gte=${since}`),
        get(`${base}&sort_by=popularity.desc&vote_count.gte=${tv ? 5 : 20}&page=1`),
        get(`${base}&sort_by=popularity.desc&vote_count.gte=${tv ? 5 : 20}&page=2`),
        get(`${base}&sort_by=vote_average.desc&vote_count.gte=${tv ? 20 : 300}`),
        ...mine.map((i) => get(`/${kind}/${i}/recommendations`).catch(() => ({}))),
      ]);
      const seen = new Set();
      const uniq = (arr, skip = []) => (arr || []).filter((r) => r.poster_path && !seen.has(r.id) && !skip.includes(String(r.id)) && seen.add(r.id)).map((r) => card({ ...r, media_type: kind }));
      const top = uniq(recent.results).slice(0, 10);
      if (top.length < 10) top.push(...uniq([...(p1.results || []), ...(p2.results || [])]).slice(0, 10 - top.length));
      const popular = uniq([...(p1.results || []), ...(p2.results || [])]);
      const recSeen = new Set(), personal = [];
      recs.flatMap((r) => r.results || []).forEach((r) => { if (okLang(r) && r.poster_path && !recSeen.has(r.id) && !mine.includes(String(r.id))) { recSeen.add(r.id); personal.push(card({ ...r, media_type: kind })); } });
      const rec = personal.length >= 4 ? personal.slice(0, 20) : [...personal, ...(best.results || []).filter((r) => r.poster_path && !recSeen.has(r.id) && !mine.includes(String(r.id))).map((r) => card({ ...r, media_type: kind }))].slice(0, 20);
      // clean (text-free) widescreen stills for the hero banner, same as the Trending hero
      await Promise.all(top.map(async (c) => {
        try {
          const im = (await get(`/${kind}/${c.id}/images?include_image_language=null`)).backdrops || [];
          const best = im.filter((b) => !b.iso_639_1 && b.aspect_ratio > 1.7 && b.width >= 1280)
            .sort((x, y) => y.vote_average - x.vote_average || y.vote_count - x.vote_count || y.width - x.width)[0];
          if (best) c.thumb = "https://image.tmdb.org/t/p/w1280" + best.file_path;
        } catch {}
      }));
      return json({ top, rec, popular, personal: personal.length >= 4 });
    }
    const path = { trending: "/trending/all/week", movies: "/movie/top_rated", series: "/tv/top_rated",
      search: `/search/multi?query=${encodeURIComponent(q)}` }[mode];
    const data = await get(path);
    if (!Array.isArray(data.results)) throw new Error(data.status_message || "TMDB returned no results object");
    const out = (data.results || []).filter((r) => r.media_type !== "person" && r.poster_path).map((r) => card({ ...r, media_type: r.media_type || (mode === "series" ? "tv" : "movie") }));
    if (mode === "trending") await enrich(out.slice(0, 12)); // hero banner stills + trailers
    json(out);
  } catch (e) { console.error("tmdb api error:", e); res.setHeader("Cache-Control", "no-store"); res.status(500).json({ error: "Upstream error, please try again" }); }
}