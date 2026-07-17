const API_KEY_STORAGE = 'jommakan_gemini_key';
const MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function envApiKey() {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  } catch {
    return '';
  }
}

export function getApiKey() {
  const fromEnv = envApiKey();
  if (fromEnv) return fromEnv;
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function hasEnvApiKey() {
  return Boolean(envApiKey());
}

export function setApiKey(key) {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function extractJson(text) {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error('NO_JSON_IN_RESPONSE');
  return JSON.parse(match[0]);
}

async function callGemini({ parts, tools, jsonMode, timeoutMs = 25000 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('MISSING_API_KEY');

  const body = { contents: [{ role: 'user', parts }] };
  if (tools) body.tools = tools;
  if (jsonMode) body.generationConfig = { responseMimeType: 'application/json' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE_URL}/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('GEMINI_TIMEOUT');
    throw new Error('GEMINI_NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GEMINI_ERROR_${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
  return text;
}

export async function analyzePantryImage(base64Image, mimeType = 'image/jpeg') {
  const prompt = `You are a kitchen pantry scanner for a Malaysian cooking app. Look at this image and identify all visible food ingredients. For each ingredient, estimate its size/portion as best as you can from the image (e.g. a whole chicken, a bundle of vegetables, a bag of rice) and convert that into a name (Malay name with English in brackets when applicable, e.g. "Ayam (Chicken)"), an estimated quantity, and a unit (g, ml, or pcs). Approximate quantities are fine — exact precision is not required. Respond ONLY with a JSON array, no other text, in this exact format: [{"name": "...", "qty": number, "unit": "g|ml|pcs"}]. If no food ingredients are visible, respond with [].`;

  const text = await callGemini({
    parts: [
      { text: prompt },
      { inlineData: { mimeType, data: base64Image } },
    ],
    jsonMode: true,
  });

  const items = extractJson(text);
  return Array.isArray(items) ? items : [];
}

export async function generateRecipes(pantryItems) {
  const pantryList = (pantryItems || []).map((p) => `${p.name} (${p.qty}${p.unit})`).join(', ');
  const prompt = `You are a Malaysian home-cooking assistant. Based on this pantry: ${pantryList || 'empty pantry'}, suggest up to 5 possible recipes mixing Malay/local dishes and Western dishes that use some or all of these ingredients. The suggestions do not need to match the pantry quantities exactly — a recipe is fine even if the pantry doesn't have quite enough of an ingredient, or has more than needed. Respond ONLY with a JSON array, no other text, in this exact format:
[{"name": "Recipe name", "kind": "ayam|rendang|ikan|nasi|western", "time": number, "difficulty": "Mudah|Sederhana|Sukar", "ingredients": [{"name": "...", "qty": number, "unit": "g|ml|pcs"}], "steps": [{"title": "...", "desc": "...", "duration": number}]}]
"time" is total minutes. "duration" in steps is seconds of waiting/cooking time for that step (0 if none). Write all recipe names, ingredient names, step titles and descriptions in Bahasa Malaysia.`;

  const text = await callGemini({ parts: [{ text: prompt }], jsonMode: true });
  const recipes = extractJson(text);

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
  const prompt = `Search for: "promosi/diskaun makan halal/restaurant near me hari ini" — find real halal food stalls or restaurants near latitude ${lat}, longitude ${lng} in Malaysia that have an active promotion or discount today. For each one, give:
- name: the stall/restaurant name
- promo: the promotion/discount details (promosi/diskaun)
- discountLabel: a short badge version of the promo (e.g. "20% OFF", "Beli 1 Percuma 1")
- distance: approximate distance from the given coordinates (e.g. "1.2 km")
- dateAvailability: the date(s) or period the promotion is valid for (e.g. "Hari ini sahaja", "17-20 Julai 2026", "Setiap Isnin")
- cuisine: the type of food
- rating: a rating out of 5
Respond ONLY with a JSON array, no other text, in this exact format:
[{"name": "...", "cuisine": "...", "promo": "...", "discountLabel": "...", "dateAvailability": "...", "rating": number, "distance": "e.g. 1.2 km"}]
Return up to 6 results, closest first. If no restaurants with an active promotion/discount today are found nearby, respond with [].`;

  const text = await callGemini({
    parts: [{ text: prompt }],
    tools: [{ google_search: {} }],
  });

  const items = extractJson(text);
  const gradients = [
    'from-sambal to-charcoal',
    'from-kaya to-sambal',
    'from-charcoal to-pandan',
    'from-pandan to-kaya',
    'from-sambal to-kaya',
  ];

  return (Array.isArray(items) ? items : []).map((r, i) => ({
    id: `gemini-resto-${Date.now()}-${i}`,
    gradient: gradients[i % gradients.length],
    ...r,
  }));
}
