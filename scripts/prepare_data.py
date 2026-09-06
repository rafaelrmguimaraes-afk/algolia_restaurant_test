"""Join the supplied JSON and CSV by objectID. No dependencies or credentials needed."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    with (ROOT / 'dataset/restaurants_list.json').open(encoding='utf-8') as source:
        restaurants = json.load(source)
    with (ROOT / 'dataset/restaurants_info.csv').open(encoding='utf-8-sig', newline='') as source:
        details = {row['objectID']: row for row in csv.DictReader(source, delimiter=';')}
    records = []
    for restaurant in restaurants:
        record = {**restaurant, **details.get(str(restaurant['objectID']), {})}
        record['objectID'] = str(record['objectID'])
        record['food_type'] = record.get('food_type') or 'Other'
        for field in ('stars_count', 'reviews_count'):
            value = record.get(field)
            record[field] = (float(value) if field == 'stars_count' else int(value)) if value else None
        records.append(record)
    output = ROOT / 'data/restaurants.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Prepared {len(records)} restaurants in {output}')

if __name__ == '__main__':
    main()
