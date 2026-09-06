# Location audit and nearby discovery

## Current interface: device location or a US street address

The city dropdown has been removed. A compact restaurant search sits beside **Use your location or enter your address** under the OpenTable name.

- Device location is requested only after clicking the button. It is rounded before sending to Algolia.
- Address lookup runs only after submitting **Find**, not on every keystroke. The local server forwards the address to the US Census Geocoder and returns possible matches. The visitor confirms a match before nearby search starts.
- Addresses are matched approximately using Census data; they are not guaranteed rooftop coordinates. Use a street number/name plus city/state or ZIP; a city name alone is not a substitute for a street address.
- The UI states that the address goes to Census and coordinates go to Algolia. The app does not persist addresses or coordinates, and POST keeps the address out of the local server access-log URL. Third-party services have their own data practices.
- The debugger records POST /api/geocode with the address omitted. Both address and device coordinates are hidden in Algolia debug entries, while actual requests contain the coordinates required for search.
- Failure, no-match, denied permission, and timeouts preserve the previously applied search location. A new selection/reset invalidates pending lookups.
- Distances are approximate straight-line miles from the selected address or rounded device position. Use All locations to remove proximity restrictions.

The original coordinate audit remains valid: all 5,000 records are labelled US, have complete address/phone/neighborhood fields, and pass numeric coordinate-range checks. Two Kailua records remain flagged for geographic review. These checks do not prove address-level accuracy, and no source coordinates were rewritten.

The generated `data/locations.json` file is retained as an offline audit artifact, but is no longer fetched or used by the UI. Restaurant `_geoloc` values remain the source for Algolia geo search.

## API flow

1. GET /config.json supplies public search configuration.
2. If the visitor submits an address, POST /api/geocode resolves it through Census. This is separate from Algolia search and does not upload records.
3. After address confirmation or device success, the normal Algolia query gains aroundLatLng, aroundRadius (meters or "all"), aroundPrecision: 1000, and getRankingInfo: true.
4. Restaurant and cuisine-count queries share the same location/radius. Distance is taken from _rankingInfo.matchedGeoLocation.distance.

Algolia’s existing default geo ranking criterion is used; this is geographic relevance, not a guarantee of strict nearest-first order for all text queries. No index changes or record uploads were needed.

## Validation

The Census documentation’s public address example successfully returned coordinates. Synthetic tests cover address confirmation, no match, device denial/timeout, rounding, redaction, stale callbacks, and reset. No actual personal/device location was used for testing. Previous live geo tests passed for San Francisco and Denver. Browser permission and visual checks remain manual.

Run `node tests/location.test.cjs`, `python3 tests/test_geocode.py`, and `python3 scripts/verify_geo.py`.

References: [Census geocoder API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), [Algolia geo search](https://www.algolia.com/doc/guides/managing-results/refine-results/geolocation).
