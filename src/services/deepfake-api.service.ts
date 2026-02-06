import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { GoogleGenAI, Type } from "@google/genai";

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

    // 🕵️ ULTIMATE FORENSIC PROMPT
    const prompt = `
      Act as a Lead Audio Forensic Analyst. Analyze the provided audio sample for signs of Generative AI cloning.
      
      Target Language: ${req.language === 'Auto-Detect' ? 'Auto-Detect' : req.language}.

      ### 🔬 FORENSIC PROTOCOL (ULTIMATE SPOOF PROOF):
      
      1. **Spectral Dynamics & MFCCs**:
         - **Delta (Δ) Coefficients**: Check for "Over-Smoothing". AI often generates mathematically perfect trajectories. Human speech has erratic, organic inertia.
         - **High-Freq Artifacts**: Scan 7kHz-16kHz for metallic ringing or "spectral smearing" typical of neural vocoders.

      2. **Biological Integrity**:
         - **Micro-Tremors**: Analyze 85Hz-300Hz (F0). Human vocal cords exhibit sub-perceptual jitter/shimmer. AI is often perfectly stable.
         - **Digital Breathlessness**: Check for unnaturally long sentences without inhalation pauses.
         - **Vocal Tract Resonance**: Look for rich formants (F1-F4). AI often lacks the depth of physical tissue resonance.

      3. **Phase & Temporal Continuity**:
         - **Plosive Phase Check**: Inspect 'p', 'b', 't', 'k'. Human plosives have chaotic phase dispersion. AI often "smears" the phase during these transients.
         - **Fricative Noise**: Check 's', 'f', 'z'. AI often generates these as white noise rather than turbulent air flow.

      ### 📝 OUTPUT REQUIREMENT:
      - Return **AI_GENERATED** if: Smoothed Deltas, Metallic Artifacts, Phase Smearing, or Lack of Breath/Jitter.
      - Return **HUMAN** if: Organic Jitter, Natural Breath, chaotic Plosive Phase, and rich Resonance.

      Return JSON ONLY.
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

      const text = response.text;
      if (!text) throw new Error('Empty AI response');

      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const json = JSON.parse(cleanText);
      
      return {
        classification: json.classification,
        confidenceScore: json.confidenceScore
      };

    } catch (e: any) {
      throw new Error(`Forensic Analysis Failed: ${e.message}`);
    }
  }
}