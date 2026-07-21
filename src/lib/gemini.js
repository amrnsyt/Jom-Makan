// File Path: src/lib/gemini.js
// Client service routing requests to secure Vercel backend + Geospatial Caching & GPS Fallback

const RESTO_CACHE_KEY = 'jommakan_geo_cache_v1';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 Hours TTL

export function getApiKey() {
  return 'VERCEL_SECURED_KEY'; 
}

export function hasEnvApiKey() {
  return true; 
}

export function setApiKey() {
  /* No-op: Key is managed securely in Vercel environment settings */
}

async function callServerlessApi(action, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout for mobile data

  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `SERVER_ERROR_${res.status}`);
    }

    const data = await res.json();
    return data.result;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('GEMINI_TIMEOUT');
    if (!navigator.onLine) throw new Error('GEMINI_NETWORK_ERROR');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzePantryImage(base64Image, mimeType = 'image/jpeg') {
  const items = await callServerlessApi('analyzePantryImage', { base64Image, mimeType });
  return Array.isArray(items) ? items : [];
}

export async function generateRecipes(pantryItems) {
  const recipes = await callServerlessApi('generateRecipes', { pantryItems });
  const gradients = [
    'from-sambal to-kaya',
    'from-charcoal to-sambal',
    'from-pandan to-kaya',
    'from-pandan to-charcoal',
    'from-kaya to-charcoal',
  ];
  return (Array.isArray(recipes) ? recipes : []).map((r, i) => ({
    id: `gemini-recipe-${Date.now()}-${i}`,
    heroGradient: gradients[i % gradients.length],
    ...r,
  }));
}

export async function findNearbyHalalRestaurants(lat, lng) {
  // Jika koordinat tidak diberikan dari UI, cuba dapatkan melalui GPS pelayar dengan Fallback automatik
  let targetLat = lat;
  let targetLng = lng;

  if (!targetLat || !targetLng) {
    try {
      const position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 7000,
          maximumAge: 60000,
          enableHighAccuracy: false
        });
      });
      targetLat = position.coords.latitude;
      targetLng = position.coords.longitude;
    } catch (geoErr) {
      console.warn('[JomMakan] GPS gagal dikesan/ditolak. Menggunakan lokasi lalai (Kuala Lumpur).', geoErr);
      // Fallback koordinat pusat (Kuala Lumpur)
      targetLat = 3.1390;
      targetLng = 101.6869;
    }
  }

  // 1. Round coordinates to 2 decimal places (~1.1km grid) for effective geospatial matching
  const gridLat = Number(targetLat).toFixed(2);
  const gridLng = Number(targetLng).toFixed(2);
  const cacheKey = `${gridLat}_${gridLng}`;

  // 2. Check local storage cache before making an API call
  try {
    const cachedRaw = localStorage.getItem(RESTO_CACHE_KEY);
    if (cachedRaw) {
      const cacheStore = JSON.parse(cachedRaw);
      const entry = cacheStore[cacheKey];
      if (entry && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
        console.log('[JomMakan] Serving restaurants from Geospatial Cache (0 Tokens used!)');
        return entry.data;
      }
    }
  } catch {
    /* Ignore localStorage read errors */
  }

  // 3. If cache miss or expired, call Gemini API via Serverless backend
  const items = await callServerlessApi('findNearbyHalalRestaurants', { lat: targetLat, lng: targetLng });
  const gradients = [
    'from-sambal to-charcoal',
    'from-kaya to-sambal',
    'from-charcoal to-pandan',
    'from-pandan to-kaya',
    'from-sambal to-kaya',
  ];
  
  const processedResults = (Array.isArray(items) ? items : []).map((r, i) => ({
    id: `gemini-resto-${Date.now()}-${i}`,
    gradient: gradients[i % gradients.length],
    ...r,
  }));

  // 4. Save new results to Geospatial Cache
  try {
    const cachedRaw = localStorage.getItem(RESTO_CACHE_KEY) || '{}';
    const cacheStore = JSON.parse(cachedRaw);
    cacheStore[cacheKey] = {
      timestamp: Date.now(),
      data: processedResults
    };
    localStorage.setItem(RESTO_CACHE_KEY, JSON.stringify(cacheStore));
  } catch {
    /* Ignore quota errors */
  }

  return processedResults;
}

export async function compressImage(file, maxDim = 800, quality = 0.7) {
  // Disertakan bersama modul utiliti jika diperlukan oleh komponen
  const { compressImage: comp } = await import('./image-compressor.js');
  return comp(file, maxDim, quality);
}
