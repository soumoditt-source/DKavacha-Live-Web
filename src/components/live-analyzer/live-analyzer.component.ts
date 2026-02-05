import { Component, inject, computed, effect, ViewChild, ElementRef, AfterViewChecked, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioService } from '../../services/audio.service';
import { FraudNetService } from '../../services/fraud-net.service';

@Component({
  selector: 'app-live-analyzer',
  standalone: true,
  imports: [CommonModule],
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

  // Smoothing state for bars
  private previousBars: number[] = Array(32).fill(5);

  // Visualizer bars computation with smoothing
  visualizerBars = computed(() => {
    const data = this.audioService.frequencyData();
    const bars: number[] = [];
    const smoothingFactor = 0.6; // Higher = smoother

    if (data.length > 0) {
      const step = Math.floor(data.length / 32);
      for (let i = 0; i < 32; i++) {
        const targetHeight = data[i * step] / 255 * 100;
        
        // Linear Interpolation (Lerp) for smoothness
        const prev = this.previousBars[i] || 5;
        const smoothVal = prev * smoothingFactor + targetHeight * (1 - smoothingFactor);
        
        bars.push(Math.max(5, smoothVal)); // Min height 5%
      }
    } else {
      return Array(32).fill(5);
    }
    
    // Side effect to update state - acceptable for visualizer cache
    this.previousBars = bars;
    return bars;
  });

  fraudAlert = computed(() => {
    const res = this.fraudService.currentResult();
    return res?.label === 'FRAUD';
  });

  threatLevel = computed(() => {
    return this.fraudService.currentResult()?.threatLevel || 0;
  });

  keywordsDetected = computed(() => {
      const res = this.fraudService.currentResult();
      return res?.detectedKeywords && res.detectedKeywords.length > 0;
  });

  uniqueKeywords = computed(() => {
      const k = this.fraudService.currentResult()?.detectedKeywords || [];
      return [...new Set(k)].slice(-3).reverse(); // Show last 3 unique threats
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
  
  toggleHaptics() {
    this.fraudService.toggleHaptics();
  }
  
  toggleOverlay() {
      this.overlayMode = !this.overlayMode;
  }
}