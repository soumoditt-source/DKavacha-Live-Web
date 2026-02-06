import { Injectable, signal, computed } from '@angular/core';

// Types for Web Speech API
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
  
  // --- VOCAL ISOLATION CHAIN (NOISE REDUCTION) ---
  private highPassFilter: BiquadFilterNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private vocalPeakingFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

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
      // Async voice loading
      const load = () => {
          this.voices = this.synthesis.getVoices();
      };
      
      load();
      if (this.synthesis.onvoiceschanged !== undefined) {
          this.synthesis.onvoiceschanged = load;
      }
  }

  // Allow dynamic language switching for better accuracy
  setLanguage(lang: string) {
      this.currentLang.set(lang);
      if (this.recognition) {
          this.recognition.lang = lang;
          // Restart if currently recording to apply change
          if (this.isRecording()) {
              this.recognition.stop(); 
              // onend will handle restart
          }
      }
  }

  private initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      
      // Robust Configuration
      this.recognition.continuous = true; // Keep listening
      this.recognition.interimResults = true; // Real-time feedback
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
        
        // Update live stream text (what is currently being spoken)
        this.liveStreamText.set(interimTranscript || newFinalTranscript);

        // Append to full transcript log if there's a final result
        if (newFinalTranscript) {
           this.transcript.update(t => {
             const updated = t + ' ' + newFinalTranscript;
             // Keep last 5k chars (Reduced from 10k for performance)
             return updated.slice(-5000).trim(); 
           });
        }
      };

      this.recognition.onerror = (event: any) => {
        // Silent error handling for 'no-speech' to prevent spamming logs
        if (event.error !== 'no-speech') {
             console.warn('Speech Recognition Warning:', event.error);
        }
      };

      this.recognition.onend = () => {
        // Robust auto-restart (Always-On Sentinel Mode)
        if (this.isRecording()) {
          try {
            // Tiny delay to prevent CPU thrashing on rapid close/open loops
            setTimeout(() => {
                if (this.isRecording()) this.recognition.start();
            }, 100);
          } catch (e) {
             // Ignore if already started
          }
        }
      };
    } else {
        console.error('Web Speech API not supported in this browser.');
    }
  }

  async startRecording() {
    if (this.isRecording()) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      this.highPassFilter = this.audioContext.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.value = 85;

      this.lowPassFilter = this.audioContext.createBiquadFilter();
      this.lowPassFilter.type = 'lowpass';
      this.lowPassFilter.frequency.value = 3500; 

      this.vocalPeakingFilter = this.audioContext.createBiquadFilter();
      this.vocalPeakingFilter.type = 'peaking';
      this.vocalPeakingFilter.frequency.value = 2500;
      this.vocalPeakingFilter.Q.value = 1.0;
      this.vocalPeakingFilter.gain.value = 5.0; 

      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.source.connect(this.highPassFilter);
      this.highPassFilter.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.vocalPeakingFilter);
      this.vocalPeakingFilter.connect(this.compressor);
      this.compressor.connect(this.analyser);

      this.isRecording.set(true);
      
      if (this.recognition) {
          try {
              this.recognition.start();
          } catch(e) {
              console.log('Recognition already active');
          }
      }
      
      this.updateFrequencyData();
      
      // Greet user on connection
      this.speak("Sentinel Uplink Established. Voice Monitoring Active.", true);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Ensure permissions are granted.');
    }
  }

  stopRecording() {
    this.isRecording.set(false);
    this.speak("Uplink Terminated.", true);
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.recognition) {
      this.recognition.stop();
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private updateFrequencyData() {
    if (!this.isRecording() || !this.analyser) return;

    // Performance Fix: Throttle update rate to ~24fps (40ms) instead of 60fps
    // This frees up main thread for voice processing and UI responsiveness
    setTimeout(() => {
        if (!this.isRecording() || !this.analyser) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        this.frequencyData.set(dataArray);
        
        // Use requestAnimationFrame only for the scheduling, but inside the timeout
        requestAnimationFrame(() => this.updateFrequencyData());
    }, 40);
  }

  speak(text: string, force = false) {
    if (!this.voiceEnabled() && !force) return;
    
    if (force) this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    
    // Attempt to pick a good voice
    if (this.voices.length === 0) {
        this.voices = this.synthesis.getVoices();
    }

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