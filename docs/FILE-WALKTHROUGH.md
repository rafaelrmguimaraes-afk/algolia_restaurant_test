# Understanding the project

Read in this order: `index.html` → current overrides near the bottom of `index.css` → `index.js` → `debug.js`. Then read `scripts/prepare_data.py`, `config/algolia-settings.json`, and `scripts/index_data.py` to understand where the search data comes from.

## The two flows

**Preparing the data:** original JSON + CSV → Python join by objectID → generated JSON → batch upload → wait for published tasks → apply search settings.

**Using the page:** HTML loads the JavaScript → GET local public configuration → POST searches directly to Algolia → render hits and cuisine counts. The page does not read the generated JSON or run the indexing scripts.

## Why the JSON files have no inline comments

Standard JSON does not accept `//` or `/* ... */` comments. Adding `_comment` properties to restaurant records could also send unwanted fields into Algolia. The working JSON remains unchanged. `docs/algolia-settings.explained.jsonc` is a commented learning copy; the uploader reads only `config/algolia-settings.json`.

## Restaurant JSON fields

`dataset/restaurants_list.json` is the supplied base list. `dataset/restaurants_info.csv` supplies additional details. `data/restaurants.json` is their generated join. CSV fields take precedence when a field occurs in both sources; missing CSV matches retain the base restaurant. The script normalizes objectIDs to strings, ratings to numbers, review counts to integers, and missing cuisines to “Other”.

| Field | Meaning and current use |
| --- | --- |
| `objectID` | Stable restaurant identifier and join key. Uploading the same ID updates its record. |
| `name` | Card title and first searchable attribute. |
| `food_type` | Cuisine; searchable and filterable, with counts for checkboxes. |
| `stars_count` | Numeric rating; displayed, filtered by minimum, and used for ranking ties. Missing values become null. |
| `reviews_count` | Integer review count; displayed and used as a further ranking tiebreaker. Missing values become null. |
| `city`, `state` | Card location and searchable attributes. |
| `neighborhood` | Card summary and searchable attribute. |
| `price_range` | Text such as `$30 and under`; used by the price dropdown and card summary. |
| `price` | Original numeric price category used to draw dollar signs. This is not the dropdown filter field. |
| `payment_options` | Array of payment methods. A Visa filter matches records whose array contains Visa. |
| `image_url` | Original restaurant photo URL. An unavailable photo falls back to a symbol. |
| `_geoloc.lat`, `_geoloc.lng` | Coordinates retained for a future geographic-search extension; no distance filter is currently sent. |
| `address`, `postal_code`, `area`, `country` | Preserved location information; not used by current controls or included in the configured searchable attributes. |
| `phone`, `phone_number` | Contact fields from the source files; retained, not shown in the current UI. |
| `reserve_url`, `mobile_reserve_url` | Original booking URLs; retained, but no reservation action is currently implemented. |
| `dining_style` | Additional descriptive data, retained for possible later use. |

Generated JSON should normally be recreated with `prepare_data.py`, rather than hand-edited; regeneration overwrites manual changes. Source datasets and duplicate supplied starter files have not been annotated or rewritten.

## Search request versus search response

The JSON sent by `searchParameters()` is a **request**, not a restaurant record:

- `query`: entered search text.
- `facetFilters`: categories; selected cuisines are grouped with OR, other filter entries use AND.
- `numericFilters`: minimum rating, for example `stars_count>=4`.
- `facets`: attributes for which we want counts, currently `food_type`.
- `maxValuesPerFacet`: caps distinct cuisine values returned.
- `page`: zero-based result page.
- `hitsPerPage`: six for cards, zero for the separate cuisine-count request.
- `attributesToHighlight`: an empty list because we render plain text.

Algolia responds with `hits` (current-page records), `nbHits` (total matches), `page`, `nbPages`, `facets.food_type` (cuisine counts), and `processingTimeMS` (server processing time). These response fields are not part of the uploaded restaurant schema.

## Other configuration files

| File | Explanation |
| --- | --- |
| `package.json` | Original npm manifest. `name`/`version` identify the package; `private: true` prevents accidental npm publication, not public GitHub visibility. `dependencies` lists Algolia libraries from the starter. `devDependencies` lists the old Parcel toolchain and types. `scripts.start` runs that original Parcel command. `engines.node` is the original Node constraint. The current UI uses plain fetch and the Python server, so these starter packages are not needed to run it. |
| `.env.example` | Commented blank template. Copy it to `.env` and fill in credentials. Python reads `.env`; browsers do not read it directly. |
| `/config.json` | Dynamic response created by `serve.py`, not a file on disk. Explicitly contains only appId, indexName, and searchApiKey. |
| `.gitignore` | Prevents credentials, generated caches, and duplicate starter bundles from being staged normally. It does not remove files already committed. |

## Python responsibilities

- `prepare_data.py`: local file processing only; no API calls.
- `config.py`: shared path, simple environment-file parser, and certificate verification.
- `index_data.py`: writes to Algolia and polls tasks. Run intentionally when refreshing data/settings.
- `serve.py`: serves approved frontend files and public configuration on localhost. It is a development server.
- `verify_search.py`: real read-only API checks against the local dataset; it does not modify records.

## CSS and tests

The first part of `index.css` is the original assignment stylesheet. Current layout rules are under **First-pass UI**; later rules with equal specificity override earlier ones. The current design uses grid for sidebar/results, flexbox for cards, and a 700px breakpoint for narrow screens. Some old selectors are unused; comments label the retained starter sections.

`tests/debug.test.cjs` runs application logic against a small fake DOM and fake fetch. It checks request construction, stale-response handling, error/cancellation labels, and debugger key omission. It does not replace browser layout testing. Run with `node tests/debug.test.cjs`.

## What to say in the interview

“I separated structure, styling, interaction, and data preparation. Python joins the two datasets and uploads stable IDs to Algolia. The browser builds search parameters from controls and renders Algolia hits. A second query keeps cuisine counts useful when several cuisines can be selected. I handle typing delays, pagination, and stale responses explicitly, and the debugger makes the request flow visible.”
