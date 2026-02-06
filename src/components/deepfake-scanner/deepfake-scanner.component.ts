import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepfakeApiService, VoiceAnalysisRequest, VoiceAnalysisResponse, SupportedLanguage } from '../../services/deepfake-api.service';
import { ConfigService } from '../../services/config.service';

type ScanStage = 'IDLE' | 'UPLOADING' | 'SPECTRAL_ANALYSIS' | 'NEURAL_CLASSIFICATION' | 'COMPLETE' | 'ERROR';

@Component({
  selector: 'app-deepfake-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="max-w-6xl mx-auto px-4 mt-8 pb-12">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <!-- Left Panel: Input -->
        <div class="space-y-6">
            <div class="glass-panel p-6 rounded-xl border-l-4 border-cyan-500">
                <div class="flex items-center gap-2 mb-6">
                    <span class="text-2xl">🧬</span>
                    <h2 class="font-cyber text-2xl text-cyan-100">AI VOICE HUNTER</h2>
                </div>
                
                <p class="text-sm text-slate-400 mb-6 font-light">
                    Analyze spectral artifacts to detect <strong>Voice Cloning</strong>.
                </p>

                <!-- Config -->
                <div class="space-y-4">
                    <!-- Client Key -->
                    <div>
                        <label class="block text-[10px] font-mono text-gray-500 mb-1">ACCESS TOKEN (x-api-key)</label>
                        <input type="text" 
                               [value]="apiKey()" 
                               (input)="apiKey.set($any($event.target).value)"
                               [class.border-red-500]="apiKeyError()"
                               class="w-full bg-black/40 border border-white/10 rounded px-4 py-2 text-sm text-cyan-400 font-mono focus:border-cyan-500 focus:outline-none transition-colors"
                               placeholder="sk_test_..." />
                    </div>

                    <!-- Lang Select -->
                    <div>
                        <label class="block text-[10px] font-mono text-gray-500 mb-1">TARGET LANGUAGE</label>
                        <div class="flex flex-wrap gap-2">
                            @for (lang of languages; track lang) {
                                <button (click)="selectedLang.set($any(lang))"
                                        class="px-3 py-1.5 rounded text-xs font-mono border transition-all duration-200"
                                        [class.bg-cyan-900_40]="selectedLang() === lang"
                                        [class.border-cyan-500]="selectedLang() === lang"
                                        [class.text-cyan-300]="selectedLang() === lang"
                                        [class.bg-transparent]="selectedLang() !== lang"
                                        [class.border-white_10]="selectedLang() !== lang"
                                        [class.text-gray-400]="selectedLang() !== lang">
                                    {{ lang }}
                                </button>
                            }
                        </div>
                    </div>
                </div>
            </div>

            <!-- Upload Area -->
            <div class="glass-panel p-8 rounded-xl drag-zone relative group cursor-pointer hover:bg-white/5 transition-colors"
                 (drop)="onDrop($event)" 
                 (dragover)="onDragOver($event)"
                 (click)="fileInput.click()">
                 
                 <input #fileInput type="file" accept="audio/*" class="hidden" (change)="onFileSelected($event)">
                 
                 <div class="flex flex-col items-center justify-center text-center space-y-3">
                    @if (!selectedFile()) {
                        <div class="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-cyan-100 font-bold">Upload Audio Sample</p>
                            <p class="text-xs text-gray-500 mt-1">MP3 format • Max 8MB</p>
                        </div>
                    } @else {
                        <div class="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 animate-bounce">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-emerald-300 font-bold truncate max-w-[200px]">{{ selectedFile()?.name }}</p>
                            <p class="text-xs text-gray-500 mt-1">{{ (selectedFile()?.size || 0) / 1024 / 1024 | number:'1.2-2' }} MB • Ready</p>
                        </div>
                    }
                 </div>
            </div>

            <!-- Analyze Button -->
            <button (click)="analyze()" 
                    [disabled]="!selectedFile() || scanStage() !== 'IDLE' && scanStage() !== 'COMPLETE' && scanStage() !== 'ERROR'"
                    class="w-full py-4 rounded bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-cyber font-bold tracking-widest text-white shadow-lg shadow-cyan-500/20 transition-all relative overflow-hidden">
                @if (scanStage() !== 'IDLE' && scanStage() !== 'COMPLETE' && scanStage() !== 'ERROR') {
                    <div class="flex items-center justify-center gap-2">
                        <span class="animate-pulse">{{ scanStage().replace('_', ' ') }}...</span>
                    </div>
                } @else {
                    INITIALIZE FORENSIC SCAN
                }
            </button>
            
            @if (errorMessage()) {
                <div class="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-300 text-xs font-mono">
                    ERROR: {{ errorMessage() }}
                </div>
            }
        </div>

        <!-- Right Panel: Output -->
        <div class="space-y-6">
            
            <!-- Result Card -->
            @if (result(); as res) {
                <div class="glass-panel p-6 rounded-xl border border-white/10 animate-in fade-in zoom-in duration-300" 
                     [class.border-red-500]="res.classification === 'AI_GENERATED'"
                     [class.border-emerald-500]="res.classification === 'HUMAN'">
                    
                    <div class="text-center py-6">
                        <div class="text-5xl md:text-6xl font-black font-cyber tracking-tight mb-2"
                             [class.text-red-500]="res.classification === 'AI_GENERATED'"
                             [class.text-emerald-400]="res.classification === 'HUMAN'"
                             [class.neon-text-red]="res.classification === 'AI_GENERATED'">
                            {{ res.classification?.replace('_', ' ') }}
                        </div>
                        <div class="text-sm font-mono text-gray-400">
                            CONFIDENCE: <span class="text-white">{{ res.confidenceScore | percent:'1.1-2' }}</span>
                        </div>
                    </div>
                </div>
            } @else {
                @if (scanStage() !== 'IDLE' && scanStage() !== 'ERROR') {
                     <!-- Animated Scanner -->
                     <div class="glass-panel p-6 rounded-xl border border-cyan-500/50 h-[300px] flex flex-col items-center justify-center space-y-6 relative overflow-hidden">
                         <div class="absolute inset-0 grid grid-cols-6 grid-rows-6 opacity-20 pointer-events-none">
                             <div class="border border-cyan-500/30" *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36]"></div>
                         </div>
                         <div class="absolute top-0 left-0 w-full h-1 bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.8)] scanner-line"></div>
                         
                         <div class="z-10 text-center relative">
                             <h3 class="font-cyber text-2xl text-cyan-400 animate-pulse">{{ scanStage().replace('_', ' ') }}</h3>
                             <p class="text-xs font-mono text-cyan-200 mt-2">PROCESS: {{ progress() | number:'1.0-0' }}%</p>
                         </div>
                     </div>
                } @else {
                    <div class="glass-panel p-6 rounded-xl border border-white/5 h-[300px] flex flex-col items-center justify-center text-gray-600 border-dashed">
                        <div class="text-4xl mb-4 opacity-20">📡</div>
                        <p class="text-sm font-mono">AWAITING AUDIO INPUT...</p>
                    </div>
                }
            }

            <!-- JSON Output -->
            <div class="glass-panel rounded-xl overflow-hidden border border-white/5 flex flex-col h-[300px]">
                <div class="bg-black/40 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                    <span class="text-[10px] font-mono text-gray-400">RAW TELEMETRY</span>
                </div>
                <div class="p-4 bg-[#0a0a0a] flex-1 overflow-auto font-mono text-xs">
                    <pre class="text-gray-300 leading-relaxed">{{ formattedJson }}</pre>
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
      animation: scan 1.5s ease-in-out infinite;
    }
    @keyframes scan {
      0% { transform: translateY(-100%); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(100%); opacity: 0; }
    }
  `]
})
export class DeepfakeScannerComponent {
  apiService = inject(DeepfakeApiService);
  configService = inject(ConfigService);

  apiKey = signal(''); 
  googleKey = this.configService.apiKey;
  apiKeyError = signal('');
  
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

    const reader = new FileReader();
    reader.onload = () => {
        this.base64Audio.set((reader.result as string).split(',')[1]);
    };
    reader.readAsDataURL(file);
  }

  validateKeys() {
      let valid = true;
      if (!this.apiKey().startsWith('sk_test_')) {
          this.apiKeyError.set('Invalid format');
          valid = false;
      } else {
          this.apiKeyError.set('');
      }
      if (!this.googleKey()) {
          this.errorMessage.set('System Locked');
          valid = false;
      }
      return valid;
  }

  analyze() {
    if (!this.validateKeys()) return;
    if (!this.base64Audio()) return;

    this.scanStage.set('UPLOADING');
    this.progress.set(0);
    this.result.set(null);
    this.errorMessage.set('');

    let p = 0;
    const interval = setInterval(() => {
        const stage = this.scanStage();
        if (stage === 'ERROR' || stage === 'COMPLETE') {
            clearInterval(interval);
            if (stage === 'COMPLETE') this.progress.set(100);
            return;
        }
        if (stage === 'UPLOADING') { if (p < 20) p += 2; else this.scanStage.set('SPECTRAL_ANALYSIS'); } 
        else if (stage === 'SPECTRAL_ANALYSIS') { if (p < 60) p += 1; else this.scanStage.set('NEURAL_CLASSIFICATION'); }
        else if (stage === 'NEURAL_CLASSIFICATION') { if (p < 90) p += 0.5; }
        this.progress.set(Math.min(99, p));
    }, 50);

    const payload: VoiceAnalysisRequest = {
      language: this.selectedLang(),
      audioFormat: 'mp3',
      audioBase64: this.base64Audio()
    };

    this.apiService.analyzeVoice(this.googleKey(), payload)
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
    if (!this.result()) return '// Ready...';
    return JSON.stringify(this.result(), null, 2);
  }
}