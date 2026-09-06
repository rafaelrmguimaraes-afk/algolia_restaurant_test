# Restaurant Finder — Algolia demo

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
4. JavaScript waits 200 ms after typing, then searches Algolia directly. No local dataset is downloaded by the page.
5. Cuisines combine with OR; price, payment and minimum rating combine with AND. A second query excluding the cuisine selection supplies counts for alternative cuisines, preserving OR filtering.
6. Show more requests the next six results. The default Algolia pagination limit means a broad search can display a maximum of 1,000 hits; narrow the query to explore more specific matches.
7. New input aborts old requests and invalidates stale responses. Loading, empty, retry, and unavailable-photo states are handled explicitly.

The existing package.json is retained. The first-pass app uses plain browser JavaScript and the REST API rather than the old Parcel dependencies, keeping the code easy to walk through.

## Validation and limits

Syntax checks and live API checks cover counts, cuisine/rating/price/payment filters, combined OR/AND filtering, typo tolerance, and pagination. Local server checks confirm that only public search configuration is exposed and private paths return 404. Automated browser visual testing has not been performed. Historical restaurant photo URLs may no longer work; the cards retain a fallback.

References: [Search an index](https://www.algolia.com/doc/rest-api/search/search-single-index), [Batch indexing](https://www.algolia.com/doc/rest-api/search/batch), [Index settings](https://www.algolia.com/doc/rest-api/search/set-settings).
