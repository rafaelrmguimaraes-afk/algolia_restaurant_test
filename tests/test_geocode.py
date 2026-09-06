"""Check address validation and Census response mapping with no network calls."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from geocode import lookup_address

class GeocodeTests(unittest.TestCase):
    def test_validation(self):
        with patch('geocode.urlopen') as request:
            for value in [None, '', '123', 'x' * 101]:
                with self.assertRaises(ValueError): lookup_address(value)
            request.assert_not_called()

    def test_coordinate_mapping(self):
        payload={'result':{'addressMatches':[
            {'matchedAddress':'EXAMPLE', 'coordinates':{'x':-122.4,'y':37.7}},
            {'matchedAddress':'INVALID', 'coordinates':{'x':0,'y':999}}]}}
        with patch('geocode.urlopen', return_value=io.StringIO(json.dumps(payload))):
            result=lookup_address('123 Example St, CA')
        self.assertEqual(result['matches'],[{'label':'EXAMPLE','lat':37.7,'lng':-122.4}])

    def test_no_match(self):
        with patch('geocode.urlopen', return_value=io.StringIO('{"result":{"addressMatches":[]}}')):
            self.assertEqual(lookup_address('123 Example St, CA')['matches'],[])

if __name__ == '__main__': unittest.main()
