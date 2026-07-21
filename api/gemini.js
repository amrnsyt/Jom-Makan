// File Path: api/gemini.js
// Vercel Serverless Function to keep API keys secure and enforce Structured Outputs

const MODEL = 'gemini-3.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const SCHEMAS = {
  pantry: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        qty: { type: "NUMBER" },
        unit: { type: "STRING" }
      },
      required: ["name", "qty", "unit"]
    }
  },
  recipes: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        kind: { type: "STRING" },
        time: { type: "NUMBER" },
        difficulty: { type: "STRING" },
        ingredients: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { name: { type: "STRING" }, qty: { type: "NUMBER" }, unit: { type: "STRING" } },
            required: ["name", "qty", "unit"]
          }
        },
        steps: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { title: { type: "STRING" }, desc: { type: "STRING" }, duration: { type: "NUMBER" } },
            required: ["title", "desc", "duration"]
          }
        }
      },
      required: ["name", "kind", "time", "difficulty", "ingredients", "steps"]
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MISSING_API_KEY: Server environment variable GEMINI_API_KEY is not configured.' });
  }

  const { action, payload } = req.body;

  try {
    let parts = [];
    let tools = null;
    let schema = null;

    if (action === 'analyzePantryImage') {
      schema = SCHEMAS.pantry;
      parts = [
        { text: `You are a kitchen pantry scanner for a Malaysian cooking app. Look at this image and identify all visible food ingredients. For each ingredient, estimate its size/portion and convert that into a Malay name with English in brackets when applicable (e.g., "Ayam (Chicken)"), an estimated quantity, and a unit (g, ml, or pcs). Approximate quantities are fine. Respond ONLY with a valid JSON array matching the schema.` },
        { inlineData: { mimeType: payload.mimeType || 'image/jpeg', data: payload.base64Image } }
      ];
    } else if (action === 'generateRecipes') {
      schema = SCHEMAS.recipes;
      const pantryList = (payload.pantryItems || []).map((p) => `${p.name} (${p.qty}${p.unit})`).join(', ');
      parts = [
        { text: `You are a Malaysian home-cooking assistant. Based on this pantry: ${pantryList || 'empty pantry'}, suggest up to 5 possible recipes mixing Malay/local dishes and Western dishes using these ingredients. The suggestions do not need to match quantities exactly. Write all names, ingredients, step titles, and descriptions in Bahasa Malaysia. "time" is total minutes. "duration" in steps is seconds of waiting/cooking time (0 if none). Respond ONLY with a valid JSON array matching the schema.` }
      ];
    } else if (action === 'findNearbyHalalRestaurants') {
      tools = [{ google_search: {} }];
      parts = [
        { text: `Search for halal food spots, restaurants, or food stalls near latitude ${payload.lat}, longitude ${payload.lng} in Malaysia. Find places that have good reviews or active promotions. For each one, provide: name, promo (or description), discountLabel (e.g. "Halal", "Popular", "10% OFF"), distance (e.g. "1.2 km"), dateAvailability ("Hari Ini"), cuisine, and rating out of 5. Respond ONLY with a valid JSON array in this exact format: [{"name": "...", "cuisine": "...", "promo": "...", "discountLabel": "...", "dateAvailability": "...", "rating": number, "distance": "e.g. 1.2 km"}]. Return up to 6 results, closest first.` }
      ];
    } else {
      return res.status(400).json({ error: 'Invalid action specified' });
    }

    const body = {
      contents: [{ role: 'user', parts }],
      ...(tools && { tools }),
      generationConfig: {
        responseMimeType: 'application/json',
        ...(schema && { responseSchema: schema })
      }
    };

    const response = await fetch(`${BASE_URL}/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `GEMINI_API_ERROR (${response.status}): ${errText}` });
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');

    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    const parsedJson = match ? JSON.parse(match[0]) : [];

    return res.status(200).json({ result: parsedJson });
  } catch (err) {
    console.error('[Vercel API Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
