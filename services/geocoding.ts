// Geocoding service: hardcoded cache + Nominatim/OpenStreetMap fallback

export interface GeoResult {
  latitude: number;
  longitude: number;
  displayName: string;
  timezone: number; // UTC offset estimate in hours
}

// Hardcoded city cache (merged from all existing lookups across codebase)
const CITY_CACHE: Record<string, { lat: number; lng: number; tz: number }> = {
  'new york': { lat: 40.7128, lng: -74.0060, tz: -5 },
  'los angeles': { lat: 34.0522, lng: -118.2437, tz: -8 },
  'chicago': { lat: 41.8781, lng: -87.6298, tz: -6 },
  'london': { lat: 51.5074, lng: -0.1278, tz: 0 },
  'paris': { lat: 48.8566, lng: 2.3522, tz: 1 },
  'tokyo': { lat: 35.6762, lng: 139.6503, tz: 9 },
  'sydney': { lat: -33.8688, lng: 151.2093, tz: 11 },
  'montreal': { lat: 45.5017, lng: -73.5673, tz: -5 },
  'toronto': { lat: 43.6532, lng: -79.3832, tz: -5 },
  'vancouver': { lat: 49.2827, lng: -123.1207, tz: -8 },
  'berlin': { lat: 52.5200, lng: 13.4050, tz: 1 },
  'madrid': { lat: 40.4168, lng: -3.7038, tz: 1 },
  'rome': { lat: 41.9028, lng: 12.4964, tz: 1 },
  'beijing': { lat: 39.9042, lng: 116.4074, tz: 8 },
  'shanghai': { lat: 31.2304, lng: 121.4737, tz: 8 },
  'dubai': { lat: 25.2048, lng: 55.2708, tz: 4 },
  'singapore': { lat: 1.3521, lng: 103.8198, tz: 8 },
  'mumbai': { lat: 19.0760, lng: 72.8777, tz: 5.5 },
  'delhi': { lat: 28.7041, lng: 77.1025, tz: 5.5 },
  'cairo': { lat: 30.0444, lng: 31.2357, tz: 2 },
  'são paulo': { lat: -23.5505, lng: -46.6333, tz: -3 },
  'sao paulo': { lat: -23.5505, lng: -46.6333, tz: -3 },
  'mexico city': { lat: 19.4326, lng: -99.1332, tz: -6 },
  'buenos aires': { lat: -34.6037, lng: -58.3816, tz: -3 },
  'moscow': { lat: 55.7558, lng: 37.6173, tz: 3 },
  'seoul': { lat: 37.5665, lng: 126.9780, tz: 9 },
  'hong kong': { lat: 22.3193, lng: 114.1694, tz: 8 },
  'bangkok': { lat: 13.7563, lng: 100.5018, tz: 7 },
  'istanbul': { lat: 41.0082, lng: 28.9784, tz: 3 },
  'amsterdam': { lat: 52.3676, lng: 4.9041, tz: 1 },
  'barcelona': { lat: 41.3851, lng: 2.1734, tz: 1 },
  'lisbon': { lat: 38.7223, lng: -9.1393, tz: 0 },
  'riyadh': { lat: 24.7136, lng: 46.6753, tz: 3 },
  'johannesburg': { lat: -26.2041, lng: 28.0473, tz: 2 },
  'casablanca': { lat: 33.5731, lng: -7.5898, tz: 1 },
  'algiers': { lat: 36.7538, lng: 3.0588, tz: 1 },
  'tunis': { lat: 36.8065, lng: 10.1815, tz: 1 },
  'miami': { lat: 25.7617, lng: -80.1918, tz: -5 },
  'san francisco': { lat: 37.7749, lng: -122.4194, tz: -8 },
  'houston': { lat: 29.7604, lng: -95.3698, tz: -6 },
  'phoenix': { lat: 33.4484, lng: -112.0740, tz: -7 },
  'denver': { lat: 39.7392, lng: -104.9903, tz: -7 },
  'seattle': { lat: 47.6062, lng: -122.3321, tz: -8 },
  'ottawa': { lat: 45.4215, lng: -75.6972, tz: -5 },
};

// Simple timezone estimate from longitude (rough: 1 hour per 15 degrees)
function estimateTimezone(lng: number): number {
  return Math.round(lng / 15);
}

// Rate limiter: enforce minimum 1 second between Nominatim requests
let lastNominatimRequest = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequest;
  if (timeSinceLast < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastNominatimRequest = Date.now();
  return fetch(url);
}

/**
 * Geocode a city name to coordinates.
 * 1. Exact match in hardcoded cache
 * 2. Partial string match in cache
 * 3. Nominatim API call (rate-limited)
 * 4. Fallback: Montreal
 */
export async function geocodeCity(city: string): Promise<GeoResult> {
  const normalized = city.toLowerCase().trim();

  // 1. Exact match
  if (CITY_CACHE[normalized]) {
    const c = CITY_CACHE[normalized];
    return { latitude: c.lat, longitude: c.lng, displayName: city, timezone: c.tz };
  }

  // 2. Partial match
  for (const [name, coords] of Object.entries(CITY_CACHE)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return { latitude: coords.lat, longitude: coords.lng, displayName: city, timezone: coords.tz };
    }
  }

  // 3. Nominatim API
  try {
    const encodedCity = encodeURIComponent(city);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedCity}&format=json&limit=1`;
    const response = await rateLimitedFetch(url);
    if (response.ok) {
      const results = await response.json();
      if (results && results.length > 0) {
        const result = results[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        return {
          latitude: lat,
          longitude: lng,
          displayName: result.display_name || city,
          timezone: estimateTimezone(lng),
        };
      }
    }
  } catch {
    // Network error — fall through to default
  }

  // 4. Fallback: Montreal
  return {
    latitude: 45.5017,
    longitude: -73.5673,
    displayName: city,
    timezone: -5,
  };
}
