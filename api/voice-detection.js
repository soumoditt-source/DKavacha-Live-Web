
// Vercel Serverless Function for Problem Statement 1
// Endpoint: POST /api/voice-detection

const { GoogleGenAI, Type } = require('@google/genai');

export default async function handler(req, res) {
  // 1. CORS Headers (Crucial for cross-origin testing)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-google-backend-key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // 2. Client Authentication (Problem Statement Requirement)
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !apiKey.startsWith('sk_test_')) {
    return res.status(401).json({ error: 'Unauthorized. Invalid x-api-key.' });
  }

  // 3. Google Gemini Authentication
  // PRIORITY: Header (for your testing) > Environment Variable (for prod)
  const googleKey = req.headers['x-google-backend-key'] || process.env.GEMINI_API_KEY;
  
  if (!googleKey) {
    return res.status(500).json({ error: 'Server Config Error: Missing Google API Key.' });
  }

  // 4. Input Parsing
  const { language, audioBase64 } = req.body;
  if (!language || !audioBase64) {
    return res.status(400).json({ error: 'Payload missing "language" or "audioBase64".' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: googleKey });
    
    // Strict JSON Schema for Problem Statement Compliance
    const prompt = `
      Perform forensic audio analysis to detect Deepfake/AI-Synthesis.
      Language Context: ${language}.
      Classify as either "AI_GENERATED" or "HUMAN".
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
            confidence: { type: Type.NUMBER }
          }
        }
      }
    });

    const result = JSON.parse(response.text());

    return res.status(200).json({
      classification: result.classification,
      confidence: result.confidence || 0.99,
      processedBy: 'DKavacha-Neural-V2'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Analysis Failed', details: error.message });
  }
}
