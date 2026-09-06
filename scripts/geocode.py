"""Resolve an explicitly submitted US address with the Census geocoder.

The server uses a fixed HTTPS endpoint, never a URL supplied by the browser.
No API key is required. Addresses are not logged or persisted by this module.
"""
import json
import math
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from config import tls_context

def lookup_address(address):
    if not isinstance(address, str) or not 6 <= len(address.strip()) <= 100:
        raise ValueError('Enter a complete US street address, up to 100 characters.')
    params = urlencode({'address':address.strip(), 'benchmark':'Public_AR_Current', 'format':'json'})
    request = Request('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' + params,
                      headers={'User-Agent':'OpenTableAssignmentDemo/1.0', 'Accept':'application/json'})
    with urlopen(request, context=tls_context(), timeout=15) as response:
        data = json.load(response)
    matches = []
    for match in data.get('result', {}).get('addressMatches', [])[:5]:
        point = match.get('coordinates', {})
        lat, lng = point.get('y'), point.get('x')
        if (type(lat) in (int,float) and type(lng) in (int,float)
            and math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
            matches.append({'label':str(match.get('matchedAddress', address)), 'lat':lat, 'lng':lng})
    return {'matches':matches, 'source':'US Census Geocoder'}
