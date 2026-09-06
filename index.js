/* Flow: UI controls → Algolia query → render hits and facet counts.
   The Python server supplies only public search configuration, never a write key. */
// State remembers the current search, loaded pages, and a request number used to reject old responses.
// cuisines is a Set so the same cuisine cannot be selected twice.
const state = { config: null, cuisines: new Set(), hits: [], page: 0, pages: 0, request: 0 };
// Cache the HTML controls once. The $ helper is just document.querySelector, not jQuery.
const $ = selector => document.querySelector(selector);
const searchInput = $('#search-input');
const ratingInput = $('#rating');
const priceInput = $('#price');
const paymentInput = $('#payment');
const count = $('#results-count');
const more = $('#show-more');
// debounce holds the typing timer; activeRequest lets a newer search cancel the previous fetch.
let debounce;
let activeRequest;

// Convert the current controls into Algolia request JSON. Page 0 is the first page.
// includeCuisine=false is used only for the extra query that counts alternative cuisines.
function searchParameters(page, includeCuisine = true) {
  const facetFilters = [];
  // OR within cuisines; AND between cuisine, price, payment, and rating.
  if (includeCuisine && state.cuisines.size) {
    facetFilters.push([...state.cuisines].map(value => `food_type:${value}`));
  }
  if (priceInput.value) facetFilters.push(`price_range:${priceInput.value}`);
  if (paymentInput.value) facetFilters.push(`payment_options:${paymentInput.value}`);
  return {
    query: searchInput.value.trim(), page, hitsPerPage: 6,
    facetFilters, numericFilters: Number(ratingInput.value) ? [`stars_count>=${ratingInput.value}`] : [],
    // Ask for counts by cuisine; highlighting is disabled because cards display plain text.
    facets: ['food_type'], maxValuesPerFacet: 200, attributesToHighlight: []
  };
}

// Send one POST to Algolia directly from the browser. The Python server is not a search proxy.
// group ties a result request and its optional facet request to the same user action.
async function queryAlgolia(parameters, signal, group, trigger, purpose) {
  const { appId, indexName, searchApiKey } = state.config;
  const path = `/1/indexes/${encodeURIComponent(indexName)}/query`;
  // Only safe metadata and the search body go to the debugger, never authentication headers.
  const log = apiDebug.start({ group, trigger, purpose, method: 'POST',
    endpoint: `https://{APP_ID}.algolia.net${path}`, parameters });
  let status;
  try {
    const response = await fetch(`https://${appId}.algolia.net${path}`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-Algolia-Application-Id': appId, 'X-Algolia-API-Key': searchApiKey },
      body: JSON.stringify(parameters)
    });
    status = response.status;
    if (!response.ok) throw new Error('Search request failed');
    // fetch resolves even for HTTP errors, so response.ok is checked before parsing.
    // nbHits is the total number of matches; hits contains only the requested page.
    const result = await response.json();
    apiDebug.finish(log, { status: `HTTP ${status}`, processing: result.processingTimeMS,
      hits: result.nbHits, returned: result.hits.length });
    return result;
  } catch (error) {
    apiDebug.finish(log, { status: error.name === 'AbortError' ? 'Cancelled in browser' : status ? `HTTP ${status} · failed` : 'Network error' });
    throw error;
  }
}

// Clone the HTML <template> for every loaded hit. Rendering makes no new Algolia calls.
// When Show more succeeds, state.hits includes previous pages as well as the new page.
function renderCards() {
  $('#results-list').replaceChildren();
  state.hits.forEach(restaurant => {
    const card = $('#result-template').content.cloneNode(true);
    // Treat record values as text; never inject HTML from search results.
    card.querySelector('.result__title').textContent = restaurant.name;
    card.querySelector('.result__location').textContent = [restaurant.city, restaurant.state].filter(Boolean).join(', ');
    card.querySelector('.result__rating').textContent = Number.isFinite(restaurant.stars_count)
      ? `★ ${restaurant.stars_count.toFixed(1)} · ${(restaurant.reviews_count || 0).toLocaleString()} reviews` : 'Not yet rated';
    card.querySelector('.result__summary').textContent = [restaurant.food_type, restaurant.neighborhood, restaurant.price_range].filter(Boolean).join(' · ');
    card.querySelector('.result__price').textContent = '$'.repeat(Math.min(4, Math.max(0, Number(restaurant.price) || 0)));
    const img = card.querySelector('img');
    img.addEventListener('error', () => img.remove());
    if (/^https:\/\//.test(restaurant.image_url || '')) img.src = restaurant.image_url;
    else img.remove();
    $('#results-list').append(card);
  });
}

// Algolia returns a map such as {Italian: 70, Seafood: 29}. Turn it into checkboxes.
// Preserve focus and scroll position so updating counts does not disrupt keyboard navigation.
function renderCuisines(counts) {
  const container = $('#cuisine-filters');
  const focusedCuisine = document.activeElement?.closest('#cuisine-filters input')?.value;
  const scroll = container.scrollTop;
  container.replaceChildren();
  // Keep a selected cuisine visible even when another filter produces zero hits.
  const cuisines = new Set([...Object.keys(counts), ...state.cuisines]);
  [...cuisines].sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b)).forEach(cuisine => {
    const label = document.createElement('label');
    label.className = 'cuisine-option';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = cuisine; input.checked = state.cuisines.has(cuisine);
    const name = document.createElement('span'); name.textContent = cuisine;
    const badge = document.createElement('span'); badge.textContent = (counts[cuisine] || 0).toLocaleString();
    label.append(input, name, badge); container.append(label);
    input.addEventListener('change', () => {
      input.checked ? state.cuisines.add(cuisine) : state.cuisines.delete(cuisine);
      updateSearch('Cuisine changed');
    });
    if (cuisine === focusedCuisine) input.focus({ preventScroll: true });
  });
  container.scrollTop = scroll;
}

// Coordinate one user action: cancel old work, show loading, request data, then update the page.
// append=true requests the next page; otherwise start over at page 0.
async function runSearch(append = false, trigger = 'Search') {
  clearTimeout(debounce);
  if (!state.config) return;
  apiDebug.markGroup(state.request, 'Superseded by a newer search');
  const request = ++state.request;
  activeRequest?.abort();
  activeRequest = new AbortController();
  const page = append ? state.page + 1 : 0;
  more.disabled = true;
  $('.results').setAttribute('aria-busy', 'true');
  $('#search-error').hidden = true;
  count.textContent = 'Searching restaurants…';
  // Clear old-query cards while loading, but retain existing pages for show more.
  if (!append) { $('#results-list').replaceChildren(); more.hidden = true; }
  $('#empty-state').hidden = true;
  try {
    // Cuisine counts ignore the current cuisine selection, so OR choices remain available.
    // Promise.all starts both requests together and waits for both. If no cuisine is selected,
    // the main response already supplies usable counts, so no second request is sent.
    const [result, cuisineResult] = await Promise.all([
      queryAlgolia(searchParameters(page), activeRequest.signal, request, trigger, 'Restaurant results'),
      !append && state.cuisines.size
        ? queryAlgolia({ ...searchParameters(0, false), hitsPerPage: 0 }, activeRequest.signal, request, trigger, 'Cuisine counts (cuisine filter omitted)')
        : Promise.resolve(null)
    ]);
    // Aborting alone is not enough: a response may already be on its way. Compare request IDs too.
    if (request !== state.request) return; // Ignore responses for an older query.
    apiDebug.markGroup(request, 'Applied to page');
    // Append for pagination; replace for a new query or filter combination.
    state.hits = append ? [...state.hits, ...result.hits] : result.hits;
    state.page = result.page; state.pages = result.nbPages;
    renderCards();
    if (!append) renderCuisines((cuisineResult || result).facets?.food_type || {});
    count.textContent = `${result.nbHits.toLocaleString()} restaurant${result.nbHits === 1 ? '' : 's'} found`;
    $('#results-note').textContent = `Showing ${state.hits.length} · Search ${result.processingTimeMS} ms`;
    $('#empty-state').hidden = result.nbHits !== 0;
    more.hidden = state.page + 1 >= state.pages;
    if (append) {
      const firstNew = $('#results-list').children[state.hits.length - result.hits.length];
      if (firstNew) { firstNew.tabIndex = -1; firstNew.focus({ preventScroll: true }); }
    }
  } catch (error) {
    if (request !== state.request || error.name === 'AbortError') return;
    apiDebug.markGroup(request, 'Not applied: search failed');
    activeRequest.abort();
    count.textContent = 'Search is temporarily unavailable';
    $('#results-note').textContent = '';
    $('#search-error').hidden = false;
    // Retry starts at page one, avoiding duplicates after a failed append.
    more.hidden = true;
  // finally runs after success or failure; only the latest search can change loading state.
  } finally {
    if (request === state.request) {
      more.disabled = false;
      $('.results').setAttribute('aria-busy', 'false');
    }
  }
}

// Filter changes and explicit submit run immediately; only typing uses the 200 ms delay.
function updateSearch(trigger = 'Search') { clearTimeout(debounce); runSearch(false, trigger); }
// Clear both the visible controls and the selected-cuisine state, then search again.
function resetSearch() {
  searchInput.value = ''; ratingInput.value = '0'; priceInput.value = ''; paymentInput.value = '';
  state.cuisines.clear();
  updateSearch('Reset search and filters'); searchInput.focus();
}
// Every keystroke restarts the timer. A quick burst of typing becomes one search after a pause.
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  // Invalidate immediately, even before the next debounced request starts.
  apiDebug.markGroup(state.request, 'Superseded by typing');
  ++state.request; activeRequest?.abort();
  more.hidden = true;
  count.textContent = 'Searching restaurants…';
  $('#results-list').replaceChildren();
  $('#empty-state').hidden = true;
  $('#search-error').hidden = true;
  $('.results').setAttribute('aria-busy', 'true');
  debounce = setTimeout(() => runSearch(false, 'Typing paused for 200 ms'), 200);
});
// Connect each control to a readable debugger trigger. These callbacks do not upload records.
[[ratingInput, 'Minimum rating changed'], [priceInput, 'Price changed'], [paymentInput, 'Payment changed']].forEach(([input, trigger]) => input.addEventListener('change', () => updateSearch(trigger)));
$('#search-form').addEventListener('submit', event => { event.preventDefault(); updateSearch('Search submitted'); });
$('#clear-all').addEventListener('click', resetSearch);
$('#empty-reset').addEventListener('click', resetSearch);
$('#retry-search').addEventListener('click', () => state.config ? runSearch(false, 'Retry') : init('Retry configuration'));
more.addEventListener('click', () => runSearch(true, 'Show more'));

// Entry point: GET /config.json once, then run the initial empty-query search.
// Configuration contains the public search key only. Its values never enter the debug log.
async function init(trigger = 'Page loaded') {
  const log = apiDebug.start({ group: 'config', trigger, purpose: 'Local search configuration', method: 'GET', endpoint: '/config.json' });
  let configStatus;
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    configStatus = response.status;
    if (!response.ok) throw new Error('Search configuration unavailable');
    state.config = await response.json();
    apiDebug.finish(log, { status: `HTTP ${configStatus}` });
    apiDebug.markGroup('config', 'Loaded public configuration; values omitted');
    await runSearch(false, trigger);
  } catch (error) {
    apiDebug.finish(log, { status: configStatus ? `HTTP ${configStatus} · failed` : 'Network error' });
    apiDebug.markGroup('config', 'Configuration failed');
    count.textContent = 'Search configuration unavailable';
    $('#results-note').textContent = 'Start the Python server and check your .env file.';
    $('#search-error').hidden = false;
    $('.results').setAttribute('aria-busy', 'false');
  }
}
// defer in index.html ensures the page and debug.js are ready before this entry point runs.
init();
