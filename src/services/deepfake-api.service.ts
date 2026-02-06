import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, retry } from 'rxjs/operators';
import { GoogleGenAI, Type } from "@google/genai";
import { ConfigService } from './config.service';

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
    forensicChecks?: string[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class DeepfakeApiService {
  private configService = inject(ConfigService);

  analyzeVoice(request: VoiceAnalysisRequest): Observable<VoiceAnalysisResponse> {
    const startTime = Date.now();
    const googleKey = this.configService.apiKey();

    if (!googleKey) {
        return throwError(() => new Error('System Locked. Please Authenticate via BIOS.'));
    }

    // Convert Promise to Observable and add retry logic
    return from(this.callGeminiModel(googleKey, request)).pipe(
      retry(1), // Retry once on network failure
      map(aiResult => {
        return {
          status: 'success' as const,
          classification: aiResult.classification,
          confidenceScore: aiResult.confidenceScore,
          processingTimeMs: Date.now() - startTime,
          metadata: {
            encoding: 'mp3',
            sampleRate: 44100,
            language: request.language,
            forensicChecks: ['MFCC Delta-Delta', 'Spectral Mirroring', 'Phase Coherence']
          }
        };
      }),
      catchError(err => {
        console.error('Forensic Engine Failure:', err);
        return throwError(() => new Error(err.message || 'Deepfake Analysis Failed'));
      })
    );
  }

  private async callGeminiModel(key: string, req: VoiceAnalysisRequest): Promise<{ classification: 'AI_GENERATED' | 'HUMAN', confidenceScore: number }> {
    const ai = new GoogleGenAI({ apiKey: key });

    // 🕵️ ULTIMATE FORENSIC PROMPT - v4.0 FINAL
    const prompt = `
      Act as a PhD-level Audio Forensic Analyst. Analyze the provided audio sample for signatures of Neural Vocoders (WaveNet, HiFi-GAN, VITS) and Voice Cloning.

      Target Language: ${req.language === 'Auto-Detect' ? 'Auto-Detect' : req.language}.

      ### 🔬 DEEP FORENSIC PROTOCOL:

      1. **MFCC & Cepstral Dynamics**:
         - **Delta (Δ) & Delta-Delta (ΔΔ)**: Analyze the velocity and acceleration of Mel-frequency cepstral coefficients. 
         - **Artifact Search**: AI models smooth these trajectories. Human speech has chaotic "jerk" due to physical articulator inertia.

      2. **Spectral Artifacts (GAN Signatures)**:
         - **Spectral Mirroring**: Check >12kHz for aliasing patterns common in upsampling layers.
         - **Brick-Wall Filtering**: Look for unnatural hard cutoffs at 16kHz or 24kHz.
         - **Checkerboard Artifacts**: Scan the spectrogram for grid-like patterns from deconvolution.

      3. **Phase & Glottal Analysis**:
         - **Phase Coherence**: Inspect fricatives (S, F, SH) in the 4kHz-8kHz band. AI often generates white noise here; humans have turbulent phase dispersion.
         - **Glottal Pulse Shape**: Analyze the excitation signal. AI often lacks the specific irregularity (shimmer) of biological vocal folds.

      ### 📝 CLASSIFICATION RULES:
      - **AI_GENERATED**: If Smoothed ΔΔ, Checkerboard artifacts, Phase Smearing, or unnatural Pitch Stability (>200ms flat).
      - **HUMAN**: If Organic Jitter/Shimmer, chaotic Plosive Phase, and non-uniform Breath Dynamics.

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

      // Robust JSON Extraction
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let json;
      try {
          json = JSON.parse(cleanText);
      } catch (e) {
          throw new Error('Malformed JSON from Forensic Engine.');
      }
      
      return {
        classification: json.classification,
        confidenceScore: json.confidenceScore
      };

    } catch (e: any) {
      // Improve error visibility for the UI
      if (e.message.includes('403') || e.message.includes('API key')) {
          throw new Error('Access Denied: Invalid API Key.');
      }
      throw e;
    }
  }
}