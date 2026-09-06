"""Read-only geo checks using public dataset centers, never device coordinates."""
import argparse
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from config import ROOT, load_env, tls_context

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env')
    parser.add_argument('--locations', default=str(ROOT / 'data/locations.json'))
    args = parser.parse_args()
    env = load_env(args.env)
    locations = json.loads(Path(args.locations).read_text())
    def search(params):
        request = Request(f"https://{env['ALGOLIA_APP_ID']}.algolia.net/1/indexes/{quote(env['ALGOLIA_INDEX_NAME'], safe='')}/query",
                          data=json.dumps(params).encode(), headers={'Content-Type':'application/json',
                          'X-Algolia-Application-Id':env['ALGOLIA_APP_ID'],
                          'X-Algolia-API-Key':env['ALGOLIA_SEARCH_API_KEY']})
        with urlopen(request, context=tls_context(), timeout=20) as response:
            return json.load(response)
    for label in ['San Francisco, CA, US', 'Denver, CO, US']:
        city = next(row for row in locations if row['label'] == label)
        base = {'query':'', 'aroundLatLng':f"{city['lat']},{city['lng']}", 'aroundRadius':40234,
                'aroundPrecision':1000, 'getRankingInfo':True, 'hitsPerPage':50, 'facets':['food_type']}
        result = search(base)
        assert result['nbHits'] > 0 and result.get('facets', {}).get('food_type')
        assert all(hit['_rankingInfo']['matchedGeoLocation']['distance'] <= 40234 for hit in result['hits'])
        buckets = [hit['_rankingInfo']['geoDistance'] for hit in result['hits']]
        assert buckets == sorted(buckets), 'Empty-query results should follow geo ranking bands'
        nearby = search({**base, 'aroundRadius':8047})
        assert 0 < nearby['nbHits'] <= result['nbHits']
        filtered = search({**base, 'facetFilters':[['food_type:Italian','food_type:Seafood']], 'numericFilters':['stars_count>=4']})
        assert filtered['nbHits'] > 0
        assert all(hit['food_type'] in ('Italian','Seafood') and hit['stars_count'] >= 4 for hit in filtered['hits'])
        assert all(hit['_rankingInfo']['matchedGeoLocation']['distance'] <= 40234 for hit in filtered['hits'])
        assert search({**base, 'hitsPerPage':0})['nbHits'] == result['nbHits']
        first = search({**base, 'hitsPerPage':6, 'page':0})
        second = search({**base, 'hitsPerPage':6, 'page':1})
        assert set(hit['objectID'] for hit in first['hits']).isdisjoint(hit['objectID'] for hit in second['hits'])
        print(f"PASS: {label}: {result['nbHits']} within 25 mi, {nearby['nbHits']} within 5 mi; geo ranking, filters, facets and pagination.")
    assert search({'query':'', 'aroundLatLng':'0,0','aroundRadius':8047})['nbHits'] == 0
    assert search({'query':'','hitsPerPage':0})['nbHits'] == 5000
    assert search({**base,'aroundRadius':'all','hitsPerPage':0})['nbHits'] == 5000
    print('PASS: empty remote area, all-distance mode, and unrestricted fallback.')

if __name__ == '__main__':
    main()
