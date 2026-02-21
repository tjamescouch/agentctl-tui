#!/usr/bin/env node
// Quick smoke test for the lightweight fuzzyScore used in index.js
function fuzzyScore(needle, hay) {
  if (!needle) return 1;
  needle = needle.toLowerCase();
  hay = hay.toLowerCase();
  let n = 0;
  let lastIdx = -1;
  for (let i = 0; i < needle.length; i++) {
    const ch = needle[i];
    const idx = hay.indexOf(ch, lastIdx + 1);
    if (idx === -1) return 0;
    if (idx === lastIdx + 1) n += 5;
    else n += 1;
    lastIdx = idx;
  }
  n += Math.max(0, 10 - hay.length);
  return n;
}

const samples = ['agent-alpha', 'agent-beta', 'agent-gamma', 'delta', 'alpha-agent'];
const queries = ['ag', 'agent', 'aeg', 'al', 'agp'];

for (const q of queries) {
  console.log(`\nQuery: "${q}"`);
  const scored = samples.map(s => ({ s, score: fuzzyScore(q, s) }));
  scored.sort((a, b) => b.score - a.score || a.s.localeCompare(b.s));
  for (const it of scored) {
    console.log(`  ${it.score.toString().padStart(2)}  ${it.s}`);
  }
}

console.log('\nSmoke test complete');

