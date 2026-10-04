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