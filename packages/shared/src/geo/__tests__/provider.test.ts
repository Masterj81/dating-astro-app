import { describe, expect, it, vi } from 'vitest';

import {
  buildGeoapifyUrl,
  createRemoteBirthCityProvider,
  mapGeoapifyFeature,
  mapGeoapifyResponse,
  sanitizeProviderQuery,
} from '../provider';

const geojsonFeature = (overrides: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [23.3219, 42.6977] },
  properties: {
    city: 'Sofia',
    state: 'Sofia-grad',
    country: 'Bulgaria',
    country_code: 'bg',
    lat: 42.6977,
    lon: 23.3219,
    place_id: 'geoapify-sofia',
    timezone: { name: 'Europe/Sofia' },
    ...overrides,
  },
});

describe('sanitizeProviderQuery — what may leave for a third party', () => {
  it('keeps the city text and nothing else', () => {
    const clean = sanitizeProviderQuery({ text: '  Sofia  ', lang: 'fr', limit: 5 });
    expect(clean).toEqual({ text: 'Sofia', lang: 'fr', limit: 5 });
  });

  it('refuses a query below the minimum length', () => {
    expect(sanitizeProviderQuery({ text: 'so' })).toBeNull();
    expect(sanitizeProviderQuery({ text: '' })).toBeNull();
    expect(sanitizeProviderQuery({ text: '   ' })).toBeNull();
  });

  it('lets a two-character CJK city through, unlike a Latin one', () => {
    expect(sanitizeProviderQuery({ text: '東京' })?.text).toBe('東京');
    expect(sanitizeProviderQuery({ text: 'to' })).toBeNull();
  });

  it('truncates rather than forwarding a paste', () => {
    const clean = sanitizeProviderQuery({ text: 'a'.repeat(500) });
    expect(clean?.text.length).toBeLessThanOrEqual(120);
  });

  it('strips control characters, which is how a header gets split', () => {
    const clean = sanitizeProviderQuery({ text: 'Sofia\r\nX-Injected: 1' });
    expect(clean?.text).toBe('Sofia X-Injected: 1');
    // eslint-disable-next-line no-control-regex -- asserting their absence
    expect(clean?.text).not.toMatch(/[\u0000-\u001f]/);
  });

  it('drops a language that is not an ISO 639-1 code', () => {
    expect(sanitizeProviderQuery({ text: 'Sofia', lang: 'fr-CA' })?.lang).toBeUndefined();
    expect(sanitizeProviderQuery({ text: 'Sofia', lang: 'ENGLISH' })?.lang).toBeUndefined();
    expect(sanitizeProviderQuery({ text: 'Sofia', lang: 'ja' })?.lang).toBe('ja');
  });

  it('clamps the limit', () => {
    expect(sanitizeProviderQuery({ text: 'Sofia', limit: 999 })?.limit).toBe(10);
    // A non-positive limit falls back to the default rather than to one row.
    expect(sanitizeProviderQuery({ text: 'Sofia', limit: -4 })?.limit).toBe(5);
    expect(sanitizeProviderQuery({ text: 'Sofia', limit: 0 })?.limit).toBe(5);
    expect(sanitizeProviderQuery({ text: 'Sofia', limit: 2.7 })?.limit).toBe(2);
  });

  it('has no field for anything identifying', () => {
    // The shape is the guard: there is nowhere to put an email or a user id.
    const clean = sanitizeProviderQuery({
      text: 'Sofia',
      // @ts-expect-error — deliberately passing what must never travel
      email: 'reader@example.com',
      userId: 'abc',
      birthDate: '1990-01-01',
    });
    expect(Object.keys(clean ?? {}).sort()).toEqual(['limit', 'text']);
  });
});

describe('buildGeoapifyUrl', () => {
  it('restricts results to cities', () => {
    const url = buildGeoapifyUrl({ text: 'Sofia', limit: 5 }, 'KEY');
    expect(url).toContain('type=city');
    expect(url).toContain('https://api.geoapify.com/v1/geocode/autocomplete');
  });

  it('carries the key and the query, and encodes them', () => {
    const url = buildGeoapifyUrl({ text: 'Trois-Rivières', limit: 5 }, 'K E Y');
    expect(url).toContain('apiKey=K+E+Y');
    expect(url).toContain('text=Trois-Rivi%C3%A8res');
  });

  it('omits lang when there is none', () => {
    expect(buildGeoapifyUrl({ text: 'Sofia' }, 'KEY')).not.toContain('lang=');
    expect(buildGeoapifyUrl({ text: 'Sofia', lang: 'de' }, 'KEY')).toContain('lang=de');
  });
});

describe('mapGeoapifyFeature', () => {
  it('decodes the geojson shape', () => {
    const s = mapGeoapifyFeature(geojsonFeature());
    expect(s).toMatchObject({
      name: 'Sofia',
      admin1: 'Sofia-grad',
      country: 'Bulgaria',
      countryCode: 'BG',
      latitude: 42.6977,
      longitude: 23.3219,
      timezone: 'Europe/Sofia',
      source: 'remote',
    });
  });

  it('decodes the flat json shape too', () => {
    // format=json returns the same fields without the properties wrapper.
    const s = mapGeoapifyFeature(geojsonFeature().properties);
    expect(s?.name).toBe('Sofia');
    expect(s?.latitude).toBe(42.6977);
  });

  it('falls back to name when there is no city field', () => {
    const feature = geojsonFeature({ city: undefined, name: 'Singapore' });
    expect(mapGeoapifyFeature(feature)?.name).toBe('Singapore');
  });

  it('falls back to county when there is no state', () => {
    const feature = geojsonFeature({ state: undefined, county: 'Kent' });
    expect(mapGeoapifyFeature(feature)?.admin1).toBe('Kent');
  });

  it('accepts coordinates that arrive as strings', () => {
    const feature = geojsonFeature({ lat: '42.6977', lon: '23.3219' });
    expect(mapGeoapifyFeature(feature)?.latitude).toBe(42.6977);
  });

  it('rejects rather than repairs a feature with no usable coordinate', () => {
    for (const bad of [
      { lat: undefined, lon: undefined },
      { lat: 0, lon: 0 },
      { lat: 'not a number', lon: 12 },
      { lat: 91, lon: 12 },
      { lat: null, lon: null },
    ]) {
      expect(mapGeoapifyFeature(geojsonFeature(bad)), JSON.stringify(bad)).toBeNull();
    }
  });

  it('rejects a feature with no name or no country', () => {
    expect(mapGeoapifyFeature(geojsonFeature({ city: undefined, name: undefined }))).toBeNull();
    expect(mapGeoapifyFeature(geojsonFeature({ country: undefined }))).toBeNull();
  });

  it('rejects junk', () => {
    for (const junk of [null, undefined, 'Sofia', 42, []]) {
      expect(mapGeoapifyFeature(junk)).toBeNull();
    }
  });

  it('omits the timezone rather than inventing one', () => {
    const s = mapGeoapifyFeature(geojsonFeature({ timezone: null }));
    expect(s?.timezone).toBeUndefined();
  });
});

describe('mapGeoapifyResponse', () => {
  it('reads a geojson body', () => {
    const out = mapGeoapifyResponse({ features: [geojsonFeature()] });
    expect(out).toHaveLength(1);
  });

  it('reads a flat json body', () => {
    const out = mapGeoapifyResponse({ results: [geojsonFeature().properties] });
    expect(out).toHaveLength(1);
  });

  it('drops the features it cannot decode instead of failing the batch', () => {
    const out = mapGeoapifyResponse({
      features: [geojsonFeature({ lat: 0, lon: 0 }), geojsonFeature()],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('Sofia');
  });

  it('de-duplicates the same city returned twice', () => {
    const out = mapGeoapifyResponse({
      features: [geojsonFeature(), geojsonFeature({ place_id: 'other' })],
    });
    expect(out).toHaveLength(1);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      geojsonFeature({ city: `City ${i}`, place_id: `id-${i}` }),
    );
    expect(mapGeoapifyResponse({ features: many }, 3)).toHaveLength(3);
  });

  it('returns nothing for a body it does not understand', () => {
    for (const junk of [null, undefined, {}, { features: 'nope' }, []]) {
      expect(mapGeoapifyResponse(junk)).toEqual([]);
    }
  });
});

describe('createRemoteBirthCityProvider', () => {
  const endpoint = 'https://example.test/functions/v1/suggest-birth-cities';

  it('posts only the sanitised query to OUR endpoint', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
    );
    const provider = createRemoteBirthCityProvider({ endpoint, fetchImpl: fetchImpl as never });
    await provider({ text: '  Sofia  ', lang: 'fr' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(endpoint);
    expect(String(url)).not.toContain('geoapify');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Sofia', lang: 'fr', limit: 5 });
  });

  it('never calls the provider directly', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
    );
    const provider = createRemoteBirthCityProvider({ endpoint, fetchImpl: fetchImpl as never });
    await provider({ text: 'Sofia' });
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).not.toMatch(/geoapify|locationiq|nominatim/i);
  });

  it('passes per-request auth headers to the proxy', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
    );
    const provider = createRemoteBirthCityProvider({ endpoint, fetchImpl: fetchImpl as never });
    await provider({ text: 'Sofia' }, undefined, { Authorization: 'Bearer session-token' });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer session-token',
    });
  });

  it('refuses a short query without hitting the network', async () => {
    const fetchImpl = vi.fn();
    const provider = createRemoteBirthCityProvider({ endpoint, fetchImpl: fetchImpl as never });
    const result = await provider({ text: 'so' });
    expect(result).toEqual({ ok: false, reason: 'invalid_query' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports rate limiting distinctly from an outage', async () => {
    const provider = createRemoteBirthCityProvider({
      endpoint,
      fetchImpl: (async () => new Response('', { status: 429 })) as never,
    });
    expect(await provider({ text: 'Sofia' })).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('reports an outage rather than throwing', async () => {
    const provider = createRemoteBirthCityProvider({
      endpoint,
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as never,
    });
    expect(await provider({ text: 'Sofia' })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('re-validates what the endpoint returns — ours is not a coordinate check', async () => {
    const provider = createRemoteBirthCityProvider({
      endpoint,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            suggestions: [
              { name: 'Sofia', country: 'Bulgaria', latitude: 42.6977, longitude: 23.3219, source: 'remote' },
              { name: 'Nowhere', country: 'Nowhere', latitude: 0, longitude: 0, source: 'remote' },
              { name: 'Broken', country: 'X', latitude: 'nope', longitude: 12, source: 'remote' },
            ],
          }),
          { status: 200 },
        )) as never,
    });
    const result = await provider({ text: 'Sofia' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]?.name).toBe('Sofia');
    }
  });

  it('treats a malformed body as an outage', async () => {
    const provider = createRemoteBirthCityProvider({
      endpoint,
      fetchImpl: (async () => new Response('{"nope":1}', { status: 200 })) as never,
    });
    expect(await provider({ text: 'Sofia' })).toEqual({ ok: false, reason: 'unavailable' });
  });
});
