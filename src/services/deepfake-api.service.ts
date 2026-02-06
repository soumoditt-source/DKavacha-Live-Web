import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { GoogleGenAI, Type } from "@google/genai";

// Expanded Language Support (Problem Statement + Upgrades)
export type SupportedLanguage = 
  'Tamil' | 'English' | 'Hindi' | 'Malayalam' | 'Telugu' | 
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

    // Updated Prompt for Voice Cloning Detection
    const prompt = `
      Perform advanced forensic audio analysis.
      Language: ${req.language}.

      Tasks:
      1. Detect artifacts of Voice Cloning (VC) and Text-to-Speech (TTS).
      2. Analyze spectral continuity, breath patterns, and prosody.
      3. Look for "metallic" artifacts or unnaturally perfect pitch stability common in AI.
      4. Classify if the speaker is a Real Human or AI Generated/Cloned.
      
      Return JSON ONLY:
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

      const text = response.text();
      const json = JSON.parse(text);
      
      return {
        classification: json.classification,
        confidenceScore: json.confidenceScore
      };

    } catch (e: any) {
      throw new Error(`AI Analysis Error: ${e.message}`);
    }
  }
}