"""Audit supplied coordinates and generate approximate manual-search centers.

No geocoder, phone lookup, credential, or external API is used. A valid numeric
range is not proof of address accuracy. Possible city outliers remain unchanged.
"""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]

def valid_geo(geo):
    """Reject missing, nonnumeric, infinite, out-of-range, and zero-island points."""
    if not isinstance(geo, dict):
        return False
    lat, lng = geo.get('lat'), geo.get('lng')
    return (type(lat) in (int, float) and type(lng) in (int, float)
            and math.isfinite(lat) and math.isfinite(lng)
            and -90 <= lat <= 90 and -180 <= lng <= 180 and (lat, lng) != (0, 0))

def distance_km(a, b):
    """Haversine distance on a sphere; sufficient for a coarse outlier screen."""
    lat1, lng1, lat2, lng2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2
    return 12742 * math.asin(min(1, math.sqrt(h)))

def center(records):
    # Coordinate medians resist isolated outliers. This is not an official city center.
    return {axis: round(median(r['_geoloc'][axis] for r in records), 5) for axis in ('lat', 'lng')}

def audit(records):
    issues, groups = [], defaultdict(list)
    for record in records:
        if not valid_geo(record.get('_geoloc')):
            issues.append({'objectID': record.get('objectID'), 'issue': 'invalid_or_missing_coordinates'})
            continue
        if not all(record.get(k) for k in ('city', 'state', 'country')):
            issues.append({'objectID': record.get('objectID'), 'issue': 'missing_city_state_country'})
            continue
        groups[(record['city'], record['state'], record['country'])].append(record)
    locations = []
    for (city, state, country), members in sorted(groups.items()):
        midpoint = center(members)
        # A broad, heuristic screen, not a geographic boundary check or automatic correction.
        ambiguous = len(members) >= 3 and any(distance_km(r['_geoloc'], midpoint) > 50 for r in members)
        parts = defaultdict(list)
        if ambiguous:
            for record in members:
                if distance_km(record['_geoloc'], midpoint) > 50:
                    issues.append({'objectID': record['objectID'], 'issue': 'city_group_outlier_review',
                                   'city': city, 'state': state,
                                   'distance_from_group_median_km': round(distance_km(record['_geoloc'], midpoint), 1)})
                # Same-name places can be far apart. Use ZIP labels instead of implying one center.
                parts[str(record.get('postal_code') or 'unknown ZIP')].append(record)
        else:
            parts[''] = members
        for postal, subset in sorted(parts.items()):
            locations.append({'label': f'{city}, {state}, {country}' + (f' · ZIP {postal}' if postal else ''),
                              **center(subset), 'restaurantCount': len(subset),
                              'source': 'median_of_supplied_restaurant_coordinates',
                              'precision': 'approximate_search_center'})
    fields = ('address', 'city', 'state', 'country', 'postal_code', 'neighborhood', 'phone', 'phone_number')
    report = {'records': len(records), 'countries': dict(sorted(Counter(r.get('country', 'missing') for r in records).items())),
              'valid_coordinate_ranges': sum(valid_geo(r.get('_geoloc')) for r in records),
              'missing_fields': {k: sum(not r.get(k) for r in records) for k in fields},
              'duplicate_object_ids': len(records) - len({r.get('objectID') for r in records}),
              'manual_search_centers': len(locations), 'issues': issues,
              'limitations': ['Range checks do not validate coordinates against a street address or country boundary.',
                             'City outliers are review flags; original coordinates are not corrected or enriched.',
                             'Phone and neighborhood completeness is checked; neither is used to infer coordinates.',
                             'Manual centers are dataset medians, not authoritative geocoded city centers.']}
    return report, sorted(locations, key=lambda location: location['label'].casefold())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', default=str(ROOT / 'data/restaurants.json'))
    args = parser.parse_args()
    report, locations = audit(json.loads(Path(args.data).read_text(encoding='utf-8')))
    for relative, value in [('data/location-audit.json', report), ('data/locations.json', locations)]:
        target = ROOT / relative
        target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Audited {report['records']} records: {report['valid_coordinate_ranges']} valid coordinate ranges; {len(report['issues'])} review flags; {len(locations)} manual centers.")

if __name__ == '__main__':
    main()
