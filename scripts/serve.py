"""Serve the UI and public search configuration. Never serve .env or write keys."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from config import ROOT, load_env

# Extend the standard-library file server with one dynamic configuration endpoint.
class PublicFiles(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        # This JSON is generated on request, not read from a config.json file.
        # Reading .env each time means saved credential changes apply on the next page reload.
        if path == '/config.json':
            try:
                values = load_env()
                # Explicit allowlist: the browser only receives the search key.
                public = {'appId': values['ALGOLIA_APP_ID'],
                          'indexName': values['ALGOLIA_INDEX_NAME'],
                          'searchApiKey': values['ALGOLIA_SEARCH_API_KEY']}
                if not all(public.values()):
                    raise ValueError('Missing search configuration')
                body = json.dumps(public).encode()
            except (KeyError, ValueError, OSError):
                self.send_error(503, 'Fill in the local search configuration')
                return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            # Do not cache credentials/configuration in the browser response cache.
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # Serve only these exact files. A generic folder server would also expose .env and source data.
        allowed = {'/', '/index.html', '/index.css', '/index.js', '/debug.js', '/assets/favicon.ico',
                   '/assets/images/background.png', '/assets/images/background_@2X.png'}
        if path not in allowed:
            self.send_error(404)
            return
        # Delegate actual public-file reading and MIME types to the standard-library server.
        super().do_GET()

    # This minimal preview implements GET only; HEAD is intentionally rejected.
    def do_HEAD(self):
        self.send_error(405)

if __name__ == '__main__':
    # Bind to localhost only. This is a development preview, not a production hosting setup.
    # Each request gets a handler rooted in the project folder; threads allow concurrent file requests.
    server = ThreadingHTTPServer(('127.0.0.1', 8000), partial(PublicFiles, directory=str(ROOT)))
    print('Restaurant Finder: http://127.0.0.1:8000', flush=True)
    server.serve_forever()
