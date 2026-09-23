/**
 * Pure mapping: statement → journey shares + reservoir levels. No DOM.
 */

const FLOOR = 0.06; // min visual fill for zero / near-zero tanks

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmtPct(share) {
  return `${(share * 100).toFixed(1)}%`;
}

function fmtMoney(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export const Model = {
  /**
   * @param {object} statement from DataAdapter
   * @returns {{ shares, levels, labels, meta }}
   */
  from(statement) {
    const rev = Number(statement?.income?.revenue) || 0;
    const cogs = Number(statement?.income?.cogs) || 0;
    const opex = Number(statement?.income?.opex) || 0;

    let cogsShare = 0;
    let opexShare = 0;
    if (rev > 0) {
      cogsShare = clamp01(cogs / rev);
      opexShare = clamp01(opex / rev);
    }
    // Keep residual non-negative; if COGS+OpEx overrun rev, shrink opex visually last.
    if (cogsShare + opexShare > 1) {
      opexShare = Math.max(0, 1 - cogsShare);
    }
    const residualShare = Math.max(0, 1 - cogsShare - opexShare);

    const cash = Math.max(0, Number(statement?.balance?.cash) || 0);
    const ar = Math.max(0, Number(statement?.balance?.ar) || 0);
    const inventory = Math.max(0, Number(statement?.balance?.inventory) || 0);
    const debt = Math.max(0, Number(statement?.balance?.debt) || 0);
    const peak = Math.max(cash, ar, inventory, debt, 1);

    const height = (v) => (v <= 0 ? FLOOR : Math.max(FLOOR, clamp01(v / peak)));

    const levels = {
      cash: height(cash),
      ar: height(ar),
      inventory: height(inventory),
      debt: height(debt),
    };

    const shares = { cogsShare, opexShare, residualShare };

    const labels = {
      ticker: statement?.ticker || '',
      source: statement?.source || 'demo',
      asOf: statement?.asOf || null,
      revenue: fmtMoney(rev),
      cogs: `${fmtMoney(cogs)} · ${fmtPct(cogsShare)}`,
      opex: `${fmtMoney(opex)} · ${fmtPct(opexShare)}`,
      residual: `${fmtPct(residualShare)} of revenue (after COGS+OpEx)`,
      residualNote: 'Residual ≠ cash in pocket',
      cash: fmtMoney(cash),
      ar: fmtMoney(ar),
      inventory: fmtMoney(inventory),
      debt: fmtMoney(debt),
      journey: [
        { key: 'cogs', title: 'COGS', share: cogsShare },
        { key: 'opex', title: 'OpEx', share: opexShare },
        { key: 'residual', title: 'Residual', share: residualShare },
      ],
      tanks: [
        { key: 'cash', title: 'Cash', value: cash },
        { key: 'ar', title: 'AR', value: ar },
        { key: 'inventory', title: 'Inventory', value: inventory },
        { key: 'debt', title: 'Debt', value: debt },
      ],
    };

    return { shares, levels, labels, meta: { revenue: rev, cogs, opex, cash, ar, inventory, debt } };
  },
};
