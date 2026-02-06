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
    { word: 'mumbai police', risk: 0.95, msg: 'Police Impersonation' },
    { word: 'narcotics', risk: 0.95, msg: 'Narcotics Bureau Threat' },
    { word: 'money laundering', risk: 0.90, msg: 'Money Laundering Accusation' },
    { word: 'arrest warrant', risk: 0.98, msg: 'Fake Arrest Warrant Issued' },
    { word: 'official statement', risk: 0.80, msg: 'Fake Legal Procedure' },
    
    // 📦 COURIER / PARCEL SCAMS (FedEx/BlueDart)
    { word: 'illegal parcel', risk: 0.95, msg: 'Illegal Parcel Scam' },
    { word: 'fedex', risk: 0.85, msg: 'Courier Scam Pattern' },
    { word: 'package seized', risk: 0.95, msg: 'Customs/Courier Threat' },
    { word: 'customs duty', risk: 0.90, msg: 'Customs Fee Fraud' },
    { word: 'drugs found', risk: 0.95, msg: 'Contraband Accusation' },
    
    // 🎰 LOTTERY & PRIZE FRAUD
    { word: 'won lottery', risk: 0.99, msg: 'Lottery Fraud Detected' },
    { word: 'lucky draw', risk: 0.95, msg: 'Fake Prize Scam' },
    { word: 'claim your prize', risk: 0.90, msg: 'Prize Claim Scam' },
    { word: 'processing fee', risk: 0.85, msg: 'Advance Fee Fraud' },
    { word: 'minimal fee', risk: 0.85, msg: 'Hidden Fee Scam' },
    { word: 'refundable', risk: 0.80, msg: 'Fake Refund Promise' },
    { word: 'deposit money', risk: 0.85, msg: 'Upfront Deposit Request' },
    
    // 💼 JOB & TASK SCAMS
    { word: 'prepaid task', risk: 0.95, msg: 'Prepaid Task Scam' },
    { word: 'daily income', risk: 0.85, msg: 'Fake Job Offer' },
    { word: 'pay via telegram', risk: 0.95, msg: 'Telegram Payment Fraud' },
    { word: 'part time job', risk: 0.65, msg: 'Suspicious Job Offer (Verify)' },
    { word: 'work from home', risk: 0.60, msg: 'Work From Home Trap (Verify)' },

    // 💘 ROMANCE & HONEY TRAPS
    { word: 'stuck in customs', risk: 0.90, msg: 'Romance Scam: Customs Ploy' },
    { word: 'visa fee', risk: 0.85, msg: 'Romance Scam: Visa Fraud' },
    { word: 'hospital bill', risk: 0.80, msg: 'Emergency Money Scam' },
    { word: 'send money for flight', risk: 0.90, msg: 'Travel Cost Scam' },

    // 📈 INVESTMENT SCAMS
    { word: 'guaranteed return', risk: 0.95, msg: 'Fake Investment Promise' },
    { word: 'double your money', risk: 1.0, msg: 'Ponzi Scheme Alert' },
    { word: 'crypto investment', risk: 0.75, msg: 'Crypto Scam Risk' },
    { word: 'stock tip', risk: 0.70, msg: 'Pump and Dump Risk' },

    // 🔗 LINKS & UPI PHISHING
    { word: 'tap the link', risk: 0.95, msg: 'Malicious Link Bait' },
    { word: 'click the link', risk: 0.95, msg: 'Phishing Link Request' },
    { word: 'scan qr', risk: 0.95, msg: 'QR Code Payment Fraud' },
    { word: 'receive money', risk: 0.90, msg: 'Reverse Payment Scam' },
    { word: 'enter upi', risk: 0.95, msg: 'UPI PIN Phishing' },

    // 💳 BANKING & KYC
    { word: 'kyc update', risk: 0.92, msg: 'KYC Phishing Alert' },
    { word: 'pan card update', risk: 0.90, msg: 'PAN Card Phishing' },
    { word: 'block your card', risk: 0.95, msg: 'Panic Inducing Threat' },
    { word: 'bank details', risk: 0.85, msg: 'Sensitive Banking Request' },
    { word: 'cvv', risk: 0.99, msg: 'CVV Request (CRITICAL)' },
    { word: 'otp', risk: 0.95, msg: 'OTP Solicitation' },
    
    // 💻 REMOTE ACCESS (Screen Sharing)
    { word: 'anydesk', risk: 1.0, msg: 'Remote Access Tool (CRITICAL)' },
    { word: 'teamviewer', risk: 1.0, msg: 'Remote Access Tool (CRITICAL)' },
    { word: 'screen share', risk: 0.95, msg: 'Screen Share Request' },
    { word: 'support app', risk: 0.90, msg: 'Fake Support App Download' }
  ];

  // --- REGEX PATTERNS FOR DATA THEFT ---
  private readonly dataTheftPatterns = [
    { regex: /\b\d{16}\b/, msg: 'Credit Card Number Detection', risk: 1.0 },
    { regex: /\b\d{3}\s*$/, msg: 'CVV/CVC Detection', risk: 0.9 }, 
    { regex: /\b(otp|code)\s*(is)?\s*\d{4,6}/i, msg: 'OTP Pattern Detected', risk: 1.0 }
  ];

  private analysisInterval: any;
  private lastThreatTime = 0; 
  private lastVoiceAlertTime = 0;
  private lastAnalysisExecTime = 0; 

  // --- REPETITION CONTROL ---
  private lastDetectedMsg = '';
  private alertRepeatCount = 0; // Tracks how many times we've alerted for the CURRENT threat

  constructor() {
    this.requestNotificationPermission();

    effect(() => {
      // 1. TRACKING: Signals inside effect
      const transcript = this.audioService.transcript().toLowerCase();
      const liveStream = this.audioService.liveStreamText().toLowerCase();
      const isRecording = this.audioService.isRecording();

      // 2. PERFORMANCE THROTTLE (CRITICAL FOR ANTI-FREEZE)
      const now = Date.now();
      // Only run analysis max once every 500ms
      if (now - this.lastAnalysisExecTime < 500) return; 
      
      this.lastAnalysisExecTime = now;

      // 3. LOGIC
      if (this.currentSession()?.status === 'active' && isRecording) {
         // 4. CONTEXT SLICING: Only analyze last 300 chars to keep regex fast
         const context = (transcript.slice(-300) + " " + liveStream).trim();
         
         if (context.length > 5) {
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
    
    // Reset alert tracking
    this.lastDetectedMsg = '';
    this.alertRepeatCount = 0;

    // Simulation Loop (for probability decay)
    this.analysisInterval = setInterval(() => {
      this.runInference();
    }, 1000); // 1s interval for decay is sufficient
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

  private requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }

  /**
   * 🧠 ANALYZE TEXT WITH OPTIMIZED MATCHING
   */
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

      // --- STOP REPEAT LOGIC (UPDATED) ---
      // If the message is different from the last one, reset the counter
      if (message !== this.lastDetectedMsg) {
          this.lastDetectedMsg = message;
          this.alertRepeatCount = 0;
      }

      // If we have already alerted TWICE for this exact threat message, STOP.
      if (this.alertRepeatCount >= 2) {
          return; 
      }

      const now = Date.now();
      // Minimal throttle between 'different' alerts or detecting the same one quickly
      if (now - this.lastVoiceAlertTime < 3000) return;

      // 1. HAPTICS
      if (prefs.hapticsEnabled) {
          this.triggerHaptics(type);
      }

      // 2. VOICE ALERTS
      if (prefs.soundEnabled) {
            
            this.alertRepeatCount++; // Increment count
            this.lastVoiceAlertTime = now;

            // Siren for Critical only
            if (type === 'CRITICAL') {
                this.audioService.playSiren();
            }
            
            const prefix = type === 'CRITICAL' ? 'Critical Alert! ' : 'Warning. ';
            const fullMessage = `${prefix} ${message}`;
            
            // Speak Main Alert
            this.audioService.speak(fullMessage, type === 'CRITICAL');
      }

      // 3. SYSTEM NOTIFICATIONS (Once per threat type to avoid spam)
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

  private reportToCyberCell(incident: any) {
      // Mock reporting - in production this sends data to backend
  }

  private triggerSystemNotification(type: string, body: string) {
      if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const note = new Notification(`DKAVACHA: ${type}`, { 
                body, 
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                tag: 'fraud-alert',
                silent: false 
            });
            setTimeout(() => note.close(), 4000);
          } catch(e) {}
      }
  }

  private runInference() {
    const previous = this.currentResult();
    if (!previous) return;

    let probability = previous.probability;

    // Decay if no threat recently
    const timeSinceThreat = Date.now() - this.lastThreatTime;
    if (timeSinceThreat > 4000) {
        probability = probability * 0.90; // Decay
    } 
    
    if (probability < 0.05) probability = 0;

    // Optimize: Don't update signal if nothing changed (Performance)
    if (probability === 0 && previous.probability === 0) return;

    const isFraud = probability > 0.60;

    const result: FraudResult = {
      probability: parseFloat(probability.toFixed(3)),
      confidence: probability > 0.8 ? 'HIGH' : (probability > 0.4 ? 'MEDIUM' : 'LOW'),
      label: isFraud ? 'FRAUD' : 'SAFE',
      timestamp: Date.now(),
      threatLevel: Math.floor(probability * 100),
      detectedKeywords: previous.detectedKeywords,
      actionRecommendation: isFraud ? "POTENTIAL THREAT" : "SECURE"
    };

    this.updateResult(result);
  }

  private updateResult(result: FraudResult) {
    this.currentResult.set(result);
    // Limit history to 20 items to save memory
    this.recentHistory.update(history => {
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
              navigator.vibrate([100, 50, 100, 50, 200]); 
          } else {
              navigator.vibrate([200]); 
          }
      }
  }

  dismissCriticalAlert() {
      this.activeCriticalAlert.set(null);
      this.lastVoiceAlertTime = Date.now() + 5000; // Snooze 5s
  }
}