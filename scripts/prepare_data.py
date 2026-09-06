"""Join the supplied JSON and CSV by objectID. No dependencies or credentials needed."""
import csv
import json
from pathlib import Path

# Resolve paths relative to this script, so the command works from any current folder.
ROOT = Path(__file__).resolve().parents[1]

def main():
    # The JSON is the base list: names, locations, photo URLs, payment options, and IDs.
    with (ROOT / 'dataset/restaurants_list.json').open(encoding='utf-8') as source:
        restaurants = json.load(source)
    # The CSV adds cuisine, ratings, and other details. It uses semicolons, not commas.
    # utf-8-sig also handles an optional byte-order mark at the start of the CSV.
    with (ROOT / 'dataset/restaurants_info.csv').open(encoding='utf-8-sig', newline='') as source:
        # Build a dictionary keyed by objectID for quick lookups instead of scanning the CSV per restaurant.
        details = {row['objectID']: row for row in csv.DictReader(source, delimiter=';')}
    records = []
    for restaurant in restaurants:
        # This is a left join: keep every JSON restaurant, even if it has no CSV match.
        # CSV fields come second and therefore take precedence when both files define a field.
        record = {**restaurant, **details.get(str(restaurant['objectID']), {})}
        # CSV IDs are strings; normalize JSON IDs to the same type for stable Algolia updates.
        record['objectID'] = str(record['objectID'])
        record['food_type'] = record.get('food_type') or 'Other'
        # CSV cells are text. Numeric types are needed for rating comparisons and ranking.
        # Missing values become JSON null, rather than an invented zero-star rating.
        for field in ('stars_count', 'reviews_count'):
            value = record.get(field)
            record[field] = (float(value) if field == 'stars_count' else int(value)) if value else None
        records.append(record)
    # Write a separate generated file; do not modify the supplied datasets.
    # Re-running this script replaces the generated output, not the Algolia index.
    output = ROOT / 'data/restaurants.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Prepared {len(records)} restaurants in {output}')

# Run only when called as a script, not when imported by another Python file.
if __name__ == '__main__':
    main()
