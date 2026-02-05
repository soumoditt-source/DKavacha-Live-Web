import { Injectable, signal, computed } from '@angular/core';

// Types for Web Speech API & TTS
declare var webkitSpeechRecognition: any;
declare var SpeechRecognition: any;

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private recognition: any = null;
  private synthesis: SpeechSynthesis = window.speechSynthesis;
  private wakeLock: any = null;

  // Signals
  isRecording = signal(false);
  frequencyData = signal<Uint8Array>(new Uint8Array(0));
  transcript = signal<string>('');
  
  // Real-time stream text (Includes interim results for instant detection)
  liveStreamText = signal<string>(''); 
  
  voiceEnabled = signal(true); 
  
  // Volume Meter (RMS)
  volumeLevel = computed(() => {
    const data = this.frequencyData();
    if (data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
  });

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true; // CRITICAL: Allows mid-sentence detection
      this.recognition.lang = 'en-IN'; 
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            finalTranscript += res[0].transcript;
          } else {
            interimTranscript += res[0].transcript;
          }
        }
        
        // 1. Instant Stream Update (For FraudNet to analyze immediately)
        const currentBuffer = (finalTranscript + ' ' + interimTranscript).trim().toLowerCase();
        if (currentBuffer) {
            this.liveStreamText.set(currentBuffer);
        }

        // 2. Persistent Transcript Log (Only commits final results)
        if (finalTranscript) {
           this.transcript.update(t => {
             const updated = t + ' ' + finalTranscript;
             return updated.slice(-5000); 
           });
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'network') {
            // Silent ignore, will auto-restart via onend if recording
        } else {
            console.warn('Speech API Error:', event.error);
        }
      };
      
      this.recognition.onend = () => {
          if (this.isRecording()) {
              // aggressive restart
              setTimeout(() => {
                  try { this.recognition.start(); } catch(e){}
              }, 100); 
          }
      }
    }
  }

  async startRecording() {
    try {
      this.audioContext = new AudioContext();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
        } 
      });
      
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.85; // Smoother visualizer data
      this.source.connect(this.analyser);
      
      this.isRecording.set(true);
      this.transcript.set(''); 
      this.liveStreamText.set('');
      
      if (this.recognition) {
        try { this.recognition.start(); } catch(e) { console.log('Recognition already active'); }
      }

      this.requestWakeLock();
      this.updateData();
      this.speak("Secure connection established. Monitoring active.", true);
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Microphone access required for Live FraudNet analysis.');
    }
  }

  stopRecording() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    if (this.recognition) {
      this.recognition.stop();
    }
    this.releaseWakeLock();
    this.isRecording.set(false);
    this.frequencyData.set(new Uint8Array(0));
    this.speak("Monitoring ended.", true);
  }

  // --- Background Capability: Wake Lock ---
  private async requestWakeLock() {
      if ('wakeLock' in navigator) {
          try {
              this.wakeLock = await (navigator as any).wakeLock.request('screen');
          } catch (err) {
              console.warn('Wake Lock failed:', err);
          }
      }
  }

  private releaseWakeLock() {
      if (this.wakeLock) {
          this.wakeLock.release().then(() => this.wakeLock = null);
      }
  }

  // --- Voice Sentinel ---
  speak(text: string, force = false) {
    if (!this.voiceEnabled() && !force) return;
    
    this.synthesis.cancel(); // Interrupt existing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; 
    utterance.pitch = 1.05; // Slightly higher pitch for clarity
    utterance.volume = 1.0;
    
    const voices = this.synthesis.getVoices();
    // Prioritize high-quality voices
    const preferredVoice = voices.find(v => 
        v.name.includes('Google US English') || 
        v.name.includes('Samantha') || 
        v.name.includes('Microsoft Zira') ||
        v.lang === 'en-US'
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    this.synthesis.speak(utterance);
  }

  private updateData() {
    if (!this.isRecording() || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    this.frequencyData.set(dataArray);

    requestAnimationFrame(() => this.updateData());
  }
}