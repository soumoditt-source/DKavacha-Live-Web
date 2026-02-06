
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
    
    // 🕵️ ULTIMATE FORENSIC PROMPT (API VERSION)
    const prompt = `
      Act as a Lead Audio Forensic Analyst. Analyze the provided audio sample for signs of Generative AI cloning.
      
      Target Language: ${language}.

      ### 🔬 FORENSIC PROTOCOL (SPOOF-PROOF STANDARD):
      1. **Advanced MFCC Spectrography**:
         - **Delta (Δ) & Delta-Delta (ΔΔ)**: Analyze the rate of change (velocity) and acceleration of cepstral coefficients. 
         - **Human**: Exhibits erratic, organic variance in Δ/ΔΔ due to physical tissue constraints (mucosal wave irregularities).
         - **AI/Cloned**: Exhibits over-smoothed, mathematically perfect trajectories in Δ/ΔΔ, lacking natural inertia.
      
      2. **Frequency Domain (Hz) Precision**:
         - **Low Band (85Hz-300Hz)**: Check for organic "micro-tremors" in F0 (sub-perceptual jitter > 0.5%). AI often produces flat F0.
         - **High Band (7kHz-16kHz)**: Scan for "spectral smearing" or "metallic ringing" (common in HiFi-GAN/DiffWave vocoders).
         - **Phase Continuity**: Look for unnatural phase alignment in plosive sounds.
      
      3. **Temporal Dynamics**:
         - **Breath Detection**: Identify "Zero-Breath" continuity in long sentences.
         - **Prosody**: Check for unnatural flatness or lack of emotional variance.

      ### 📝 OUTPUT REQUIREMENT:
      Classify strictly based on artifacts.
      - Return **AI_GENERATED** if phase issues, metallic artifacts, or lack of micro-tremors are found.
      - Return **HUMAN** if natural breath, organic jitter, and full-spectrum resonance are present.

      Return JSON ONLY.
      {
        "classification": "AI_GENERATED" | "HUMAN",
        "confidenceScore": number
      }
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
            confidenceScore: { type: Type.NUMBER }
          }
        }
      }
    });

    // ACCESS AS PROPERTY
    const text = response.text;
    
    if (!text) {
        throw new Error('Empty response from AI');
    }

    let result;
    try {
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(cleanText);
    } catch (e) {
        throw new Error('AI Response Malformed JSON');
    }

    return res.status(200).json({
      classification: result.classification,
      confidence: result.confidenceScore || 0.99,
      processedBy: 'DKavacha-Neural-V2-ULTIMATE'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Analysis Failed', details: error.message });
  }
}
