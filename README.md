# OpenTable — Algolia restaurant demo

The supplied HTML/CSS starter now searches the live `restaurants` Algolia index. The original four-record `restaurants_test` index is preserved.

## Run locally

Requires Python 3.10 or newer. After cloning, copy `.env.example` to `.env` and fill in your Algolia credentials. No npm installation is required.

```sh
python3 scripts/serve.py
```

Open http://127.0.0.1:8000. Stop with Ctrl+C. Keep the server running while demonstrating the page. Use this server, not a generic file server or the old Parcel command: it provides `/config.json` while keeping `.env` private.

## Files and responsibilities

| File | Purpose |
| --- | --- |
| `index.html` | Search form, filters, and reusable restaurant card |
| `index.css` | Supplied styles plus responsive overrides |
| `location.js` | Optional device/address location, radius, and distance display |
| `scripts/audit_locations.py` | Validate location data and derive approximate city choices |
| `data/locations.json` | Retained offline city-center audit output; no longer loaded by the UI |
| `scripts/geocode.py` | Resolve explicitly submitted US addresses through Census Geocoder |
| `data/location-audit.json` | Offline audit findings and review flags |
| `index.js` | Search requests, facet counts, pagination, loading and error states |
| `dataset/` | Unchanged assignment JSON and CSV |
| `data/restaurants.json` | 5,000 merged records generated from the original files |
| `scripts/prepare_data.py` | Join records by objectID; normalize ratings/reviews |
| `scripts/index_data.py` | Upload in batches of 500 and wait for published tasks |
| `scripts/config.py` | Read local configuration and configure verified TLS |
| `scripts/serve.py` | Serve public files and public search configuration |
| `config/algolia-settings.json` | Searchable fields, facets, and custom ranking |
| `.env` | Actual local API credentials; excluded from Git |
| `.env.example` | Blank credential template |

Python files use `.py`. This demo does not need a separate database: original files provide storage, and Algolia stores the searchable records.

## Refresh the index

```sh
python3 scripts/prepare_data.py
python3 scripts/index_data.py
```

The uploader uses `ALGOLIA_INDEX_NAME` from `.env`. It upserts records using stable objectIDs and does not clear the index or delete unrelated records. Each batch and the settings update must reach `published` before the script reports success. Limited retries handle transient failures. This is a deliberately small REST implementation; a production application should consider the supported Algolia SDK's host failover and retry handling.

## Credentials

Set `ALGOLIA_APP_ID`, `ALGOLIA_INDEX_NAME=restaurants`, `ALGOLIA_SEARCH_API_KEY`, and `ALGOLIA_WRITE_API_KEY` in `.env`. The Python server exposes only the application ID, index name, and search key through `/config.json`. A search-only key is browser-visible by design; the write key is used only by Python. Use a key with only search permission, ideally restricted to `restaurants`. Do not use an admin key as the search key.

## Explain the search in an interview

1. Python merges the JSON and CSV by objectID. Algolia receives the combined records in batches.
2. Searchable attributes are ordered: name, cuisine, city, neighborhood, state. Algolia's default relevance and typo tolerance remain enabled.
3. Ratings, then review counts, break relevance ties. They do not override a stronger text match. This simple ranking favors high ratings; review-volume weighting is a possible later improvement.
4. JavaScript waits 200 ms after typing, then searches Algolia directly. The full restaurant dataset is not downloaded by the page; submitted addresses are resolved by the local server through the US Census Geocoder.
5. Cuisines combine with OR; price, payment and minimum rating combine with AND. A second query excluding the cuisine selection supplies counts for alternative cuisines, preserving OR filtering.
6. Show more requests the next six results. The default Algolia pagination limit means a broad search can display a maximum of 1,000 hits; narrow the query to explore more specific matches.
7. New input aborts old requests and invalidates stale responses. Loading, empty, retry, and unavailable-photo states are handled explicitly.

The existing package.json is retained. The first-pass app uses plain browser JavaScript and the REST API rather than the old Parcel dependencies, keeping the code easy to walk through.

## Validation and limits

Syntax checks and live API checks cover counts, cuisine/rating/price/payment filters, combined OR/AND filtering, typo tolerance, and pagination. Local server checks confirm that only public search configuration is exposed and private paths return 404. Automated browser visual testing has not been performed. Historical restaurant photo URLs may no longer work; the cards retain a fallback.

References: [Search an index](https://www.algolia.com/doc/rest-api/search/search-single-index), [Batch indexing](https://www.algolia.com/doc/rest-api/search/batch), [Index settings](https://www.algolia.com/doc/rest-api/search/set-settings).

## Explain each API call with the debugger

Expand **API debugger** below the results. The newest 30 application requests stay in memory until you clear the log or reload. Expand a row to see the request JSON, trigger, HTTP status, timing, and whether the result was applied or superseded. The log intentionally omits credentials, request headers, and configuration values. It does not capture image requests, CSS/fonts, or browser CORS preflight requests; use the browser Network tab for those.

| Action | API calls | Why |
| --- | --- | --- |
| Page load | `GET /config.json`, then `POST /1/indexes/restaurants/query` | The local Python server supplies public search configuration; Algolia returns the first six restaurants and cuisine counts. |
| Typing | One search after a 200 ms pause; two if cuisines are selected | Avoid a request for every keystroke. A query interrupted before the delay expires never reaches the API. |
| Select cuisine(s) | Two POST requests to the same `/query` endpoint | One returns matching restaurants. The other uses `hitsPerPage: 0` and omits the cuisine restriction, so counts for other cuisines remain available. |
| Change rating, price, or payment | One POST, or two with selected cuisines | Apply all current filters; reset pagination to page 0. |
| Show more | One POST with the next `page` | Get six more hits without recomputing alternative cuisine counts. Algolia pages are zero-based. |
| Reset | One POST with empty query and no filters | Return to the first page of all restaurants. |
| Retry | Repeat search; fetch configuration first if it failed | Recover from a network or API error. |

**How to read the JSON:** `query` is the entered text; `facetFilters` contains categorical filters; nested cuisine arrays mean OR, while separate entries mean AND. `numericFilters` contains the minimum rating. `facets: ["food_type"]` asks Algolia for cuisine counts. `hitsPerPage` and `page` control pagination.

**How to read timing:** browser round trip is measured from fetch start until the JSON body is read, including network overhead. `processingTimeMS` is Algolia's reported server processing time. They measure different things.

**How to read cancellation:** “Cancelled in browser” means the frontend stopped waiting; it does not prove the server never processed the request. “Superseded” means a newer action replaced this search; its results are not applied. A successful earlier search keeps its historical “Applied to page” label.

**Indexing is a separate Python flow.** Running `scripts/index_data.py` sends ten `POST /1/indexes/restaurants/batch` calls (500 records each), checks `GET /1/indexes/restaurants/task/{taskID}` until each batch is published, then sends `PUT /1/indexes/restaurants/settings` and waits for that task. Those calls use the private write key and do not occur when a visitor searches. They are printed as progress by Python rather than logged in the browser.

Interview wording: “The browser gets search configuration from my local server, then queries Algolia directly. Each response includes restaurant hits and facet counts. When a cuisine is selected, a second query calculates counts without that cuisine constraint so users can add other cuisines. I debounce typing, request the next page for Show more, and ignore responses superseded by newer input.”

The debugger is isolated in `debug.js`. It only receives explicitly selected metadata and search parameters; it never receives API headers or raw response bodies. Run its behavior checks with `node tests/debug.test.cjs`.

## Read the commented code

Start with [the file walkthrough](docs/FILE-WALKTHROUGH.md). The HTML, CSS, JavaScript, Python, test, and blank environment template now contain explanatory comments. For strict JSON, use [the annotated settings copy](docs/algolia-settings.explained.jsonc) and the walkthrough's record/configuration tables; working JSON cannot contain comments.

## Location-aware search

The demo now includes optional device location, manual address lookup, radius filtering, and approximate distances. Read [the location audit and geo-search guide](docs/GEO-SEARCH.md) for the findings, limitations, privacy choices, API parameters, and repeatable tests. No records needed reindexing because they already contained `_geoloc`.

## Payment and reservation cards

Cards display payment brands from payment_options and a Reserve on OpenTable link from reserve_url. Only http/https URLs on opentable.com or www.opentable.com without embedded credentials/custom ports are accepted; HTTP is upgraded to HTTPS. Missing or invalid links are hidden. Links open in a new tab with noopener/noreferrer. These historical URLs do not guarantee current availability. No booking is submitted by the demo. Test the card behavior with `node tests/cards.test.cjs`.

## Compact OpenTable search header

The restaurant search now sits beside “Use your location or enter your address.” City selection is removed. Submitting Find sends the US street address to `POST /api/geocode`; the Python server calls the fixed Census endpoint and returns matches for the visitor to confirm. Only confirmation starts nearby Algolia search. Addresses and their coordinates are hidden from the debugger; no lookup occurs while typing. The Census lookup requires internet access and may not match every address.

Address entry is hidden by default. Click Enter your address to open its popover; close with ×, Escape, or by confirming a matched address. Device-location errors leave the popover closed until explicitly requested.
