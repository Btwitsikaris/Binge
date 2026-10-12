# Binge

1. `npm install`
2. Get free keys: TMDB (themoviedb.org -> Settings -> API) and OMDb (omdbapi.com). Copy `.env.example` to `.env` and fill it in. Never commit `.env`.
3. Run locally with the API: `npx vercel dev`  (plain `npm run dev` has no /api)
4. Deploy: push to GitHub -> import in Vercel -> add `TMDB_KEY` and `OMDB_KEY` (and optional `MDBLIST_KEY`) under Settings -> Environment Variables.
5. Votes: in Vercel open Storage -> connect Upstash Redis (free). It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. Without it, voting is disabled on the live site.
6. Redeploy after changing environment variables.