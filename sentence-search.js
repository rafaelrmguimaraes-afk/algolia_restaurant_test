/* Small, deterministic interpreter: recognized phrases become filters; other
   words stay in Algolia's query. No records or index settings are modified. */
window.sentenceSearch = (() => {
  const cuisines = ['Contemporary American', 'Japanese', 'Italian', 'American', 'French', 'Mexican', 'Chinese', 'Indian', 'Thai', 'Seafood', 'Steakhouse', 'Sushi', 'Mediterranean', 'Greek', 'Korean', 'Vietnamese'];
  function parse(text) {
    let query = text;
    const tokens = [], notes = [];
    // Replacing with spaces preserves offsets, letting a chip remove its original phrase.
    function take(pattern, kind, value) {
      query = query.replace(pattern, (phrase, ...args) => {
        const start = args[args.length - 2];
        tokens.push({kind, value, start, end:start + phrase.length});
        return ' '.repeat(phrase.length);
      });
    }
    // Negation / OR need more than this small grammar. Keep those searches literal.
    if (/\b(without|except|not|or)\b/i.test(text)) return {query:text, tokens, notes:['For alternatives or exclusions, use the filters. This sentence is searched as text.']};
    take(/\bcheap\b/gi, 'price', '$30 and under');
    take(/\bmoderate\b/gi, 'price', '$31 to $50');
    take(/\bexpensive\b/gi, 'price', '$50 and over');
    take(/\b(?:under|less than|up to)\s*["']?\$?30["']?(?![\d.])/gi, 'price', '$30 and under');
    take(/\b(?:over|more than)\s*["']?\$?50["']?(?![\d.])/gi, 'price', '$50 and over');
    take(/\b(?:between\s*)?\$?31\s*(?:to|and|-)\s*\$?50\b/gi, 'price', '$31 to $50');
    for (const [pattern, brand] of [[/\b(?:accepting\s+|accepts\s+|pay(?:ing)? with\s+)?(?:amex|american express)\b/gi,'AMEX'], [/\b(?:accepting\s+|accepts\s+|pay(?:ing)? with\s+)?visa\b/gi,'Visa'], [/\b(?:accepting\s+|accepts\s+|pay(?:ing)? with\s+)?master\s*card\b/gi,'MasterCard'], [/\b(?:accepting\s+|accepts\s+|pay(?:ing)? with\s+)?discover\b/gi,'Discover']]) take(pattern,'payment',brand);
    // Common pizza terms and misspellings resolve to the original facet label.
    take(/\b(?:pizza|pizzeria|pizzaria|pizzeira)\b/gi, 'cuisine', 'Pizzeria');
    take(/\bbrazilian steak\s*house\b/gi, 'cuisine', 'Brazilian Steakhouse');
    take(/\bcheapest\b/gi, 'cheapest', 'Lowest available price band');
    for (const cuisine of cuisines) take(new RegExp('\\b'+cuisine+'\\b','gi'), 'cuisine', cuisine);
    if (/\b(?:under|less than|up to|over|more than|between)\s*["']?\$?\d/i.test(query)) notes.push('Only $30 and under, $31 to $50, and $50 and over are available. Other prices remain search text.');
    if (/\bbest\b/i.test(query)) {
      take(/\bbest\b/gi, 'ranking', 'Best');
      notes.push('Best uses the existing Algolia relevance ranking; it is not a separate highest-rating sort.');
    }
    if (tokens.some(t=>t.kind==='cheapest')) notes.push('Cheapest shows the lowest available price band among your matches, not exact menu prices.');
    if (tokens.some(t=>t.kind==='price')) notes.push('Prices use the dataset’s per-person bands, not exact menu prices.');
    if (tokens.length) query = query.replace(/\b(find|me|restaurants?|places?|please|that|with|and)\b/gi,' ');
    return {query:query.replace(/\s+/g,' ').trim(), tokens, notes};
  }
  return {parse};
})();
