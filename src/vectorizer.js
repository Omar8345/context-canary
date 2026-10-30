// Domain-specific concept vectors keep the demo deterministic and avoid a separate
// embedding service on self-hosted Appwrite. VectorsDB still performs the search.
const concepts = [
  { weight: 1, pattern: /\breturn(?:s|ed|ing)?\b|\bsent back\b/i },
  { weight: 1, pattern: /\brefund\b|\bmoney back\b/i },
  { weight: 1, pattern: /\bdeadline\b|\btime limit\b|\bwindow\b|\bwithin\s+\d+\s+days\b|\b\d+\s+days?\b/i },
  { weight: 0.5, pattern: /\breceipt\b|\bproof of purchase\b/i },
  { weight: 1, pattern: /\bshipping\b|\bship\b|\bfulfill(?:ment)?\b/i }
];

export function vectorize(text) {
  const vector = Array(768).fill(0);
  concepts.forEach((concept, index) => {
    if (concept.pattern.test(text)) vector[index] = concept.weight;
  });
  if (vector.every(value => value === 0)) throw new Error('No known concepts found in text');
  const magnitude = Math.hypot(...vector);
  return vector.map(value => value / magnitude);
}
