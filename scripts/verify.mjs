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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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

/**
 * Static contract check against the compiled stylesheet: the dual-thumb slider
 * must isolate touch on `.slider-track` and never on `:host`.
 */
function readBuiltCssContract(assetsDir) {
  // Component styles are inlined into the component definition by the Angular
  // build, so the contract is asserted across both stylesheets and JS chunks.
  const files = readdirSync(assetsDir).filter((name) => name.endsWith('.css') || name.endsWith('.js'));
  const source = files.map((name) => readFileSync(resolve(assetsDir, name), 'utf8')).join('\n');
  return {
    files: files.length,
    hasBrandUtility: source.includes('--color-brand-bg'),
    hasTrackTouchRule: /\.slider-track[^{]*\{[^}]*touch-action:\s*none/.test(source),
    hostTouchRule: /:host[^{]*\{[^}]*touch-action/.test(source)
  };
}

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
  page.on('response', (response) => {
    if (response.status() >= 400) {
      sink.requestFailures.push(`${response.status()} ${response.url()}`);
    }
  });
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

/**
 * Clicks an element handle after an instant scroll-into-view.
 *
 * The stylesheet enables `scroll-behavior: smooth`, so a naive click on an
 * off-screen element dispatches at pre-scroll coordinates and misses the target.
 */
async function clickElement(page, handle) {
  await handle.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await new Promise((done) => setTimeout(done, 150));
  const point = await handle.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return null;
    }
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  if (!point) {
    throw new Error('clickElement: target is outside the viewport');
  }
  await page.mouse.click(point.x, point.y);
}

/**
 * Injected into every page so storage probes can run inside the application
 * origin — the harness cannot open IndexedDB from Node.
 */
const STORAGE_HELPERS = `
window.openPortalDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('real_estate_portal_db');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
window.readAll = (db, store) =>
  new Promise((resolve) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
  });
window.writeRecord = (db, store, record) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
window.probeStoreCounts = async () => {
  const db = await window.openPortalDb();
  const counts = {};
  for (const name of ['tenants', 'agents', 'properties', 'bookings']) {
    counts[name] = await new Promise((resolve) => {
      const request = db.transaction(name, 'readonly').objectStore(name).count();
      request.onsuccess = () => resolve(request.result);
    });
  }
  return { ...counts, expectedAgents: 4, expectedProperties: 7 };
};
`;

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
    await page.evaluateOnNewDocument(STORAGE_HELPERS);

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
    assert(
      'routing',
      '/404 renders explicit not-found state',
      /location not found/i.test(notFoundText) && notFoundText.includes('404'),
      notFoundText.replace(/\s+/g, ' ').slice(0, 120)
    );

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

    // -------------------------------------------------------- ui primitives
    console.log('\n[phase] atomic ui primitives');

    await page.setViewport(VIEWPORTS['w390']);
    await gotoAndSettle(page, '/preview/components');
    await page.waitForSelector('ui-button', { timeout: 20_000 });

    const buttonCount = await page.$$eval('ui-button button', (nodes) => nodes.length);
    assert('primitives', 'button variants render', buttonCount >= 6, `count=${buttonCount}`);

    const primaryButton = await page.$('ui-button button');
    await clickElement(page, primaryButton);
    await page
      .waitForFunction(
        () => (document.querySelector('[data-testid="button-log"]')?.textContent ?? '').includes('primary@'),
        { timeout: 5000 }
      )
      .catch(() => undefined);
    const buttonLog = await page.$eval('[data-testid="button-log"]', (el) => el.textContent ?? '');
    assert('primitives', 'button emits activation event', buttonLog.includes('primary@'), buttonLog.trim());

    await page.type('ui-input input', 'Elena');
    const typedValue = await page.$eval('ui-input input', (el) => el.value);
    assert('primitives', 'input accepts and reports text', typedValue === 'Elena', typedValue);

    const inputAria = await page.$$eval('ui-input input', (nodes) =>
      nodes.map((node) => ({
        id: node.id,
        labelled: Boolean(document.querySelector(`label[for="${node.id}"]`)),
        described: node.getAttribute('aria-describedby'),
        height: Math.round(node.getBoundingClientRect().height)
      }))
    );
    assert(
      'primitives',
      'inputs are labelled and touch sized',
      inputAria.every((entry) => entry.labelled && entry.height >= 44),
      JSON.stringify(inputAria)
    );

    await page.type('ui-input input[type="email"]', 'not-an-email');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const emailState = await page.evaluate(() => {
      const field = document.querySelector('ui-input input[type="email"]');
      const describedBy = field?.getAttribute('aria-describedby') ?? '';
      const message = describedBy ? document.getElementById(describedBy)?.textContent ?? '' : '';
      return {
        invalid: field?.getAttribute('aria-invalid'),
        message
      };
    });
    assert(
      'primitives',
      'invalid input exposes aria-invalid and an alert message',
      emailState.invalid === 'true' && emailState.message.toLowerCase().includes('valid email'),
      JSON.stringify(emailState)
    );

    const selectValue = await page.$eval('ui-select select', (el) => el.value);
    assert('primitives', 'select holds its bound value', selectValue === 'date_desc', selectValue);

    const sliderState = await page.evaluate(() => {
      const host = document.querySelector('ui-range-slider');
      const track = host?.querySelector('.slider-track');
      const hostStyle = host ? getComputedStyle(host) : null;
      const trackStyle = track ? getComputedStyle(track) : null;
      const thumbs = Array.from(host?.querySelectorAll('.slider-thumb') ?? []);
      return {
        hostTouchAction: hostStyle?.touchAction ?? null,
        trackTouchAction: trackStyle?.touchAction ?? null,
        thumbCount: thumbs.length,
        roles: thumbs.map((thumb) => thumb.getAttribute('role')),
        values: thumbs.map((thumb) => thumb.getAttribute('aria-valuenow')),
        height: track ? Math.round(track.getBoundingClientRect().height) : 0
      };
    });
    assert(
      'primitives',
      'touch-action is isolated on the inner track, never on the host',
      sliderState.trackTouchAction === 'none' && sliderState.hostTouchAction !== 'none',
      JSON.stringify(sliderState)
    );
    assert(
      'primitives',
      'range slider exposes two ARIA slider thumbs',
      sliderState.thumbCount === 2 && sliderState.roles.every((role) => role === 'slider'),
      JSON.stringify(sliderState)
    );

    await page.evaluate(() => {
      const thumb = document.querySelectorAll('ui-range-slider .slider-thumb')[0];
      thumb.focus();
    });
    await page.keyboard.press('ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const keyboardRange = await page.$eval('[data-testid="range-log"]', (el) => el.textContent ?? '');
    assert('primitives', 'slider thumb responds to keyboard', /250,000/.test(keyboardRange), keyboardRange.trim());

    const sheetButtons = await page.$$('ui-button button');
    let sheetButton = null;
    for (const candidate of sheetButtons) {
      const text = await candidate.evaluate((node) => node.textContent ?? '');
      if (text.includes('Open bottom sheet')) {
        sheetButton = candidate;
        break;
      }
    }
    await clickElement(page, sheetButton);
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    const sheetState = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const surface = dialog?.querySelector('.sheet-surface');
      const active = document.activeElement;
      return {
        modal: dialog?.getAttribute('aria-modal'),
        maxHeightVar: getComputedStyle(document.documentElement).getPropertyValue('--sheet-max-height').trim(),
        overflowLocked: document.body.style.overflow,
        focusInside: Boolean(active && dialog?.contains(active)),
        sheetHeight: surface ? Math.round(surface.getBoundingClientRect().height) : 0,
        viewportHeight: window.innerHeight
      };
    });
    assert('primitives', 'sheet modal opens as a modal dialog', sheetState.modal === 'true', JSON.stringify(sheetState));
    assert(
      'primitives',
      'sheet max height tracks the visual viewport',
      sheetState.maxHeightVar.endsWith('px') && sheetState.sheetHeight <= sheetState.viewportHeight,
      JSON.stringify(sheetState)
    );
    assert(
      'primitives',
      'opening the sheet locks page scroll and moves focus inside',
      sheetState.overflowLocked === 'hidden' && sheetState.focusInside,
      JSON.stringify(sheetState)
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, { timeout: 10_000 });
    assert('primitives', 'escape closes the sheet modal', true);

    const sheetViewportBehavior = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog === null;
    });
    assert('primitives', 'sheet is removed from the DOM after close', sheetViewportBehavior);

    const cssContract = readBuiltCssContract(resolve(projectRoot, 'dist', 'assets'));
    assert('primitives', 'brand theme utilities are compiled', cssContract.hasBrandUtility);
    assert(
      'primitives',
      'stylesheet declares touch-action on the track rule only',
      cssContract.hasTrackTouchRule && !cssContract.hostTouchRule,
      JSON.stringify(cssContract)
    );

    // -------------------------------------------------------------- molecules
    console.log('\n[phase] compound molecules');

    await gotoAndSettle(page, '/preview/components');
    await page.waitForSelector('app-property-card article', { timeout: 20_000 });

    const cardMetrics = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('app-property-card article'));
      return {
        count: cards.length,
        details: cards.map((card) => {
          const media = card.querySelector('.aspect-\\[4\\/3\\]');
          const specsRow = Array.from(card.querySelectorAll('li')).map((li) => li.textContent?.trim() ?? '');
          const action = card.querySelector('a, button');
          const actionRect = action?.getBoundingClientRect();
          return {
            mediaAspect: media ? media.getBoundingClientRect().height / media.getBoundingClientRect().width : 0,
            specsRow,
            overflow: card.scrollWidth - card.clientWidth,
            actionHeight: actionRect ? Math.round(actionRect.height) : 0,
            actionWidth: actionRect ? Math.round(actionRect.width) : 0,
            truncated: Array.from(card.querySelectorAll('p, li, h3')).every(
              (node) => node.scrollWidth <= node.clientWidth + 1 || node.className.includes('truncate')
            )
          };
        })
      };
    });
    assert('molecules', 'property cards render for the tenant', cardMetrics.count >= 2, `count=${cardMetrics.count}`);
    assert(
      'molecules',
      'card photography keeps a 4:3 aspect ratio',
      cardMetrics.details.every((card) => Math.abs(card.mediaAspect - 0.75) < 0.02),
      JSON.stringify(cardMetrics.details.map((card) => card.mediaAspect))
    );
    assert(
      'molecules',
      'card specs rows never overflow their track',
      cardMetrics.details.every((card) => card.overflow <= 1),
      JSON.stringify(cardMetrics.details.map((card) => card.overflow))
    );
    assert(
      'molecules',
      'card action is touch sized',
      cardMetrics.details.every((card) => card.actionHeight >= 44 && card.actionWidth >= 44),
      JSON.stringify(cardMetrics.details.map((card) => `${card.actionWidth}x${card.actionHeight}`))
    );

    const readArchitectLine = async (viewportKey) => {
      await page.setViewport(VIEWPORTS[viewportKey]);
      await new Promise((done) => setTimeout(done, 200));
      return page.evaluate(() => {
        const card = document.querySelector('app-property-card article');
        const line = Array.from(card?.querySelectorAll('p') ?? []).find((node) =>
          node.textContent?.trimStart().startsWith('Architect:')
        );
        if (!line) {
          return null;
        }
        return {
          display: getComputedStyle(line).display,
          overflow: line.scrollWidth - line.clientWidth
        };
      });
    };
    const architectSmall = await readArchitectLine('w360');
    const architectStandard = await readArchitectLine('w390');
    assert(
      'molecules',
      'architect credit is dropped below 390px and restored at 390px',
      architectSmall !== null &&
        architectSmall.display === 'none' &&
        architectStandard !== null &&
        architectStandard.display !== 'none' &&
        architectStandard.overflow <= 1,
      JSON.stringify({ architectSmall, architectStandard })
    );
    await page.setViewport(VIEWPORTS['w390']);

    const cardAction = await page.$('app-property-card article a, app-property-card article button');
    await clickElement(page, cardAction);
    await page
      .waitForFunction(
        () => (document.querySelector('[data-testid="card-log"]')?.textContent ?? '').includes('the-'),
        { timeout: 5000 }
      )
      .catch(() => undefined);
    const cardLog = await page.$eval('[data-testid="card-log"]', (el) => el.textContent ?? '');
    assert('molecules', 'property card emits the selected slug', /Selected residence: (?!none)\S+/.test(cardLog), cardLog.trim());

    const galleryMetrics = await page.evaluate(() => {
      const gallery = document.querySelector('app-architectural-gallery');
      const figures = gallery?.querySelectorAll('figure') ?? [];
      const thumbs = gallery?.querySelectorAll('li button') ?? [];
      return {
        slides: figures.length,
        thumbs: thumbs.length,
        hasExpand: Boolean(gallery?.querySelector('button[aria-label="Open full screen viewer"]')),
        counter: gallery?.querySelector('p')?.textContent?.trim() ?? ''
      };
    });
    assert(
      'molecules',
      'gallery renders one slide per media item with matching thumbnails',
      galleryMetrics.slides === galleryMetrics.thumbs && galleryMetrics.slides >= 2,
      JSON.stringify(galleryMetrics)
    );

    const expandButton = await page.$('app-architectural-gallery button[aria-label="Open full screen viewer"]');
    await clickElement(page, expandButton);
    await page.waitForSelector('.cdk-overlay-container [role="dialog"]', { timeout: 10_000 });
    const lightboxPlacement = await page.evaluate(() => {
      const dialog = document.querySelector('.cdk-overlay-container [role="dialog"]');
      const container = document.querySelector('.cdk-overlay-container');
      return {
        inOverlayContainer: Boolean(container && dialog && container.contains(dialog)),
        parentIsBody: dialog?.parentElement?.parentElement?.parentElement === document.body,
        modal: dialog?.getAttribute('aria-modal')
      };
    });
    assert(
      'molecules',
      'lightbox is portalled to a body-level overlay container',
      lightboxPlacement.inOverlayContainer && lightboxPlacement.modal === 'true',
      JSON.stringify(lightboxPlacement)
    );

    await page.keyboard.press('ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const lightboxNext = await page.evaluate(
      () => document.querySelector('.cdk-overlay-container [role="dialog"] header span')?.textContent?.trim() ?? ''
    );
    assert('molecules', 'lightbox supports keyboard navigation', lightboxNext === '2 / 3', lightboxNext);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, { timeout: 10_000 });
    assert('molecules', 'escape dismisses the lightbox overlay', true);

    const galleryIndexAfterClose = await page.$eval('[data-testid="gallery-log"]', (el) => el.textContent ?? '');
    assert('molecules', 'gallery index follows lightbox navigation', galleryIndexAfterClose.includes('2'), galleryIndexAfterClose.trim());

    // Inline facets are a desktop affordance; below md they collapse into the
    // drawer trigger, so the two are exercised at their own breakpoints.
    await page.setViewport(VIEWPORTS['w1024']);
    await new Promise((done) => setTimeout(done, 250));
    const filterMetrics = await page.evaluate(() => {
      const bar = document.querySelector('app-property-filter-bar');
      const sticky = bar?.querySelector('.sticky');
      const search = bar?.querySelector('input[type="search"]');
      const facetRow = Array.from(bar?.querySelectorAll('div') ?? []).find((node) =>
        node.className.includes('md:flex')
      );
      return {
        stickyPosition: sticky ? getComputedStyle(sticky).position : null,
        hasSearch: Boolean(search),
        facetButtons: facetRow?.querySelectorAll('[aria-pressed]').length ?? 0,
        facetRowVisible: facetRow ? getComputedStyle(facetRow).display !== 'none' : false,
        drawerTriggerVisible: Boolean(bar?.querySelector('button[aria-label="Open filters"]'))
      };
    });
    assert(
      'molecules',
      'filter bar is sticky with search and type facets',
      filterMetrics.stickyPosition === 'sticky' &&
        filterMetrics.hasSearch &&
        filterMetrics.facetRowVisible &&
        filterMetrics.facetButtons >= 5,
      JSON.stringify(filterMetrics)
    );

    const facetPressedBefore = await page.$eval(
      'app-property-filter-bar [aria-pressed]',
      (el) => el.getAttribute('aria-pressed')
    );
    const facetButton = await page.$('app-property-filter-bar [aria-pressed]');
    await clickElement(page, facetButton);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const filterLog = await page.$eval('[data-testid="filter-log"]', (el) => el.textContent ?? '');
    assert(
      'molecules',
      'type facet toggles and emits new criteria',
      facetPressedBefore !== filterLog.includes('Active types: 1'),
      `${facetPressedBefore} | ${filterLog.trim()}`
    );

    await page.setViewport(VIEWPORTS['w390']);
    await new Promise((done) => setTimeout(done, 250));
    const drawerTrigger = await page.$('app-property-filter-bar button[aria-label="Open filters"]');
    await clickElement(page, drawerTrigger);
    await page.waitForSelector('app-property-filter-drawer [role="dialog"]', { timeout: 10_000 });
    const drawerState = await page.evaluate(() => {
      const sheet = document.querySelector('app-property-filter-drawer [role="dialog"]');
      const rect = sheet?.getBoundingClientRect();
      return {
        bottomAnchored: rect ? Math.abs(window.innerHeight - rect.bottom) < 2 : false,
        rect: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) } : null,
        innerHeight: window.innerHeight,
        scrollY: Math.round(window.scrollY),
        wrapperAlign: sheet?.parentElement ? getComputedStyle(sheet.parentElement).alignItems : null,
        hasRange: Boolean(sheet?.querySelector('ui-range-slider')),
        hasTypes: sheet?.querySelectorAll('[aria-pressed]').length ?? 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert(
      'molecules',
      'mobile filter drawer is a bottom sheet with full facets',
      drawerState.bottomAnchored && drawerState.hasRange && drawerState.hasTypes >= 10 && drawerState.overflow <= 1,
      JSON.stringify(drawerState)
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.querySelector('app-property-filter-drawer [role="dialog"]') === null,
      { timeout: 10_000 }
    );
    assert('molecules', 'filter drawer dismisses with escape', true);

    // ----------------------------------------------------------- features
    console.log('\n[phase] domain features');

    await gotoAndSettle(page, '/preview/components');
    await page.waitForSelector('app-mortgage-calculator', { timeout: 20_000 });

    const mortgageBefore = await page.$eval('[data-testid="monthly-payment"]', (el) => el.textContent?.trim() ?? '');
    await page.evaluate(() => {
      const slider = document.querySelector('#mc-rate');
      slider.value = '9';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((done) => setTimeout(done, 300));
    const mortgageAfter = await page.$eval('[data-testid="monthly-payment"]', (el) => el.textContent?.trim() ?? '');
    assert(
      'features',
      'mortgage payment recalculates when the rate changes',
      mortgageBefore !== mortgageAfter && /\$[\d,]+\.\d{2}/.test(mortgageAfter),
      `${mortgageBefore} -> ${mortgageAfter}`
    );

    const donutState = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="donut-chart"] svg');
      const arcs = Array.from(svg?.querySelectorAll('circle') ?? []);
      return {
        arcs: arcs.length,
        hasDashArray: arcs.slice(1).every((arc) => (arc.getAttribute('stroke-dasharray') ?? '').length > 0)
      };
    });
    assert(
      'features',
      'payment envelope renders an SVG donut breakdown',
      donutState.arcs >= 2 && donutState.hasDashArray,
      JSON.stringify(donutState)
    );

    await page.waitForSelector('app-floor-plan-viewer .floorplan-stage', { timeout: 10_000 });
    const planState = await page.evaluate(() => {
      const viewer = document.querySelector('app-floor-plan-viewer');
      const svg = viewer?.querySelector('.floorplan-stage svg');
      const markers = Array.from(viewer?.querySelectorAll('.floorplan-stage button[aria-label]') ?? []);
      return {
        levels: viewer?.querySelectorAll('[role="group"][aria-label="Floor level"] button').length ?? 0,
        hasSvg: Boolean(svg),
        svgTag: svg?.tagName ?? null,
        markerCount: markers.length,
        markerPositions: markers.map((marker) => `${marker.style.left}/${marker.style.top}`),
        scriptTags: viewer?.querySelectorAll('script').length ?? 0
      };
    });
    assert(
      'features',
      'floor plan renders sanitized inline SVG across multiple levels',
      planState.hasSvg && planState.svgTag === 'svg' && planState.levels >= 2,
      JSON.stringify(planState)
    );
    assert('features', 'floor plan markup carries no script elements', planState.scriptTags === 0, JSON.stringify(planState));
    assert(
      'features',
      'hotspot coordinates are clamped inside the viewport',
      planState.markerPositions.length > 0 &&
        planState.markerPositions.every((position) => {
          const [left, top] = position.split('/').map((value) => Number.parseFloat(value));
          return left >= 0 && left <= 100 && top >= 0 && top <= 100;
        }),
      JSON.stringify(planState.markerPositions)
    );

    const levelButtons = await page.$$('app-floor-plan-viewer [role="group"][aria-label="Floor level"] button');
    await clickElement(page, levelButtons[1]);
    await new Promise((done) => setTimeout(done, 300));
    const switchedLevel = await page.$eval(
      'app-floor-plan-viewer [role="group"][aria-label="Floor level"]',
      (el) => Array.from(el.querySelectorAll('button')).findIndex((button) => button.getAttribute('aria-pressed') === 'true')
    );
    assert('features', 'level switcher activates a different plan', switchedLevel === 1, `active=${switchedLevel}`);

    const zoomLabelBefore = await page.$eval(
      'app-floor-plan-viewer [role="group"][aria-label="Floor level"] ~ div span.editorial-label',
      (el) => el.textContent?.trim()
    ).catch(() => null);
    const zoomInButton = await page.$('app-floor-plan-viewer button[aria-label="Zoom in"]');
    await clickElement(page, zoomInButton);
    await new Promise((done) => setTimeout(done, 250));
    const zoomState = await page.evaluate(() => {
      const stage = document.querySelector('app-floor-plan-viewer .floorplan-stage');
      const surface = stage?.querySelector('[style*="translate3d"]');
      return surface?.getAttribute('style') ?? '';
    });
    assert('features', 'viewer zoom applies a bounded transform', /scale\(1\.[0-9]+\)/.test(zoomState), `${zoomLabelBefore} ${zoomState}`);

    const marker = await page.$('app-floor-plan-viewer .floorplan-stage button[aria-label]');
    await clickElement(page, marker);
    await page.waitForFunction(
      () => !(document.querySelector('[data-testid="hotspot-log"]')?.textContent ?? '').includes('none'),
      { timeout: 5000 }
    );
    const hotspotLog = await page.$eval('[data-testid="hotspot-log"]', (el) => el.textContent ?? '');
    assert('features', 'hotspot selection surfaces its description', !hotspotLog.includes('none'), hotspotLog.trim());

    const tourButtons = await page.$$('app-ui-preview ui-button button');
    for (const candidate of tourButtons) {
      const text = await candidate.evaluate((node) => node.textContent ?? '');
      if (text.includes('Schedule a tour')) {
        await clickElement(page, candidate);
        break;
      }
    }
    await page.waitForSelector('app-schedule-tour-dialog [role="dialog"]', { timeout: 10_000 });

    const emptySubmitButtons = await page.$$('app-schedule-tour-dialog ui-button button');
    await clickElement(page, emptySubmitButtons[emptySubmitButtons.length - 1]);
    await new Promise((done) => setTimeout(done, 300));
    const validationState = await page.evaluate(() => ({
      alerts: document.querySelectorAll('app-schedule-tour-dialog [role="alert"]').length,
      invalidFields: document.querySelectorAll('app-schedule-tour-dialog [aria-invalid="true"]').length
    }));
    assert(
      'features',
      'empty tour submission surfaces field validation',
      validationState.alerts >= 3 && validationState.invalidFields >= 3,
      JSON.stringify(validationState)
    );

    await page.evaluate(() => {
      const setValue = (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const inputs = Array.from(document.querySelectorAll('app-schedule-tour-dialog ui-input input'));
      setValue(inputs[0], 'Elena Rostova');
      setValue(inputs[1], 'elena.rostova@example.com');
      setValue(inputs[2], '+1 415 555 0184');
      const selects = Array.from(document.querySelectorAll('app-schedule-tour-dialog ui-select select'));
      const slotSelect = selects[selects.length - 1];
      const option = Array.from(slotSelect.options).find((entry) => entry.value !== '');
      slotSelect.value = option?.value ?? '';
      slotSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise((done) => setTimeout(done, 300));

    const submitButtons = await page.$$('app-schedule-tour-dialog ui-button button');
    await clickElement(page, submitButtons[submitButtons.length - 1]);
    await page
      .waitForFunction(
        () => Boolean(document.querySelector('app-schedule-tour-dialog [data-testid="booking-confirmation"]')),
        { timeout: 10_000 }
      )
      .catch(() => undefined);

    const bookingState = await page.evaluate(async () => {
      const log = document.querySelector('[data-testid="booking-log"]')?.textContent?.trim() ?? '';
      const confirmation = Boolean(document.querySelector('[data-testid="booking-confirmation"]'));
      const bookings = await new Promise((resolve) => {
        const request = indexedDB.open('real_estate_portal_db');
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('bookings', 'readonly').objectStore('bookings').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => resolve([]);
        };
        request.onerror = () => resolve([]);
      });
      return { log, confirmation, bookings };
    });
    assert(
      'features',
      'valid tour submission persists an agent-verified booking',
      bookingState.confirmation &&
        bookingState.bookings.length === 1 &&
        bookingState.bookings[0].agentIsActive === true &&
        bookingState.log.includes('agent verified'),
      JSON.stringify({ log: bookingState.log, count: bookingState.bookings.length })
    );
    assert(
      'features',
      'booking stays inside the tenant boundary',
      bookingState.bookings.every((booking) => booking.tenantId === 't-1001-atelier'),
      JSON.stringify(bookingState.bookings.map((booking) => booking.tenantId))
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, { timeout: 10_000 });

    // ------------------------------------------------------ tenant switcher
    // --------------------------------------------- security & data invariants
    console.log('\n[phase] security and data invariants');

    await gotoAndSettle(page, '/preview/components');
    await page.waitForSelector('[data-testid="invariants"] ui-button button', { timeout: 20_000 });

    const invariantsRunner = await page.$('[data-testid="invariants"] ui-button button');
    await clickElement(page, invariantsRunner);
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="invariants"] li[data-testid^="invariant-"]').length >= 5,
      { timeout: 20_000 }
    );

    const invariantRows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="invariants"] li[data-testid^="invariant-"]')).map((row) => ({
        key: row.getAttribute('data-testid'),
        text: (row.textContent ?? '').replace(/\s+/g, ' ').trim()
      }))
    );
    const failingInvariants = invariantRows.filter((row) => row.text.includes('!'));
    assert(
      'invariants',
      'every domain invariant passes in the live runtime',
      invariantRows.length >= 5 && failingInvariants.length === 0,
      failingInvariants.map((row) => `${row.key}: ${row.text}`).join(' | ')
    );

    const invariantDetail = (key) => invariantRows.find((row) => row.key === `invariant-${key}`)?.text ?? '';
    const svgInvariant = invariantDetail('svg-sanitizer');
    assert(
      'invariants',
      'SEC-01: adversarial SVG vectors are neutralized by the DOM parser',
      svgInvariant.includes('neutralized') && !/<script|\son\w+=/i.test(svgInvariant),
      svgInvariant.slice(0, 200)
    );
    assert(
      'invariants',
      'FIN-01: payment envelope reconciles and amortization settles',
      invariantDetail('financial-reconciliation').includes('reconcile exactly'),
      invariantDetail('financial-reconciliation').slice(0, 200)
    );
    assert(
      'invariants',
      'DATA-02: booking fallback uses a CSPRNG token',
      invariantDetail('booking-identifier').includes('CSPRNG'),
      invariantDetail('booking-identifier').slice(0, 200)
    );
    assert(
      'invariants',
      'SEC-04: hostile theme tokens fall back to platform defaults',
      /primary=#2c2b29/i.test(invariantDetail('theme-validation')),
      invariantDetail('theme-validation').slice(0, 200)
    );
    assert(
      'invariants',
      'SEC-03: cancellation requires the verified client email',
      invariantDetail('booking-authorization').includes('refused'),
      invariantDetail('booking-authorization').slice(0, 200)
    );

    const themeAfterInvariants = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--color-brand-primary').trim().toLowerCase()
    );
    assert('invariants', 'tenant theme is restored after invariant run', themeAfterInvariants === '#2c2b29', themeAfterInvariants);

    // DATA-01: seeding is atomic and idempotent across boots.
    const firstBoot = await page.evaluate(() => window.probeStoreCounts());
    await gotoAndSettle(page, '/preview/components');
    await page.waitForSelector('[data-testid="invariants"]', { timeout: 20_000 });
    const secondBoot = await page.evaluate(() => window.probeStoreCounts());
    assert(
      'invariants',
      'DATA-01: seeding is complete and idempotent across boots',
      firstBoot.tenants === 2 &&
        firstBoot.agents === firstBoot.expectedAgents &&
        firstBoot.properties === firstBoot.expectedProperties &&
        secondBoot.tenants === firstBoot.tenants &&
        secondBoot.agents === firstBoot.agents &&
        secondBoot.properties === firstBoot.properties,
      JSON.stringify({ firstBoot, secondBoot })
    );

    // SEC-02: an inactive tenant never reaches the shell or the document root.
    await page.evaluate(async () => {
      const db = await window.openPortalDb();
      const tenants = await window.readAll(db, 'tenants');
      const tenant = tenants.find((row) => row.slug === 'atelier-living');
      await window.writeRecord(db, 'tenants', {
        ...tenant,
        isActive: false,
        branding: {
          ...tenant.branding,
          themeTokens: { ...tenant.branding.themeTokens, primaryColor: '#ff00aa' }
        }
      });
    });
    await gotoAndSettle(page, '/t/atelier-living');
    await page.waitForFunction(() => location.pathname === '/404', { timeout: 20_000 }).catch(() => undefined);
    const inactiveLeak = await page.evaluate(() => ({
      url: location.pathname,
      primary: document.documentElement.style.getPropertyValue('--color-brand-primary').trim().toLowerCase(),
      shell: document.querySelectorAll('app-tenant-shell').length
    }));
    assert(
      'invariants',
      'SEC-02: inactive tenant redirects before the shell is constructed',
      inactiveLeak.url === '/404' && inactiveLeak.shell === 0 && inactiveLeak.primary !== '#ff00aa',
      JSON.stringify(inactiveLeak)
    );

    await page.evaluate(async () => {
      const db = await window.openPortalDb();
      const tenants = await window.readAll(db, 'tenants');
      const tenant = tenants.find((row) => row.slug === 'atelier-living');
      await window.writeRecord(db, 'tenants', {
        ...tenant,
        isActive: true,
        branding: {
          ...tenant.branding,
          themeTokens: { ...tenant.branding.themeTokens, primaryColor: '#2C2B29' }
        }
      });
    });
    await gotoAndSettle(page, '/t/atelier-living');
    await page.waitForSelector('app-property-catalog', { timeout: 20_000 });
    const restoredTenant = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--color-brand-primary').trim().toLowerCase()
    );
    assert('invariants', 'reactivated tenant restores its storefront', restoredTenant === '#2c2b29', restoredTenant);

    // UI-01: a trailing decimal point survives keystrokes.
    await gotoAndSettle(page, '/preview/components');
    await page.waitForSelector('#mc-rate', { timeout: 20_000 });
    const decimalEntry = await page.evaluate(async () => {
      const label = Array.from(document.querySelectorAll('app-mortgage-calculator ui-input label')).find((node) =>
        node.textContent?.includes('property tax')
      );
      const field = document.getElementById(label.getAttribute('for'));
      field.focus();
      field.value = '1.';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const afterDot = field.value;
      field.value = '1.25';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { afterDot, afterDigits: field.value };
    });
    assert(
      'ui-decimal-entry',
      'UI-01: typing "1." keeps the decimal point until digits follow',
      decimalEntry.afterDot === '1.' && decimalEntry.afterDigits === '1.25',
      JSON.stringify(decimalEntry)
    );

    // UI-02: separators never orphan onto their own line at 360px.
    await page.setViewport(VIEWPORTS['w360']);
    await gotoAndSettle(page, '/t/atelier-living');
    await page.waitForSelector('app-property-catalog app-property-card', { timeout: 20_000 });
    const orphanSeparators = await page.evaluate(() => {
      const offenders = [];
      for (const card of document.querySelectorAll('app-property-card article')) {
        const items = Array.from(card.querySelectorAll('ul li'));
        for (let index = 1; index < items.length; index += 1) {
          const item = items[index];
          if ((item.textContent ?? '').trim() !== '\u00b7') continue;
          const dotTop = Math.round(item.getBoundingClientRect().top);
          const previousRect = items[index - 1].getBoundingClientRect();
          if (Math.abs(previousRect.top - dotTop) > 2) {
            offenders.push('separator wrapped below its item');
          }
        }
      }
      return offenders;
    });
    assert(
      'ui-layout',
      'UI-02: specs separators never wrap onto their own line',
      orphanSeparators.length === 0,
      orphanSeparators.join(' | ')
    );

    await gotoAndSettle(page, '/t/atelier-living/property/the-kura-residence');
    await page.waitForSelector('app-property-detail dl', { timeout: 20_000 });
    const structureCell = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('app-property-detail dl > div'));
      const structure = cells.find((cell) => cell.querySelector('dt')?.textContent?.includes('Structure'));
      const value = structure?.querySelector('dd');
      if (!value) return null;
      return {
        text: (value.textContent ?? '').trim(),
        overflow: value.scrollWidth - value.clientWidth
      };
    });
    assert(
      'ui-layout',
      'UI-02: structural material wraps instead of truncating at 360px',
      structureCell !== null && structureCell.text.includes('Basalt') && structureCell.overflow <= 1,
      JSON.stringify(structureCell)
    );

    await page.setViewport(VIEWPORTS['w390']);

    // ------------------------------------------------------- privacy & PII
    console.log('\n[phase] privacy and PII anonymization');

    const seededContacts = await page.evaluate(async () => {
      const db = await window.openPortalDb();
      const tenants = await window.readAll(db, 'tenants');
      const agents = await window.readAll(db, 'agents');
      return {
        emails: [
          ...tenants.map((tenant) => tenant.branding.contactEmail),
          ...agents.map((agent) => agent.email)
        ],
        phones: [
          ...tenants.map((tenant) => tenant.branding.contactPhone),
          ...agents.map((agent) => agent.phone)
        ],
        socials: agents.flatMap((agent) => Object.values(agent.socialLinks ?? {})),
        licenses: [
          ...tenants.map((tenant) => tenant.branding.licenseNumber),
          ...agents.map((agent) => agent.licenseCode)
        ],
        legalEntities: tenants.map((tenant) => tenant.branding.legalEntityName)
      };
    });

    // RFC 2606 reserves `example` and any `*.example.{com,org,net}`; a tenant
    // subdomain in front of the reserved label is still inside the safe range.
    const RFC2606 = /(^|\.)(example|example\.(com|org|net))$/i;
    const NANP_TEST = /^\+1 \(\d{3}\) 555-01\d{2}$/;

    assert(
      'privacy',
      'every seeded email uses an RFC 2606 reserved domain',
      seededContacts.emails.every((email) => RFC2606.test(email.split('@')[1] ?? '')),
      seededContacts.emails.filter((email) => !RFC2606.test(email.split('@')[1] ?? '')).join(' | ')
    );
    assert(
      'privacy',
      'every seeded phone number uses the NANP 555-01xx test range',
      seededContacts.phones.every((phone) => NANP_TEST.test(phone)),
      seededContacts.phones.filter((phone) => !NANP_TEST.test(phone)).join(' | ')
    );
    assert(
      'privacy',
      'social profiles resolve to reserved example hosts',
      seededContacts.socials.every((url) => RFC2606.test(new URL(url).hostname)),
      seededContacts.socials.join(' | ')
    );
    assert(
      'privacy',
      'licence numbers are marked simulated',
      seededContacts.licenses.every((entry) => entry.includes('Simulated')),
      seededContacts.licenses.join(' | ')
    );

    const disclaimers = [];
    for (const path of ['/t/atelier-living', '/t/monolith-properties']) {
      await gotoAndSettle(page, path);
      await page.waitForSelector('app-tenant-shell aside[role="note"]', { timeout: 20_000 });
      const notice = await page.evaluate(() => {
        const aside = document.querySelector('app-tenant-shell aside[role="note"]');
        const rect = aside.getBoundingClientRect();
        return {
          text: (aside.textContent ?? '').replace(/\s+/g, ' ').trim(),
          top: Math.round(rect.top),
          label: aside.getAttribute('aria-label')
        };
      });
      disclaimers.push({ path, ...notice });
    }
    assert(
      'privacy',
      'demonstration notice renders above the header on every tenant',
      disclaimers.every(
        (entry) => entry.text.startsWith('Demonstration Environment:') && entry.top < 120 && entry.label === 'Demonstration Notice'
      ),
      JSON.stringify(disclaimers.map((entry) => `${entry.path}:${entry.text.slice(0, 48)}`))
    );

    const footerCopy = await page.evaluate(
      () => document.querySelector('app-tenant-footer')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
    assert(
      'privacy',
      'footer identifies the portal as a fictional simulation',
      footerCopy.includes('Fictional simulation') && footerCopy.includes('synthetic models'),
      footerCopy.slice(-120)
    );

    await gotoAndSettle(page, '/t/atelier-living/property/the-kura-residence');
    await page.waitForSelector('app-property-detail ui-button button', { timeout: 20_000 });
    const railButtons = await page.$$('app-property-detail aside ui-button button');
    await clickElement(page, railButtons[railButtons.length - 1]);
    await page.waitForSelector('app-schedule-tour-dialog [role="dialog"]', { timeout: 10_000 });
    const disclosure = await page.evaluate(() => {
      const dialog = document.querySelector('app-schedule-tour-dialog [role="dialog"]');
      const notes = Array.from(dialog.querySelectorAll('[role="note"]')).map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim());
      const firstField = dialog.querySelector('ui-input');
      return {
        notes,
        // DOCUMENT_POSITION_FOLLOWING on the note means the first field comes
        // after it in document order, which is the required reading sequence.
        beforeFields:
          Boolean(firstField) && notes.length > 0
            ? Boolean(
                dialog
                  .querySelector('[role="note"]')
                  .compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING
              )
            : false
      };
    });
    assert(
      'privacy',
      'tour dialog discloses local-only storage before any input field',
      disclosure.notes.some((note) => note.startsWith('Privacy Disclosure:')) && disclosure.beforeFields,
      JSON.stringify(disclosure.notes).slice(0, 180)
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, { timeout: 10_000 });

    console.log('\n[phase] tenant switch utility');

    await gotoAndSettle(page, '/t/atelier-living');
    await page.waitForSelector('app-tenant-switcher button', { timeout: 20_000 });
    await clickElement(page, await page.$('app-tenant-switcher button'));
    await page.waitForSelector('app-tenant-switcher [role="dialog"]', { timeout: 10_000 });

    const monolithHref = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('app-tenant-switcher [role="dialog"] a'));
      return links.find((link) => link.textContent?.includes('Monolith'))?.getAttribute('href') ?? '';
    });
    assert('switcher', 'switcher lists the other tenant', monolithHref.includes('/t/monolith-properties'), monolithHref);

    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('app-tenant-switcher [role="dialog"] a'));
      links.find((link) => link.textContent?.includes('Monolith'))?.click();
    });
    await page.waitForFunction(() => location.pathname === '/t/monolith-properties', { timeout: 15_000 });
    await new Promise((done) => setTimeout(done, 600));
    const switchedState = await page.evaluate(() => ({
      primary: document.documentElement.style.getPropertyValue('--color-brand-primary').trim(),
      text: document.body.textContent ?? ''
    }));
    assert(
      'switcher',
      'switching tenant re-themes and re-scopes in place',
      switchedState.primary.toLowerCase() === '#111213' && switchedState.text.includes('Monolith'),
      JSON.stringify({ primary: switchedState.primary })
    );

    // ------------------------------------------------------------ page assembly
    console.log('\n[phase] catalog and detail assembly');

    await page.setViewport(VIEWPORTS['w1024']);
    await gotoAndSettle(page, '/t/atelier-living');
    await page.waitForSelector('app-property-catalog [data-testid="catalog-grid"] app-property-card', { timeout: 20_000 });

    const catalogAtelier = await page.evaluate(() => ({
      cards: document.querySelectorAll('app-property-catalog app-property-card').length,
      hero: Boolean(document.querySelector('app-property-catalog a[href*="/property/"]')),
      heroTitle: document.querySelector('app-property-catalog h1')?.textContent?.trim() ?? '',
      skeletons: document.querySelectorAll('[data-testid="catalog-skeletons"]').length,
      emptyState: document.querySelectorAll('[data-testid="catalog-empty"]').length
    }));
    assert(
      'catalog',
      'catalog renders the tenant grid and featured hero',
      catalogAtelier.cards >= 3 && catalogAtelier.hero && catalogAtelier.skeletons === 0 && catalogAtelier.emptyState === 0,
      JSON.stringify(catalogAtelier)
    );
    assert('catalog', 'hero carries the agency wordmark', catalogAtelier.heroTitle.includes('Atelier Living'), catalogAtelier.heroTitle);

    await gotoAndSettle(page, '/t/monolith-properties');
    await page.waitForSelector('app-property-catalog app-property-card', { timeout: 20_000 });
    const catalogMonolith = await page.evaluate(() => ({
      cards: document.querySelectorAll('app-property-catalog app-property-card').length,
      wordmark: document.querySelector('app-property-catalog h1')?.textContent?.trim() ?? ''
    }));
    assert(
      'catalog',
      'tenant isolation: monolith catalog differs from atelier',
      catalogMonolith.cards !== catalogAtelier.cards && catalogMonolith.wordmark.includes('Monolith'),
      JSON.stringify(catalogMonolith)
    );

    await gotoAndSettle(page, '/t/atelier-living');
    await page.waitForSelector('app-property-catalog app-property-card', { timeout: 20_000 });
    const totalCards = await page.$$eval('app-property-catalog app-property-card', (nodes) => nodes.length);
    await page.evaluate(() => {
      const facets = document.querySelectorAll('app-property-filter-bar [aria-pressed]');
      facets[0]?.click();
    });
    await new Promise((done) => setTimeout(done, 300));
    const filteredCards = await page.$$eval('app-property-catalog app-property-card', (nodes) => nodes.length);
    assert(
      'catalog',
      'type facet narrows the listing grid',
      filteredCards > 0 && filteredCards < totalCards,
      `${totalCards} -> ${filteredCards}`
    );

    const searchInput = await page.$('#catalog-search');
    await page.evaluate(() => {
      const input = document.querySelector('#catalog-search');
      input.value = 'zzzz-no-such-residence';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('search', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await new Promise((done) => setTimeout(done, 400));
    void searchInput;
    const emptyState = await page.evaluate(() => ({
      empty: document.querySelectorAll('[data-testid="catalog-empty"]').length,
      cards: document.querySelectorAll('app-property-catalog app-property-card').length
    }));
    assert(
      'catalog',
      'empty result set renders a recovery state',
      emptyState.empty === 1 && emptyState.cards === 0,
      JSON.stringify(emptyState)
    );

    const resetButton = await page.$('[data-testid="catalog-empty"] ui-button button');
    await clickElement(page, resetButton);
    await page.waitForFunction(
      () => document.querySelectorAll('app-property-catalog app-property-card').length > 0,
      { timeout: 10_000 }
    );
    const restoredCards = await page.$$eval('app-property-catalog app-property-card', (nodes) => nodes.length);
    assert('catalog', 'empty-state reset restores the full register', restoredCards === totalCards, `${restoredCards}`);

    await gotoAndSettle(page, '/t/atelier-living/property/the-kura-residence');
    await page.waitForSelector('app-property-detail app-architectural-gallery', { timeout: 20_000 });
    const detailState = await page.evaluate(() => ({
      title: document.querySelector('app-property-detail h1')?.textContent?.trim() ?? '',
      gallery: document.querySelectorAll('app-architectural-gallery').length,
      floorPlans: document.querySelectorAll('app-floor-plan-viewer').length,
      planLevels: document.querySelectorAll('app-floor-plan-viewer [role="group"][aria-label="Floor level"] button').length,
      mortgage: document.querySelectorAll('app-mortgage-calculator').length,
      rail: document.querySelectorAll('app-property-detail aside').length,
      specs: document.querySelectorAll('app-property-detail dl div').length,
      amenityBadges: document.querySelectorAll('app-property-detail [class*="rounded-\\[var\\(--radius-brand\\)\\]"]').length,
      mobileCta: document.querySelectorAll('[data-testid="mobile-cta"]').length
    }));
    assert(
      'detail',
      'detail page integrates gallery, plans and financing',
      detailState.gallery === 1 && detailState.floorPlans === 1 && detailState.mortgage === 1 && detailState.planLevels >= 3,
      JSON.stringify(detailState)
    );
    assert('detail', 'detail headline matches the residence', detailState.title === 'The Kura Residence', detailState.title);
    assert('detail', 'inquiry rail renders on every viewport', detailState.rail === 1, JSON.stringify(detailState));

    const crossTenantDetail = await page.evaluate(() => ({
      url: location.pathname
    }));
    void crossTenantDetail;

    await gotoAndSettle(page, '/t/monolith-properties/property/the-kura-residence');
    await page
      .waitForFunction(() => location.pathname === '/404', { timeout: 20_000 })
      .catch(() => undefined);
    const crossTenantUrl = page.url();
    assert('detail', 'cross-tenant residence deep link is refused', crossTenantUrl.endsWith('/404'), crossTenantUrl);

    // ------------------------------------------------------- responsive sweep
    console.log('\n[phase] responsive sweep (360 - 1440)');

    const responsiveIssues = [];
    for (const path of ['/t/atelier-living', '/t/atelier-living/property/the-kura-residence', '/t/monolith-properties']) {
      for (const [label, viewport] of Object.entries(VIEWPORTS)) {
        await page.setViewport(viewport);
        await gotoAndSettle(page, path);
        await page.waitForSelector('app-property-catalog, app-property-detail', { timeout: 20_000 });
        await new Promise((done) => setTimeout(done, 250));

        const metrics = await page.evaluate(() => {
          const root = document.documentElement;
          const offenders = [];
          const selector =
            'button, a[href], input, select, textarea, [role="button"], [role="slider"], [tabindex]:not([tabindex="-1"])';
          for (const element of document.querySelectorAll(selector)) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const style = getComputedStyle(element);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            if (rect.height < 44 || rect.width < 44) {
              offenders.push(`${element.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
            }
          }
          const cta = document.querySelector('[data-testid="mobile-cta"]');
          return {
            overflow: root.scrollWidth - root.clientWidth,
            offenders: offenders.slice(0, 3),
            ctaVisible: cta ? getComputedStyle(cta).display !== 'none' : false,
            headingSize: Number.parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)
          };
        });

        const mobile = Number.parseInt(label.slice(1), 10) < 768;
        if (metrics.overflow > 1) {
          responsiveIssues.push(`${path} @${label}: horizontal overflow ${metrics.overflow}px`);
        }
        if (metrics.offenders.length > 0) {
          responsiveIssues.push(`${path} @${label}: small targets ${metrics.offenders.join(', ')}`);
        }
        // The call-to-action bar belongs to the detail layout only.
        if (path.includes('/property/') && metrics.ctaVisible !== mobile) {
          responsiveIssues.push(`${path} @${label}: mobile CTA visibility ${metrics.ctaVisible}`);
        }
        if (metrics.headingSize < 22) {
          responsiveIssues.push(`${path} @${label}: heading too small (${metrics.headingSize}px)`);
        }
      }
    }
    assert(
      'responsive-sweep',
      'all routes hold layout and touch targets from 360px to 1440px',
      responsiveIssues.length === 0,
      responsiveIssues.slice(0, 6).join(' ; ')
    );

    // ------------------------------------------------------- detail interaction
    await page.setViewport(VIEWPORTS['w390']);
    await gotoAndSettle(page, '/t/atelier-living/property/the-kura-residence');
    await page.waitForSelector('[data-testid="mobile-cta"] ui-button button', { timeout: 20_000 });

    const ctaBox = await page.evaluate(() => {
      const cta = document.querySelector('[data-testid="mobile-cta"]');
      const rect = cta.getBoundingClientRect();
      const parentStyle = getComputedStyle(cta.parentElement);
      return {
        position: getComputedStyle(cta).position,
        bottom: Math.round(rect.bottom),
        innerHeight: window.innerHeight,
        parentOverflow: parentStyle.overflow,
        parentTransform: parentStyle.transform
      };
    });
    assert(
      'detail',
      'mobile CTA is a fixed bottom node outside scroll containers',
      ctaBox.position === 'fixed' &&
        Math.abs(ctaBox.bottom - ctaBox.innerHeight) < 2 &&
        ctaBox.parentOverflow === 'visible' &&
      ctaBox.parentTransform === 'none',
      JSON.stringify(ctaBox)
    );

    await clickElement(page, await page.$('[data-testid="mobile-cta"] ui-button button'));
    await page.waitForSelector('app-schedule-tour-dialog [role="dialog"]', { timeout: 10_000 });
    const dialogFromCta = await page.evaluate(() => Boolean(document.querySelector('app-schedule-tour-dialog [role="dialog"]')));
    assert('detail', 'mobile CTA opens the tour dialog', dialogFromCta);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, { timeout: 10_000 });

    await page.setViewport(VIEWPORTS['w1024']);
    await gotoAndSettle(page, '/t/atelier-living/property/the-kura-residence');
    await page.waitForSelector('app-property-detail aside', { timeout: 20_000 });
    const railSticky = await page.evaluate(() => {
      const inner = document.querySelector('app-property-detail aside > div');
      return inner ? getComputedStyle(inner).position : 'missing';
    });
    assert('detail', 'inquiry rail is sticky on desktop', railSticky === 'sticky', railSticky);

    // -------------------------------------------------------------- errors
    console.log('\n[phase] runtime health');
    assert('runtime', 'no uncaught page errors', errors.pageErrors.length === 0, errors.pageErrors.join(' | '));
    assert('runtime', 'no console errors', errors.console.length === 0, errors.console.slice(0, 5).join(' | '));
    assert('runtime', 'no failed network responses', errors.requestFailures.length === 0, errors.requestFailures.slice(0, 5).join(' | '));
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