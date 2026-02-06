import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LiveAnalyzerComponent } from './components/live-analyzer/live-analyzer.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CallHistoryComponent } from './components/call-history/call-history.component';
import { DeepfakeScannerComponent } from './components/deepfake-scanner/deepfake-scanner.component';
import { FraudNetService } from './services/fraud-net.service';
import { ConfigService } from './services/config.service';
import { AudioService } from './services/audio.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    LiveAnalyzerComponent, 
    DashboardComponent, 
    CallHistoryComponent,
    DeepfakeScannerComponent
  ],
  template: `
    @if (!isUnlocked()) {
      <!-- BOOTLOADER / BIOS SCREEN -->
      <div class="fixed inset-0 bg-black z-[999] flex flex-col items-center justify-center font-mono overflow-hidden">
          
          <!-- Background Matrix Rain Effect (Simplified CSS) -->
          <div class="absolute inset-0 opacity-20 pointer-events-none">
              <div class="absolute top-0 left-[10%] w-px h-full bg-gradient-to-b from-transparent via-cyan-500 to-transparent opacity-30"></div>
              <div class="absolute top-0 left-[30%] w-px h-full bg-gradient-to-b from-transparent via-cyan-500 to-transparent opacity-20"></div>
              <div class="absolute top-0 left-[70%] w-px h-full bg-gradient-to-b from-transparent via-cyan-500 to-transparent opacity-40"></div>
              <div class="absolute top-0 left-[90%] w-px h-full bg-gradient-to-b from-transparent via-cyan-500 to-transparent opacity-20"></div>
          </div>

          <div class="relative z-10 w-full max-w-md p-8">
              <!-- Logo / Header -->
              <div class="text-center mb-12">
                  <div class="inline-block mb-4 p-4 border border-cyan-500/30 rounded-full bg-cyan-900/10 shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                      <span class="text-4xl">🛡️</span>
                  </div>
                  <h1 class="text-4xl font-cyber font-bold text-white tracking-widest glitch-text" data-text="DKAVACHA BIOS">DKAVACHA BIOS</h1>
                  <p class="text-cyan-500/60 text-xs tracking-[0.3em] mt-2">SYSTEM INTEGRITY CHECK... OK</p>
              </div>

              <!-- Input Terminal -->
              <div class="bg-black/80 border border-white/10 rounded-lg p-6 backdrop-blur-md shadow-2xl relative overflow-hidden group">
                  <!-- Corner Accents -->
                  <div class="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-500"></div>
                  <div class="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-500"></div>
                  <div class="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-500"></div>
                  <div class="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-500"></div>

                  <div class="mb-4">
                      <label class="block text-cyan-400 text-xs mb-2 tracking-widest">ENTER SECURE ACCESS TOKEN</label>
                      <div class="relative">
                          <span class="absolute left-3 top-3 text-cyan-700">></span>
                          <input type="password" 
                                 [(ngModel)]="inputKey"
                                 (keyup.enter)="unlockSystem()"
                                 class="w-full bg-black border border-cyan-900/50 rounded py-2 pl-8 pr-4 text-cyan-100 font-mono focus:border-cyan-500 focus:outline-none focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all placeholder-cyan-900"
                                 placeholder="AIza..." 
                                 [disabled]="isBooting()"
                                 autocomplete="off">
                      </div>
                  </div>

                  <button (click)="unlockSystem()"
                          [disabled]="isBooting()"
                          class="w-full py-3 bg-cyan-900/20 border border-cyan-500/30 text-cyan-400 font-cyber tracking-widest hover:bg-cyan-500 hover:text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                      @if (isBooting()) {
                          <span class="animate-pulse">INITIALIZING NEURAL LINK...</span>
                      } @else {
                          INITIALIZE SYSTEM
                      }
                  </button>
                  
                  @if (gateError()) {
                      <div class="mt-4 text-center">
                          <p class="text-red-500 text-xs font-mono bg-red-900/20 border border-red-500/20 py-1 px-2 animate-pulse">
                              ⚠️ {{ gateError() }}
                          </p>
                      </div>
                  }
              </div>

              <div class="mt-8 text-center">
                  <p class="text-[10px] text-gray-600 font-mono">
                      SECURE CONNECTION ESTABLISHED<br>
                      ENCRYPTION LEVEL: MILITARY GRADE
                  </p>
              </div>
          </div>
      </div>
    } @else {
      <!-- MAIN APPLICATION CONTENT -->
      <div class="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black text-slate-200 selection:bg-cyan-500/30 animate-in fade-in duration-1000">
        
        <!-- Navigation / Header -->
        <header class="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
          <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-black font-cyber text-lg shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                D
              </div>
              <div>
                <h1 class="font-cyber font-bold text-lg tracking-wider text-white">DKAVACHA <span class="text-cyan-500">LIVE</span></h1>
                <div class="text-[10px] text-gray-400 leading-none tracking-widest">PRODUCTION BUILD v3.3.0</div>
              </div>
            </div>
            
            <div class="flex items-center gap-6">
                <div class="hidden md:flex items-center gap-6 text-xs font-mono text-cyan-500/80">
                  <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    <span>API: ONLINE</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    <span>REGION: ASIA-SOUTH1</span>
                  </div>
                </div>
                
                <button (click)="logout()" class="text-xs font-mono text-red-400 hover:text-red-300 border border-red-900/50 bg-red-900/10 px-3 py-1 rounded transition-colors">
                    [ LOGOUT ]
                </button>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <main class="py-8 px-4 relative">
          
          <!-- Background Decor -->
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none"></div>

          <div class="relative z-10 flex flex-col items-center">
            
            <!-- Module Switcher -->
            <div class="inline-flex items-center p-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md mb-8 shadow-lg shadow-black/50">
                <button (click)="activeTab.set('live')" 
                        class="px-6 py-2 rounded-lg text-sm font-cyber tracking-wider transition-all duration-300 flex items-center gap-2"
                        [class.bg-gradient-to-r]="activeTab() === 'live'"
                        [class.from-cyan-600]="activeTab() === 'live'"
                        [class.to-blue-600]="activeTab() === 'live'"
                        [class.text-white]="activeTab() === 'live'"
                        [class.shadow-lg]="activeTab() === 'live'"
                        [class.text-gray-400]="activeTab() !== 'live'"
                        [class.hover:text-white]="activeTab() !== 'live'">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                   </svg>
                   LIVE SENTINEL
                </button>
                
                <button (click)="activeTab.set('scanner')" 
                        class="px-6 py-2 rounded-lg text-sm font-cyber tracking-wider transition-all duration-300 flex items-center gap-2"
                        [class.bg-gradient-to-r]="activeTab() === 'scanner'"
                        [class.from-purple-600]="activeTab() === 'scanner'"
                        [class.to-pink-600]="activeTab() === 'scanner'"
                        [class.text-white]="activeTab() === 'scanner'"
                        [class.shadow-lg]="activeTab() === 'scanner'"
                        [class.text-gray-400]="activeTab() !== 'scanner'"
                        [class.hover:text-white]="activeTab() !== 'scanner'">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                   </svg>
                   AI VOICE HUNTER
                </button>
            </div>

            <!-- Tab Content -->
            @if (activeTab() === 'live') {
                <div class="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <app-live-analyzer></app-live-analyzer>
                   <app-dashboard></app-dashboard>
                   <app-call-history></app-call-history>
                </div>
            } @else {
                <div class="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <app-deepfake-scanner></app-deepfake-scanner>
                </div>
            }

          </div>

        </main>

        <footer class="border-t border-white/5 bg-black text-center py-6 mt-12">
          <p class="text-xs text-gray-600 font-mono">
            © 2026 DKAVACHA SECURITY SYSTEMS. ALL RIGHTS RESERVED. <br>
            ENGINEERED BY SOUMODITYA DAS.
          </p>
        </footer>
      </div>
    }
  `,
})
export class AppComponent implements OnInit {
  fraudService = inject(FraudNetService);
  configService = inject(ConfigService);
  audioService = inject(AudioService);
  
  // Tab State: 'live' | 'scanner'
  activeTab = signal<'live' | 'scanner'>('live');

  // Gatekeeper Input State
  inputKey = '';
  gateError = signal('');
  isBooting = signal(false);

  // Expose unlocked state
  isUnlocked = computed(() => this.configService.isUnlocked());

  ngOnInit() {
    // Only load models if already unlocked (e.g. from session refresh)
    if (this.configService.isUnlocked()) {
      this.fraudService.loadModel();
    }
  }

  unlockSystem() {
    if (!this.inputKey || !this.inputKey.startsWith('AIza')) {
      this.gateError.set('ACCESS DENIED: INVALID KEY FORMAT');
      // Shake effect timeout
      setTimeout(() => this.gateError.set(''), 3000);
      return;
    }
    
    // REQUEST PERMISSIONS ON USER GESTURE (Notification + Audio)
    this.fraudService.requestNotificationPermission();
    
    // Greet immediately to ensure browser allows audio playback (Autoplay Policy)
    this.audioService.speak("System Unlocked. Access Granted to Soumoditya Das.", true);

    this.isBooting.set(true);
    
    // Simulate BIOS Loading Sequence
    setTimeout(() => {
        this.configService.setApiKey(this.inputKey);
        this.fraudService.loadModel();
        
        this.isBooting.set(false);
    }, 1500);
  }

  logout() {
    this.configService.clearSession();
    this.inputKey = '';
    window.location.reload();
  }
}