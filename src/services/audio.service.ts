import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // --- VOCAL ISOLATION & SPECTRAL GATING CHAIN ---
  private lowCutFilter: BiquadFilterNode | null = null; 
  private lowPassFilter: BiquadFilterNode | null = null; 
  private vocalPresenceFilter: BiquadFilterNode | null = null; 
  private spectralGateCompressor: DynamicsCompressorNode | null = null; 

  private recognition: any = null;
  private synthesis: SpeechSynthesis = window.speechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  
  // Signals
  isRecording = signal(false);
  frequencyData = signal<Uint8Array>(new Uint8Array(0));
  transcript = signal<string>('');
  liveStreamText = signal<string>(''); 
  voiceEnabled = signal(true); 
  currentLang = signal<string>('en-IN');

  constructor() {
    this.initSpeechRecognition();
    this.initVoices();
  }

  private initVoices() {
      const load = () => {
          this.voices = this.synthesis.getVoices();
      };
      load();
      if (this.synthesis.onvoiceschanged !== undefined) {
          this.synthesis.onvoiceschanged = load;
      }
  }

  setLanguage(lang: string) {
      this.currentLang.set(lang);
      if (this.recognition) {
          this.recognition.lang = lang;
          if (this.isRecording()) {
              this.recognition.stop(); 
          }
      }
  }

  private initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.currentLang(); 
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let newFinalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            newFinalTranscript += res[0].transcript;
          } else {
            interimTranscript += res[0].transcript;
          }
        }
        
        this.liveStreamText.set(interimTranscript || newFinalTranscript);

        if (newFinalTranscript) {
           this.transcript.update(t => {
             const updated = t + ' ' + newFinalTranscript;
             return updated.slice(-5000).trim(); 
           });
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
             console.warn('Speech Recognition Warning:', event.error);
        }
      };

      this.recognition.onend = () => {
        if (this.isRecording()) {
          try {
            setTimeout(() => {
                if (this.isRecording()) this.recognition.start();
            }, 100);
          } catch (e) { }
        }
      };
    }
  }

  async startRecording() {
    if (this.isRecording()) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      
      if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
      }

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;

      // 1. Low Cut (85Hz)
      this.lowCutFilter = this.audioContext.createBiquadFilter();
      this.lowCutFilter.type = 'highpass';
      this.lowCutFilter.frequency.value = 85;

      // 2. Low Pass (4000Hz)
      this.lowPassFilter = this.audioContext.createBiquadFilter();
      this.lowPassFilter.type = 'lowpass';
      this.lowPassFilter.frequency.value = 4000; 

      // 3. Vocal Boost (2500Hz)
      this.vocalPresenceFilter = this.audioContext.createBiquadFilter();
      this.vocalPresenceFilter.type = 'peaking';
      this.vocalPresenceFilter.frequency.value = 2500;
      this.vocalPresenceFilter.Q.value = 1.0;
      this.vocalPresenceFilter.gain.value = 4.0; 

      // 4. Dynamics
      this.spectralGateCompressor = this.audioContext.createDynamicsCompressor();
      this.spectralGateCompressor.threshold.value = -35; 
      this.spectralGateCompressor.knee.value = 30; 
      this.spectralGateCompressor.ratio.value = 8; 
      this.spectralGateCompressor.attack.value = 0.005;
      this.spectralGateCompressor.release.value = 0.20;

      // Chain
      this.source.connect(this.lowCutFilter);
      this.lowCutFilter.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.vocalPresenceFilter);
      this.vocalPresenceFilter.connect(this.spectralGateCompressor);
      this.spectralGateCompressor.connect(this.analyser);

      this.isRecording.set(true);
      
      if (this.recognition) {
          try { this.recognition.start(); } catch(e) {}
      }
      
      this.updateFrequencyData();
      this.speak("Sentinel Uplink Established.", true);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Microphone access denied.');
    }
  }

  stopRecording() {
    this.isRecording.set(false);
    this.speak("Uplink Terminated.", true);
    
    // Proper Cleanup of Audio Nodes
    try {
        if (this.source) this.source.disconnect();
        if (this.lowCutFilter) this.lowCutFilter.disconnect();
        if (this.lowPassFilter) this.lowPassFilter.disconnect();
        if (this.vocalPresenceFilter) this.vocalPresenceFilter.disconnect();
        if (this.spectralGateCompressor) this.spectralGateCompressor.disconnect();
    } catch(e) { console.warn('Node disconnect error', e); }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.recognition) this.recognition.stop();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private updateFrequencyData() {
    if (!this.isRecording() || !this.analyser) return;

    setTimeout(() => {
        if (!this.isRecording() || !this.analyser) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        this.frequencyData.set(dataArray);
        
        requestAnimationFrame(() => this.updateFrequencyData());
    }, 33); // 30 FPS throttle
  }

  speak(text: string, force = false) {
    if (!this.voiceEnabled() && !force) return;
    if (force) this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    
    if (this.voices.length === 0) this.voices = this.synthesis.getVoices();

    const preferredVoice = this.voices.find(v => v.name.includes('Google') && v.name.includes('Female')) 
                        || this.voices.find(v => v.name.includes('Female')) 
                        || this.voices[0];
                        
    if (preferredVoice) utterance.voice = preferredVoice;

    this.synthesis.speak(utterance);
  }

  playSiren() {
      if (!this.voiceEnabled()) return;
      if (!this.audioContext) this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') this.audioContext.resume();

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.type = 'sawtooth';
      const now = this.audioContext.currentTime;
      osc.frequency.setValueAtTime(880, now); 
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.5); 
      
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(now + 0.6);
  }
}