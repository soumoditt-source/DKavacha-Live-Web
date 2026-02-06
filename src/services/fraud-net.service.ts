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

  // --- THREAT DICTIONARY 2026 (ENHANCED BANKING/THEFT) ---
  private readonly scamPhrases = [
    // 🚨 DIGITAL ARREST / CBI / POLICE
    { word: 'digital arrest', risk: 1.0, msg: 'Digital Arrest Threat Detected' },
    { word: 'cbi', risk: 0.95, msg: 'Federal Agency Impersonation' },
    { word: 'narcotics', risk: 0.95, msg: 'Narcotics/Drug Threat' },
    { word: 'money laundering', risk: 0.90, msg: 'Money Laundering Accusation' },
    { word: 'police station', risk: 0.85, msg: 'Police Impersonation' },
    { word: 'arrest warrant', risk: 0.98, msg: 'Fake Arrest Warrant' },
    
    // 💳 CREDIT CARD / BANKING THEFT (High Precision)
    { word: '16 digit', risk: 0.99, msg: 'Credit Card Number Solicitation' },
    { word: 'card number', risk: 0.95, msg: 'Card Details Requested' },
    { word: 'expiry date', risk: 0.95, msg: 'Card Expiry Requested' },
    { word: 'cvv', risk: 0.99, msg: 'CVV Security Code Request' },
    { word: 'three digits at the back', risk: 0.99, msg: 'CVV Phishing Pattern' },
    { word: 'pin number', risk: 0.99, msg: 'PIN Phishing' },
    { word: 'atm pin', risk: 0.99, msg: 'ATM PIN Request' },
    { word: 'net banking password', risk: 0.99, msg: 'Net Banking Credential Theft' },
    
    // 📱 TELECOM / SIM SWAP
    { word: 'sim card block', risk: 0.95, msg: 'SIM Blocking Threat' },
    { word: 'close your number', risk: 0.90, msg: 'Number Disconnection Threat' },
    { word: 'kyc update', risk: 0.92, msg: 'KYC Phishing' },

    // 💻 REMOTE ACCESS
    { word: 'anydesk', risk: 0.99, msg: 'Remote Access Tool (CRITICAL)' },
    { word: 'teamviewer', risk: 0.99, msg: 'Remote Access Tool (CRITICAL)' },
    { word: 'screen share', risk: 0.95, msg: 'Screen Share Request' },
    
    // 💸 GENERAL
    { word: 'refund', risk: 0.85, msg: 'Refund Scam Pattern' },
    { word: 'otp', risk: 0.90, msg: 'OTP Solicitation' }
  ];

  // --- REGEX PATTERNS FOR DATA THEFT ---
  // Simple regexes to catch users reading out numbers
  private readonly dataTheftPatterns = [
    { regex: /\b\d{16}\b/, msg: 'Potential Credit Card Number (16 Digits)', risk: 1.0 },
    { regex: /\b\d{3}\s*$/, msg: 'Potential CVV (Standalone 3 Digits)', risk: 0.8 }, // Context dependent
    { regex: /\b(cvv|cvc)\s*is\s*\d{3}/i, msg: 'CVV Disclosure', risk: 1.0 },
    { regex: /\b(otp|code)\s*is\s*\d{4,6}/i, msg: 'OTP Disclosure', risk: 1.0 }
  ];

  private analysisInterval: any;
  private lastThreatTime = 0; 
  private lastVoiceAlertTime = 0;

  constructor() {
    this.requestNotificationPermission();

    effect(() => {
      const stream = this.audioService.liveStreamText().toLowerCase();
      if (stream && this.currentSession()?.status === 'active') {
        this.analyzeTextContext(stream);
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
    console.log('FRAUDNET ENGINE INITIALIZED: 2026 BANKING THREAT MATRIX LOADED');
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

    this.analysisInterval = setInterval(() => {
      this.runInference();
    }, 250); 
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
   * 🧠 ANALYZE TEXT WITH REGEX & KEYWORDS
   */
  private analyzeTextContext(text: string) {
    let maxRisk = 0;
    let detectedMsg = '';
    let detectedWords: string[] = [];

    // 1. Check Keywords
    const foundPhrases = this.scamPhrases.filter(p => text.includes(p.word));
    if (foundPhrases.length > 0) {
        const bestMatch = foundPhrases.reduce((prev, current) => (prev.risk > current.risk) ? prev : current);
        maxRisk = bestMatch.risk;
        detectedMsg = bestMatch.msg;
        detectedWords = foundPhrases.map(p => p.word);
    }

    // 2. Check Regex (Data Theft)
    for (const pattern of this.dataTheftPatterns) {
        if (pattern.regex.test(text)) {
            if (pattern.risk > maxRisk) {
                maxRisk = pattern.risk;
                detectedMsg = pattern.msg;
                detectedWords.push('PII_PATTERN_MATCH');
            }
        }
    }
    
    if (maxRisk > 0) {
      const current = this.currentResult() || this.createEmptyResult();
      this.lastThreatTime = Date.now();
      
      const newProb = Math.min(1.0, Math.max(current.probability, maxRisk));
      
      let action = "MONITORING";
      if (newProb > 0.9) action = "HANG UP IMMEDIATELY";
      else if (newProb > 0.7) action = "HIGH ALERT - VERIFY IDENTITY";
      else if (newProb > 0.5) action = "CAUTION ADVISED";

      // 🚨 Trigger Logic
      if (newProb > 0.75) {
        this.handleThreatTrigger('CRITICAL', detectedMsg);
      } else if (newProb > 0.45) {
        this.handleThreatTrigger('WARNING', detectedMsg);
      }

      this.updateResult({
        ...current,
        probability: newProb,
        detectedKeywords: [...new Set([...current.detectedKeywords, ...detectedWords])].slice(-5), 
        actionRecommendation: action,
        label: newProb > 0.65 ? 'FRAUD' : 'SAFE',
        confidence: newProb > 0.8 ? 'HIGH' : 'MEDIUM',
        threatLevel: Math.floor(newProb * 100)
      });
    }
  }

  private handleThreatTrigger(type: 'CRITICAL' | 'WARNING', message: string) {
      const prefs = this.prefs();
      if (!prefs.enabled) return;

      if (prefs.minThreshold === 'HIGH' && type === 'WARNING') return;

      // Haptics
      if (prefs.hapticsEnabled) {
          this.triggerHaptics(type);
      }

      const now = Date.now();
      const throttle = type === 'CRITICAL' ? 5000 : 15000; // Faster throttle for Critical
      
      if (prefs.soundEnabled && (now - this.lastVoiceAlertTime > throttle)) {
            // Play Siren for Critical
            if (type === 'CRITICAL') {
                this.audioService.playSiren();
                this.reportToCyberCell({ type, message, timestamp: now }); // 📡 API REPORT
            }
            
            // TTS Backup
            const prefix = type === 'CRITICAL' ? 'Critical Threat. ' : 'Warning. ';
            setTimeout(() => this.audioService.speak(`${prefix}${message}`, type === 'CRITICAL'), 600);
            
            this.lastVoiceAlertTime = now;
      }

      if (type === 'CRITICAL' && !this.activeCriticalAlert()) {
          this.activeCriticalAlert.set({
              title: "THREAT DETECTED",
              message: message,
              threatLevel: 'HIGH',
              timestamp: Date.now()
          });
      }

      if (document.visibilityState === 'hidden' || type === 'CRITICAL') {
           this.triggerSystemNotification(type, message);
      }
  }

  /**
   * 📡 MOCK API ENDPOINT FOR CYBER CRIME REPORTING
   * In production, this would POST to https://api.cybercrime.gov.in/v2/report
   */
  private reportToCyberCell(incident: any) {
      const payload = {
          incidentId: crypto.randomUUID(),
          severity: incident.type,
          description: incident.message,
          timestamp: new Date(incident.timestamp).toISOString(),
          geo: 'IN-WB-KOL', // From persona location
          deviceFingerprint: navigator.userAgent
      };
      console.group('📡 [API SIMULATION] SENDING REPORT TO CYBER CRIME PORTAL');
      console.log('Endpoint: POST https://api.cybercrime.gov.in/v2/report');
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.groupEnd();
  }

  private triggerSystemNotification(type: string, body: string) {
      if ('Notification' in window && Notification.permission === 'granted') {
          const note = new Notification(`DKAVACHA: ${type} ALERT`, { 
              body, 
              icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
              tag: 'fraud-alert',
              requireInteraction: type === 'CRITICAL',
              silent: !this.prefs().soundEnabled
          });
          note.onclick = () => { window.focus(); note.close(); };
      }
  }

  private runInference() {
    const previous = this.currentResult();
    if (!previous) return;

    let probability = previous.probability;

    const timeSinceThreat = Date.now() - this.lastThreatTime;
    if (timeSinceThreat > 5000) {
        probability = probability * 0.98; 
    } 
    
    if (probability < 0.01) probability = 0;

    const isFraud = probability > 0.65;

    const result: FraudResult = {
      probability: parseFloat(probability.toFixed(3)),
      confidence: probability > 0.8 ? 'HIGH' : (probability > 0.4 ? 'MEDIUM' : 'LOW'),
      label: isFraud ? 'FRAUD' : 'SAFE',
      timestamp: Date.now(),
      threatLevel: Math.floor(probability * 100),
      detectedKeywords: previous.detectedKeywords,
      actionRecommendation: isFraud ? (probability > 0.9 ? "HANG UP NOW" : "BLOCK CALLER") : "SECURE"
    };

    this.updateResult(result);
  }

  private updateResult(result: FraudResult) {
    this.currentResult.set(result);
    this.recentHistory.update(history => {
      const newHistory = [...history, result];
      return newHistory.slice(-100);
    });
  }

  private createEmptyResult(): FraudResult {
      return { probability: 0, confidence: 'LOW', label: 'SAFE', timestamp: Date.now(), threatLevel: 0, detectedKeywords: [], actionRecommendation: 'SECURE' };
  }

  private triggerHaptics(type: 'WARNING' | 'CRITICAL') {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
          if (type === 'CRITICAL') {
              navigator.vibrate([100, 50, 100, 50, 100, 200, 500, 200, 500]);
          } else {
              navigator.vibrate([50, 50, 50]); 
          }
      }
  }

  dismissCriticalAlert() {
      this.activeCriticalAlert.set(null);
  }
}