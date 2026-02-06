
// Vercel Serverless Function for Problem Statement 1
// Endpoint: POST /api/voice-detection

const { GoogleGenAI, Type } = require('@google/genai');

export default async function handler(req, res) {
  // 1. CORS Headers
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

  // 2. Client Authentication
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !apiKey.startsWith('sk_test_')) {
    return res.status(401).json({ error: 'Unauthorized. Invalid x-api-key.' });
  }

  // 3. Google Gemini Authentication
  const googleKey = req.headers['x-google-backend-key'] || process.env.GEMINI_API_KEY;
  if (!googleKey) {
    return res.status(500).json({ error: 'Server Config Error: Missing Google API Key.' });
  }

  // 4. Robust Input Validation
  const { language, audioBase64 } = req.body;
  
  if (!language || !audioBase64) {
    return res.status(400).json({ error: 'Payload missing "language" or "audioBase64".' });
  }

  // Size Check (Strict < 10MB)
  if (audioBase64.length > 14000000) {
      return res.status(413).json({ error: 'Payload too large. Max 10MB audio.' });
  }

  // Format Check (Basic Base64 Regex)
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!base64Regex.test(audioBase64)) {
      return res.status(400).json({ error: 'Invalid Audio Data: Malformed Base64.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: googleKey });
    
    // Detailed Prompt for all supported languages
    const prompt = `
      Perform forensic audio analysis for Deepfake/Voice Cloning artifacts.
      Language Context: ${language}.
      Supported Languages: Tamil, English, Hindi, Malayalam, Telugu, Bengali, Gujarati, Marathi, Kannada, Odia.

      Analyze for:
      - Synthetic prosody (unnatural rhythm)
      - Metallic spectral artifacts
      - Zero-breath continuity (AI often forgets to breathe)
      
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

    // FIX: response.text is a property, not a function
    const text = response.text;
    
    if (!text) {
        throw new Error('Empty response from AI');
    }

    const result = JSON.parse(text);

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
