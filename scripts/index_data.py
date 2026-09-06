"""Upload prepared records, configure relevance, and wait for published tasks.

Run: python3 scripts/index_data.py
Uses .env's index unless --index is supplied. Upserts by objectID; never clears
an index or deletes unrelated records. Re-running the same dataset is safe.
"""
import argparse
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from config import ROOT, load_env, tls_context

# Small REST client used by Python only. Browser searches use a different, search-only key.
class Algolia:
    def __init__(self, values, index):
        # URL-encode the index name so it is safely treated as one path segment.
        self.base = f"https://{values['ALGOLIA_APP_ID']}.algolia.net/1/indexes/{quote(index, safe='')}"
        self.headers = {'Content-Type': 'application/json',
                        'X-Algolia-Application-Id': values['ALGOLIA_APP_ID'],
                        'X-Algolia-API-Key': values['ALGOLIA_WRITE_API_KEY']}

    # Shared request handling for batch uploads, settings updates, and task-status reads.
    def request(self, method, path, body=None):
        # A Python dictionary becomes JSON bytes. GET requests have no body.
        payload = json.dumps(body).encode() if body is not None else None
        for attempt in range(3):
            try:
                request = Request(self.base + path, data=payload, method=method, headers=self.headers)
                with urlopen(request, context=tls_context(), timeout=30) as response:
                    return json.load(response)
            # Retry only rate-limit/transient server failures, not invalid keys or bad requests.
            except HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError(f'Algolia returned HTTP {error.code}; check key permissions and index configuration.') from None
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError('Unable to reach Algolia after three attempts.') from None
            # Wait 1 second, then 2 seconds, before retrying; never loop indefinitely.
            time.sleep(2 ** attempt)

    # Writes are asynchronous: a taskID means accepted, not ready for searching yet.
    # Poll once per second until published, with a roughly two-minute polling window.
    def wait(self, task_id):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if self.request('GET', f'/task/{task_id}')['status'] == 'published':
                return
            time.sleep(1)
        raise RuntimeError(f'Task {task_id} is still pending. Check it before re-running.')

def main():
    # Optional command-line overrides make the same script usable for another index or input file.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', help='Override the index named in .env')
    parser.add_argument('--env', help='Optional path to .env')
    parser.add_argument('--data', default=str(ROOT / 'data/restaurants.json'))
    args = parser.parse_args()
    values = load_env(args.env)
    index = args.index or values.get('ALGOLIA_INDEX_NAME')
    if not index or not all(values.get(k) for k in ('ALGOLIA_APP_ID', 'ALGOLIA_WRITE_API_KEY')):
        raise RuntimeError('Fill in the application ID, index name, and write key in .env.')
    records = json.loads(open(args.data, encoding='utf-8').read())
    # Duplicate objectIDs would overwrite each other, so reject them before uploading.
    if not records or len({r['objectID'] for r in records}) != len(records):
        raise RuntimeError('Expected nonempty records with unique objectIDs.')
    api = Algolia(values, index)
    # Batches use stable objectIDs, so retries replace the same records.
    for start in range(0, len(records), 500):
        batch = records[start:start + 500]
        task = api.request('POST', '/batch', {'requests': [{'action': 'addObject', 'body': r} for r in batch]})
        api.wait(task['taskID'])
        print(f'Published {min(start + 500, len(records))}/{len(records)} records.', flush=True)
    # Keep search configuration in a separate JSON file so relevance choices are easy to inspect.
    # PUT applies those settings; wait for its task just as we waited for data writes.
    settings = json.loads((ROOT / 'config/algolia-settings.json').read_text())
    api.wait(api.request('PUT', '/settings', settings)['taskID'])
    print(f'Finished: {index} records and search settings are published.', flush=True)

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError) as error:
        raise SystemExit(str(error)) from None
