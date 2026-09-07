# Vercel setup

Prepared, not yet deployed or verified on Vercel. Local startup stays `python3 scripts/serve.py`.

## Import settings

Import this repository. Framework: Other. The committed vercel.json sets the build to `python3 scripts/build_vercel.py`, output directory to `dist`, and skips the obsolete Parcel dependency install. Python 3.12 is selected. Only an explicit asset list is copied into public output. /config.json routes to a Python Function; /api/geocode is another Python Function.

## Environment variables

Add for Preview and Production:

- ALGOLIA_APP_ID
- ALGOLIA_INDEX_NAME = restaurants
- ALGOLIA_SEARCH_API_KEY (search-only, index-restricted)
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

Do not add the Algolia write/admin key. Do not upload .env. The configuration endpoint returns only the three public Algolia fields.

Connect an Upstash Redis store through Vercel's Marketplace or supply its REST URL/token. Review the selected provider plan before provisioning. Preview and production must use the same store to share the Nominatim request limit. No store has been created by this preparation step.

The global Redis lock serializes provider requests, survives multiple function instances, and adds a cooldown. Busy calls return 429 and invite a manual retry. Provider results are cached for one hour in Redis; only public location inputs should be used. Local development retains its in-memory limiter/cache. If the store is missing/unavailable, hosted manual lookup fails closed; device location and Algolia search remain independent.

## Preview acceptance checks

1. Confirm the landing page loads and /config.json contains only public search configuration.
2. Test exact names, affordable Italian, sidebar filters, page size and numbered pages.
3. Allow device location in Chrome and verify nearby results.
4. Find Waltham, MA and ZIP 33101; confirm a match and check the radius.
5. Test a repeated lookup (cache) and overlapping lookups (busy response).
6. Verify /.env, /dataset/restaurants_list.json and /scripts/config.py are not publicly served.
7. Inspect mobile layout, error states and external booking links.

Run local checks: `python3 tests/test_vercel.py` after `python3 scripts/build_vercel.py`, plus the existing test suite. Mocks verify the lock protocol; actual Redis connectivity and Vercel routing still require a preview deployment.
