"""Runtime configuration: the write key must never be sent to visitors."""
import json
import os
from http.server import BaseHTTPRequestHandler
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        public = {key:os.environ.get(env,'') for key,env in {
            'appId':'ALGOLIA_APP_ID','indexName':'ALGOLIA_INDEX_NAME',
            'searchApiKey':'ALGOLIA_SEARCH_API_KEY'}.items()}
        code = 200 if all(public.values()) else 503
        body = json.dumps(public if code == 200 else {'error':'Search configuration unavailable'}).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)
