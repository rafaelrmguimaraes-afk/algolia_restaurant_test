"""Add dining-style text search and synonyms without replacing other settings.
Run: python3 scripts/configure_dining_search.py --index restaurants
No records are changed. Existing unrelated synonyms are preserved.
"""
import argparse
import json
from config import ROOT, load_env
from index_data import Algolia

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', required=True)
    args = parser.parse_args()
    api = Algolia(load_env(), args.index)
    settings = api.request('GET', '/settings')
    attributes = settings.get('searchableAttributes', [])
    # Empty means all fields are already searchable: preserve that behavior.
    if attributes and not any('dining_style' == x or x == 'unordered(dining_style)' for x in attributes):
        attributes.append('unordered(dining_style)')
        api.wait(api.request('PUT', '/settings', {'searchableAttributes': attributes})['taskID'])
    synonyms = json.loads((ROOT / 'config/dining-style-synonyms.json').read_text())
    api.wait(api.request('POST', '/synonyms/batch?replaceExistingSynonyms=false', synonyms)['taskID'])
    print('Published dining-style search and', len(synonyms), 'synonyms to', args.index)

if __name__ == '__main__':
    main()
