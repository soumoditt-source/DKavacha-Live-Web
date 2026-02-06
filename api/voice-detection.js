import { GoogleGenAI, Type } from "@google/genai";

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
    return res.status(401).json({ error: 'Unauthorized. Invalid x-api-key format.' });
  }

  // 3. Google Gemini Authentication
  const googleKey = req.headers['x-google-backend-key'] || process.env.GEMINI_API_KEY;
  if (!googleKey) {
    return res.status(500).json({ error: 'Server Config Error: Missing Google API Key.' });
  }

  const { language, audioBase64 } = req.body;
  
  if (!language || !audioBase64) {
    return res.status(400).json({ error: 'Payload missing data.' });
  }

  if (audioBase64.length > 14000000) {
      return res.status(413).json({ error: 'Payload too large.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: googleKey });
    
    // 🕵️ ULTIMATE FORENSIC PROMPT (SERVER SIDE SYNC)
    const prompt = `
      Act as a Lead Audio Forensic Analyst. Analyze the provided audio sample for signs of Generative AI cloning.
      
      Target Language: ${language}.

      ### 🔬 FORENSIC PROTOCOL (ULTIMATE SPOOF PROOF):
      
      1. **Spectral Dynamics & MFCCs**:
         - **Delta (Δ) Coefficients**: Check for "Over-Smoothing". AI often generates mathematically perfect trajectories. Human speech has erratic, organic inertia.
         - **High-Freq Artifacts**: Scan 7kHz-16kHz for metallic ringing or "spectral smearing".

      2. **Biological Integrity**:
         - **Micro-Tremors**: Analyze 85Hz-300Hz (F0). Human vocal cords exhibit sub-perceptual jitter/shimmer. AI is often perfectly stable.
         - **Digital Breathlessness**: Check for unnaturally long sentences without inhalation pauses.
         - **Vocal Tract Resonance**: Look for rich formants (F1-F4). AI often lacks the depth of physical tissue resonance.

      3. **Phase & Temporal Continuity**:
         - **Plosive Phase Check**: Inspect 'p', 'b', 't', 'k'. Human plosives have chaotic phase dispersion. AI often "smears" the phase.
         - **Fricative Noise**: Check 's', 'f', 'z'. AI often generates these as white noise.

      ### 📝 OUTPUT REQUIREMENT:
      - Return **AI_GENERATED** if: Smoothed Deltas, Metallic Artifacts, Phase Smearing, or Lack of Breath/Jitter.
      - Return **HUMAN** if: Organic Jitter, Natural Breath, chaotic Plosive Phase, and rich Resonance.

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

    const text = response.text;
    if (!text) throw new Error('Empty response');

    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);

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