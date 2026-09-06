/* Flow: UI controls → Algolia query → render hits and facet counts.
   The Python server supplies only public search configuration, never a write key. */
const state = { config: null, cuisines: new Set(), hits: [], page: 0, pages: 0, request: 0 };
const $ = selector => document.querySelector(selector);
const searchInput = $('#search-input');
const ratingInput = $('#rating');
const priceInput = $('#price');
const paymentInput = $('#payment');
const count = $('#results-count');
const more = $('#show-more');
let debounce;
let activeRequest;

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
    facets: ['food_type'], maxValuesPerFacet: 200, attributesToHighlight: []
  };
}

async function queryAlgolia(parameters, signal) {
  const { appId, indexName, searchApiKey } = state.config;
  const response = await fetch(`https://${appId}.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Algolia-Application-Id': appId, 'X-Algolia-API-Key': searchApiKey },
    body: JSON.stringify(parameters)
  });
  if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
  return response.json();
}

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
      updateSearch();
    });
    if (cuisine === focusedCuisine) input.focus({ preventScroll: true });
  });
  container.scrollTop = scroll;
}

async function runSearch(append = false) {
  clearTimeout(debounce);
  if (!state.config) return;
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
    const [result, cuisineResult] = await Promise.all([
      queryAlgolia(searchParameters(page), activeRequest.signal),
      !append && state.cuisines.size
        ? queryAlgolia({ ...searchParameters(0, false), hitsPerPage: 0 }, activeRequest.signal)
        : Promise.resolve(null)
    ]);
    if (request !== state.request) return; // Ignore responses for an older query.
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
    count.textContent = 'Search is temporarily unavailable';
    $('#results-note').textContent = '';
    $('#search-error').hidden = false;
    // Retry starts at page one, avoiding duplicates after a failed append.
    more.hidden = true;
  } finally {
    if (request === state.request) {
      more.disabled = false;
      $('.results').setAttribute('aria-busy', 'false');
    }
  }
}

function updateSearch() { clearTimeout(debounce); runSearch(); }
function resetSearch() {
  searchInput.value = ''; ratingInput.value = '0'; priceInput.value = ''; paymentInput.value = '';
  state.cuisines.clear();
  updateSearch(); searchInput.focus();
}
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  // Invalidate immediately, even before the next debounced request starts.
  ++state.request; activeRequest?.abort();
  more.hidden = true;
  count.textContent = 'Searching restaurants…';
  $('#results-list').replaceChildren();
  $('#empty-state').hidden = true;
  $('#search-error').hidden = true;
  $('.results').setAttribute('aria-busy', 'true');
  debounce = setTimeout(runSearch, 200);
});
[ratingInput, priceInput, paymentInput].forEach(input => input.addEventListener('change', updateSearch));
$('#search-form').addEventListener('submit', event => { event.preventDefault(); updateSearch(); });
$('#clear-all').addEventListener('click', resetSearch);
$('#empty-reset').addEventListener('click', resetSearch);
$('#retry-search').addEventListener('click', () => state.config ? runSearch() : init());
more.addEventListener('click', () => runSearch(true));

async function init() {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Search configuration unavailable');
    state.config = await response.json();
    await runSearch();
  } catch (error) {
    count.textContent = 'Search configuration unavailable';
    $('#results-note').textContent = 'Start the Python server and check your .env file.';
    $('#search-error').hidden = false;
    $('.results').setAttribute('aria-busy', 'false');
  }
}
init();
