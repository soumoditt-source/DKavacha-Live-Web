import { Component, inject, computed, effect, ViewChild, ElementRef, AfterViewChecked, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioService } from '../../services/audio.service';
import { FraudNetService } from '../../services/fraud-net.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-live-analyzer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-analyzer.component.html',
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
}