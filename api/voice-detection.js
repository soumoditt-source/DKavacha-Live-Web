// Vercel Serverless Function for Problem Statement 1
// Endpoint: POST /api/voice-detection

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
    console.warn(`[SECURITY] Blocked invalid API Key request from IP: ${req.headers['x-forwarded-for'] || 'unknown'}`);
    return res.status(401).json({ error: 'Unauthorized. Invalid x-api-key format.' });
  }

  // 3. Google Gemini Authentication (Fallback to Env)
  const googleKey = req.headers['x-google-backend-key'] || process.env.GEMINI_API_KEY;
  if (!googleKey) {
    console.error('[SERVER] Critical: Missing Google Gemini API Key configuration.');
    return res.status(500).json({ error: 'Server Config Error: Missing Google API Key.' });
  }

  // 4. Robust Input Validation (AGGRESSIVE)
  const { language, audioBase64 } = req.body;
  
  if (!language || !audioBase64) {
    return res.status(400).json({ error: 'Payload missing "language" or "audioBase64".' });
  }

  // Size Check (Strict < 10MB)
  if (audioBase64.length > 14000000) {
      return res.status(413).json({ error: 'Payload too large. Max 10MB audio allowed.' });
  }

  // Format Check (Strict Base64 Regex)
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!base64Regex.test(audioBase64)) {
      return res.status(400).json({ error: 'Invalid Audio Data: Malformed Base64 string.' });
  }

  // 5. Audio File Signature Validation (Magic Bytes)
  try {
      const buffer = Buffer.from(audioBase64.substring(0, 24), 'base64');
      const hex = buffer.toString('hex').toUpperCase();
      
      // Check for common MP3 signatures
      // ID3v2 container: 49 44 33
      // MPEG-1 Layer 3 Sync: FF FB, FF F3, FF F2
      const isMp3 = hex.startsWith('494433') || hex.startsWith('FFF');
      
      if (!isMp3) {
           console.warn(`[VALIDATION] Rejected file with signature: ${hex.substring(0,6)}`);
           return res.status(400).json({ 
               error: 'Invalid file format. Only MP3 files are supported.',
               debug: 'Magic bytes do not match MP3 signature.'
           });
      }
  } catch (e) {
      return res.status(400).json({ error: 'Failed to decode audio header for validation.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: googleKey });
    
    // 🕵️ ULTIMATE FORENSIC PROMPT (API VERSION)
    const prompt = `
      Act as a Lead Audio Forensic Analyst. Analyze the provided audio sample for signs of Generative AI cloning.
      
      Target Language: ${language}.

      ### 🔬 FORENSIC PROTOCOL (ULTIMATE SPOOF PROOF):
      1. **Advanced MFCC Spectrography & Vocal Tract Resonance**:
         - **Delta (Δ) & Delta-Delta (ΔΔ)**: Analyze the rate of change (velocity) and acceleration of cepstral coefficients. Look for **over-smoothed delta/delta-delta coefficients** that lack natural inertia, contrasting with the erratic, organic variance of human speech.
         - **Vocal Tract**: Identify natural formants (F1, F2, F3, F4). Human voices exhibit rich harmonic resonance due to physical tissue constraints. AI-generated speech often lacks this depth.

      2. **Frequency Domain (Hz) Precision & Micro-Tremors**:
         - **Fundamental Frequency (F0)**: Analyze 85Hz-300Hz for **Sub-Perceptual Jitter** (>0.5% variance) and organic **micro-tremors**. AI generation is often pitch-perfect, lacking these biological imperfections.
         - **High-Frequency Artifacts (7kHz-16kHz)**: Scan for **metallic high-frequency artifacts**, "spectral smearing", or sudden phase cutoffs typical of neural vocoders (HiFi-GAN/DiffWave).

      3. **Temporal Dynamics & Phase Continuity**:
         - **Phase Alignment**: Inspect **plosive sounds** (p, t, k, b, d, g). Specific check: Look for **phase continuity issues** where the transient attack is "smeared" or phase-incoherent.
         - **Zero-Breath Continuity**: Detect unnatural sentence chaining without inhalation pauses.

      ### 📝 OUTPUT REQUIREMENT:
      Classify strictly based on artifacts.
      - Return **AI_GENERATED** if smooth Δ/ΔΔ, metallic high-freqs, phase discontinuities in plosives, or lack of micro-tremors are found.
      - Return **HUMAN** if natural breath, organic jitter, valid phase alignment, and full-spectrum resonance are present.

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