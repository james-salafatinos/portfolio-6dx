/**
 * Fetch → normalize → Statement.
 * Live: same-origin GET /api/financials/:ticker (server proxies Fin-node).
 * Any fail → bundled demo + Demo badge.
 */

/** Bundled AAPL-like annual snapshot (illustrative, not live). */
export const DEMO_STATEMENT = {
  source: 'demo',
  asOf: '2025-09-30',
  ticker: 'DEMO',
  income: {
    revenue: 416_161_000_000,
    cogs: 220_960_000_000,
    opex: 62_151_000_000,
    operatingIncome: 133_050_000_000,
  },
  balance: {
    cash: 35_934_000_000,
    ar: 72_957_000_000,
    inventory: 5_718_000_000,
    debt: 112_377_000_000,
  },
};

function isLiveStatement(payload) {
  return (
    payload &&
    payload.source === 'live' &&
    payload.income &&
    Number(payload.income.revenue) > 0 &&
    payload.balance
  );
}

async function tryProxy(ticker) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`/api/financials/${encodeURIComponent(ticker)}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!isLiveStatement(payload)) throw new Error('Invalid live payload');
    return {
      source: 'live',
      asOf: payload.asOf || null,
      ticker: payload.ticker || ticker,
      income: {
        revenue: Number(payload.income.revenue) || 0,
        cogs: Number(payload.income.cogs) || 0,
        opex: Number(payload.income.opex) || 0,
        operatingIncome: Number(payload.income.operatingIncome) || 0,
      },
      balance: {
        cash: Number(payload.balance.cash) || 0,
        ar: Number(payload.balance.ar) || 0,
        inventory: Number(payload.balance.inventory) || 0,
        debt: Number(payload.balance.debt) || 0,
      },
    };
  } finally {
    clearTimeout(t);
  }
}

export const DataAdapter = {
  /**
   * @param {string} ticker
   * @returns {Promise<{source:'live'|'demo', asOf:string|null, ticker:string, income:object, balance:object}>}
   */
  async load(ticker) {
    const cleaned = String(ticker || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.\-]/g, '');
    if (!cleaned) {
      return { ...DEMO_STATEMENT, ticker: 'DEMO' };
    }

    try {
      return await tryProxy(cleaned);
    } catch {
      return {
        ...DEMO_STATEMENT,
        ticker: cleaned,
        source: 'demo',
      };
    }
  },
};
