import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { GoogleGenAI, Type } from "@google/genai";

// Expanded Language Support with Auto-Detect
export type SupportedLanguage = 
  'Auto-Detect' | 'Tamil' | 'English' | 'Hindi' | 'Malayalam' | 'Telugu' | 
  'Bengali' | 'Gujarati' | 'Marathi' | 'Kannada' | 'Odia';

export interface VoiceAnalysisRequest {
  language: SupportedLanguage;
  audioFormat: string;
  audioBase64: string;
}

export interface VoiceAnalysisResponse {
  status: 'success' | 'error';
  classification?: 'AI_GENERATED' | 'HUMAN';
  confidenceScore?: number;
  processingTimeMs?: number;
  error?: string;
  metadata?: {
    encoding: string;
    sampleRate: number;
    language: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DeepfakeApiService {

  analyzeVoice(googleKey: string, request: VoiceAnalysisRequest): Observable<VoiceAnalysisResponse> {
    const startTime = Date.now();

    if (!googleKey) {
        return throwError(() => new Error('Google API Key is missing.'));
    }

    return from(this.callGeminiModel(googleKey, request)).pipe(
      map(aiResult => {
        return {
          status: 'success' as const,
          classification: aiResult.classification,
          confidenceScore: aiResult.confidenceScore,
          processingTimeMs: Date.now() - startTime,
          metadata: {
            encoding: 'mp3',
            sampleRate: 44100,
            language: request.language
          }
        };
      }),
      catchError(err => {
        console.error('AI Error:', err);
        return throwError(() => new Error(err.message || 'Processing Failed'));
      })
    );
  }

  private async callGeminiModel(key: string, req: VoiceAnalysisRequest): Promise<{ classification: 'AI_GENERATED' | 'HUMAN', confidenceScore: number }> {
    const ai = new GoogleGenAI({ apiKey: key });

    // 🕵️ ULTIMATE FORENSIC PROMPT (MFCCs Delta/Delta-Delta + Hz Range)
    const prompt = `
      Act as a Lead Audio Forensic Analyst. Analyze the provided audio sample for signs of Generative AI cloning (RVC, VITS, Tortoise, ElevenLabs, Vall-E).
      
      Target Language: ${req.language === 'Auto-Detect' ? 'Auto-Detect (Analyze phonemes to identify)' : req.language}.

      ### 🔬 FORENSIC PROTOCOL (SPOOF-PROOF STANDARD):
      1. **Advanced MFCC Spectrography**:
         - **Delta (Δ) & Delta-Delta (ΔΔ)**: Analyze the rate of change (velocity) and acceleration of cepstral coefficients. 
         - **Human**: Exhibits erratic, organic variance in Δ/ΔΔ due to physical tissue constraints (mucosal wave irregularities).
         - **AI/Cloned**: Exhibits over-smoothed, mathematically perfect trajectories in Δ/ΔΔ, lacking natural inertia.
      
      2. **Frequency Domain (Hz) Precision**:
         - **Fundamental Frequency (F0)**: Analyze 85Hz-300Hz. Look for **Sub-Perceptual Jitter** (>0.5% variance). AI often generates pitch-perfect F0.
         - **High-Frequency Artifacts (7kHz-16kHz)**: Scan for "spectral smearing", "metallic ringing", or sudden phase cutoffs (common in HiFi-GAN/DiffWave vocoders).
      
      3. **Temporal Dynamics**:
         - **Zero-Breath Continuity**: Detect unnatural sentence chaining without inhalation pauses.
         - **Phoneme Artifacts**: Check for "mushed" fricatives (s, f, z) or unnatural silence gating between words.

      ### 📝 OUTPUT REQUIREMENT:
      Classify strictly based on artifacts.
      - Return **AI_GENERATED** if smooth Δ/ΔΔ, metallic high-freqs, or lack of micro-tremors are found.
      - Return **HUMAN** if natural breath, organic jitter/shimmer, and full-spectrum resonance are present.

      Return JSON ONLY. No markdown. No explanation text outside JSON.
      {
        "classification": "AI_GENERATED" | "HUMAN",
        "confidenceScore": number (0.0 to 1.0)
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'audio/mp3',
                  data: req.audioBase64
                }
              }
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

      // ACCESS AS PROPERTY (New SDK Standard)
      const text = response.text;
      
      if (!text) {
        throw new Error('Empty response received from AI Model');
      }

      // Robust JSON Parsing
      try {
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(cleanText);
        
        if (!json.classification || typeof json.confidenceScore !== 'number') {
           throw new Error('Invalid JSON structure');
        }

        return {
          classification: json.classification,
          confidenceScore: json.confidenceScore
        };
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError, 'Raw Text:', text);
        throw new Error('Failed to parse AI forensic report. The model returned malformed data.');
      }

    } catch (e: any) {
      // Differentiate between network/API errors and parsing errors
      const msg = e.message || 'Unknown Error';
      if (msg.includes('403') || msg.includes('KEY')) {
         throw new Error('Invalid API Key or Permission Denied.');
      }
      throw new Error(`Forensic Analysis Failed: ${msg}`);
    }
  }
}