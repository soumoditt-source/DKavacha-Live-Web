import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { GoogleGenAI, Type } from "@google/genai";

export interface VoiceAnalysisRequest {
  language: 'Tamil' | 'English' | 'Hindi' | 'Malayalam' | 'Telugu';
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

  /**
   * REAL-WORLD INFERENCE ENGINE
   * Uses Google Gemini 2.5 Flash (Multimodal) to analyze audio spectrums.
   */
  analyzeVoice(apiKey: string, request: VoiceAnalysisRequest): Observable<VoiceAnalysisResponse> {
    const startTime = Date.now();

    if (!apiKey || apiKey.trim() === '') {
        return throwError(() => new Error('API Key is missing. Please provide a valid Google GenAI Key.'));
    }

    // Wrap the Promise-based SDK in an RxJS Observable
    return from(this.callGeminiModel(apiKey, request)).pipe(
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
        console.error('Gemini API Error:', err);
        return throwError(() => new Error(err.message || 'AI Processing Failed'));
      })
    );
  }

  private async callGeminiModel(key: string, req: VoiceAnalysisRequest): Promise<{ classification: 'AI_GENERATED' | 'HUMAN', confidenceScore: number }> {
    const ai = new GoogleGenAI({ apiKey: key });

    const prompt = `
      You are an elite Digital Forensic AI specialized in Audio Deepfake Detection.
      
      Analyze the provided audio file strictly for artifacts of synthesis, vocoder anomalies, and unnatural spectral continuity.
      Language context: ${req.language}.
      
      Output JSON ONLY using this schema:
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
              confidenceScore: { type: Type.NUMBER, description: "Probability score between 0 and 1" }
            },
            required: ['classification', 'confidenceScore']
          }
        }
      });

      const text = response.text();
      if (!text) throw new Error("Empty response from AI model");
      
      const json = JSON.parse(text);
      return {
        classification: json.classification,
        confidenceScore: json.confidenceScore
      };

    } catch (e: any) {
      console.error("Critical AI Failure:", e);
      throw new Error(`Forensic Analysis Failed: ${e.message}`);
    }
  }
}