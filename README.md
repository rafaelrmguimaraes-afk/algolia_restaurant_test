# Restaurant Discovery Search — Algolia Solutions Engineer Assignment

A restaurant discovery search demo built with Algolia for visitors who are either looking for a specific restaurant or exploring places to eat.

**Live demo:** https://algolia-restaurant-test.vercel.app/  
**Repository:** https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test

## Approach

I created a restaurant discovery search demo for visitors who are looking for places to eat and exploring their options.

The first step was to work with the data provided by Algolia. I joined the two source files — one JSON and one CSV — using `objectID` as the unique identifier, normalized the data, and indexed 5,000 restaurants in Algolia.

The experience combines text search, cuisine and price filters, ratings, payment options, and location-based discovery. I prioritized restaurant names for known-item searches, added dining-style synonyms and an affordability Rule, and used rating and review count as custom ranking signals. OpenStreetMap's Nominatim service resolves entered locations; Algolia performs the nearby search.

I used plain JavaScript and a small Python backend to keep the implementation easy to inspect and explain. I validated the experience with automated tests and manual checks locally and on Vercel, including a misspelled restaurant query that returned the intended restaurant as its only result.

Key trade-offs include price bands rather than exact prices and deterministic sentence interpretation rather than semantic search.

## Search Experience

The demo supports two primary search behaviors.

### Known-item search

Visitors who already have a restaurant in mind can search by name. Restaurant names are prioritized in Algolia's searchable attributes, while Algolia's typo tolerance helps recover intended restaurants from misspelled queries.

### Discovery

Visitors who are still deciding where to eat can combine search with refinements such as:

- Cuisine / food type
- Minimum rating
- Price range
- Payment options
- Location and search radius

The experience also supports sentence-style input through deterministic interpretation of supported terms. This is intentionally not presented as semantic or AI search.

## Data Preparation

The supplied restaurant information came from two files:

- `restaurants_list.json`
- `restaurants_info.csv`

A Python data-preparation step joins the datasets on `objectID`, normalizes the records, validates the result, and produces the Algolia-ready dataset.

The final index contains **5,000 restaurant records** with fields used by the search experience, including restaurant name, cuisine, rating, review count, neighborhood, price range, dining style, payment options, reservation information, and `_geoloc`.

## Algolia Configuration

The index configuration is designed to support both known-item search and discovery.

### Searchable attributes

Restaurant identity is prioritized so a strong name match remains more important than a weaker match in a discovery attribute. Cuisine and location-related attributes remain searchable to support broader exploration.

### Facets and filters

Algolia facets and numeric filters power the refinement experience. Multiple cuisine selections behave as alternatives, while different refinement categories are combined.

For example:

```text
(Italian OR Sushi)
AND price_range = "$31 to $50"
AND stars_count >= 4
```

### Ranking

Rating and review count are used as custom ranking signals after Algolia's textual relevance criteria.

The goal is for ratings and review volume to improve ordering among similarly relevant restaurants without allowing popularity to override a stronger text match.

### Synonyms and Rules

Dining-style synonyms improve matching for related terminology.

An affordability Rule supports price-oriented intent while keeping the implementation deterministic and explainable.

## Location-Based Discovery

Restaurant records retain the supplied `_geoloc` coordinates.

Visitors can use their current location or enter a location and choose a search radius. Entered locations are resolved through OpenStreetMap's Nominatim service, and the resulting coordinates are passed to Algolia for geographic search.

Algolia performs the actual nearby restaurant search and returns location-aware results. If no location is selected, the experience continues to use normal relevance.

## Architecture

```text
restaurants_list.json ─┐
                       ├──> Python data preparation ──> Algolia
restaurants_info.csv ──┘                               │
                                                       │
Browser UI <────────────── Algolia Search API <────────┘
     │
     └── Nominatim (entered-location lookup)
```

The frontend is intentionally implemented with plain HTML, CSS, and JavaScript. A small Python backend supports the local application and keeps privileged configuration outside the browser.

The browser uses only the Algolia Search API Key. The Write API Key is reserved for indexing/configuration operations and is never exposed to the frontend.

## API Debugger

The demo includes an API debugger that makes the search integration easier to inspect during a technical walkthrough.

It shows the requests generated by user actions and useful response information such as result counts and Algolia processing time, while omitting credentials and sensitive location details.

## Validation

I validated the application with automated tests and manual end-to-end checks locally and on the deployed Vercel version.

Testing covered the major user flows, including:

- Exact restaurant-name search
- Misspelled known-item search
- Cuisine discovery
- Price, rating, and payment refinements
- Combined filters
- Location-based search
- Search radius changes
- Pagination / Show more
- Empty and error states

A representative typo-tolerance test used a misspelled restaurant query and returned the intended restaurant as the only result.

## Security

- `.env` is excluded from Git.
- `.env.example` documents required configuration without containing secrets.
- The frontend receives only the Algolia Search API Key.
- The Write API Key remains outside the browser.
- Search-result content is rendered as text rather than injected as arbitrary HTML.
- External reservation URLs are validated before being exposed by the UI.

## Running Locally

Clone the repository:

```bash
git clone https://github.com/rafaelrmguimaraes-afk/algolia_restaurant_test.git
cd algolia_restaurant_test
```

Create your local environment configuration from `.env.example` and supply the required Algolia values.

Then start the included Python server:

```bash
python3 scripts/serve.py
```

Open the local URL printed by the server in your browser.

See the repository scripts and documentation for data preparation, Algolia configuration, indexing, and validation commands.

## Project Structure

```text
.
├── assets/              # UI assets
├── config/              # Algolia configuration
├── data/                # Prepared restaurant data
├── dataset/             # Supplied source datasets
├── docs/                # Supporting technical documentation
├── scripts/             # Data preparation, indexing, and local server
├── tests/               # Automated tests
├── index.html           # Application markup
├── index.css            # Application styling
├── index.js             # Search and UI logic
├── location.js          # Location search behavior
├── debug.js             # API debugger
├── .env.example         # Environment configuration template
└── README.md
```

## Trade-offs

### Price bands instead of exact prices

The source data provides price categories rather than exact menu pricing. The experience therefore filters and interprets affordability using those supplied price bands rather than implying precision the dataset does not contain.

### Deterministic sentence interpretation instead of semantic search

Sentence-style search recognizes supported intent through deterministic logic. I chose this approach because it is predictable, testable, and easy to explain within the scope of the assignment. It should not be confused with semantic or generative search.

### Lightweight frontend

I used plain JavaScript instead of introducing a larger frontend framework. This keeps the Algolia request flow visible and makes the implementation easier to inspect during a Solutions Engineer discussion.

## Potential Next Steps

With production usage and analytics, I would explore:

- Search analytics and no-result queries
- Algolia Rules driven by observed user behavior
- Query Suggestions
- A/B testing of ranking strategies
- Additional personalization and discovery signals
- Conversion and reservation analytics

These would be driven by real search behavior rather than added solely as demo features.

---

Built for the Algolia Solutions Engineer take-home assignment.
