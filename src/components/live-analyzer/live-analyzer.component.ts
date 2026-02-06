import { Component, inject, computed, effect, ViewChild, ElementRef, AfterViewChecked, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioService } from '../../services/audio.service';
import { FraudNetService } from '../../services/fraud-net.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-live-analyzer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="relative w-full transition-all duration-300" 
     [class]="!overlayMode ? 'max-w-5xl mx-auto' : ''"
     [class.animate-pulse]="fraudAlert()" 
     [class]="fraudAlert() ? 'bg-red-950/30' : ''">
  
  <!-- Overlay Mode Container Injection -->
  <div [class]="overlayMode ? 'overlay-mode glass-panel border-cyan-500' : ''">
      
      <!-- Main Content Area -->
      <div [class]="!overlayMode ? 'grid grid-cols-1 md:grid-cols-3 gap-6' : ''">
  
          <!-- Left Panel: Visualizer & Controls -->
          <div [class]="!overlayMode ? 'md:col-span-2 space-y-6' : 'space-y-6'">
              
              <!-- Main Panel -->
              <div class="glass-panel rounded-xl p-6 md:p-8 relative z-10 overflow-hidden border transition-colors duration-300" 
                   [class]="panelClasses()">
                
                <!-- Background Scanline -->
                <div class="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                    <div class="scanline"></div>
                </div>

                <!-- Header -->
                <div class="flex justify-between items-center mb-4">
                  <div class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full animate-pulse"
                         [class]="audioService.isRecording() ? 'bg-red-500' : 'bg-gray-600'">
                    </div>
                    <div>
                        <h2 class="font-cyber tracking-widest transition-colors" 
                            [class]="headerTextClasses()">
                          {{ fraudAlert() ? 'THREAT DETECTED' : 'LIVE GUARDIAN' }}
                        </h2>
                        <div class="text-[10px] text-cyan-500/80 font-mono" *ngIf="fraudService.currentSession() as session">
                            SID: {{ session.id }}
                        </div>
                    </div>
                  </div>
                  
                  <!-- Compact Controls for Overlay -->
                  <div class="flex gap-2">
                     <button (click)="toggleOverlay()" class="p-1 hover:text-cyan-400 text-gray-400 transition" title="Toggle Overlay/Window Mode">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                     </button>
                     <button (click)="toggleSettings()" class="p-1 hover:text-cyan-400 text-gray-400 transition" title="Settings">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                     </button>
                  </div>
                </div>

                <!-- Main Visualizer Area -->
                <div class="bg-black/40 rounded-lg border border-white/5 flex items-end justify-between px-4 py-2 gap-1 mb-6 relative"
                     [class]="visualizerContainerClasses()">
                  
                  <!-- Safe/Fraud Overlay Indicator -->
                  @if (audioService.isRecording()) {
                    <div class="absolute top-2 right-2 px-2 py-0.5 rounded border backdrop-blur-md transition-colors duration-300 z-20 shadow-lg"
                         [class]="indicatorClasses()">
                      <span class="font-mono font-bold tracking-wider text-xs"
                            [class]="fraudAlert() ? 'text-white' : 'text-emerald-300'">
                        {{ fraudAlert() ? 'THREAT DETECTED' : 'SECURE' }}
                      </span>
                    </div>
                  }

                  <!-- Visualizer Bars -->
                  @for (height of visualizerBars(); track $index) {
                    <div class="bar w-full rounded-t-sm"
                         [style.height.%]="height"
                         [class]="barClasses()">
                    </div>
                  }
                </div>

                <!-- Primary Controls -->
                @if (!overlayMode) {
                  <div class="flex items-center gap-4">
                      <button (click)="toggleSession()"
                              class="flex-1 py-4 font-cyber font-bold tracking-widest text-lg rounded bg-gradient-to-r transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] border border-white/10"
                              [class]="mainButtonClasses()">
                        {{ audioService.isRecording() ? 'TERMINATE UPLINK' : 'INITIALIZE UPLINK' }}
                      </button>
                      
                      <button (click)="toggleVoice()" 
                              class="px-4 py-4 rounded border border-white/10 transition-colors bg-white/5 hover:bg-white/10 relative group"
                              [class]="audioService.voiceEnabled() ? 'text-cyan-400' : 'text-gray-500'"
                              title="AI Voice Sentinel (Use Headphones)">
                          <div class="flex flex-col items-center">
                              <span class="text-[10px] font-mono mb-1">AI VOICE</span>
                              <div class="w-3 h-3 rounded-full" [class]="audioService.voiceEnabled() ? 'bg-cyan-500' : 'bg-gray-600'"></div>
                          </div>
                      </button>
                  </div>
                }
              </div>
          </div>

          <!-- Right Panel: Forensics (Hidden in Overlay Mode) -->
          @if (!overlayMode) {
            <div class="md:col-span-1 flex flex-col gap-6">
                
                <!-- Metrics Cards -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="glass-panel p-3 rounded-lg border-l-2 border-cyan-500">
                      <div class="text-[10px] text-gray-400 font-mono mb-1">PROBABILITY</div>
                      <div class="text-xl font-cyber text-white">
                        {{ (fraudService.currentResult()?.probability || 0) | percent:'1.0-0' }}
                      </div>
                  </div>
                  <div class="glass-panel p-3 rounded-lg border-l-2"
                       [class]="fraudAlert() ? 'border-red-500' : 'border-emerald-500'">
                      <div class="text-[10px] text-gray-400 font-mono mb-1">RECOMMENDATION</div>
                      <div class="text-sm font-bold font-mono truncate"
                           [class]="fraudAlert() ? 'text-red-400' : 'text-emerald-400'">
                         {{ (fraudService.currentResult()?.actionRecommendation) || 'IDLE' }}
                      </div>
                  </div>
                </div>

                <!-- Live Transcript Terminal -->
                <div class="glass-panel flex-1 rounded-xl p-4 flex flex-col overflow-hidden relative border border-cyan-500/20">
                    <div class="absolute top-0 left-0 w-full bg-cyan-900/20 p-2 text-[10px] font-mono text-cyan-400 border-b border-cyan-500/20 backdrop-blur-sm z-10 flex justify-between">
                        <span>> LIVE TRANSCRIPT_</span>
                        <span class="text-cyan-600">{{ audioService.voiceEnabled() ? 'VOICE GUARD ACTIVE' : 'SILENT MODE' }}</span>
                    </div>
                    <div #scrollContainer class="transcript-box mt-8 flex-1 overflow-y-auto font-mono text-xs md:text-sm text-cyan-100/80 space-y-2 max-h-[300px]">
                        @if (audioService.transcript()) {
                            <p class="break-words leading-relaxed">
                                {{ audioService.transcript() }}
                                <span class="inline-block w-2 h-4 bg-cyan-500 align-middle animate-pulse"></span>
                            </p>
                        } @else {
                            <div class="h-full flex items-center justify-center text-gray-600 italic">
                                Waiting for audio input...
                            </div>
                        }
                    </div>
                </div>

                <!-- Detected Phrases Alerts -->
                @if (keywordsDetected()) {
                    <div class="glass-panel p-3 rounded-xl border border-red-500/50 bg-red-900/10">
                        <div class="text-[10px] font-bold text-red-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                            FORENSIC ALERTS
                        </div>
                        <div class="flex flex-wrap gap-2">
                            @for (phrase of uniqueKeywords(); track $index) {
                                <span class="px-2 py-1 bg-red-500/20 border border-red-500/30 rounded text-[10px] text-red-200 font-mono">
                                    {{ phrase }}
                                </span>
                            }
                        </div>
                        <div class="mt-2 text-[10px] text-red-300/60 leading-tight">
                            Automated Advisory Sent to User.
                        </div>
                    </div>
                }
            </div>
          }
      </div>
  </div>
</div>

<!-- SETTINGS MODAL -->
@if (showSettings) {
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div class="bg-slate-900/95 border border-cyan-500/30 p-6 rounded-xl w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
            <button (click)="toggleSettings()" class="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
            <h3 class="font-cyber text-xl text-cyan-400 mb-6 flex items-center gap-2">
                <span>⚙</span> SENTINEL CONFIG
            </h3>
            
            <div class="space-y-6">
                <!-- Toggle Notification Master -->
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-sm text-white font-mono block">SYSTEM NOTIFICATIONS</span>
                        <span class="text-[10px] text-gray-500 block">Allow popup alerts</span>
                    </div>
                    <button (click)="updatePref('enabled', !prefs().enabled)" 
                            class="w-12 h-6 rounded-full transition-colors relative focus:outline-none"
                            [class]="prefs().enabled ? 'bg-emerald-600' : 'bg-gray-700'">
                        <div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-md"
                             [class]="prefs().enabled ? 'left-7' : 'left-1'"></div>
                    </button>
                </div>

                <!-- Toggle Sound -->
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-sm text-white font-mono block">VOICE & SOUND</span>
                        <span class="text-[10px] text-gray-500 block">AI Voice + Siren</span>
                    </div>
                    <button (click)="updatePref('soundEnabled', !prefs().soundEnabled)" 
                            class="w-12 h-6 rounded-full transition-colors relative focus:outline-none"
                            [class]="prefs().soundEnabled ? 'bg-cyan-600' : 'bg-gray-700'">
                        <div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-md"
                             [class]="prefs().soundEnabled ? 'left-7' : 'left-1'"></div>
                    </button>
                </div>

                <!-- Toggle Haptics -->
                <div class="flex items-center justify-between">
                    <div>
                         <span class="text-sm text-white font-mono block">HAPTIC FEEDBACK</span>
                         <span class="text-[10px] text-gray-500 block">Vibration on Threat</span>
                    </div>
                    <button (click)="updatePref('hapticsEnabled', !prefs().hapticsEnabled)" 
                            class="w-12 h-6 rounded-full transition-colors relative focus:outline-none"
                            [class]="prefs().hapticsEnabled ? 'bg-purple-600' : 'bg-gray-700'">
                        <div class="w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-md"
                             [class]="prefs().hapticsEnabled ? 'left-7' : 'left-1'"></div>
                    </button>
                </div>

                <!-- Threshold -->
                <div class="pt-4 border-t border-white/10">
                    <label class="block text-[10px] font-mono text-gray-500 mb-3">DETECTION SENSITIVITY</label>
                    <div class="grid grid-cols-3 gap-2">
                        <button *ngFor="let level of ['LOW','MEDIUM','HIGH']" 
                                (click)="updatePref('minThreshold', level)"
                                class="text-xs py-2 rounded border transition-colors font-mono hover:bg-white/5"
                                [class]="prefs().minThreshold === level ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'border-white/10 text-gray-500'">
                            {{ level }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
}

<!-- PERSISTENT CRITICAL ALERT OVERLAY (Mobile Optimized) -->
@if (criticalAlert(); as alert) {
  <div class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-red-950/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 p-6 text-center">
    
    <!-- Pulse Effect -->
    <div class="absolute inset-0 border-[16px] border-red-600 animate-pulse pointer-events-none"></div>

    <div class="relative z-10 flex flex-col items-center max-w-md w-full">
        <div class="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-[0_0_50px_rgba(220,38,38,0.8)] border-4 border-white">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>

        <h1 class="font-cyber text-5xl font-bold text-white mb-2 tracking-widest drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]">{{ alert.title }}</h1>
        <p class="text-red-100 font-mono text-xl mb-8 bg-black/50 px-6 py-4 rounded-xl border border-red-500/50 shadow-xl">
            {{ alert.message }}
        </p>
        
        <div class="grid grid-cols-1 w-full gap-4">
            <!-- Action: Hang Up -->
            <button (click)="terminateCall()" 
                    class="w-full py-6 bg-red-600 hover:bg-red-500 rounded-xl text-white font-cyber font-bold text-2xl tracking-widest shadow-2xl active:scale-95 transition-transform flex items-center justify-center gap-3 border-2 border-red-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
                HANG UP NOW
            </button>
            
            <!-- Action: Ignore -->
            <button (click)="dismissAlert()" 
                    class="w-full py-4 bg-transparent border border-white/20 rounded-xl text-gray-400 font-mono font-bold text-sm hover:bg-white/5 transition-colors">
                FALSE ALARM (DISMISS)
            </button>
        </div>
    </div>
  </div>
}
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .bar { transition: height 0.1s ease-out; } 
    .transcript-box { scroll-behavior: smooth; }
    /* Overlay Mode Styles: Fixed to bottom right, mimics floating widget */
    .overlay-mode {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        z-index: 9999;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        border-width: 1px;
    }
  `]
})
export class LiveAnalyzerComponent implements AfterViewChecked {
  audioService = inject(AudioService);
  fraudService = inject(FraudNetService);
  
  @ViewChild('scrollContainer') private scrollContainer: ElementRef | undefined;

  overlayMode = false;
  showSettings = false;

  // Visualizer Bars State
  private previousBars: number[] = Array(32).fill(5);

  visualizerBars = computed(() => {
    const data = this.audioService.frequencyData();
    const bars: number[] = [];
    const smoothingFactor = 0.6; 

    if (data.length > 0) {
      const step = Math.floor(data.length / 32);
      for (let i = 0; i < 32; i++) {
        const targetHeight = data[i * step] / 255 * 100;
        const prev = this.previousBars[i] || 5;
        const smoothVal = prev * smoothingFactor + targetHeight * (1 - smoothingFactor);
        bars.push(Math.max(5, smoothVal)); 
      }
    } else {
      return Array(32).fill(5);
    }
    
    this.previousBars = bars;
    return bars;
  });

  fraudAlert = computed(() => {
    const res = this.fraudService.currentResult();
    return res?.label === 'FRAUD';
  });

  // Access to critical overlay state
  criticalAlert = computed(() => this.fraudService.activeCriticalAlert());

  // Access to settings
  prefs = computed(() => this.fraudService.prefs());

  keywordsDetected = computed(() => {
      const res = this.fraudService.currentResult();
      return res?.detectedKeywords && res.detectedKeywords.length > 0;
  });

  uniqueKeywords = computed(() => {
      const k = this.fraudService.currentResult()?.detectedKeywords || [];
      return [...new Set(k)].slice(-3).reverse(); 
  });

  constructor() {
    effect(() => {
      if (this.audioService.isRecording()) {
        this.fraudService.startAnalysis();
      } else {
        this.fraudService.stopAnalysis();
      }
    });
  }

  ngAfterViewChecked() {
      this.scrollToBottom();
  }

  scrollToBottom(): void {
      if (this.scrollContainer) {
          try {
              this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
          } catch(err) { }
      }
  }

  toggleSession() {
    if (this.audioService.isRecording()) {
      this.audioService.stopRecording();
    } else {
      this.audioService.startRecording();
    }
  }

  toggleVoice() {
    this.audioService.voiceEnabled.update(v => !v);
  }
  
  toggleSettings() {
      this.showSettings = !this.showSettings;
  }
  
  toggleOverlay() {
      this.overlayMode = !this.overlayMode;
  }

  // --- Alert Actions ---
  dismissAlert() {
      this.fraudService.dismissCriticalAlert();
  }

  terminateCall() {
      // Simulate hanging up via the service
      this.audioService.stopRecording();
      this.fraudService.dismissCriticalAlert();
      // In a real mobile integration, this would call navigator.call.end() or similar if available/authorized
  }

  // --- Settings Updates ---
  updatePref(key: string, value: any) {
      this.fraudService.updatePreferences({ [key]: value });
  }

  // Helper Methods for complex classes
  panelClasses() {
    return this.overlayMode ? 'p-4' : 'min-h-[400px] border-red-500 shadow-[0_0_50px_rgba(220,38,38,0.3)]' + (this.fraudAlert() ? ' border-red-500 shadow-[0_0_50px_rgba(220,38,38,0.3)]' : '');
  }

  headerTextClasses() {
    const base = 'text-xl'; 
    const size = this.overlayMode ? 'text-sm' : 'text-xl';
    const color = this.fraudAlert() ? 'text-red-500' : 'text-white';
    return `${size} ${color}`;
  }

  visualizerContainerClasses() {
     const height = this.overlayMode ? 'h-20' : 'h-48 md:h-64';
     return `${height}`;
  }

  indicatorClasses() {
    if (this.fraudAlert()) {
      return 'border-red-500 bg-red-900/80';
    }
    return 'border-emerald-500 bg-emerald-900/60';
  }

  barClasses() {
    if (this.fraudAlert()) {
      return 'bg-red-500 shadow-[0_0_15px_rgba(255,0,0,0.6)]';
    }
    return 'bg-cyan-500 shadow-[0_0_10px_rgba(0,255,255,0.5)]';
  }
  
  mainButtonClasses() {
    if (this.audioService.isRecording()) {
      return 'from-red-900 to-rose-900 text-gray-200';
    }
    return 'from-cyan-900 to-blue-900 text-gray-200';
  }
}