/* Location state is separate from search state. We never infer a visitor's city
   from IP or ask for device access until the visitor clicks Use my location. */
window.restaurantLocation = (() => {
  const addressInput = document.querySelector('#location-address');
  const radiusInput = document.querySelector('#location-radius');
  const status = document.querySelector('#location-status');
  const deviceButton = document.querySelector('#use-location');
  const addressPanel = document.querySelector('#address-panel');
  const addressToggle = document.querySelector('#toggle-address');
  function showAddress(open, focus = true) {
    addressPanel.hidden = !open;
    addressToggle.setAttribute('aria-expanded', String(open));
    if (focus) (open ? addressInput : addressToggle).focus();
  }
  let addressRequest;
  let selected = null;
  let lookupId = 0;
  let onChange = () => {};

  function describe() {
    radiusInput.disabled = !selected;
    document.querySelector('#location-distance').hidden = !selected;
    document.querySelector('#clear-location').hidden = !selected;
    if (!selected) {
      status.textContent = 'Showing all locations';
    } else {
      status.textContent = `Near ${selected.label}`;
    }
  }

  // Cancel the effect of an old device callback after an address is chosen or reset is clicked.
  function cancelLookup() { ++lookupId; deviceButton.disabled = false; addressRequest?.abort(); document.querySelector('#apply-address').disabled = false; document.querySelector('#address-matches').hidden = true; }
  function clear(notify = true) {
    showAddress(false, false);
    cancelLookup(); selected = null; addressInput.value = ''; radiusInput.value = '40234';
    describe();
    if (notify) onChange('Location cleared');
  }

  function applyAddress(match, id) {
    if (id !== lookupId) return;
    selected = { ...match, source: 'address' };
    document.querySelector('#address-matches').hidden = true;
    addressInput.value = match.label;
    showAddress(false);
    apiDebug.markGroup(`address-${id}`, 'Selected address applied to nearby search');
    describe(); onChange('Address selected (address and coordinates hidden)');
  }

  async function findAddress() {
    const address = addressInput.value.trim();
    if (address.length < 2 || address.length > 100) {
      status.textContent = 'Enter a US city, ZIP code, street, or combination.'; return;
    }
    cancelLookup();
    const id = lookupId;
    addressRequest = new AbortController();
    document.querySelector('#apply-address').disabled = true;
    status.textContent = 'Looking up your address…';
    const log = apiDebug.start({group: `address-${id}`, trigger: 'Find address', purpose: 'Address or ZIP lookup through local server', method: 'POST', endpoint: '/api/geocode', parameters: {address: '[address hidden]'}});
    let httpStatus;
    try {
      const response = await fetch('/api/geocode', {method:'POST', signal:addressRequest.signal,
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({address})});
      httpStatus = response.status;
      if (!response.ok) throw new Error('Address lookup failed');
      const data = await response.json();
      apiDebug.finish(log, {status:`HTTP ${httpStatus}`});
      if (id !== lookupId) { apiDebug.markGroup(`address-${id}`, 'Superseded'); return; }
      const matches = data.matches || [];
      if (!matches.length) {
        status.textContent = 'No location match. Add a city, state, or ZIP to narrow the search, or use your location. Your current search area is unchanged.';
        apiDebug.markGroup(`address-${id}`, 'No matching address');
      } else {
        // Let the visitor confirm even a single matched address; geocoders can return an unexpected match.
        const choices = document.querySelector('#address-matches'); choices.replaceChildren();
        matches.forEach(match => {
          const button = document.createElement('button'); button.type = 'button';
          button.textContent = `Use this location: ${match.label}`;
          button.addEventListener('click', () => applyAddress(match, id)); choices.append(button);
        });
        choices.hidden = false;
        status.textContent = 'Select the address match in the popup to search nearby.';
        apiDebug.markGroup(`address-${id}`, 'Address matches returned; waiting for selection');
      }
    } catch (error) {
      apiDebug.finish(log, {status:error.name === 'AbortError' ? 'Cancelled in browser' : httpStatus ? `HTTP ${httpStatus} · failed` : 'Network error'});
      if (id === lookupId && error.name !== 'AbortError') status.textContent = 'Address lookup is unavailable. Try again or use your location. Your current search area is unchanged.';
    } finally {
      if (id === lookupId) document.querySelector('#apply-address').disabled = false;
    }
  }

  function useDevice() {
    if (!window.isSecureContext || !navigator.geolocation) {
      status.textContent = 'Device location is unavailable here. Enter an address instead; your existing search location is unchanged.';
      addressToggle.focus(); return;
    }
    cancelLookup();
    const id = lookupId;
    deviceButton.disabled = true;
    status.textContent = 'Waiting for location permission… You can also enter an address.';
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== lookupId) return;
      deviceButton.disabled = false;
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        status.textContent = 'The device returned an invalid location. Enter an address instead.'; return;
      }
      // Round before sending to Algolia: roughly a 1 km grid, not an exact device position.
      selected = { lat: Number(latitude.toFixed(2)), lng: Number(longitude.toFixed(2)),
        source: 'device', label: 'your approximate location' };
      addressInput.value = '';
      showAddress(false, false);
      describe();
      if (accuracy > 5000) status.textContent += ' Your device reported low accuracy; entering an address may work better.';
      onChange('Device location selected (coordinates hidden)');
    }, error => {
      if (id !== lookupId) return;
      deviceButton.disabled = false;
      const reason = error.code === 1 ? 'Location permission was declined.' : error.code === 3 ? 'Location lookup timed out after 20 seconds. Try allowing location in your browser and system settings, or use a full US street address.' : 'Your device could not determine a location.';
      status.textContent = `${reason} Enter an address instead. The current search location has not changed.`;
      showAddress(true);
    }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
  }

  function parameters() {
    if (!selected) return {};
    return { aroundLatLng: `${selected.lat},${selected.lng}`,
      aroundRadius: radiusInput.value === 'all' ? 'all' : Number(radiusInput.value),
      // Nearby points within the same distance band can be ordered by later ranking criteria.
      aroundPrecision: 1000, getRankingInfo: true };
  }

  function debugParameters(parameters) {
    // The teaching panel hides both device and address coordinates; Algolia receives the actual search center.
    return selected && parameters.aroundLatLng
      ? { ...parameters, aroundLatLng: selected.source === 'device' ? '[device coordinates hidden]' : '[address coordinates hidden]' } : parameters;
  }

  function distanceText(restaurant) {
    if (!selected) return '';
    const meters = restaurant._rankingInfo?.matchedGeoLocation?.distance;
    if (!Number.isFinite(meters)) return 'Distance unavailable';
    const miles = meters / 1609.344;
    return `≈ ${miles < 0.1 ? '<0.1' : miles.toFixed(1)} mi from ${selected.source === 'device' ? 'your approximate location' : 'selected address'}`;
  }

  function init(callback) {
    onChange = callback;
    addressToggle.addEventListener('click', () => showAddress(addressPanel.hidden));
    document.querySelector('#close-address').addEventListener('click', () => showAddress(false));
    addressPanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); showAddress(false); }
    });
    document.querySelector('#address-form').addEventListener('submit', event => { event.preventDefault(); findAddress(); });
    // Editing the input invalidates an older address lookup or an unconfirmed match.
    addressInput.addEventListener('input', cancelLookup);
    deviceButton.addEventListener('click', useDevice);
    document.querySelector('#clear-location').addEventListener('click', () => clear());
    radiusInput.addEventListener('change', () => { describe(); if (selected) onChange('Search radius changed'); });
    describe();
  }
  return { init, parameters, debugParameters, distanceText, clear, active: () => Boolean(selected) };
})();
