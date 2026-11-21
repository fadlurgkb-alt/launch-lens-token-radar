export type Protocol = {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
};

export type RadarRow = {
  slug: string; name: string; rank: number; implied_value_usd: number;
  farm_steps: string[]; category: string; chains: string[]; tvl_usd: number;
  change_7d: number | null; age_days: number | null; token_status: 'unrecorded' | 'recorded';
  watchlist: boolean; score: number; confidence: 'high' | 'medium' | 'low';
  risk: 'elevated' | 'moderate' | 'lower'; thesis: string; model: Record<string, number>;
};

const CATEGORY_MULTIPLIER: Record<string, number> = {
  Lending: 0.22, DEXes: 0.17, Derivatives: 0.2, 'Yield Aggregator': 0.16,
  'Risk Curators': 0.18, RWA: 0.19, Stablecoins: 0.12, 'Leveraged Farming': 0.14,
  'Uncollateralized Lending': 0.16, Insurance: 0.15, Options: 0.18,
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const rounded = (n: number) => Math.max(1, Math.round(n / 1000) * 1000);

function ageDays(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  return Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / 86400000));
}

function actionFor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('lending')) return 'supply a major stablecoin, then borrow only if the health factor stays above 1.8';
  if (c.includes('dex') || c.includes('amm')) return 'make two modest swaps, then add balanced liquidity only in a liquid pair';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) return 'open and close one small hedged position using a limit order';
  if (c.includes('yield') || c.includes('farm') || c.includes('vault')) return 'deposit into the simplest audited stablecoin vault and avoid leveraged loops';
  if (c.includes('rwa')) return 'use the smallest eligible deposit in a liquid short-duration market';
  if (c.includes('stablecoin')) return 'mint or swap a small amount, then test one redemption path';
  if (c.includes('bridge')) return 'bridge a small amount once and return it only after finality is verified';
  return 'complete the protocol’s simplest deposit and withdrawal flow with a major asset';
}

function farmPlan(p: Protocol, category: string, risk: string): string[] {
  const chain = p.chains[0] ?? 'its primary chain';
  const action = actionFor(category);
  return [
    `Day 0 · Research (20–30 min, $0): confirm the official ${p.name} application, supported ${chain} contracts, audits, eligibility terms, and whether a points or rewards program actually exists. Never infer an airdrop from this radar.`,
    `Day 1 · Trial ($10–$25 plus gas): fund a fresh activity wallet on ${chain}, ${action}. Keep the first transaction deliberately small and save its hash.`,
    `Week 1 · Establish use ($50–$150 plus gas): repeat one economically real action on two separate days; do not wash trade, sybil, or manufacture volume. Cap protocol exposure at an amount you can fully lose.`,
    `Weeks 2–4 · Maintain (10 min weekly, about 1–3 gas fees): inspect balances, position health, reward pages, and governance announcements. Exit if contracts change, liquidity deteriorates, or the ${risk} risk no longer fits.`,
    `Verification · Before scaling or claiming: match every transaction in a ${chain} explorer, test a partial withdrawal, export hashes and dates, and independently re-check token status. Revoke unused approvals after exit.`,
  ];
}

export function buildRows(protocols: Protocol[], watchlistSlugs: string[], asOf: string): RadarRow[] {
  const watch = new Set(watchlistSlugs);
  const enriched = protocols.map((p) => {
    const age = ageDays(p, asOf);
    const unrecorded = p.gecko_id === null && p.symbol === null;
    const category = p.category ?? 'Uncategorized';
    const tvlFactor = CATEGORY_MULTIPLIER[category] ?? 0.14;
    const growth = p.change_7d === null ? 1 : clamp(1 + p.change_7d / 100 * 0.55, 0.72, 1.34);
    const ageFactor = age === null ? 0.88 : clamp(0.82 + Math.log1p(age) / 18, 0.86, 1.22);
    const chainFactor = 1 + Math.min(0.14, Math.max(0, p.chains.length - 1) * 0.025);
    // Recorded-token rows are contextual benchmarks, not launch opportunities.
    const statusFactor = unrecorded ? 1 : 0.01;
    const implied = rounded(p.tvl_usd * tvlFactor * growth * ageFactor * chainFactor * statusFactor);
    const risk: RadarRow['risk'] = /Leveraged|Derivatives|Options|Uncollateralized|Bridge/i.test(category) ? 'elevated' : p.chains.length > 4 ? 'moderate' : 'lower';
    const confidence: RadarRow['confidence'] = p.change_7d !== null && age !== null ? 'high' : p.change_7d !== null || age !== null ? 'medium' : 'low';
    return {
      slug: p.slug, name: p.name, rank: 0, implied_value_usd: implied,
      farm_steps: farmPlan(p, category, risk), category, chains: p.chains, tvl_usd: p.tvl_usd,
      change_7d: p.change_7d, age_days: age, token_status: unrecorded ? 'unrecorded' as const : 'recorded' as const,
      watchlist: watch.has(p.slug), score: implied, confidence, risk,
      thesis: `${p.name} is modeled from $${p.tvl_usd.toLocaleString('en-US')} TVL, ${p.change_7d === null ? 'unreported' : `${p.change_7d.toFixed(1)}%`} seven-day growth, ${age === null ? 'unknown' : `${age} days`} of tracked history, and a ${unrecorded ? 'no-token-record' : 'recorded-token'} status.`,
      model: { tvl_factor: tvlFactor, growth_factor: growth, age_factor: ageFactor, chain_factor: chainFactor, status_factor: statusFactor },
    };
  });
  const excludedCategories = /^(Bridge|Canonical Bridge|Liquid Staking|Liquid Restaking|Restaked BTC|CEX)$/i;
  const derivativeName = /\b(wrapped|staked|staking)\b|\s(?:v?\d+(?:\.\d+)*)$/i;
  const exchangeName = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  const launchCandidate = (r: RadarRow) => r.token_status === 'unrecorded' && !excludedCategories.test(r.category) && !derivativeName.test(r.name) && !exchangeName.test(r.name);
  const pretoken = enriched.filter(launchCandidate).sort(sortValue).slice(0, 200);
  const benchmarks = enriched.filter((r) => r.token_status === 'recorded').sort(sortValue).slice(0, 32);
  const selected = new Map([...pretoken, ...benchmarks].map((r) => [r.slug, r]));
  for (const slug of watch) {
    const row = enriched.find((r) => r.slug === slug);
    if (row) selected.set(slug, row);
  }
  return [...selected.values()].sort(sortValue).map((r, i) => ({ ...r, rank: i + 1 }));
}

function sortValue(a: RadarRow, b: RadarRow): number {
  return b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug, 'en');
}
