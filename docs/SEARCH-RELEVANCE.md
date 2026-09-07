# Search relevance evidence

## Direct Algolia checks — September 7, 2026

These requests used the live index with Rules enabled and no manual filters. No browser sentence interpreter was involved.

| Query | Matches | Records inspected | Finding |
| --- | --- | --- | --- |
| Italian | 874 | 100 | Baseline text search |
| affordable | 3125 | 100 | All inspected records in `$30 and under` |
| affordable Italian | 585 | 100 | All inspected records in `$30 and under` |

The affordable Rule initially put the price filter in its condition. It therefore required an existing price selection before triggering. Moving the filter to the consequence enabled the intended query behavior. The Rule also removes affordable from the text query.

The active Rule is exported in `config/price-rules.json`. Grouped Rules files are proposals, not evidence that all aliases are active. The earlier ten-Rule upload exceeded the account quota.

## User-reported checks

- `Chaimmbers Walk Caf` found Chambers Walk Cafe & Catering; position not recorded.
- Device location worked in Chrome; the in-app browser timed out.
- ZIP 33101 and Waltham, MA location lookup worked.

## Remaining validation

Record expected and actual positions for exact, partial, concatenated and misspelled restaurant names. Retest combinations with known sidebar selections. Complete desktop/mobile pagination and location checks. Automated mocked tests cover implementation behavior, not a complete live relevance benchmark.

## Dining-style search — September 7, 2026

Added `unordered(dining_style)` to the end of the live searchable attribute list, preserving existing priorities. Eight one-way synonyms are in `config/dining-style-synonyms.json`; apply them with `python3 scripts/configure_dining_search.py --index restaurants`. No restaurant records were changed and no UI filter was added.

| Query | Direct Algolia matches | Finding |
| --- | ---: | --- |
| relaxed dining | 2203 | First 100: Casual Dining |
| smart casual dining | 2130 | First 100: Casual Elegant |
| upscale dining | 641 | First 100: Fine Dining |
| homestyle | 28 | 26 Home Style; 2 other styles matched searchable text |
| upscale dining Italian | 100 | First 100: Fine Dining |

Live browser test: `upscale dining Italian` returned 97 restaurants, with The Cellar Restaurant first. The browser converts Italian to an exact food_type refinement, explaining the difference from the direct text-only query. Synonyms expand text matching across searchable attributes; they do not guarantee a strict dining_style category. For example, Fine Dining returned 698 total because other searchable fields can also match. Restaurant name remains the highest-priority searchable attribute.

## Whole-state location search — September 7, 2026

All 50 USPS state codes and DC are recognized case-insensitively in the location field. A standalone code bypasses geocoding and applies an Algolia state facet filter, with no radius or distance labels. City/ZIP/street inputs continue using nearby search. Full names remain geocoder inputs and can be ambiguous (New York city versus state); use NY for statewide results.

Browser checks with live Algolia: NY returned 1,086 records and FL returned 238; all returned records on the inspected first pages had the requested state. FL combined with `cheap Italian accepting Visa` returned 29. Clear location restored all-location mode. Unit checks cover all 51 codes, lowercase/whitespace, no geocoder call and reset.
