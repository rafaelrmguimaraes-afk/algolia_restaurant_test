"""User-triggered location lookup. One shared request at a time; no autocomplete.
Endpoint is configurable so the provider can be switched without code changes.
The bounded in-memory cache expires after an hour and is never written to disk.
"""
import json
import math
import os
import time
import threading
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from config import tls_context

_lock = threading.Lock()
_last_request = 0.0
_cache = {}

def lookup_address(address):
    global _last_request
    if not isinstance(address, str) or not 2 <= len(address.strip()) <= 100:
        raise ValueError('Enter a city, ZIP code, street, or combination (2–100 characters).')
    query = address.strip()
    with _lock:
        now = time.monotonic()
        for key in list(_cache):
            if now - _cache[key][0] > 3600:
                del _cache[key]
        if query.casefold() in _cache:
            return _cache[query.casefold()][1]
        # This local demo runs one server process; all its visitors share this limit.
        time.sleep(max(0, 1.1 - (now - _last_request)))
        endpoint = os.environ.get('GEOCODER_URL', 'https://nominatim.openstreetmap.org/search')
        params = urlencode({'q':query, 'format':'jsonv2', 'countrycodes':'us', 'limit':5})
        request = Request(endpoint + '?' + params, headers={
            'User-Agent':'OpenTableAssignmentDemo/1.0 (https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test)',
            'Accept':'application/json'})
        _last_request = time.monotonic()
        with urlopen(request, context=tls_context(), timeout=15) as response:
            data = json.load(response)
        matches = []
        for place in data[:5]:
            try:
                lat, lng = float(place['lat']), float(place['lon'])
            except (KeyError, TypeError, ValueError):
                continue
            if math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180:
                matches.append({'label':str(place.get('display_name', query)), 'lat':lat, 'lng':lng})
        result = {'matches':matches, 'source':'OpenStreetMap Nominatim'}
        if len(_cache) >= 100:
            del _cache[next(iter(_cache))]
        _cache[query.casefold()] = (time.monotonic(), result)
        return result
