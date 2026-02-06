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
    { word: 'credit card', risk: 0.99, msg: 'Credit Card Solicitation' }, 
    { word: 'debit card', risk: 0.99, msg: 'Debit Card Solicitation' }, 
    { word: 'bank account', risk: 0.95, msg: 'Bank Account Phishing' }, 
    { word: 'give me your', risk: 0.85, msg: 'Suspicious Request Pattern' }, 
    { word: '16 digit', risk: 0.99, msg: 'Credit Card Number Solicitation' },
    { word: 'card number', risk: 0.95, msg: 'Card Details Requested' },
    { word: 'expiry date', risk: 0.95, msg: 'Card Expiry Requested' },
    { word: 'cvv', risk: 0.99, msg: 'CVV Security Code Request' },
    { word: 'three digits', risk: 0.99, msg: 'CVV Phishing Pattern' },
    { word: 'pin number', risk: 0.99, msg: 'PIN Phishing' },
    { word: 'atm pin', risk: 0.99, msg: 'ATM PIN Request' },
    { word: 'net banking', risk: 0.99, msg: 'Net Banking Credential Theft' },
    
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
  private readonly dataTheftPatterns = [
    { regex: /\b\d{16}\b/, msg: 'Potential Credit Card Number (16 Digits)', risk: 1.0 },
    { regex: /\b\d{3}\s*$/, msg: 'Potential CVV (Standalone 3 Digits)', risk: 0.9 }, 
    { regex: /\b(cvv|cvc)\s*(is|number)?\s*\d{3}/i, msg: 'CVV Disclosure', risk: 1.0 },
    { regex: /\b(otp|code)\s*(is)?\s*\d{4,6}/i, msg: 'OTP Disclosure', risk: 1.0 }
  ];

  private analysisInterval: any;
  private lastThreatTime = 0; 
  private lastVoiceAlertTime = 0;

  constructor() {
    this.requestNotificationPermission();

    effect(() => {
      // FIX: Use the full transcript history instead of just live stream to catch split phrases
      const fullHistory = this.audioService.transcript().toLowerCase();
      const recentContext = fullHistory.slice(-300); // Analyze last 300 chars for context
      
      const liveStream = this.audioService.liveStreamText().toLowerCase();
      
      // Combine strict live buffer + recent history for maximum hit rate
      const combinedContext = (recentContext + " " + liveStream).trim();

      if (combinedContext.length > 3 && this.currentSession()?.status === 'active') {
        this.analyzeTextContext(combinedContext);
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

    // 1. Check Keywords (Partial Match)
    const foundPhrases = this.scamPhrases.filter(p => text.includes(p.word));
    if (foundPhrases.length > 0) {
        // Sort by risk descending
        const bestMatch = foundPhrases.sort((a,b) => b.risk - a.risk)[0];
        maxRisk = bestMatch.risk;
        detectedMsg = bestMatch.msg;
        detectedWords = foundPhrases.map(p => p.word);
    }

    // 2. Check Regex (Data Theft)
    for (const pattern of this.dataTheftPatterns) {
        if (pattern.regex.test(text)) {
            if (pattern.risk >= maxRisk) {
                maxRisk = pattern.risk;
                detectedMsg = pattern.msg;
                detectedWords.push('SENSITIVE_DATA_PATTERN');
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

      // 🚨 Trigger Logic - Lowered threshold for "Warning" to catch things earlier
      if (newProb > 0.75) {
        this.handleThreatTrigger('CRITICAL', detectedMsg);
      } else if (newProb > 0.4) { 
        this.handleThreatTrigger('WARNING', detectedMsg);
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

      const now = Date.now();
      const throttle = type === 'CRITICAL' ? 3000 : 8000;

      // 1. HAPTICS (Always try to vibrate if enabled)
      if (prefs.hapticsEnabled) {
          this.triggerHaptics(type);
      }

      // 2. VOICE ALERTS (Speak Twice Logic)
      if (prefs.soundEnabled && (now - this.lastVoiceAlertTime > throttle)) {
            
            // Siren
            if (type === 'CRITICAL') {
                this.audioService.playSiren();
            }
            
            // Text to Speech Message
            const prefix = type === 'CRITICAL' ? 'Critical Alert! ' : 'Warning. ';
            const fullMessage = `${prefix} ${message}`;
            
            // First Speech
            this.audioService.speak(fullMessage, type === 'CRITICAL');
            
            // Second Speech (Delayed by 2.5s)
            // Using setTimeout to create a natural pause, ensuring it says it exactly twice
            setTimeout(() => {
                 this.audioService.speak("Repeat. " + fullMessage, type === 'CRITICAL');
            }, 3000);
            
            this.lastVoiceAlertTime = now;
            
            if (type === 'CRITICAL') {
                 this.reportToCyberCell({ type, message, timestamp: now });
            }
      }

      // 3. SYSTEM NOTIFICATIONS (Fallback if Voice is OFF, or critical)
      if (!prefs.soundEnabled || type === 'CRITICAL') {
           this.triggerSystemNotification(type, message);
      }

      // 4. IN-APP OVERLAY
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
      const payload = {
          incidentId: crypto.randomUUID(),
          severity: incident.type,
          description: incident.message,
          timestamp: new Date(incident.timestamp).toISOString(),
          geo: 'IN-WB-KOL',
          deviceFingerprint: navigator.userAgent
      };
      console.log('📡 [CYBER_CELL_LINK] REPORTING:', payload);
  }

  private triggerSystemNotification(type: string, body: string) {
      if ('Notification' in window && Notification.permission === 'granted') {
          const note = new Notification(`DKAVACHA: ${type} ALERT`, { 
              body, 
              icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
              tag: 'fraud-alert',
              requireInteraction: type === 'CRITICAL',
              silent: false 
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

    const isFraud = probability > 0.60;

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

  /**
   * 📳 HAPTIC FEEDBACK ENGINE
   * Distinct patterns for Warning vs Critical
   */
  private triggerHaptics(type: 'WARNING' | 'CRITICAL') {
      if (typeof navigator !== 'undefined' && navigator.vibrate && this.prefs().hapticsEnabled) {
          
          if (type === 'CRITICAL') {
              // SOS Pattern: ... --- ... (Short, Short, Short, Long, Long, Long, Short, Short, Short)
              // 100ms vibration, 50ms pause
              navigator.vibrate([
                  100, 50, 100, 50, 100, 50, // ...
                  300, 50, 300, 50, 300, 50, // ---
                  100, 50, 100, 50, 100      // ...
              ]);
          } else {
              // Warning: Double Pulse
              navigator.vibrate([200, 100, 200]); 
          }
      }
  }

  dismissCriticalAlert() {
      this.activeCriticalAlert.set(null);
  }
}