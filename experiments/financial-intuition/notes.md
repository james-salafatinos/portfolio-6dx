# Financial Intuition

One-screen **stocks & flows**: a dollar of revenue splits into COGS, OpEx, and residual; balance-sheet tanks show cash, AR, inventory, and debt.

## Idea

Income statement ≈ **flows**. Balance sheet ≈ **stocks** (reservoirs). Replay `$1` to watch the split; reservoirs are scaled relative to each other — not dollars-per-pixel truth.

Residual is labeled honestly: leftover after COGS + OpEx on the statement snapshot — **not** “cash in pocket.” Working capital and financing sit in the tanks below.

## Data

`DataAdapter` tries a **best-effort live** public fundamentals fetch (Alpha Vantage income + balance, CORS-friendly `apikey=demo`). That demo key typically returns full statements for **IBM** only; other tickers (or any network/CORS/parse failure) fall back to a bundled demo statement with a persistent **Demo — not live** badge. No server proxy — live is opportunistic, demo is the reliable path.

## Phone

HUD stacks; journey ~55% / reservoirs ~45%. Keep Replay taps large. Dense labels may truncate on narrow widths — shares still animate.
