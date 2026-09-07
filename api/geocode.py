"""Vercel POST endpoint; request bodies and provider exceptions aren't logged."""
import sys
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from shared_geocode import lookup_shared, Busy, NotConfigured
class handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 2048: raise ValueError()
            body = json.loads(self.rfile.read(length))
            if not isinstance(body,dict): raise ValueError()
            result, code = lookup_shared(body.get('address')), 200
        except (ValueError, UnicodeError): result, code = {'error':'Enter a city, ZIP, or street.'}, 400
        except NotConfigured: result, code = {'error':'Address search is not configured yet. Please use your device location.', 'code':'location_not_configured'}, 503
        except Busy: result, code = {'error':'Location search is busy. Please try again shortly.'}, 429
        except Exception: result, code = {'error':'Location lookup is unavailable. Use device location or try again later.'}, 503
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        if code == 429: self.send_header('Retry-After','2')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
