"""Small fixtures verify that the audit flags bad inputs without inventing positions."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from audit_locations import audit, valid_geo

class AuditTests(unittest.TestCase):
    def test_invalid_coordinates(self):
        for geo in [None, {}, {'lat': True, 'lng': 1}, {'lat': 91, 'lng': 0},
                    {'lat': 0, 'lng': 181}, {'lat': float('nan'), 'lng': 1},
                    {'lat': '40', 'lng': -70}, {'lat': 0, 'lng': 0}]:
            self.assertFalse(valid_geo(geo))
        self.assertTrue(valid_geo({'lat': 21.3, 'lng': -157.8}))

    def test_ambiguous_city_and_preservation(self):
        records = [{'objectID':str(i), 'city':'Same Name', 'state':'HI', 'country':'US',
                    'postal_code':postal, '_geoloc':{'lat':lat,'lng':lng}}
                   for i,(lat,lng,postal) in enumerate([(21.3,-157.8,'A'),(21.31,-157.81,'A'),(19.6,-155.9,'B')])]
        import copy
        original = copy.deepcopy(records)
        report, centers = audit(records)
        self.assertEqual(records, original)
        self.assertEqual(report['valid_coordinate_ranges'], 3)
        self.assertEqual(len(report['issues']), 1)
        self.assertEqual(len(centers), 2)
        self.assertTrue(all('ZIP' in row['label'] for row in centers))

if __name__ == '__main__':
    unittest.main()
