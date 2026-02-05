import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import * as Astronomy from 'https://esm.sh/astronomy-engine@2.1.19'

// --- Zodiac helpers (inline for Deno edge function) ---

const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]

function getZodiacSign(longitude: number): string {
  const normalizedLong = ((longitude % 360) + 360) % 360
  const signIndex = Math.floor(normalizedLong / 30)
  return ZODIAC_SIGNS[signIndex]
}

function getDegreeInSign(longitude: number): number {
  const normalizedLong = ((longitude % 360) + 360) % 360
  return Math.round((normalizedLong % 30) * 100) / 100
}

// --- Geocentric longitude helpers ---

function getGeocentricLongitude(body: string, time: any): number {
  if (body === 'Sun') {
    return Astronomy.SunPosition(time).elon
  }
  if (body === 'Moon') {
    return Astronomy.EclipticGeoMoon(time).lon
  }
  const geo = Astronomy.GeoVector(body, time, true)
  const ecl = Astronomy.Ecliptic(geo)
  return ecl.elon
}

// --- Ascendant calculation ---

function calculateAscendant(time: any, latitude: number, longitude: number): number {
  const gmstHours = Astronomy.SiderealTime(time)
  const gmstDeg = gmstHours * 15
  const lst = ((gmstDeg + longitude) % 360 + 360) % 360
  const lstRad = lst * Math.PI / 180

  const T = (time.ut - 0) / 36525
  const eps = (23.439291 - 0.0130042 * T) * Math.PI / 180
  const latRad = latitude * Math.PI / 180

  const y = -Math.cos(lstRad)
  const x = Math.sin(eps) * Math.tan(latRad) + Math.cos(eps) * Math.sin(lstRad)
  let asc = Math.atan2(y, x) * 180 / Math.PI
  asc = ((asc % 360) + 360) % 360

  return asc
}

// --- Aspect detection ---

const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 8, type: 'intense' },
  { name: 'sextile', angle: 60, orb: 6, type: 'harmonious' },
  { name: 'square', angle: 90, orb: 7, type: 'challenging' },
  { name: 'trine', angle: 120, orb: 8, type: 'harmonious' },
  { name: 'opposition', angle: 180, orb: 8, type: 'challenging' },
]

function detectAspect(long1: number, long2: number): { name: string; angle: number; actualOrb: number; type: string } | null {
  const diff = Math.abs(((long1 - long2 + 180) % 360) - 180)
  for (const aspect of ASPECTS) {
    const orbDiff = Math.abs(diff - aspect.angle)
    if (orbDiff <= aspect.orb) {
      return {
        name: aspect.name,
        angle: aspect.angle,
        actualOrb: Math.round(orbDiff * 100) / 100,
        type: aspect.type,
      }
    }
  }
  return null
}

function signDegreeToLongitude(sign: string, degree: number): number {
  const index = ZODIAC_SIGNS.indexOf(sign.toLowerCase())
  if (index < 0) return 0
  return index * 30 + degree
}

// --- Geocoding: hardcoded cache + Nominatim ---

const CITY_CACHE: Record<string, { lat: number; lng: number }> = {
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'montreal': { lat: 45.5017, lng: -73.5673 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'berlin': { lat: 52.5200, lng: 13.4050 },
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'beijing': { lat: 39.9042, lng: 116.4074 },
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'delhi': { lat: 28.7041, lng: 77.1025 },
  'cairo': { lat: 30.0444, lng: 31.2357 },
  'são paulo': { lat: -23.5505, lng: -46.6333 },
  'sao paulo': { lat: -23.5505, lng: -46.6333 },
  'mexico city': { lat: 19.4326, lng: -99.1332 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
  'moscow': { lat: 55.7558, lng: 37.6173 },
  'seoul': { lat: 37.5665, lng: 126.9780 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'bangkok': { lat: 13.7563, lng: 100.5018 },
  'istanbul': { lat: 41.0082, lng: 28.9784 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'lisbon': { lat: 38.7223, lng: -9.1393 },
  'riyadh': { lat: 24.7136, lng: 46.6753 },
  'johannesburg': { lat: -26.2041, lng: 28.0473 },
  'casablanca': { lat: 33.5731, lng: -7.5898 },
  'algiers': { lat: 36.7538, lng: 3.0588 },
  'tunis': { lat: 36.8065, lng: 10.1815 },
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const normalized = city.toLowerCase().trim()

  // Exact match
  if (CITY_CACHE[normalized]) return CITY_CACHE[normalized]

  // Partial match
  for (const [name, coords] of Object.entries(CITY_CACHE)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return coords
    }
  }

  // Nominatim API
  try {
    const encodedCity = encodeURIComponent(city)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedCity}&format=json&limit=1`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AstroDatingApp/1.0' },
    })
    if (response.ok) {
      const results = await response.json()
      if (results && results.length > 0) {
        return {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
        }
      }
    }
  } catch {
    // Fall through
  }

  return null
}

// --- Planet positions ---

const PLANET_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']

function calculatePlanetPositions(time: any): Record<string, { longitude: number; sign: string; degree: number }> {
  const planets: Record<string, { longitude: number; sign: string; degree: number }> = {}
  for (const body of PLANET_BODIES) {
    const long = getGeocentricLongitude(body, time)
    planets[body.toLowerCase()] = {
      longitude: long,
      sign: getZodiacSign(long),
      degree: getDegreeInSign(long),
    }
  }
  return planets
}

// --- Aspect-based compatibility scoring ---

const COMPATIBILITY_PAIRS = [
  { key1: 'sun', key2: 'sun', weight: 1.0 },
  { key1: 'moon', key2: 'moon', weight: 1.0 },
  { key1: 'sun', key2: 'moon', weight: 0.9 },
  { key1: 'moon', key2: 'sun', weight: 0.9 },
  { key1: 'venus', key2: 'mars', weight: 0.85 },
  { key1: 'mars', key2: 'venus', weight: 0.85 },
  { key1: 'mercury', key2: 'mercury', weight: 0.7 },
  { key1: 'rising', key2: 'sun', weight: 0.7 },
  { key1: 'sun', key2: 'rising', weight: 0.7 },
  { key1: 'jupiter', key2: 'jupiter', weight: 0.5 },
  { key1: 'saturn', key2: 'saturn', weight: 0.5 },
  { key1: 'venus', key2: 'venus', weight: 0.6 },
]

// Category-specific pairs for synastry
const SYNASTRY_CATEGORY_PAIRS = [
  { key1: 'moon', key2: 'moon', category: 'emotional' },
  { key1: 'moon', key2: 'venus', category: 'emotional' },
  { key1: 'venus', key2: 'moon', category: 'emotional' },
  { key1: 'mercury', key2: 'mercury', category: 'communication' },
  { key1: 'mercury', key2: 'sun', category: 'communication' },
  { key1: 'sun', key2: 'mercury', category: 'communication' },
  { key1: 'venus', key2: 'mars', category: 'passion' },
  { key1: 'mars', key2: 'venus', category: 'passion' },
  { key1: 'saturn', key2: 'sun', category: 'longTerm' },
  { key1: 'sun', key2: 'saturn', category: 'longTerm' },
  { key1: 'saturn', key2: 'saturn', category: 'longTerm' },
  { key1: 'venus', key2: 'venus', category: 'values' },
  { key1: 'jupiter', key2: 'jupiter', category: 'growth' },
]

function getLongFromChart(chart: any, key: string): number {
  if (key === 'sun' || key === 'moon' || key === 'rising') {
    return chart[key]?.longitude ?? signDegreeToLongitude(chart[key]?.sign || 'aries', chart[key]?.degree || 0)
  }
  const planet = chart.planets?.[key]
  if (planet) {
    return planet.longitude ?? signDegreeToLongitude(planet.sign || 'aries', planet.degree || 0)
  }
  return 0
}

function calculateCompatibility(chart1: any, chart2: any): {
  overall: number
  emotional: number
  communication: number
  passion: number
  longTerm: number
  values: number
  growth: number
} {
  // Overall score using weighted aspect pairs
  let totalWeight = 0
  let weightedScore = 0

  for (const pair of COMPATIBILITY_PAIRS) {
    const long1 = getLongFromChart(chart1, pair.key1)
    const long2 = getLongFromChart(chart2, pair.key2)
    const aspect = detectAspect(long1, long2)
    totalWeight += pair.weight

    if (aspect) {
      const orbTightness = 1 - aspect.actualOrb / 10
      if (aspect.type === 'harmonious') {
        weightedScore += pair.weight * orbTightness * 1.0
      } else if (aspect.type === 'intense') {
        weightedScore += pair.weight * orbTightness * 0.6
      } else {
        weightedScore -= pair.weight * orbTightness * 0.5
      }
    }
  }

  const ratio = totalWeight > 0 ? weightedScore / totalWeight : 0
  const overall = Math.max(0, Math.min(100, Math.round(50 + ratio * 40)))

  // Category scores
  const catScores: Record<string, { total: number; count: number }> = {
    emotional: { total: 0, count: 0 },
    communication: { total: 0, count: 0 },
    passion: { total: 0, count: 0 },
    longTerm: { total: 0, count: 0 },
    values: { total: 0, count: 0 },
    growth: { total: 0, count: 0 },
  }

  for (const pair of SYNASTRY_CATEGORY_PAIRS) {
    const long1 = getLongFromChart(chart1, pair.key1)
    const long2 = getLongFromChart(chart2, pair.key2)
    const aspect = detectAspect(long1, long2)

    let score = 55 // neutral default
    if (aspect) {
      const orbTightness = 1 - aspect.actualOrb / 10
      if (aspect.type === 'harmonious') {
        score = 70 + orbTightness * 25
      } else if (aspect.type === 'intense') {
        score = 60 + orbTightness * 20
      } else {
        score = 35 + orbTightness * 15
      }
    }

    catScores[pair.category].total += score
    catScores[pair.category].count += 1
  }

  const avg = (key: string) => {
    const c = catScores[key]
    return c.count > 0 ? Math.round(c.total / c.count) : 55
  }

  return {
    overall,
    emotional: avg('emotional'),
    communication: avg('communication'),
    passion: avg('passion'),
    longTerm: avg('longTerm'),
    values: avg('values'),
    growth: avg('growth'),
  }
}

// --- Server handler ---

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { action, ...params } = await req.json()

    let result: any

    switch (action) {
      case 'calculate_chart': {
        const { birthDate, birthTime, birthCity, latitude, longitude } = params

        // Parse birth date and time
        const [year, month, day] = birthDate.split('-').map(Number)
        let hour = 12
        let minute = 0

        if (birthTime) {
          const timeParts = birthTime.split(':')
          hour = parseInt(timeParts[0]) || 12
          minute = parseInt(timeParts[1]) || 0
        }

        // Get coordinates
        let lat = latitude
        let lng = longitude

        if (!lat || !lng) {
          if (birthCity) {
            const coords = await geocodeCity(birthCity)
            if (coords) {
              lat = coords.lat
              lng = coords.lng
            } else {
              lat = 51.5074
              lng = 0
            }
          } else {
            lat = 51.5074
            lng = 0
          }
        }

        // Create astronomy-engine time
        const date = new Date(year, month - 1, day, hour, minute, 0, 0)
        const time = Astronomy.MakeTime(date)

        // Calculate positions using astronomy-engine
        const sunLong = getGeocentricLongitude('Sun', time)
        const moonLong = getGeocentricLongitude('Moon', time)
        const ascendantLong = calculateAscendant(time, lat, lng)
        const planets = calculatePlanetPositions(time)

        result = {
          sun: {
            longitude: sunLong,
            sign: getZodiacSign(sunLong),
            degree: getDegreeInSign(sunLong)
          },
          moon: {
            longitude: moonLong,
            sign: getZodiacSign(moonLong),
            degree: getDegreeInSign(moonLong)
          },
          rising: {
            longitude: ascendantLong,
            sign: getZodiacSign(ascendantLong),
            degree: getDegreeInSign(ascendantLong)
          },
          planets,
          coordinates: { latitude: lat, longitude: lng },
          julianDay: time.ut + 2451545.0
        }
        break
      }

      case 'calculate_synastry': {
        const { chart1, chart2 } = params
        result = calculateCompatibility(chart1, chart2)
        break
      }

      case 'get_sun_sign': {
        const { birthDate } = params
        const [year, month, day] = birthDate.split('-').map(Number)
        const date = new Date(year, month - 1, day, 12, 0, 0, 0)
        const time = Astronomy.MakeTime(date)
        const sunLong = getGeocentricLongitude('Sun', time)
        result = {
          sign: getZodiacSign(sunLong),
          degree: getDegreeInSign(sunLong)
        }
        break
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
