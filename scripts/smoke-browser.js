// Loads the homepage and every experiment in a real browser and fails on
// console errors, page errors, or a suspiciously empty root. This catches
// the class of bug an HTTP smoke test can't: valid HTML that then fails to
// execute in the browser (e.g. a bad ES module import).
const fs = require('fs');
const { chromium } = require('playwright');
const { createApp } = require('../server/server');
const { discoverExperiments } = require('../platform/discovery');

// Some sandboxes pre-install a Chromium build under a fixed path that may not
// match this repo's pinned Playwright version. Prefer it when present instead
// of triggering a browser download; CI installs a matching build via
// `npx playwright install` and uses the default lookup.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(PREINSTALLED_CHROMIUM)
  ? { executablePath: PREINSTALLED_CHROMIUM }
  : {};

async function main() {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const browser = await chromium.launch(launchOptions);
  const failures = [];

  const routes = ['/', ...discoverExperiments().map((x) => `/x/${x.slug}`)];

  for (const route of routes) {
    const page = await browser.newPage();
    const issues = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') issues.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));

    await page.goto(base + route, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);

    if (route !== '/') {
      const errorBox = await page.evaluate(() => {
        const box = document.querySelector('#experiment-error');
        return box && !box.hidden ? box.textContent : null;
      });
      if (errorBox) issues.push(`experiment reported failure: ${errorBox}`);
    }

    if (issues.length) failures.push({ route, issues });
    await page.close();
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.error('Browser smoke test failed:');
    for (const { route, issues } of failures) {
      console.error(`  ${route}`);
      for (const issue of issues) console.error(`    - ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Browser smoke test passed for ${routes.length} route(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
