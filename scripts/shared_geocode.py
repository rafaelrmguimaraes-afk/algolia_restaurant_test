"""Shared Redis cache and lock for all preview/production geocoding instances.
Fail closed if Redis is unavailable. Never fall back to uncoordinated requests.
"""
import hashlib
import json
import os
import uuid
from urllib.request import Request, urlopen
from config import tls_context
from geocode import lookup_address
class Busy(Exception): pass

def redis(*command):
    endpoint = os.environ.get('UPSTASH_REDIS_REST_URL','')
    token = os.environ.get('UPSTASH_REDIS_REST_TOKEN','')
    if not endpoint.startswith('https://') or not token:
        raise RuntimeError('Shared location service not configured')
    request = Request(endpoint, data=json.dumps(command).encode(), headers={
        'Authorization':'Bearer '+token, 'Content-Type':'application/json'})
    with urlopen(request, context=tls_context(), timeout=5) as response:
        data = json.load(response)
    if data.get('error'): raise RuntimeError('Shared location store unavailable')
    return data.get('result')

def lookup_shared(query):
    if not isinstance(query,str) or not 2 <= len(query.strip()) <= 100:
        raise ValueError('Enter a city, ZIP, or street.')
    cache_key = 'restaurant-geo:v1:' + hashlib.sha256(query.strip().casefold().encode()).hexdigest()
    cached = redis('GET', cache_key)
    if cached: return json.loads(cached)
    lock = 'restaurant-geo:global-lock'
    owner = str(uuid.uuid4())
    # Longer than the function's maximum duration. Hold through the upstream call,
    # then add a cooldown; shared across environments using the same Redis store.
    if redis('SET', lock, owner, 'NX', 'EX', 60) != 'OK': raise Busy()
    try:
        result = lookup_address(query)
        redis('SET', cache_key, json.dumps(result), 'EX', 3600)
        return result
    finally:
        redis('EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],1100) else return 0 end", 1, lock, owner)
