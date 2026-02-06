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
  
  // Signals
  isRecording = signal(false);
  frequencyData = signal<Uint8Array>(new Uint8Array(0));
  transcript = signal<string>('');
  liveStreamText = signal<string>(''); 
  voiceEnabled = signal(true); 

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true; 
      this.recognition.lang = 'en-IN'; 
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
             return updated.slice(-8000); 
           });
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Speech Recognition Error:', event.error);
        if (event.error === 'not-allowed') {
          this.stopRecording();
          alert('Microphone access denied. Please check browser settings.');
        }
      };

      this.recognition.onend = () => {
        if (this.isRecording()) {
          try {
            this.recognition.start();
          } catch (e) {}
        }
      };
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
      
      if (this.recognition) this.recognition.start();
      
      this.updateFrequencyData();

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Ensure permissions are granted.');
    }
  }

  stopRecording() {
    this.isRecording.set(false);
    
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

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    this.frequencyData.set(dataArray);

    requestAnimationFrame(() => this.updateFrequencyData());
  }

  speak(text: string, force = false) {
    if (!this.voiceEnabled() && !force) return;
    
    if (force) this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    
    const voices = this.synthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female'));
    if (preferredVoice) utterance.voice = preferredVoice;

    this.synthesis.speak(utterance);
  }

  /**
   * 🚨 GENERATE SIREN TONE
   * Creates a hardware-accelerated alarm sound using Oscillators.
   * This ensures the alert is heard even if TTS is too slow.
   */
  playSiren() {
      if (!this.voiceEnabled()) return;
      
      // Ensure context is running (it might suspend if no user interaction, but we usually have it from recording)
      if (!this.audioContext) this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') this.audioContext.resume();

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      // Sawtooth wave for "harsh" alarm sound
      osc.type = 'sawtooth';
      
      // Siren Sweep: 880Hz (A5) -> 440Hz (A4)
      const now = this.audioContext.currentTime;
      osc.frequency.setValueAtTime(880, now); 
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.5); 
      
      // Volume Envelope
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      
      osc.start();
      osc.stop(now + 0.6);
  }
}