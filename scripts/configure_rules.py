"""Publish only this demo's price Rules; preserve all unrelated Rules and records."""
import json
from config import ROOT, load_env
from index_data import Algolia

def main():
    values = load_env()
    api = Algolia(values, values['ALGOLIA_INDEX_NAME'])
    rules = json.loads((ROOT/'config/price-rules.json').read_text())
    for rule in rules:
        task = api.request('PUT', '/rules/' + rule['objectID'], rule)
        api.wait(task['taskID'])
    print(f'Published {len(rules)} price Rules.')
if __name__ == '__main__': main()
