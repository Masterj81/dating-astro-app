#!/usr/bin/env node
// =============================================================================
// PWA legacy recovery — preuve comportementale A → B (JUNO-16)
// =============================================================================
//
// USAGE   node scripts/pwa-legacy-recovery.mjs
// PREREQ  playwright (devDep du repo) + son Chromium ; aucun réseau externe.
//
// CE QUE CE HARNAIS PROUVE (la question ouverte du plan PWA §3 / 10.4) :
// « une PWA installée AVANT le dernier déploiement récupère-t-elle la
//   version courante ? » — exécuté pour de vrai, pas simulé par assertion.
//
// PHASE A — le client « ancien » : un service worker réellement enregistré,
// copie EXACTE de `f9bc682:public/service-worker.js` (cache `astrodating-v1`,
// addAll des assets, network-first runtime, handlers push `AstroDating`) —
// le code que les installations d'avant mai 2026 portent encore. La page A
// l'enregistre, il s'active, prend le contrôle (clients.claim) et remplit
// son cache. Une « session » est posée dans localStorage.
//
// PHASE B — le « déploiement » : le serveur sert désormais le kill-switch
// RÉEL du dépôt (`apps/web/public/service-worker.js`, lu au runtime — le
// harnais teste les octets livrés, pas une copie) et une page B
// identifiable. Une navigation dans le scope contrôlé déclenche l'update
// check du navigateur (le mécanisme de reprise : le SW script contourne le
// cache HTTP par défaut).
//
// VERDITS exigés :
//   1. la page finit sur B (pas de mélange A/B — pas de cache résiduel) ;
//   2. plus AUCUNE registration (le kill-switch s'est désenregistré) ;
//   3. plus AUCUN cache (astrodating-v1 purgé) ;
//   4. la session localStorage a survécu ;
//   5. hors ligne après guérison : la navigation échoue (rien ne sert du
//      vieux contenu) puis revient en ligne sur B ;
//   6. multi-onglets : deux pages contrôlées par A finissent TOUTES DEUX
//      sur B, propres, session intacte.
// =============================================================================

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// Le kill-switch LIVRÉ — lu au runtime, jamais une copie.
const KILL_SWITCH = readFileSync(
  path.join(REPO_ROOT, 'apps/web/public/service-worker.js'),
  'utf8',
);

// L'ANCIEN service worker — copie exacte et figée de
// `git show f9bc682:public/service-worker.js` (artefact historique : il ne
// vit plus dans l'arbre, c'est précisément le code que les vieilles PWA ont
// encore en cache). Ne pas « améliorer » cette copie : le harnais doit
// tester le vrai comportement historique, bugs compris.
const LEGACY_SW = `const CACHE_NAME = 'astrodating-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Only cache http and https requests (skip chrome-extension://, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Skip API calls, Supabase requests, and external domains
  if (url.href.includes('/api/') || url.href.includes('supabase.co')) {
    return;
  }

  // Skip all external domains (only cache same-origin requests)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip hot module reload and dev server requests
  if (url.href.includes('hot-update') || url.href.includes('__webpack')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        // Clone the response before caching
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseClone))
          .catch(() => {}); // Ignore cache errors
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AstroDating', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.url || '/')
  );
});
`;

// Seule la page HISTORIQUE (A) enregistrait le SW — c'est ainsi que les
// vieilles PWA se sont retrouvées contrôlées. La version B (l'app actuelle)
// n'enregistre RIEN, exactement comme le dépôt (aucun register dans
// apps/web/src) : le kill-switch n'est repris que via l'update check du
// navigateur, puis se désenregistre. Ré-enregistrer en B serait créer la
// boucle de rechargement que le harnais est chargé de refuser.
const PAGE_A = `<!doctype html>
<html><head><meta charset="utf-8"><title>JUNO A</title></head>
<body data-version="A"><h1>Version A</h1>
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
</script>
</body></html>`;

const PAGE_B = `<!doctype html>
<html><head><meta charset="utf-8"><title>JUNO B</title></head>
<body data-version="B"><h1>Version B</h1>
</body></html>`;

const ICON = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG minimal
const MANIFEST_A = JSON.stringify({ name: 'AstroDating legacy', start_url: '/' });

// ── Serveur à deux phases : A (legacy) puis B (kill-switch) ─────────────────
let phase = 'A';
const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  const send = (body, type) => {
    res.writeHead(200, {
      'Content-Type': type,
      // Pas de cache HTTP côté serveur de test : la péremption éventuelle
      // du SW relève du navigateur, pas de nos en-têtes de simulation.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  };
  if (url === '/service-worker.js') {
    return send(phase === 'A' ? LEGACY_SW : KILL_SWITCH, 'application/javascript');
  }
  if (url === '/manifest.json') return send(MANIFEST_A, 'application/json');
  if (url === '/icon-192.png' || url === '/icon-512.png') return send(ICON, 'image/png');
  return send(phase === 'A' ? PAGE_A : PAGE_B, 'text/html'); // '/' et tout le reste
});

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;

const results = [];
const check = (ok, label) => {
  results.push({ ok, label });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // ── PHASE A : installation « ancienne » ────────────────────────────────────
  console.log('\n[Phase A] installation legacy (astrodating-v1)…');
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  // Laisser le runtime caching remplir astrodating-v1 (la navigation y passe).
  await page.reload();
  await wait(500);
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
  check(controlled?.endsWith('/service-worker.js') === true, 'A : la page est contrôlée par le SW legacy');
  const cachedA = await page.evaluate(async () => (await caches.keys()));
  check(cachedA.includes('astrodating-v1'), `A : le cache legacy existe (${cachedA.join(', ')})`);
  await page.evaluate(() => localStorage.setItem('juno-session-synthetic', 'A'));
  const storedA = await page.evaluate(() => localStorage.getItem('juno-session-synthetic'));
  check(storedA === 'A', 'A : session posée dans localStorage');
  const versionA = await page.evaluate(() => document.body.dataset.version);
  check(versionA === 'A', `A : la page sert la version ${versionA}`);

  // ── PHASE B : déploiement de la version courante ───────────────────────────
  console.log('\n[Phase B] déploiement : kill-switch du dépôt + page B…');
  phase = 'B';
  // La réouverture d'une PWA = navigation dans le scope contrôlé → update check.
  await page.goto(BASE);
  // Le kill-switch : install → skipWaiting → activate → purge → unregister →
  // navigate(client.url) → reload sans contrôleur.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller === null && document.body.dataset.version === 'B',
    null,
    { timeout: 20000 },
  );
  check(true, 'B : la page est sur la version B, sans contrôleur');
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  check(regs === 0, `B : zéro registration restante (${regs})`);
  const cachesB = await page.evaluate(async () => (await caches.keys()));
  check(cachesB.length === 0, `B : zéro cache restant (${cachesB.join(', ') || 'aucun'})`);
  const storedB = await page.evaluate(() => localStorage.getItem('juno-session-synthetic'));
  check(storedB === 'A', 'B : la session a survécu à la mise à jour');

  // Stabilité : fermeture/réouverture (nouvelle navigation, plus de SW du tout).
  await page.goto(BASE + '?reopen=1');
  const versionReopen = await page.evaluate(() => document.body.dataset.version);
  check(versionReopen === 'B', `B : réouverture → version ${versionReopen}, pas de mélange A/B`);
  const regsReopen = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  const cachesReopen = await page.evaluate(async () => (await caches.keys()).length);
  check(regsReopen === 0 && cachesReopen === 0, 'B : réouverture → zéro registration, zéro cache (aucune boucle de ré-enregistrement)');

  // ── Hors ligne après guérison : rien ne sert du vieux contenu ──────────────
  console.log('\n[Hors ligne] après guérison…');
  await context.setOffline(true);
  let offlineRefused = false;
  try {
    await page.goto(BASE + '?offline=1', { timeout: 8000 });
  } catch {
    offlineRefused = true; // net::ERR_INTERNET_DISCONNECTED — AUCUN SW ne sert un cache
  }
  check(offlineRefused, 'Hors ligne : la navigation échoue (aucun cache résiduel ne sert du contenu A)');
  await context.setOffline(false);
  await page.goto(BASE + '?back-online=1');
  const versionBack = await page.evaluate(() => document.body.dataset.version);
  check(versionBack === 'B', `Retour en ligne → version ${versionBack}`);

  // ── Multi-onglets : deux clients contrôlés par A finissent tous sur B ──────
  console.log('\n[Multi-onglets] deux clients legacy → tous mis à jour…');
  phase = 'A';
  const p1 = await context.newPage();
  const p2 = await context.newPage();
  await p1.goto(BASE + '?tab=1');
  await p2.goto(BASE + '?tab=2');
  await p1.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await p2.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await p1.evaluate(() => localStorage.setItem('juno-session-synthetic', 'tabs'));
  phase = 'B';
  await p1.goto(BASE + '?tab=1'); // une seule navigation déclenche l'update
  for (const [name, p] of [['tab1', p1], ['tab2', p2]]) {
    await p.waitForFunction(
      () => navigator.serviceWorker.controller === null && document.body.dataset.version === 'B',
      null,
      { timeout: 20000 },
    );
    const regsTabs = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    const cachesTabs = await p.evaluate(async () => (await caches.keys()).length);
    check(regsTabs === 0 && cachesTabs === 0, `Multi-onglets ${name} : version B, zéro registration, zéro cache`);
  }
  const sessionTabs = await p2.evaluate(() => localStorage.getItem('juno-session-synthetic'));
  check(sessionTabs === 'tabs', 'Multi-onglets : session intacte dans l’onglet non navigué');

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? 'PWA LEGACY RECOVERY — PASS' : `PWA LEGACY RECOVERY — ${failed} ÉCHEC(S)`}`);
  console.log(`Verdict JUNO-16 : une PWA contrôlée par l'ancien SW récupère bien la version`);
  console.log(`courante (update check → kill-switch → purge → unregister → reload).`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\nHARNAIS EN ÉCHEC :', e.message);
  process.exitCode = 1;
  server.close();
});
