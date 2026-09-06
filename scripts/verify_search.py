"""Read-only checks comparing live filters with the prepared dataset."""
import argparse
import json
from urllib.request import Request, urlopen
from urllib.parse import quote
from config import ROOT, load_env, tls_context

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env')
    parser.add_argument('--data', default=str(ROOT / 'data/restaurants.json'))
    parser.add_argument('--index')
    args = parser.parse_args()
    env = load_env(args.env)
    index = args.index or env['ALGOLIA_INDEX_NAME']
    def search(**params):
        request = Request(f"https://{env['ALGOLIA_APP_ID']}.algolia.net/1/indexes/{quote(index, safe='')}/query",
                          data=json.dumps({'hitsPerPage': 6, **params}).encode(), headers={
                          'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:8000',
                          'X-Algolia-Application-Id': env['ALGOLIA_APP_ID'],
                          'X-Algolia-API-Key': env['ALGOLIA_SEARCH_API_KEY']})
        with urlopen(request, context=tls_context(), timeout=20) as response:
            assert response.headers.get('Access-Control-Allow-Origin') in ('*', 'http://127.0.0.1:8000')
            return json.load(response)
    records = json.loads(open(args.data, encoding='utf-8').read())
    all_results = search(query='', facets=['food_type'], maxValuesPerFacet=200)
    assert all_results['nbHits'] == len(records) == 5000
    assert all_results['facets']['food_type']['Italian'] == sum(r['food_type'] == 'Italian' for r in records)
    cases = [
        ({'facetFilters': ['food_type:Italian']}, lambda r: r['food_type'] == 'Italian'),
        ({'numericFilters': ['stars_count>=4.5']}, lambda r: (r.get('stars_count') or 0) >= 4.5),
        ({'facetFilters': ['price_range:$30 and under']}, lambda r: r.get('price_range') == '$30 and under'),
        ({'facetFilters': ['payment_options:Visa']}, lambda r: 'Visa' in r.get('payment_options', [])),
        ({'facetFilters': [['food_type:Italian', 'food_type:Seafood'], 'payment_options:Visa', 'price_range:$30 and under'], 'numericFilters': ['stars_count>=4']},
         lambda r: r['food_type'] in ('Italian', 'Seafood') and 'Visa' in r.get('payment_options', []) and r.get('price_range') == '$30 and under' and (r.get('stars_count') or 0) >= 4)
    ]
    for params, predicate in cases:
        result = search(**params)
        assert result['nbHits'] == sum(predicate(r) for r in records), params
        assert all(predicate(r) for r in result['hits']), params
    first = {r['objectID'] for r in all_results['hits']}
    second = {r['objectID'] for r in search(page=1)['hits']}
    assert len(first) == len(second) == 6 and first.isdisjoint(second)
    assert search(query='zzzzzzzzzzzzzzzzzzzzzzzz')['nbHits'] == 0
    assert search(query='italain')['nbHits'] > 0
    print('PASS: 5,000 records, facets, cuisine/rating/price/payment filters, OR+AND combination, pagination, empty search, typo tolerance, browser CORS.')

if __name__ == '__main__':
    main()
