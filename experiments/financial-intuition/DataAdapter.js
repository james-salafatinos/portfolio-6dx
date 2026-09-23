/**
 * Fetch → normalize → Statement.
 * Live: Alpha Vantage (CORS *). Demo key is reliable for IBM; anything else → demo.
 */

const AV_KEY = 'demo';
const AV_BASE = 'https://www.alphavantage.co/query';

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

function num(v) {
  if (v == null || v === 'None' || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalize(ticker, source, asOf, incomeRaw, balanceRaw) {
  const revenue = num(incomeRaw.totalRevenue ?? incomeRaw.revenue);
  const cogs = num(
    incomeRaw.costOfRevenue ??
      incomeRaw.costofGoodsAndServicesSold ??
      incomeRaw.cogs,
  );
  let opex = num(incomeRaw.operatingExpenses ?? incomeRaw.opex);
  if (!opex) {
    opex =
      num(incomeRaw.sellingGeneralAndAdministrative) +
      num(incomeRaw.researchAndDevelopment);
  }
  const operatingIncome = num(incomeRaw.operatingIncome);
  if (!opex && revenue) {
    opex = Math.max(0, revenue - cogs - operatingIncome);
  }

  const cash = num(
    balanceRaw.cashAndCashEquivalentsAtCarryingValue ??
      balanceRaw.cash ??
      balanceRaw.cashAndShortTermInvestments,
  );
  const ar = num(
    balanceRaw.currentNetReceivables ??
      balanceRaw.netReceivables ??
      balanceRaw.accountsReceivable,
  );
  const inventory = num(balanceRaw.inventory);
  let debt = num(balanceRaw.shortLongTermDebtTotal);
  if (!debt) {
    debt = num(balanceRaw.shortTermDebt) + num(balanceRaw.longTermDebt);
  }

  return {
    source,
    asOf: asOf || null,
    ticker,
    income: { revenue, cogs, opex, operatingIncome },
    balance: { cash, ar, inventory, debt },
  };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function tryAlphaVantage(ticker) {
  const incomeUrl = `${AV_BASE}?function=INCOME_STATEMENT&symbol=${encodeURIComponent(ticker)}&apikey=${AV_KEY}`;
  const balanceUrl = `${AV_BASE}?function=BALANCE_SHEET&symbol=${encodeURIComponent(ticker)}&apikey=${AV_KEY}`;
  const [incomePayload, balancePayload] = await Promise.all([
    fetchJson(incomeUrl),
    fetchJson(balanceUrl),
  ]);

  if (incomePayload?.Note || incomePayload?.Information || incomePayload?.['Error Message']) {
    throw new Error(incomePayload.Note || incomePayload.Information || incomePayload['Error Message']);
  }
  if (balancePayload?.Note || balancePayload?.Information || balancePayload?.['Error Message']) {
    throw new Error(balancePayload.Note || balancePayload.Information || balancePayload['Error Message']);
  }

  const incomeReports = incomePayload?.annualReports;
  const balanceReports = balancePayload?.annualReports;
  if (!Array.isArray(incomeReports) || !incomeReports.length) {
    throw new Error('No income annualReports');
  }
  if (!Array.isArray(balanceReports) || !balanceReports.length) {
    throw new Error('No balance annualReports');
  }

  const incomeRaw = incomeReports[0];
  const balanceRaw = balanceReports[0];
  const asOf = incomeRaw.fiscalDateEnding || balanceRaw.fiscalDateEnding || null;
  return normalize(ticker, 'live', asOf, incomeRaw, balanceRaw);
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
      return await tryAlphaVantage(cleaned);
    } catch {
      return {
        ...DEMO_STATEMENT,
        ticker: cleaned,
        source: 'demo',
      };
    }
  },
};
