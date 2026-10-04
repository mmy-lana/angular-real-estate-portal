/**
 * Headless Chrome verification harness for the Real Estate Multi-Tenant Portal.
 *
 * Boots a headless Chrome instance against the production build served by
 * `vite preview`, executes a declarative scenario suite, and fails the process
 * when any assertion fails or the page emits runtime/console errors.
 *
 * The browser is launched with an isolated throw-away profile inside the
 * project workspace, so no user browser session is ever touched.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const previewPort = Number(process.env['VERIFY_PORT'] ?? 4301);
const baseUrl = `http://127.0.0.1:${previewPort}`;
const profileDir = resolve(projectRoot, '.verify-profile');

const CHROME_CANDIDATES = [
  process.env['CHROME_PATH'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

function resolveChromeBinary() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`No Chrome executable found. Checked:\n${CHROME_CANDIDATES.join('\n')}`);
  }
  return found;
}

function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveReady, rejectReady) => {
    const attempt = async () => {
      try {
        const response = await fetch(url, { redirect: 'manual' });
        if (response.status < 500) {
          resolveReady();
          return;
        }
      } catch {
        /* server not up yet */
      }
      if (Date.now() > deadline) {
        rejectReady(new Error(`Preview server did not become ready at ${url}`));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

const VIEWPORTS = {
  'w360': { width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'w390': { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'w430': { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'w768': { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'w1024': { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  'w1440': { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
};

const results = [];
let failures = 0;

function record(scenario, name, ok, detail = '') {
  results.push({ scenario, name, ok, detail });
  if (!ok) {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function assert(scenario, name, condition, detail = '') {
  record(scenario, name, Boolean(condition), detail);
}

function attachErrorCollectors(page, sink) {
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') {
      const text = message.text();
      if (text.includes('Download the Angular DevTools')) return;
      sink.console.push(`[${type}] ${text}`);
    }
  });
  page.on('pageerror', (error) => sink.pageErrors.push(error.message));
}

/**
 * Deterministic offline environment: local app assets load from the preview
 * server, every third-party asset is served a 1x1 transparent PNG, and anything
 * else is aborted. Keeps verification hermetic and fast.
 */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

async function installNetworkStub(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(baseUrl) || url.startsWith('data:') || url.startsWith('blob:')) {
      void request.continue();
      return;
    }
    if (request.resourceType() === 'image' || url.includes('fonts.g')) {
      void request.respond({
        status: 200,
        contentType: 'image/png',
        headers: { 'cache-control': 'no-store' },
        body: TRANSPARENT_PNG
      });
      return;
    }
    void request.abort();
  });
}

async function gotoAndSettle(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => document.querySelector('app-root')?.children.length > 0, {
    timeout: 20_000
  });
}

async function run() {
  if (!existsSync(resolve(projectRoot, 'dist', 'index.html'))) {
    throw new Error('dist/index.html missing — run `pnpm run build` before verification.');
  }

  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });

  const preview = spawn(
    process.execPath,
    [resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(previewPort), '--host', '127.0.0.1', '--strictPort'],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  preview.stdout.on('data', () => {});
  preview.stderr.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`));

  let browser;
  try {
    await waitForServer(`${baseUrl}/`);
    browser = await puppeteer.launch({
      executablePath: resolveChromeBinary(),
      headless: true,
      userDataDir: profileDir,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--window-size=1440,900',
        '--hide-scrollbars'
      ]
    });

    const page = await browser.newPage();
    const errors = { console: [], pageErrors: [], requestFailures: [] };
    attachErrorCollectors(page, errors);
    await installNetworkStub(page);

    // ---------------------------------------------------------------- routing
    console.log('\n[phase] routing & tenant resolution');

    await page.setViewport(VIEWPORTS['w1440']);
    await gotoAndSettle(page, '/');
    await page.waitForFunction(
      () => location.pathname === '/t/atelier-living' || location.pathname.startsWith('/t/'),
      { timeout: 20_000 }
    );
    record('routing', 'root redirects into a tenant scope', true);

    await gotoAndSettle(page, '/t/atelier-living');
    const atelierName = await page.$eval('app-tenant-shell', (el) => el.textContent ?? '').catch(() => '');
    assert('routing', 'atelier tenant shell renders', atelierName.includes('Atelier Living'), atelierName.slice(0, 120));

    const themePrimary = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--color-brand-primary').trim()
    );
    assert('routing', 'atelier brand tokens applied to :root', themePrimary !== '', `primary=${themePrimary}`);

    await gotoAndSettle(page, '/t/monolith-properties');
    const monolithTheme = await page.evaluate(() => ({
      primary: document.documentElement.style.getPropertyValue('--color-brand-primary').trim(),
      radius: document.documentElement.style.getPropertyValue('--radius-brand').trim(),
      text: document.body.textContent ?? ''
    }));
    assert(
      'routing',
      'monolith tenant swaps brand tokens',
      monolithTheme.primary.toLowerCase() === '#111213',
      JSON.stringify(monolithTheme.primary)
    );
    assert('routing', 'monolith tenant content renders', monolithTheme.text.includes('Monolith'));

    await gotoAndSettle(page, '/404');
    const notFoundText = await page.evaluate(() => document.body.textContent ?? '');
    assert('routing', '/404 renders explicit not-found state', notFoundText.includes('Location Not Found'));

    await gotoAndSettle(page, '/t/does-not-exist');
    await page
      .waitForFunction(() => location.pathname === '/404', { timeout: 20_000 })
      .catch(() => undefined);
    const unknownTenantUrl = page.url();
    assert('routing', 'unknown tenant slug lands on /404', unknownTenantUrl.endsWith('/404'), unknownTenantUrl);

    // ------------------------------------------------------------ data layer
    console.log('\n[phase] indexeddb tenant isolation');

    const dbProbe = await page.evaluate(async () => {
      const open = () =>
        new Promise((resolveDb, rejectDb) => {
          const request = indexedDB.open('real_estate_portal_db');
          request.onsuccess = () => resolveDb(request.result);
          request.onerror = () => rejectDb(request.error);
        });
      const db = await open();
      const names = Array.from(db.objectStoreNames);
      const counts = {};
      for (const name of names) {
        counts[name] = await new Promise((resolveCount) => {
          const request = db.transaction(name, 'readonly').objectStore(name).count();
          request.onsuccess = () => resolveCount(request.result);
        });
      }
      const tenants = await new Promise((resolveAll) => {
        const request = db.transaction('tenants', 'readonly').objectStore('tenants').getAll();
        request.onsuccess = () => resolveAll(request.result);
      });
      const properties = await new Promise((resolveAll) => {
        const request = db.transaction('properties', 'readonly').objectStore('properties').getAll();
        request.onsuccess = () => resolveAll(request.result);
      });
      return {
        names,
        counts,
        tenantSlugs: tenants.map((tenant) => tenant.slug),
        propertyTenants: properties.map((property) => property.tenantId),
        scriptedSvg: properties.some((property) =>
          property.floorPlans.some((level) => /<script|\son\w+\s*=/i.test(level.svgContent))
        )
      };
    });

    assert(
      'storage',
      'all four object stores exist',
      ['tenants', 'properties', 'agents', 'bookings'].every((store) => dbProbe.names.includes(store)),
      dbProbe.names.join(',')
    );
    assert('storage', 'two seeded tenants', dbProbe.tenantSlugs.length >= 2, dbProbe.tenantSlugs.join(','));
    assert(
      'storage',
      'properties are seeded per tenant',
      dbProbe.counts['properties'] >= 4,
      `properties=${dbProbe.counts['properties']}`
    );
    assert(
      'storage',
      'seeded floorplan svg carries no script/inline handlers',
      dbProbe.scriptedSvg === false
    );

    // ------------------------------------------------------------ responsive
    console.log('\n[phase] responsive shell');

    const touchTargetFailures = [];
    for (const [label, viewport] of Object.entries(VIEWPORTS)) {
      await page.setViewport(viewport);
      await gotoAndSettle(page, '/t/atelier-living');
      await page.waitForSelector('app-property-catalog', { timeout: 20_000 });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      assert(
        'responsive',
        `${label} has no horizontal overflow`,
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `scroll=${overflow.scrollWidth} client=${overflow.clientWidth}`
      );

      const smallTargets = await page.evaluate(() => {
        const selector = 'button, a[href], [role="button"], input, select, [tabindex]:not([tabindex="-1"])';
        const offenders = [];
        for (const element of document.querySelectorAll(selector)) {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const style = getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if (rect.height < 44 || rect.width < 44) {
            offenders.push(
              `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
            );
          }
        }
        return offenders;
      });
      if (smallTargets.length > 0) {
        touchTargetFailures.push(`${label}: ${smallTargets.slice(0, 4).join(' | ')}`);
      }
    }
    assert('responsive', 'interactive elements meet 44px touch targets', touchTargetFailures.length === 0, touchTargetFailures.join(' ; '));

    // -------------------------------------------------------------- errors
    console.log('\n[phase] runtime health');
    assert('runtime', 'no uncaught page errors', errors.pageErrors.length === 0, errors.pageErrors.join(' | '));
    assert('runtime', 'no console errors', errors.console.length === 0, errors.console.slice(0, 5).join(' | '));
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
    rmSync(profileDir, { recursive: true, force: true });
  }

  const passed = results.filter((entry) => entry.ok).length;
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${passed}/${results.length} checks passed`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('Verification harness crashed:', error);
  process.exitCode = 1;
});