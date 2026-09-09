# OpenTable restaurant discovery with Algolia

A restaurant search prototype for the [Algolia Solutions Engineer hiring assignment](https://github.com/algolia/solutions-hiring-assignment/). It combines the supplied restaurant files into an Algolia index and demonstrates a path from searching or browsing to an OpenTable reservation link.

[Live demo on Vercel](https://algolia-restaurant-test.vercel.app) · [Source on GitHub](https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test)

The production demo is publicly accessible without a Vercel login (checked September 9, 2026). On September 9, 2026, six automated test suites passed locally, and the author reported all eight manual smoke checks passing both locally and on Vercel. Algolia Support Access was confirmed enabled by the author on September 9, 2026. The evaluation includes functional checks and the relevance evidence linked below; the author confirmed that the typo search returned the intended restaurant as its only result (rank 1).

## The customer problem

OpenTable needs to serve two audiences: visitors who know a restaurant's name, and visitors exploring their options. The prototype addresses both:

| Audience | Experience | Intended customer value |
| --- | --- | --- |
| Known restaurant | Text search, Algolia typo handling, city/neighborhood information, reservation links | Help visitors identify the right restaurant and reach booking quickly |
| Exploring restaurants | Cuisine, rating, price, payment, nearby search, and simple sentence interpretation | Help visitors narrow choices without knowing a restaurant name |

These are design goals, not measured conversion improvements. The demo links to OpenTable; it does not create bookings or check table availability.

## Run locally

Requirements: Python (3.12 matches the configured deployment runtime), internet access, and an Algolia application with search credentials. The local server and the six test suites below also passed using Python 3.9.6 and Node.js 24.15.0 on September 9, 2026. Node.js is needed for JavaScript tests and the optional `npm start` shortcut; the demo itself requires no npm dependency installation.

```sh
git clone https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test.git
cd algolia_restaurant_test
cp .env.example .env
```

Fill in `.env` locally:

- `ALGOLIA_APP_ID`: your application ID.
- `ALGOLIA_INDEX_NAME`: the restaurant index, currently `restaurants`.
- `ALGOLIA_SEARCH_API_KEY`: a search-only key restricted to the intended index.
- `ALGOLIA_WRITE_API_KEY`: needed only when importing records or changing index settings, Rules, or synonyms. It is not required to run the demo against an existing index.

For an existing configured index, skip the import commands. To populate your own index, set the write key and run:

```sh
python3 scripts/prepare_data.py
python3 scripts/index_data.py
```

The importer applies `config/algolia-settings.json`. To reproduce the additional dining-style synonyms and price Rule, use a key with the corresponding permissions and run:

```sh
python3 scripts/configure_dining_search.py --index YOUR_INDEX_NAME
python3 scripts/configure_rules.py
```

Replace `YOUR_INDEX_NAME` with your index name. The Rules script uses the index in `.env`.

Start the demo:

```sh
python3 scripts/serve.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the process running; stop it with Ctrl+C. Use this server rather than a generic file server: it supplies search configuration and the location endpoint while restricting access to private files. `npm start` launches this same Python server; no npm installation is required to use the direct Python command above.

## Data preparation

The supplied JSON is the base restaurant list. Python performs a left join with the semicolon-delimited CSV using `objectID`, keeping all JSON restaurants. CSV values take precedence for overlapping fields.

Preparation normalizes IDs to strings, converts ratings and review counts to numeric values, uses `Other` for a missing cuisine, and represents missing numeric values as null. It preserves the original input files and writes 5,000 merged records to `data/restaurants.json`.

The location audit checks coordinate ranges and writes review findings separately. The index uses the supplied `_geoloc` coordinates; coordinates are not inferred from phone numbers. Range validation alone does not prove an address is geographically correct.

The importer uploads batches of 500 using stable objectIDs, waits for each task to be published, then applies the search configuration. It upserts records; it does not clear unrelated records from an existing index.

### Price consistency

An audit found 220 records where numeric `price` did not follow the dominant correspondence with `price_range`. Search and card symbols therefore use the explicit price band consistently, without rewriting the source data:

| Source `price_range` | Card symbol | Search alias |
| --- | --- | --- |
| `$30 and under` | $ | cheap |
| `$31 to $50` | $$ | moderate |
| `$50 and over` | $$$ | expensive |

These are per-person categories, not exact menu prices. Source boundaries are retained as supplied.

## Architecture and API flow

The implementation uses plain HTML, CSS, JavaScript, and a small Python server to keep the request flow easy to inspect and explain.

1. The browser requests `/config.json`, containing only the application ID, index name, and browser-visible search key.
2. JavaScript translates supported sentence phrases into filters and sends search requests directly to Algolia.
3. Algolia returns restaurant hits, counts, and pagination information; JavaScript renders the cards.
4. Optional location lookup runs through Python. After the visitor confirms a location, its coordinates become Algolia geo-search parameters.

The write key is used only by local administration scripts for records, settings, Rules, and synonyms; it is not needed by the deployed application. `.env` is excluded from Git. The browser search key is public by design and must not be an admin key.

| Action | Requests |
| --- | --- |
| Initial page load | Same-origin `GET /config.json`, followed by an Algolia search |
| Typing | Search after a 200 ms pause; stale responses are ignored |
| Cuisine checkbox selection | Results query plus a query omitting cuisine restrictions for alternative facet counts |
| Page navigation | One query for the selected zero-based page |
| Results per page | Return to page one with 20, 50, or 100 hits per page |
| Cheapest search | Three count-only price-band queries, then results in the lowest matching band; an additional facet query may occur with checked cuisines |
| City, ZIP, or street | `POST /api/geocode`, server-side geocoding, then an Algolia search after confirmation |
| Two-letter US state code | Algolia state filter; no geocoding request or radius |
| Device location | Browser permission request; on success, an Algolia search with rounded coordinates |

The API debugger displays the latest 30 application requests, their triggers, bodies, status, and timing. It omits keys, headers, and location coordinates. Browser round-trip timing and Algolia processing time are different measurements. The debugger does not capture every browser resource request.

## Search configuration and decisions

The repository configuration is in `config/algolia-settings.json`:

- **Searchable fields:** `name`, `food_type`, `city`, `neighborhood`, `state`, then `unordered(dining_style)`. Names receive attribute priority for known-item searches; dining-style matching has lower attribute priority.
- **Facets:** `food_type`; filter-only `price_range`, `payment_options`, and `state`.
- **Numeric filtering:** minimum `stars_count`.
- **Custom ranking:** descending `stars_count`, then `reviews_count`, after the preceding relevance criteria. This is not a universal highest-rating sort.
- **Typo behavior:** rely on Algolia's existing/default matching rather than implementing a general spelling engine.
- **Geo-search:** Algolia uses indexed `_geoloc` coordinates with `aroundLatLng`, `aroundRadius`, and `aroundPrecision` to find nearby restaurants. City, ZIP, and street lookups use Nominatim, a geocoding service based on [OpenStreetMap](https://www.openstreetmap.org/) data, to obtain the search coordinates. Device location comes from the browser. Distances are approximate straight-line distances.

Cuisine checkbox choices use OR. Separate price, payment, and rating restrictions use AND. The original combined Cuisine / Food type list is retained because the source does not consistently provide those as independent dimensions.

### Algolia Rules and synonyms

The `affordable` Rule removes that word and applies `price_range:"$30 and under"`. In direct API checks on September 7, 2026, `affordable Italian` returned 585 matches; all 100 inspected records had that price band. The Rule is exported in `config/price-rules.json`.

Eight one-way synonyms in `config/dining-style-synonyms.json` expand phrases such as `relaxed dining`, `smart casual dining`, and `upscale dining` into dataset dining styles. These expand text matching; they do not impose a strict dining-style filter. Restaurant names retain higher searchable-attribute priority. See [search relevance evidence](docs/SEARCH-RELEVANCE.md) for measured outcomes and limitations.

### Sentence interpretation

Examples include `cheap Italian`, `Japanese under $30 accepting Visa`, and `cheapest Brazilian steak house`. A small deterministic interpreter recognizes supported phrases; Algolia applies the resulting filters. This is application logic, not semantic search or an Algolia synonym configuration.

Removable chips show the interpretation. Pizza spelling aliases resolve to `Pizzeria`. Unsupported words remain in the text query. Unsupported prices are explained rather than silently converted into an exact price filter.

`Cheapest` means the lowest available matching price band, not all results sorted by exact cost. `Best` uses existing relevance ranking and explicitly does not promise a separate highest-rating sort.

Typed cuisine and price intent take priority over corresponding sidebar selections. **Current limitation:** the sidebar can retain the old visible selection; explanatory text identifies the override. Synchronizing these controls into one visible state remains an improvement to make.

## Location lookup

Visitors may use device location or enter a US city, ZIP, street, or combination. Manual lookup returns candidates for confirmation. All 50 two-letter USPS state codes and DC select the entire state without geocoding or distance labels; use `NY` for statewide results rather than the ambiguous `New York`. City, ZIP, and street selections use a radius. Finding a location does not guarantee matching restaurants within that radius.

The local Python server uses [OpenStreetMap Nominatim](https://nominatim.org/). Its request controls are:

- Lookup occurs only on Find, not autocomplete or background queries.
- One server process serializes requests with at least 1.1 seconds between starts.
- A bounded in-memory cache retains results for up to one hour; it is not written to disk.
- Requests identify this application and the UI provides OpenStreetMap attribution.
- The endpoint can be changed with the process environment variable `GEOCODER_URL`.

Use public locations; do not submit personal or confidential information. On Vercel, Python Functions provide configuration and geocoding. Hosted geocoding uses a shared Redis lock and one-hour cache; it returns an error if the store is unavailable or not configured. Preview and production must share the store to coordinate requests. See [deployment setup](docs/VERCEL.md) for environment variables and checks.

Device location requires browser permission and a working location provider. The user confirmed it worked in Chrome; the in-app browser timed out. Errors provide an address-entry fallback. No device-location request runs automatically on page load.

## Validation and relevance evidence

### Manual smoke checks — September 9, 2026

The author reported the following outcomes both locally and on the Vercel demo. These checks establish basic functionality; they are not a measured relevance benchmark or an exhaustive mobile/device test.

| Check | Reported outcome |
| --- | --- |
| Page load | Styling and restaurant results displayed |
| `Italian` | Results appeared |
| `$30 and under`, Visa, and minimum 4 stars | Combined filter check passed |
| Page 2 | Restaurants changed |
| Reset | Filters cleared |
| `Chaimmbers Walk Caf` | Chambers Walk Cafe & Catering was the only result (rank 1), confirmed by the author |
| Waltham, MA | Location flow passed; zero restaurant results were reported as expected, with no radius recorded |
| Narrow browser window | Responsive layout remained usable |

[Search relevance evidence](docs/SEARCH-RELEVANCE.md) records earlier direct Algolia tests, Rule corrections, synonyms, and statewide filtering. Exact expected/actual ranking positions and a controlled matrix of filters and radii were not recorded for every query type. A future evaluation could add those measurements and extend coverage of conflicting typed-cuisine/sidebar selections.

### Automated checks

All six commands below passed on September 9, 2026, after the startup and JavaScript compatibility changes.

Run the automated checks from the project root:

```sh
node tests/debug.test.cjs
node tests/cards.test.cjs
node tests/location.test.cjs
node tests/sentence.test.cjs
python3 tests/test_geocode.py
python3 tests/test_location_audit.py
```

The tests cover request construction, stale responses, failures, location state, geocoder parsing/cache behavior, sentence matching, and card rendering. Most use mocked network responses. They do not constitute a full end-to-end browser suite or a guarantee of external service availability.

## Code guide

| File | Responsibility |
| --- | --- |
| `index.html`, `index.css` | Accessible controls, card template, responsive styling |
| `index.js` | Algolia requests, filter composition, cards, pagination |
| `sentence-search.js` | Supported language patterns and aliases |
| `location.js` | Location selection, permission handling, geo parameters |
| `debug.js` | Bounded, redacted request log |
| `scripts/prepare_data.py`, `scripts/index_data.py` | Merge and import restaurant data |
| `scripts/serve.py`, `scripts/config.py` | Local server and configuration |
| `scripts/geocode.py` | Local Nominatim lookup and rate limiting |
| `api/`, `scripts/shared_geocode.py` | Hosted configuration, address lookup, and shared Redis coordination |
| `vercel.json`, `scripts/build_vercel.py` | Deployment routing and public asset build |
| `scripts/audit_locations.py` | Coordinate audit |
| `data/locations.json` | Offline audit output; not the live geocoder |
| `tests/` | Automated behavior checks |

Comments explain the implementation in the source. Strict JSON files stay valid JSON; `docs/algolia-settings.explained.jsonc` provides an annotated settings reference.

## Submission checklist

- [x] Complete the eight manual smoke checks locally and on Vercel.
- [x] Run the six automated test suites successfully.
- [x] Document relevance findings and evaluation limitations.
- [x] Enable Algolia employee Support Access (confirmed by the author September 9, 2026).
- [ ] Submit the live demo link, GitHub repository link, and the short approach explanation below (planned for September 10, 2026).

Historical images and reservation links may no longer be available. Image fallbacks and validated booking links are provided, but current restaurant availability is not verified. Algolia's configured pagination limit can also constrain how many results a broad query exposes.

## Approach summary

I kept the original data separate from the generated index records, used Algolia for matching, facets, and geo-search, and kept interpretation and presentation logic small enough to inspect. The demo supports both known-item search and discovery, with a direct reservation action. The key trade-offs are rule-based sentence interpretation, price bands rather than exact prices, and an external geocoder for location text. Search quality is evaluated separately from whether an API request succeeds.

AI tools assisted implementation and debugging. The code, API debugger, tests, and documented decisions are intended to make the architecture and trade-offs reviewable and explainable.

## Scope of native price Rules

`config/price-rules.json` contains the verified `affordable` Rule. The grouped Rules files are proposals, not evidence that all aliases are active. The broader migration hit the account Rules quota. The browser still interprets cheap/moderate/expensive; affordable reaches Algolia as text and uses the native Rule. This distinction is intentional in the current demo and should be preserved when explaining the implementation.
