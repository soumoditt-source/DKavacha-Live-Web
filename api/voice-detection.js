
// Vercel Serverless Function for "Problem Statement 1"
// Endpoint: POST /api/voice-detection

const { GoogleGenAI, Type } = require('@google/genai');

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. API Key Authentication (x-api-key)
  const apiKey = req.headers['x-api-key'];
  // In a real scenario, validate against a database. Here we check the format/value.
  if (!apiKey || !apiKey.startsWith('sk_test_')) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }

  // 3. Input Validation
  const { language, audioFormat, audioBase64 } = req.body;
  if (!language || !audioBase64) {
    return res.status(400).json({ error: 'Missing required fields: language, audioBase64' });
  }

  // 4. AI Processing (Using Server-Side Env Variable for Google Key)
  // NOTE: You must set GEMINI_API_KEY in Vercel Environment Variables
  const googleKey = process.env.GEMINI_API_KEY;
  
  if (!googleKey) {
    return res.status(500).json({ error: 'Server Configuration Error: GEMINI_API_KEY missing' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: googleKey });
    const prompt = `
      Analyze this audio for Deepfake artifacts. 
      Language: ${language}.
      Return JSON: { "classification": "AI_GENERATED" | "HUMAN" }.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            classification: { type: Type.STRING, enum: ['AI_GENERATED', 'HUMAN'] },
          }
        }
      }
    });

    const jsonText = response.text();
    const result = JSON.parse(jsonText);

    // 5. Success Response
    return res.status(200).json({
      status: 'success',
      classification: result.classification, // AI_GENERATED or HUMAN
      language: language,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Processing Error:', error);
    return res.status(500).json({ error: 'Internal AI Processing Failed', details: error.message });
  }
}
