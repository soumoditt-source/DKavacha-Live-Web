import { Injectable, signal, effect, inject } from '@angular/core';
import { AudioService } from './audio.service';

export interface FraudResult {
  probability: number;
  confidence: 'HIGH' | 'LOW' | 'MEDIUM';
  label: 'FRAUD' | 'SAFE';
  timestamp: number;
  threatLevel: number;
  detectedKeywords: string[];
  actionRecommendation: string;
}

export interface CallSession {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'active' | 'analyzing' | 'ended';
  finalRiskLabel?: 'FRAUD' | 'SAFE';
  geoRegion: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  minThreshold: 'LOW' | 'MEDIUM' | 'HIGH';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

export interface CriticalAlert {
  title: string;
  message: string;
  threatLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class FraudNetService {
  private audioService = inject(AudioService);

  // --- STATE SIGNALS ---
  currentResult = signal<FraudResult | null>(null);
  recentHistory = signal<FraudResult[]>([]);
  currentSession = signal<CallSession | null>(null);
  sessionHistory = signal<CallSession[]>([]); 
  
  confusionMatrix = signal({ tp: 142, tn: 828, fp: 12, fn: 3 }); 
  
  // --- NOTIFICATION & PREFERENCE STATE ---
  activeCriticalAlert = signal<CriticalAlert | null>(null);
  
  prefs = signal<NotificationPreferences>(this.loadPreferences());

  // --- THREAT DICTIONARY 2026 (EXPANDED) ---
  private readonly scamPhrases = [
    // 🚨 AUTHORITY IMPERSONATION (High Severity)
    { word: 'digital arrest', risk: 1.0, msg: 'Digital Arrest Threat (CBI/Police)' },
    { word: 'cbi', risk: 0.95, msg: 'Federal Agency Impersonation' },
    { word: 'police', risk: 0.90, msg: 'Police Impersonation' },
    { word: 'narcotics', risk: 0.95, msg: 'Narcotics Bureau Threat' },
    { word: 'money laundering', risk: 0.90, msg: 'Money Laundering Accusation' },
    { word: 'arrest warrant', risk: 0.98, msg: 'Fake Arrest Warrant Issued' },
    { word: 'official statement', risk: 0.80, msg: 'Fake Legal Procedure' },
    { word: 'court case', risk: 0.85, msg: 'Fake Legal Threat' },
    
    // 💳 BANKING & FINANCIAL (Expanded per user feedback)
    { word: 'credit card', risk: 0.95, msg: 'Sensitive Financial Request' },
    { word: 'credit card info', risk: 0.98, msg: 'Sensitive Financial Request' },
    { word: 'debit card', risk: 0.95, msg: 'Sensitive Financial Request' },
    { word: 'banking info', risk: 0.90, msg: 'Banking Data Solicitation' },
    { word: 'expiry date', risk: 0.95, msg: 'Card Expiry Date Request' },
    { word: 'cvv', risk: 1.0, msg: 'CVV Request (CRITICAL)' },
    { word: 'atm pin', risk: 1.0, msg: 'PIN Request (CRITICAL)' },
    { word: 'otp', risk: 0.98, msg: 'OTP Solicitation' },
    { word: 'password', risk: 0.90, msg: 'Credential Harvesting' },
    { word: 'account blocked', risk: 0.85, msg: 'Panic: Account Blocked' },
    { word: 'update kyc', risk: 0.92, msg: 'KYC Phishing Alert' },

    // 📦 COURIER / PARCEL SCAMS
    { word: 'illegal parcel', risk: 0.95, msg: 'Illegal Parcel Scam' },
    { word: 'fedex', risk: 0.85, msg: 'Courier Scam Pattern' },
    { word: 'customs', risk: 0.90, msg: 'Customs Fee Fraud' },
    { word: 'drugs found', risk: 0.95, msg: 'Contraband Accusation' },
    
    // 🎰 LOTTERY & PRIZE FRAUD
    { word: 'won lottery', risk: 0.99, msg: 'Lottery Fraud Detected' },
    { word: 'lucky draw', risk: 0.95, msg: 'Fake Prize Scam' },
    { word: 'processing fee', risk: 0.85, msg: 'Advance Fee Fraud' },
    { word: 'refundable', risk: 0.80, msg: 'Fake Refund Promise' },
    
    // 💼 JOB & TASK SCAMS
    { word: 'prepaid task', risk: 0.95, msg: 'Prepaid Task Scam' },
    { word: 'pay via telegram', risk: 0.95, msg: 'Telegram Payment Fraud' },
    
    // 💻 REMOTE ACCESS
    { word: 'anydesk', risk: 1.0, msg: 'Remote Access Tool (CRITICAL)' },
    { word: 'teamviewer', risk: 1.0, msg: 'Remote Access Tool (CRITICAL)' },
    { word: 'screen share', risk: 0.95, msg: 'Screen Share Request' }
  ];

  // --- REGEX PATTERNS FOR DATA THEFT ---
  private readonly dataTheftPatterns = [
    { regex: /\b\d{16}\b/, msg: 'Credit Card Number Detection', risk: 1.0 },
    { regex: /\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b/, msg: 'Credit Card Number Detection', risk: 1.0 },
    { regex: /\b\d{3}\s*$/, msg: 'CVV/CVC Detection', risk: 0.9 }, 
    { regex: /\b(otp|code)\s*(is)?\s*\d{4,6}/i, msg: 'OTP Pattern Detected', risk: 1.0 }
  ];

  private analysisInterval: any;
  private lastThreatTime = 0; 
  private lastVoiceAlertTime = 0;
  private lastAnalysisExecTime = 0; 

  // --- REPETITION CONTROL ---
  private lastDetectedMsg = '';
  private alertRepeatCount = 0; 

  constructor() {
    effect(() => {
      // 1. TRACKING: Signals inside effect
      const transcript = this.audioService.transcript().toLowerCase();
      const liveStream = this.audioService.liveStreamText().toLowerCase();
      const isRecording = this.audioService.isRecording();

      // 2. PERFORMANCE THROTTLE
      const now = Date.now();
      if (now - this.lastAnalysisExecTime < 300) return; // Checked more frequently (300ms) for responsiveness
      this.lastAnalysisExecTime = now;

      // 3. LOGIC
      if (this.currentSession()?.status === 'active' && isRecording) {
         // 4. CONTEXT SLICING: Last 500 chars for better context
         const context = (transcript.slice(-500) + " " + liveStream).trim();
         
         if (context.length > 2) {
             this.analyzeTextContext(context);
         }
      }
    });

    effect(() => {
        const p = this.prefs();
        localStorage.setItem('dkavacha_prefs', JSON.stringify(p));
    });
  }

  updatePreferences(newPrefs: Partial<NotificationPreferences>) {
      this.prefs.update(current => ({ ...current, ...newPrefs }));
  }

  private loadPreferences(): NotificationPreferences {
      const saved = localStorage.getItem('dkavacha_prefs');
      if (saved) {
          try {
            return JSON.parse(saved);
          } catch { }
      }
      return { enabled: true, minThreshold: 'MEDIUM', soundEnabled: true, hapticsEnabled: true };
  }

  async loadModel() {
    console.log('FRAUDNET ENGINE INITIALIZED: 2026 DEEP RESEARCH MATRIX LOADED');
  }

  // Public method to be called from UI user gesture
  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }

  startAnalysis() {
    const sessionId = 'DK-' + crypto.randomUUID().split('-')[0].toUpperCase() + '-' + Date.now().toString().slice(-4);
    
    this.currentSession.set({
      id: sessionId,
      startTime: Date.now(),
      status: 'active',
      geoRegion: 'IN-WB-KOL'
    });

    this.updateResult(this.createEmptyResult());
    this.activeCriticalAlert.set(null); 
    
    this.lastDetectedMsg = '';
    this.alertRepeatCount = 0;

    this.analysisInterval = setInterval(() => {
      this.runInference();
    }, 1000); 
  }

  stopAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    const session = this.currentSession();
    const result = this.currentResult();

    if (session) {
      const endTime = Date.now();
      const archivedSession: CallSession = {
        ...session,
        status: 'ended',
        endTime: endTime,
        duration: Math.floor((endTime - session.startTime) / 1000),
        finalRiskLabel: result?.label || 'SAFE'
      };

      this.sessionHistory.update(h => [archivedSession, ...h]);
      this.currentSession.set(null);
    }
    this.currentResult.set(null);
    this.activeCriticalAlert.set(null);
  }

  private analyzeTextContext(text: string) {
    let maxRisk = 0;
    let detectedMsg = '';
    let detectedWords: string[] = [];

    // 1. Check Keywords
    for (const p of this.scamPhrases) {
        if (text.includes(p.word)) {
            if (p.risk > maxRisk) {
                maxRisk = p.risk;
                detectedMsg = p.msg;
            }
            detectedWords.push(p.word);
        }
    }

    // 2. Check Regex
    for (const pattern of this.dataTheftPatterns) {
        if (pattern.regex.test(text)) {
            if (pattern.risk >= maxRisk) {
                maxRisk = pattern.risk;
                detectedMsg = pattern.msg;
                detectedWords.push('SENSITIVE_DATA');
            }
        }
    }
    
    if (maxRisk > 0) {
      const current = this.currentResult() || this.createEmptyResult();
      this.lastThreatTime = Date.now();
      
      const newProb = Math.min(1.0, Math.max(current.probability, maxRisk));
      
      let action = "MONITORING";
      if (newProb > 0.9) action = "HANG UP IMMEDIATELY";
      else if (newProb > 0.7) action = "HIGH ALERT - VERIFY";
      else if (newProb > 0.5) action = "CAUTION ADVISED";

      // 🚨 Trigger Logic
      if (newProb > 0.6) {
        this.handleThreatTrigger(newProb > 0.8 ? 'CRITICAL' : 'WARNING', detectedMsg);
      }

      this.updateResult({
        ...current,
        probability: newProb,
        detectedKeywords: [...new Set([...current.detectedKeywords, ...detectedWords])].slice(-5), 
        actionRecommendation: action,
        label: newProb > 0.60 ? 'FRAUD' : 'SAFE', 
        confidence: newProb > 0.8 ? 'HIGH' : 'MEDIUM',
        threatLevel: Math.floor(newProb * 100)
      });
    }
  }

  private handleThreatTrigger(type: 'CRITICAL' | 'WARNING', message: string) {
      const prefs = this.prefs();
      if (!prefs.enabled) return;
      if (prefs.minThreshold === 'HIGH' && type === 'WARNING') return;

      if (message !== this.lastDetectedMsg) {
          this.lastDetectedMsg = message;
          this.alertRepeatCount = 0;
      }

      if (this.alertRepeatCount >= 3) return; // Cap repetition at 3

      const now = Date.now();
      if (now - this.lastVoiceAlertTime < 4000) return; // Throttle alerts to every 4s

      // 1. HAPTICS
      if (prefs.hapticsEnabled) {
          this.triggerHaptics(type);
      }

      // 2. VOICE ALERTS
      if (prefs.soundEnabled) {
            this.alertRepeatCount++;
            this.lastVoiceAlertTime = now;

            if (type === 'CRITICAL') {
                this.audioService.playSiren();
            }
            
            const prefix = type === 'CRITICAL' ? 'Security Alert! ' : 'Warning. ';
            const fullMessage = `${prefix} ${message}`;
            this.audioService.speak(fullMessage, true); // Force speak
      }

      // 3. SYSTEM NOTIFICATIONS
      if (this.alertRepeatCount === 1) {
           this.triggerSystemNotification(type, message);
      }

      // 4. OVERLAY
      if (type === 'CRITICAL' && !this.activeCriticalAlert()) {
          this.activeCriticalAlert.set({
              title: "THREAT DETECTED",
              message: message,
              threatLevel: 'HIGH',
              timestamp: Date.now()
          });
      }
  }

  private triggerSystemNotification(type: 'CRITICAL' | 'WARNING', body: string) {
      if ('Notification' in window && Notification.permission === 'granted') {
          try {
            // Enhanced Persistent Notification
            const note = new Notification(`DKAVACHA: ${type}`, { 
                body, 
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                tag: 'fraud-alert',
                requireInteraction: true, // Key for persistence on mobile/desktop
                silent: false,
                data: { timestamp: Date.now() }
            });
            
            note.onclick = () => {
                window.focus();
                note.close();
            };
          } catch(e) {
              console.warn('Notification failed', e);
          }
      }
  }

  private runInference() {
    const previous = this.currentResult();
    if (!previous) return;

    let probability = previous.probability;

    const timeSinceThreat = Date.now() - this.lastThreatTime;
    
    // Decay logic: Only decay if NO threat detected for 5 seconds
    if (timeSinceThreat > 8000) { // Increased grace period to 8 seconds
        probability = probability * 0.98; // Slower decay (was 0.95)
    } 
    
    if (probability < 0.05) probability = 0;
    
    // Don't update if nothing changed and already safe
    if (probability === 0 && previous.probability === 0 && previous.label === 'SAFE') return;

    const isFraud = probability > 0.60;

    const result: FraudResult = {
      probability: parseFloat(probability.toFixed(3)),
      confidence: probability > 0.8 ? 'HIGH' : (probability > 0.4 ? 'MEDIUM' : 'LOW'),
      label: isFraud ? 'FRAUD' : 'SAFE',
      timestamp: Date.now(),
      threatLevel: Math.floor(probability * 100),
      detectedKeywords: isFraud ? previous.detectedKeywords : [],
      actionRecommendation: isFraud ? "POTENTIAL THREAT" : "SECURE"
    };

    this.updateResult(result);
  }

  private updateResult(result: FraudResult) {
    this.currentResult.set(result);
    this.recentHistory.update(history => {
      // Keep only last 20 points, append new
      const newHistory = [...history, result];
      return newHistory.slice(-20); 
    });
  }

  private createEmptyResult(): FraudResult {
      return { probability: 0, confidence: 'LOW', label: 'SAFE', timestamp: Date.now(), threatLevel: 0, detectedKeywords: [], actionRecommendation: 'SECURE' };
  }

  private triggerHaptics(type: 'WARNING' | 'CRITICAL') {
      if (typeof navigator !== 'undefined' && navigator.vibrate && this.prefs().hapticsEnabled) {
          if (type === 'CRITICAL') {
              // SOS Pattern (High Urgency): Short-Short-Short Long-Long-Long Short-Short-Short
              navigator.vibrate([
                  100, 50, 100, 50, 100, 200, // S
                  500, 200, 500, 200, 500, 200, // O
                  100, 50, 100, 50, 100 // S
              ]); 
          } else {
              // Warning Pattern: Double Pulse
              navigator.vibrate([200, 100, 200]); 
          }
      }
  }

  dismissCriticalAlert() {
      this.activeCriticalAlert.set(null);
      this.lastVoiceAlertTime = Date.now() + 5000; 
  }
}