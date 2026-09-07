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
