# OpenTable restaurant discovery with Algolia

A restaurant search prototype for the [Algolia Solutions Engineer hiring assignment](https://github.com/algolia/solutions-hiring-assignment/). It combines the supplied restaurant files into an Algolia index and demonstrates a path from searching or browsing to an OpenTable reservation link.

**Submission status:** the source is available on [GitHub](https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test). A public demo URL and confirmation of Algolia Support Access are still pending. This README is a draft for review.

## The customer problem

OpenTable needs to serve two audiences: visitors who know a restaurant's name, and visitors exploring their options. The prototype addresses both:

| Audience | Experience | Intended customer value |
| --- | --- | --- |
| Known restaurant | Text search, Algolia typo handling, city/neighborhood information, reservation links | Help visitors identify the right restaurant and reach booking quickly |
| Exploring restaurants | Cuisine, rating, price, payment, nearby search, and simple sentence interpretation | Help visitors narrow choices without knowing a restaurant name |

These are design goals, not measured conversion improvements. The demo links to OpenTable; it does not create bookings or check table availability.

## Run locally

Requirements: Python 3.10+, internet access, and an Algolia application with search credentials. Node.js is needed only for JavaScript tests. No npm installation is required for the demo.

```sh
git clone https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test.git
cd algolia_restaurant_test
cp .env.example .env
```

Fill in `.env` locally:

- `ALGOLIA_APP_ID`: your application ID.
- `ALGOLIA_INDEX_NAME`: the restaurant index, currently `restaurants`.
- `ALGOLIA_SEARCH_API_KEY`: a search-only key restricted to the intended index.
- `ALGOLIA_WRITE_API_KEY`: a private key with the permissions needed by the import script.

If creating your own index, prepare and import the data first:

```sh
python3 scripts/prepare_data.py
python3 scripts/index_data.py
```

Start the demo:

```sh
python3 scripts/serve.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the process running; stop it with Ctrl+C. Use this server rather than a generic file server: it supplies search configuration and the location endpoint while restricting access to private files. The retained starter `package.json` is not the current startup workflow.

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

The write key stays on the server and is used only for indexing. `.env` is excluded from Git. The browser search key is public by design and must not be an admin key.

| Action | Requests |
| --- | --- |
| Initial page load | Local `GET /config.json`, followed by an Algolia search |
| Typing | Search after a 200 ms pause; stale responses are ignored |
| Cuisine checkbox selection | Results query plus a query omitting cuisine restrictions for alternative facet counts |
| Page navigation | One query for the selected zero-based page |
| Results per page | Return to page one with 20, 50, or 100 hits per page |
| Cheapest search | Three count-only price-band queries, then results in the lowest matching band; an additional facet query may occur with checked cuisines |
| Manual location | `POST /api/geocode`, server-side geocoding, then an Algolia search after confirmation |
| Device location | Browser permission request; on success, an Algolia search with rounded coordinates |

The API debugger displays the latest 30 application requests, their triggers, bodies, status, and timing. It omits keys, headers, and location coordinates. Browser round-trip timing and Algolia processing time are different measurements. The debugger does not capture every browser resource request.

## Search configuration and decisions

The repository configuration is in `config/algolia-settings.json`:

- **Searchable fields:** `name`, `food_type`, `city`, `neighborhood`, `state`, in that order. Names receive attribute priority for known-item searches.
- **Facets:** `food_type`; filter-only `price_range` and `payment_options`.
- **Numeric filtering:** minimum `stars_count`.
- **Custom ranking:** descending `stars_count`, then `reviews_count`, after the preceding relevance criteria. This is not a universal highest-rating sort.
- **Typo behavior:** rely on Algolia's existing/default matching rather than implementing a general spelling engine.
- **Geo-search:** `_geoloc` records, `aroundLatLng`, `aroundRadius`, and `aroundPrecision` support nearby results. Distances are approximate straight-line distances.

Cuisine checkbox choices use OR. Separate price, payment, and rating restrictions use AND. The original combined Cuisine / Food type list is retained because the source does not consistently provide those as independent dimensions.

### Sentence interpretation

Examples include `cheap Italian`, `Japanese under $30 accepting Visa`, and `cheapest Brazilian steak house`. A small deterministic interpreter recognizes supported phrases; Algolia applies the resulting filters. This is application logic, not semantic search or an Algolia synonym configuration.

Removable chips show the interpretation. Pizza spelling aliases resolve to `Pizzeria`. Unsupported words remain in the text query. Unsupported prices are explained rather than silently converted into an exact price filter.

`Cheapest` means the lowest available matching price band, not all results sorted by exact cost. `Best` uses existing relevance ranking and explicitly does not promise a separate highest-rating sort.

Typed cuisine and price intent take priority over corresponding sidebar selections. **Current limitation:** the sidebar can retain the old visible selection; explanatory text identifies the override. Synchronizing these controls into one visible state remains an improvement to make.

## Location lookup

Visitors may use device location or enter a US city, ZIP, street, or combination. Manual lookup returns candidates for confirmation. Ambiguous or incomplete input may need a state or more detail; a match is not guaranteed.

The Python server uses [OpenStreetMap Nominatim](https://nominatim.org/) under its [public usage policy](https://operations.osmfoundation.org/policies/nominatim/):

- Lookup occurs only on Find, not autocomplete or background queries.
- One server process serializes requests with at least 1.1 seconds between starts.
- A bounded in-memory cache retains results for up to one hour; it is not written to disk.
- Requests identify this application and the UI provides OpenStreetMap attribution.
- The endpoint can be changed with the process environment variable `GEOCODER_URL`.

Use public locations; do not submit personal or confidential information. A production or multi-process deployment needs a suitable provider or shared rate limiting across all instances. This public endpoint is not an unrestricted production dependency.

Device location requires browser permission and a working location provider. The user confirmed it worked in Chrome; the in-app browser timed out. Errors provide an address-entry fallback. No device-location request runs automatically on page load.

## Validation and relevance evidence

| Scenario | Evidence so far |
| --- | --- |
| `Chaimmbers Walk Caf` | User confirmed Chambers Walk Cafe & Catering was found; result position was not recorded |
| Italian with Pizzeria checked | A conflicting-filter failure led to typed-cuisine priority; automated regression covers the request rule. Later reported counts still need a controlled retest |
| Cheapest American with an expensive dropdown selection | Debugger exposed the conflict; typed-price priority was added and regression-tested; user subsequently accepted the behavior |
| Pizza / pizzeria / pizzaria / pizzeira | Parser tests confirm the same Pizzeria filter |
| Price symbols | Renderer derives symbols from price_range to agree with filtering |
| Device location | User confirmed success in Chrome after in-app browser timeout |
| ZIP 33101 and Waltham, MA | Successful location lookups were confirmed during development and by the user |

These are partial relevance findings, not a completed benchmark. Before submission, record controlled exact-name, partial-name, missing-space, typo, broad, empty, and location-sensitive queries, including expected result positions and actual outcomes. Application regression tests do not substitute for evaluating live Algolia relevance.

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
| `scripts/geocode.py` | Nominatim lookup and rate limiting |
| `scripts/audit_locations.py` | Coordinate audit |
| `data/locations.json` | Offline audit output; not the live geocoder |
| `tests/` | Automated behavior checks |

Comments explain the implementation in the source. Strict JSON files stay valid JSON; `docs/algolia-settings.explained.jsonc` provides an annotated settings reference.

## Remaining submission work

- Complete and consolidate representative relevance tests, including ranking positions and before/after findings.
- Verify desktop/mobile flows, pagination, and filter interactions end to end.
- Deploy a public demo. The current server binds to localhost and is a development server, not a production hosting setup.
- Confirm Algolia Settings → Support Access → Allow Algolia employees to access my account.
- Add the public demo URL and review this explanation before submission.

Historical images and reservation links may no longer be available. Image fallbacks and validated booking links are provided, but current restaurant availability is not verified. Algolia's configured pagination limit can also constrain how many results a broad query exposes.

## Approach summary

I kept the original data separate from the generated index records, used Algolia for matching, facets, and geo-search, and kept interpretation and presentation logic small enough to inspect. The demo supports both known-item search and discovery, with a direct reservation action. The key trade-offs are rule-based sentence interpretation, price bands rather than exact prices, and an external geocoder for location text. Search quality is evaluated separately from whether an API request succeeds.

AI tools assisted implementation and debugging. The code, API debugger, tests, and documented decisions are intended to make the architecture and trade-offs reviewable and explainable.
