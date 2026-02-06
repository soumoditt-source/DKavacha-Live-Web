import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepfakeApiService, VoiceAnalysisRequest, VoiceAnalysisResponse, SupportedLanguage } from '../../services/deepfake-api.service';
import { ConfigService } from '../../services/config.service';

type ScanStage = 'IDLE' | 'UPLOADING' | 'SPECTRAL_ANALYSIS' | 'MFCC_EXTRACTION' | 'NEURAL_CLASSIFICATION' | 'COMPLETE' | 'ERROR';

@Component({
  selector: 'app-deepfake-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="max-w-6xl mx-auto px-4 mt-8 pb-12">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <!-- Left Panel: Control Center -->
        <div class="space-y-6">
            <div class="glass-panel p-6 rounded-xl border-l-4 border-cyan-500 relative overflow-hidden">
                <!-- Background Decoration -->
                <div class="absolute -right-10 -top-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div class="flex items-center gap-3 mb-6 relative z-10">
                    <div class="w-10 h-10 rounded bg-cyan-900/30 flex items-center justify-center border border-cyan-500/30">
                        <span class="text-2xl">🧬</span>
                    </div>
                    <div>
                        <h2 class="font-cyber text-2xl text-cyan-100 tracking-wide">AI VOICE HUNTER</h2>
                        <p class="text-[10px] text-cyan-400 font-mono tracking-widest">ADVANCED FORENSIC UNIT</p>
                    </div>
                </div>
                
                <!-- Target Language Selector -->
                <div class="mb-6">
                    <label class="block text-[10px] font-mono text-gray-500 mb-2">TARGET LANGUAGE MODEL</label>
                    <div class="flex flex-wrap gap-2">
                        @for (lang of languages; track lang) {
                            <button (click)="selectedLang.set($any(lang))"
                                    class="px-3 py-1.5 rounded text-xs font-mono border transition-all duration-200"
                                    [class.bg-cyan-900_40]="selectedLang() === lang"
                                    [class.border-cyan-500]="selectedLang() === lang"
                                    [class.text-cyan-300]="selectedLang() === lang"
                                    [class.bg-transparent]="selectedLang() !== lang"
                                    [class.border-white_10]="selectedLang() !== lang"
                                    [class.text-gray-400]="selectedLang() !== lang"
                                    [disabled]="scanStage() !== 'IDLE' && scanStage() !== 'COMPLETE' && scanStage() !== 'ERROR'">
                                {{ lang }}
                            </button>
                        }
                    </div>
                </div>

                <!-- API Status Indicator -->
                <div class="flex items-center gap-2 p-2 rounded bg-black/20 border border-white/5">
                    <div class="w-2 h-2 rounded-full" [class]="configService.isUnlocked() ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'"></div>
                    <span class="text-[10px] font-mono text-gray-400">
                        SYSTEM ACCESS: {{ configService.isUnlocked() ? 'GRANTED' : 'RESTRICTED' }}
                    </span>
                </div>
            </div>

            <!-- Upload Zone -->
            <div class="glass-panel p-8 rounded-xl drag-zone relative group cursor-pointer hover:bg-white/5 transition-all duration-300 border border-white/10 hover:border-cyan-500/30"
                 (drop)="onDrop($event)" 
                 (dragover)="onDragOver($event)"
                 (click)="fileInput.click()">
                 
                 <input #fileInput type="file" accept="audio/*" class="hidden" (change)="onFileSelected($event)">
                 
                 <div class="flex flex-col items-center justify-center text-center space-y-4">
                    @if (!selectedFile()) {
                        <div class="w-16 h-16 rounded-full bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-cyan-100 font-bold font-cyber tracking-wider">UPLOAD AUDIO SAMPLE</p>
                            <p class="text-xs text-gray-500 mt-1 font-mono">MP3/WAV • Max 8MB • Clear Speech</p>
                        </div>
                    } @else {
                        <div class="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-bounce">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-emerald-300 font-bold truncate max-w-[250px] font-mono">{{ selectedFile()?.name }}</p>
                            <p class="text-xs text-gray-500 mt-1 font-mono">
                                {{ (selectedFile()?.size || 0) / 1024 / 1024 | number:'1.2-2' }} MB • READY FOR SCAN
                            </p>
                        </div>
                    }
                 </div>
            </div>

            <!-- Execute Scan Button -->
            <button (click)="analyze()" 
                    [disabled]="!selectedFile() || (scanStage() !== 'IDLE' && scanStage() !== 'COMPLETE' && scanStage() !== 'ERROR')"
                    class="w-full py-5 rounded bg-gradient-to-r from-cyan-700 via-blue-700 to-cyan-700 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:grayscale font-cyber font-bold text-lg tracking-[0.2em] text-white shadow-lg shadow-cyan-500/20 transition-all relative overflow-hidden group">
                
                <!-- Shine Effect -->
                <div class="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 group-hover:animate-shine"></div>

                @if (scanStage() !== 'IDLE' && scanStage() !== 'COMPLETE' && scanStage() !== 'ERROR') {
                    <div class="flex items-center justify-center gap-3">
                        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span class="animate-pulse">{{ scanStage().replace('_', ' ') }}...</span>
                    </div>
                } @else {
                    INITIALIZE FORENSIC SCAN
                }
            </button>
            
            @if (errorMessage()) {
                <div class="p-4 bg-red-950/40 border border-red-500/50 rounded flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <h4 class="text-red-400 text-xs font-bold font-mono">SCAN FAILED</h4>
                        <p class="text-red-300 text-xs font-mono">{{ errorMessage() }}</p>
                    </div>
                </div>
            }
        </div>

        <!-- Right Panel: Visualizer & Output -->
        <div class="space-y-6">
            
            <!-- Main Result Display -->
            @if (result(); as res) {
                <div class="glass-panel p-8 rounded-xl border animate-in zoom-in duration-500 relative overflow-hidden" 
                     [class.border-red-500]="res.classification === 'AI_GENERATED'"
                     [class.border-emerald-500]="res.classification === 'HUMAN'"
                     [class.shadow-[0_0_50px_rgba(239,68,68,0.3)]]="res.classification === 'AI_GENERATED'"
                     [class.shadow-[0_0_50px_rgba(16,185,129,0.3)]]="res.classification === 'HUMAN'">
                    
                    <!-- Scanline Overlay -->
                    <div class="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                    
                    <div class="text-center relative z-10">
                        <div class="inline-block px-4 py-1 rounded-full text-[10px] font-mono mb-4 border"
                             [class.bg-red-900_30]="res.classification === 'AI_GENERATED'"
                             [class.border-red-500_50]="res.classification === 'AI_GENERATED'"
                             [class.text-red-300]="res.classification === 'AI_GENERATED'"
                             [class.bg-emerald-900_30]="res.classification === 'HUMAN'"
                             [class.border-emerald-500_50]="res.classification === 'HUMAN'"
                             [class.text-emerald-300]="res.classification === 'HUMAN'">
                            FORENSIC RESULT
                        </div>

                        <div class="text-5xl md:text-7xl font-black font-cyber tracking-tighter mb-4"
                             [class.text-red-500]="res.classification === 'AI_GENERATED'"
                             [class.text-emerald-400]="res.classification === 'HUMAN'"
                             [class.neon-text-red]="res.classification === 'AI_GENERATED'">
                            {{ res.classification?.replace('_', ' ') }}
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4 max-w-xs mx-auto mt-8 border-t border-white/10 pt-6">
                            <div class="text-center">
                                <div class="text-[10px] text-gray-400 font-mono mb-1">CONFIDENCE</div>
                                <div class="text-2xl font-bold text-white font-cyber">{{ res.confidenceScore | percent:'1.1-1' }}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-[10px] text-gray-400 font-mono mb-1">LATENCY</div>
                                <div class="text-2xl font-bold text-white font-cyber">{{ res.processingTimeMs }}<span class="text-xs text-gray-500">ms</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            } @else {
                <!-- Active Scanning Visualization -->
                @if (scanStage() !== 'IDLE' && scanStage() !== 'ERROR') {
                     <div class="glass-panel p-6 rounded-xl border border-cyan-500/50 h-[350px] flex flex-col items-center justify-center space-y-8 relative overflow-hidden bg-black/40">
                         <!-- Grid BG -->
                         <div class="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-10 pointer-events-none">
                             <div class="border border-cyan-500/30" *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]"></div>
                         </div>
                         
                         <!-- Scanning Bar -->
                         <div class="absolute top-0 left-0 w-full h-1 bg-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.9)] scanner-line z-20"></div>
                         
                         <!-- Status Text -->
                         <div class="z-30 text-center relative">
                             <h3 class="font-cyber text-2xl text-cyan-400 animate-pulse tracking-widest mb-2">{{ scanStage().replace('_', ' ') }}</h3>
                             <div class="w-64 h-2 bg-gray-800 rounded-full overflow-hidden mx-auto border border-white/10">
                                 <div class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                                      [style.width.%]="progress()"></div>
                             </div>
                             <p class="text-xs font-mono text-cyan-200 mt-3">ANALYZING SPECTRAL ARTIFACTS: {{ progress() | number:'1.0-0' }}%</p>
                         </div>
                         
                         <!-- Fake Waveform Animation -->
                         <div class="flex items-end gap-1 h-12">
                            <div class="w-1 bg-cyan-500/50 animate-wave-1"></div>
                            <div class="w-1 bg-cyan-500/50 animate-wave-2"></div>
                            <div class="w-1 bg-cyan-500/50 animate-wave-3"></div>
                            <div class="w-1 bg-cyan-500/50 animate-wave-4"></div>
                            <div class="w-1 bg-cyan-500/50 animate-wave-2"></div>
                            <div class="w-1 bg-cyan-500/50 animate-wave-5"></div>
                            <div class="w-1 bg-cyan-500/50 animate-wave-1"></div>
                         </div>
                     </div>
                } @else {
                    <!-- Placeholder State -->
                    <div class="glass-panel p-6 rounded-xl border border-white/5 h-[350px] flex flex-col items-center justify-center text-gray-600 border-dashed bg-black/20">
                        <div class="text-6xl mb-6 opacity-20 animate-pulse">📡</div>
                        <p class="text-sm font-mono tracking-widest">AWAITING AUDIO INPUT STREAM...</p>
                    </div>
                }
            }

            <!-- JSON Telemetry Log -->
            <div class="glass-panel rounded-xl overflow-hidden border border-white/5 flex flex-col h-[200px]">
                <div class="bg-black/40 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                    <span class="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Neural Engine Telemetry</span>
                    <div class="flex gap-1">
                        <div class="w-2 h-2 rounded-full bg-red-500/20"></div>
                        <div class="w-2 h-2 rounded-full bg-yellow-500/20"></div>
                        <div class="w-2 h-2 rounded-full bg-green-500/20"></div>
                    </div>
                </div>
                <div class="p-4 bg-[#050505] flex-1 overflow-auto font-mono text-[10px] leading-relaxed custom-scrollbar">
                    <pre class="text-gray-400" [class.text-cyan-300]="result()">{{ formattedJson }}</pre>
                </div>
            </div>
        </div>
    </div>
</div>
  `,
  styles: [`
    .drag-zone {
        background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23334155FF' stroke-width='2' stroke-dasharray='12%2c 12' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
    }
    .scanner-line {
      animation: scan 2s ease-in-out infinite;
    }
    @keyframes scan {
      0% { top: 0%; opacity: 0; }
      15% { opacity: 1; }
      85% { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }
    .animate-wave-1 { height: 40%; animation: wave 0.5s infinite alternate; }
    .animate-wave-2 { height: 60%; animation: wave 0.6s infinite alternate; }
    .animate-wave-3 { height: 90%; animation: wave 0.4s infinite alternate; }
    .animate-wave-4 { height: 70%; animation: wave 0.7s infinite alternate; }
    .animate-wave-5 { height: 50%; animation: wave 0.5s infinite alternate; }
    @keyframes wave { from { transform: scaleY(0.5); } to { transform: scaleY(1.2); } }
    
    .animate-shine {
        animation: shine 2s infinite;
    }
    @keyframes shine {
        0% { left: -100%; }
        20% { left: 100%; }
        100% { left: 100%; }
    }
  `]
})
export class DeepfakeScannerComponent {
  apiService = inject(DeepfakeApiService);
  configService = inject(ConfigService);

  // State Signals
  selectedLang = signal<SupportedLanguage>('Auto-Detect');
  selectedFile = signal<File | null>(null);
  base64Audio = signal<string>('');
  
  scanStage = signal<ScanStage>('IDLE');
  progress = signal(0);
  result = signal<VoiceAnalysisResponse | null>(null);
  errorMessage = signal('');

  languages: SupportedLanguage[] = [
      'Auto-Detect', 'English', 'Hindi', 'Tamil', 'Telugu', 
      'Bengali', 'Malayalam', 'Kannada', 'Gujarati', 'Marathi', 'Odia'
  ];

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) this.processFile(file);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files.length) {
      this.processFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  private processFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      alert('File limit: 8MB');
      return;
    }
    this.selectedFile.set(file);
    this.result.set(null); 
    this.scanStage.set('IDLE');
    this.progress.set(0);
    this.errorMessage.set('');

    const reader = new FileReader();
    reader.onload = () => {
        const resultStr = reader.result as string;
        // Strip data:audio/xyz;base64, prefix
        this.base64Audio.set(resultStr.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }

  analyze() {
    // 1. Pre-Flight Checks
    if (!this.configService.isUnlocked()) {
        this.errorMessage.set('SYSTEM LOCKED. Please authenticate via BIOS.');
        return;
    }
    if (!this.base64Audio()) {
        this.errorMessage.set('No audio data found. Please re-upload.');
        return;
    }

    // 2. Initialize Scan State
    this.scanStage.set('UPLOADING');
    this.progress.set(0);
    this.result.set(null);
    this.errorMessage.set('');

    // 3. Fake Progress Simulation (for UX perception of complex analysis)
    let p = 0;
    const interval = setInterval(() => {
        const stage = this.scanStage();
        if (stage === 'ERROR' || stage === 'COMPLETE') {
            clearInterval(interval);
            if (stage === 'COMPLETE') this.progress.set(100);
            return;
        }
        
        // Staged Progress Logic
        if (stage === 'UPLOADING') { 
            if (p < 20) p += 2; 
            else this.scanStage.set('SPECTRAL_ANALYSIS'); 
        } 
        else if (stage === 'SPECTRAL_ANALYSIS') { 
            if (p < 50) p += 1; 
            else this.scanStage.set('MFCC_EXTRACTION'); 
        }
        else if (stage === 'MFCC_EXTRACTION') {
            if (p < 80) p += 1.5;
            else this.scanStage.set('NEURAL_CLASSIFICATION');
        }
        else if (stage === 'NEURAL_CLASSIFICATION') { 
            if (p < 95) p += 0.5; 
        }
        
        this.progress.set(Math.min(99, p));
    }, 50);

    // 4. API Request
    const payload: VoiceAnalysisRequest = {
      language: this.selectedLang(),
      audioFormat: 'mp3',
      audioBase64: this.base64Audio()
    };

    this.apiService.analyzeVoice(payload)
        .subscribe({
            next: (res) => {
                this.scanStage.set('COMPLETE');
                this.result.set(res);
            },
            error: (err) => {
                this.errorMessage.set(err.message || 'Analysis Failed');
                this.scanStage.set('ERROR');
            }
        });
  }

  get formattedJson() {
    if (this.errorMessage()) return `// ERROR LOG\n${this.errorMessage()}`;
    if (!this.result()) return '// READY FOR INGESTION...';
    return JSON.stringify(this.result(), null, 2);
  }
}