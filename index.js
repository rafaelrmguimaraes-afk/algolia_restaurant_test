/* Flow: UI controls → Algolia query → render hits and facet counts.
   The Python server supplies only public search configuration, never a write key. */
// State remembers the current search, loaded pages, and a request number used to reject old responses.
// cuisines is a Set so the same cuisine cannot be selected twice.
const state = { config: null, cuisines: new Set(), hits: [], page: 0, pages: 0, request: 0, cheapestBand: null };
// Cache the HTML controls once. The $ helper is just document.querySelector, not jQuery.
const $ = selector => document.querySelector(selector);
const searchInput = $('#search-input');
const ratingInput = $('#rating');
const priceInput = $('#price');
const paymentInput = $('#payment');
const count = $('#results-count');
const more = $('#pagination');
// debounce holds the typing timer; activeRequest lets a newer search cancel the previous fetch.
let debounce;
let activeRequest;

// Convert the current controls into Algolia request JSON. Page 0 is the first page.
// includeCuisine=false is used only for the extra query that counts alternative cuisines.
function searchParameters(page, includeCuisine = true) {
  const locationParameters = restaurantLocation.parameters();
  const facetFilters = [...(locationParameters.facetFilters || [])];
  // OR within cuisines; AND between cuisine, price, payment, and rating.
  if (includeCuisine && state.cuisines.size && !sentenceSearch.parse(searchInput.value).tokens.some(t => t.kind === 'cuisine')) {
    facetFilters.push([...state.cuisines].map(value => `food_type:${value}`));
  }
  if (state.cheapestBand) facetFilters.push(`price_range:${state.cheapestBand}`);
  if (priceInput.value && !sentenceSearch.parse(searchInput.value).tokens.some(t => ['price', 'cheapest'].includes(t.kind))) facetFilters.push(`price_range:${priceInput.value}`);
  if (paymentInput.value) facetFilters.push(`payment_options:${paymentInput.value}`);
  // Sentence filters are ANDed with sidebar filters; visible chips explain them.
  for (const token of sentenceSearch.parse(searchInput.value).tokens) {
    if (token.kind === 'cuisine' && includeCuisine) facetFilters.push(`food_type:${token.value}`);
    if (token.kind === 'price') facetFilters.push(`price_range:${token.value}`);
    if (token.kind === 'payment') facetFilters.push(`payment_options:${token.value}`);
  }
  return {
    query: sentenceSearch.parse(searchInput.value.trim()).query, page, hitsPerPage: Number($('#page-size').value) || 20,
    facetFilters, numericFilters: Number(ratingInput.value) ? [`stars_count>=${ratingInput.value}`] : [],
    // Ask for counts by cuisine; highlighting is disabled because cards display plain text.
    facets: ['food_type'], maxValuesPerFacet: 200, attributesToHighlight: [],
    // Both the main and alternate-cuisine queries must use the same search center and radius.
    ...locationParameters, facetFilters
  };
}

// Send one POST to Algolia directly from the browser. The Python server is not a search proxy.
// group ties a result request and its optional facet request to the same user action.
async function queryAlgolia(parameters, signal, group, trigger, purpose) {
  const { appId, indexName, searchApiKey } = state.config;
  const path = `/1/indexes/${encodeURIComponent(indexName)}/query`;
  // Only safe metadata and the search body go to the debugger, never authentication headers.
  const log = apiDebug.start({ group, trigger, purpose, method: 'POST',
    endpoint: `https://{APP_ID}.algolia.net${path}`, parameters: restaurantLocation.debugParameters(parameters) });
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

// Booking URLs come from the historical dataset. Only explicit OpenTable URLs are allowed.
// Prefer HTTPS, reject embedded credentials/custom ports, and hide malformed links.
function reservationUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || !['opentable.com', 'www.opentable.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

// Plain text badges are recognizable and do not need a separate logo library.
function paymentBrands(options) {
  if (!Array.isArray(options)) return [];
  return [...new Set(options.filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim() === 'MasterCard' ? 'Mastercard' : value.trim()))];
}

// Clone the HTML <template> for every loaded hit. Rendering makes no new Algolia calls.
// Each page replaces the visible cards.
function renderCards() {
  $('#results-list').replaceChildren();
  state.hits.forEach(restaurant => {
    const card = $('#result-template').content.cloneNode(true);
    // Treat record values as text; never inject HTML from search results.
    card.querySelector('.result__title').textContent = restaurant.name;
    card.querySelector('.result__location').textContent = [restaurant.city, restaurant.state].filter(Boolean).join(', ');
    card.querySelector('.result__rating').textContent = Number.isFinite(restaurant.stars_count)
      ? `★ ${restaurant.stars_count.toFixed(1)} · ${(restaurant.reviews_count || 0).toLocaleString()} reviews` : 'Not yet rated';
    card.querySelector('.result__summary').textContent = [restaurant.food_type, restaurant.neighborhood].filter(Boolean).join(' · ');
    // Derive dollar signs from the same price band used by search filters.
    const priceLabel = card.querySelector('.result__price');
    priceLabel.textContent = ({'$30 and under':'$', '$31 to $50':'$$', '$50 and over':'$$$'})[restaurant.price_range] || '';
    priceLabel.setAttribute('aria-label', restaurant.price_range || 'Price unavailable');
    priceLabel.title = restaurant.price_range || '';
    card.querySelector('.result__distance').textContent = restaurantLocation.distanceText(restaurant);
    const payments = card.querySelector('.result__payments');
    const brands = paymentBrands(restaurant.payment_options);
    payments.hidden = brands.length === 0;
    brands.forEach(brand => {
      const badge = document.createElement('li');
      badge.className = 'payment-badge';
      badge.textContent = brand;
      payments.append(badge);
    });
    const booking = card.querySelector('.result__reserve');
    const url = reservationUrl(restaurant.reserve_url);
    if (url) {
      booking.href = url;
      booking.hidden = false;
      booking.setAttribute('aria-label', `Reserve ${restaurant.name} on OpenTable (opens in a new tab)`);
    }
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
  // Use the original dataset labels without splitting or inferring categories.
  const container = $('#cuisine-filters');
  const focused = document.activeElement?.closest('#cuisine-filters input')?.value;
  const scroll = container.scrollTop;
  container.replaceChildren();
  const options = new Set([...Object.keys(counts), ...state.cuisines]);
  [...options].sort((a,b)=>(counts[b]||0)-(counts[a]||0)||a.localeCompare(b)).forEach(value => {
    const label = document.createElement('label'); label.className = 'cuisine-option';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = value; input.checked = state.cuisines.has(value);
    const name = document.createElement('span'); name.textContent = value;
    const badge = document.createElement('span'); badge.textContent = (counts[value]||0).toLocaleString();
    label.append(input,name,badge); container.append(label);
    input.addEventListener('change', () => {
      input.checked ? state.cuisines.add(value) : state.cuisines.delete(value);
      updateSearch('Cuisine changed');
    });
    if (focused === value) input.focus({preventScroll:true});
  });
  container.scrollTop = scroll;
}

// Coordinate one user action: cancel old work, show loading, request data, then update the page.
// append=true navigates to requestedPage, retaining filters; a new search starts at 0.
async function runSearch(append = false, trigger = 'Search', requestedPage = state.page + 1) {
  clearTimeout(debounce);
  if (!state.config) return;
  renderSentence();
  apiDebug.markGroup(state.request, 'Superseded by a newer search');
  const request = ++state.request;
  activeRequest?.abort();
  activeRequest = new AbortController();
  const page = append ? requestedPage : 0;
  more.disabled = true;
  more.querySelectorAll?.('button').forEach(button => button.disabled = true);
  $('.results').setAttribute('aria-busy', 'true');
  $('#search-error').hidden = true;
  count.textContent = 'Searching restaurants…';
  // Clear old-query cards while loading, but retain existing pages for show more.
  if (!append) { $('#results-list').replaceChildren(); more.hidden = true; }
  $('#empty-state').hidden = true;
  try {
    // Find the cheapest matching band across the index, not just the displayed page.
    // Probe requests retain cuisine, payment, rating and location constraints.
    if (!append) {
      state.cheapestBand = null;
      if (sentenceSearch.parse(searchInput.value).tokens.some(t => t.kind === 'cheapest')) {
        const bands = ['$30 and under', '$31 to $50', '$50 and over'];
        const base = searchParameters(0);
        const probes = await Promise.all(bands.map(band => queryAlgolia({
          ...base, hitsPerPage:0, facets:[],
          facetFilters:[...base.facetFilters, `price_range:${band}`]
        }, activeRequest.signal, request, trigger, 'Find cheapest band: ' + band)));
        if (request !== state.request) return;
        state.cheapestBand = bands.find((band, i) => probes[i].nbHits > 0) || null;
        if (state.cheapestBand) $('#sentence-note').textContent += ' Showing: ' + state.cheapestBand + '.';
      }
    }
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
    // Display only the requested page.
    state.hits = result.hits;
    state.page = result.page; state.pages = result.nbPages;
    renderCards();
    if (!append) renderCuisines((cuisineResult || result).facets?.food_type || {});
    count.textContent = `${result.nbHits.toLocaleString()} restaurant${result.nbHits === 1 ? '' : 's'} found`;
    $('#results-note').textContent = `Page ${state.page + 1} of ${Math.max(1, state.pages)} · Search ${result.processingTimeMS} ms`;
    $('#empty-state').hidden = result.nbHits !== 0;
    $('#empty-state p').textContent = restaurantLocation.active()
      ? 'No matches in this area. Widen the distance, enter another address, or reset all filters.'
      : 'Try another restaurant name or reset your filters.';
    renderPagination();
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
  restaurantLocation.clear(false);
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
$('#page-size').addEventListener('change', () => updateSearch('Results per page changed'));
$('#search-form').addEventListener('submit', event => { event.preventDefault(); updateSearch('Search submitted'); });
$('#clear-all').addEventListener('click', resetSearch);
$('#empty-reset').addEventListener('click', resetSearch);
$('#retry-search').addEventListener('click', () => state.config ? runSearch(false, 'Retry') : init('Retry configuration'));


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
// Location handlers are independent; no device prompt or address lookup runs on page load.
restaurantLocation.init(updateSearch);

// Chips remove the phrase from the input itself, so typing and filters never drift apart.
function renderSentence() {
  const parsed = sentenceSearch.parse(searchInput.value);
  const panel = $('#sentence-filters');
  panel.replaceChildren();
  parsed.tokens.forEach(token => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = token.value + ' ×';
    button.setAttribute('aria-label', 'Remove ' + token.value);
    button.addEventListener('click', () => {
      searchInput.value = (searchInput.value.slice(0, token.start) + searchInput.value.slice(token.end)).trim();
      updateSearch('Sentence filter removed');
    });
    panel.append(button);
  });
  $('#sentence-note').textContent = parsed.notes.join(' ');
  if (priceInput.value && parsed.tokens.some(t => ['price', 'cheapest'].includes(t.kind))) {
    $('#sentence-note').textContent += ' Price from your search takes priority over the price dropdown.';
  }
  if (state.cuisines.size && parsed.tokens.some(t => t.kind === 'cuisine')) {
    $('#sentence-note').textContent += ' Cuisine from your search takes priority over the cuisine checkboxes.';
  }
}

// Bounded page links avoid hundreds of buttons on large result sets.
function renderPagination() {
  more.replaceChildren();
  more.hidden = state.pages <= 1;
  if (more.hidden) return;
  function button(label, page, disabled = false) {
    const item = document.createElement('button');
    item.type = 'button'; item.textContent = label; item.disabled = disabled;
    if (page === state.page && /^\d+$/.test(label)) item.setAttribute('aria-current', 'page');
    item.setAttribute('aria-label', /^\d+$/.test(label) ? 'Page ' + label : label);
    item.addEventListener('click', () => runSearch(true, 'Page ' + (page + 1), page));
    more.append(item);
  }
  button('Previous', state.page - 1, state.page === 0);
  const pages = new Set([0, state.pages - 1]);
  for (let i = Math.max(0, state.page - 2); i <= Math.min(state.pages - 1, state.page + 2); i++) pages.add(i);
  let previous = -1;
  [...pages].sort((a,b)=>a-b).forEach(page => {
    if (page > previous + 1) { const gap = document.createElement('span'); gap.textContent = '…'; more.append(gap); }
    button(String(page + 1), page, page === state.page); previous = page;
  });
  button('Next', state.page + 1, state.page === state.pages - 1);
}
init();
