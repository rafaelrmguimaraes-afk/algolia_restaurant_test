/* An in-memory teaching aid. Never pass headers, credentials, or raw responses here. */
// This immediately invoked function keeps log entries private and exposes only three logging methods.
window.apiDebug = (() => {
  const list = document.querySelector('#api-log');
  const status = document.querySelector('#api-log-status');
  // Memory only: nothing is saved in localStorage, uploaded, or written to disk.
  const entries = [];
  let nextId = 0;

  // Rebuild the small teaching panel using textContent so request text is never interpreted as HTML.
  function render() {
    list.replaceChildren();
    status.textContent = entries.length ? `${entries.length} request${entries.length === 1 ? '' : 's'} · newest first` : 'No requests recorded';
    [...entries].reverse().forEach(entry => {
      const item = document.createElement('details');
      item.className = 'api-entry';
      const summary = document.createElement('summary');
      summary.textContent = `#${entry.id} · ${entry.time} · ${entry.trigger} → ${entry.purpose} · ${entry.status}`;
      const info = document.createElement('p');
      info.textContent = `${entry.method} ${entry.endpoint}`;
      const timing = document.createElement('p');
      timing.textContent = entry.elapsed === undefined ? 'Request in progress…' : `Browser round trip: ${entry.elapsed} ms${entry.processing === undefined ? '' : ` · Algolia processing: ${entry.processing} ms`}`;
      const outcome = document.createElement('p');
      outcome.textContent = `${entry.outcome}${entry.hits === undefined ? '' : ` · ${entry.hits} matches, ${entry.returned} cards returned`}`;
      const payload = document.createElement('pre');
      payload.textContent = entry.parameters ? JSON.stringify(entry.parameters, null, 2) : 'No request body. Configuration values are omitted from this log.';
      item.append(summary, info, timing, outcome, payload);
      // Preserve expanded rows across request updates.
      item.open = entry.open || false;
      item.addEventListener('toggle', () => { entry.open = item.open; });
      list.append(item);
    });
  }

  // Record a request before fetch starts. Copy parameters so later state changes cannot alter history.
  function start({ group, trigger, purpose, method, endpoint, parameters }) {
    const entry = { id: ++nextId, group, trigger, purpose, method, endpoint,
      parameters: parameters ? JSON.parse(JSON.stringify(parameters)) : null,
      time: new Date().toLocaleTimeString(), started: performance.now(),
      status: 'Pending', outcome: 'Waiting for response' };
    entries.push(entry);
    // Bound memory and panel size; the oldest request is dropped when the limit is reached.
    if (entries.length > 30) entries.shift();
    render();
    return entry;
  }

  // Browser elapsed time includes network travel and reading JSON. Algolia processing time
  // is a separate server-reported value, so the two numbers are not expected to match.
  function finish(entry, { status: result, processing, hits, returned }) {
    entry.status = result;
    entry.elapsed = Math.round(performance.now() - entry.started);
    entry.processing = processing; entry.hits = hits; entry.returned = returned;
    if (entry.outcome === 'Waiting for response') entry.outcome = 'Response received';
    render();
  }

  // Mark whether an action affected the results. Preserve previously applied searches in history;
  // only unfinished or not-yet-applied responses become superseded.
  function markGroup(group, outcome) {
    entries.filter(entry => entry.group === group && (!outcome.startsWith('Superseded') || ['Waiting for response', 'Response received'].includes(entry.outcome))).forEach(entry => { entry.outcome = outcome; });
    render();
  }
  // Clear history without changing the search, cancelling requests, or making an API call.
  document.querySelector('#clear-api-log').addEventListener('click', () => { entries.length = 0; render(); });
  return { start, finish, markGroup };
})();
