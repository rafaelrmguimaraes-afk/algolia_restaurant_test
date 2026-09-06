import sys, pathlib, unittest
from unittest.mock import patch
from io import StringIO
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import geocode
class LookupTests(unittest.TestCase):
    def setUp(self):
        geocode._cache.clear()
    def test_city_and_cache(self):
        with patch.object(geocode,'urlopen',return_value=StringIO('[{"lat":"42.37","lon":"-71.23","display_name":"Waltham, Massachusetts"}]')) as request:
            result=geocode.lookup_address('Waltham, MA')
            self.assertEqual(result['matches'][0]['lat'],42.37)
            self.assertEqual(geocode.lookup_address('Waltham, MA'),result)
            self.assertEqual(request.call_count,1)
    def test_no_match(self):
        with patch.object(geocode,'urlopen',return_value=StringIO('[]')):
            self.assertEqual(geocode.lookup_address('00000')['matches'],[])
    def test_invalid(self):
        with self.assertRaises(ValueError):geocode.lookup_address('')
if __name__=='__main__':unittest.main()
