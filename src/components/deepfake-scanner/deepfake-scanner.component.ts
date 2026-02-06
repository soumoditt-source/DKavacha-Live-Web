import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepfakeApiService, VoiceAnalysisRequest, VoiceAnalysisResponse, SupportedLanguage } from '../../services/deepfake-api.service';
import { finalize } from 'rxjs/operators';

type ScanStage = 'IDLE' | 'UPLOADING' | 'SPECTRAL_ANALYSIS' | 'NEURAL_CLASSIFICATION' | 'COMPLETE' | 'ERROR';

@Component({
  selector: 'app-deepfake-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deepfake-scanner.component.html',
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

  // Configuration Signals
  apiKey = signal('sk_test_123456789'); // Client Auth Key
  // PRE-FILLED WITH USER'S KEY FOR INSTANT DEMO SUCCESS
  googleKey = signal('AIzaSyAmAapopR9s0Q9FPmYhcSzkzcvZE8c9flM'); 
  
  apiKeyError = signal('');
  googleKeyError = signal('');
  
  selectedLang = signal<SupportedLanguage>('Auto-Detect');
  selectedFile = signal<File | null>(null);
  base64Audio = signal<string>('');
  
  // UI State
  scanStage = signal<ScanStage>('IDLE');
  progress = signal(0);
  result = signal<VoiceAnalysisResponse | null>(null);
  errorMessage = signal('');

  languages: SupportedLanguage[] = [
      'Auto-Detect',
      'English', 'Tamil', 'Hindi', 'Malayalam', 'Telugu', 
      'Bengali', 'Gujarati', 'Marathi', 'Kannada', 'Odia'
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
      alert('File too large. Max 8MB limit for demo.');
      return;
    }
    this.selectedFile.set(file);
    this.result.set(null); 
    this.scanStage.set('IDLE');

    const reader = new FileReader();
    reader.onload = () => {
        // Extract pure Base64
        const base64String = (reader.result as string).split(',')[1];
        this.base64Audio.set(base64String);
    };
    reader.readAsDataURL(file);
  }

  validateKeys() {
      let valid = true;
      if (!this.apiKey().startsWith('sk_test_')) {
          this.apiKeyError.set('Invalid format (must start with sk_test_)');
          valid = false;
      } else {
          this.apiKeyError.set('');
      }

      if (!this.googleKey()) {
          this.googleKeyError.set('Required for AI analysis');
          valid = false;
      } else {
          this.googleKeyError.set('');
      }
      return valid;
  }

  analyze() {
    if (!this.validateKeys()) return;
    if (!this.base64Audio()) return;

    // Start Simulation of stages
    this.scanStage.set('UPLOADING');
    this.progress.set(10);
    this.result.set(null);
    this.errorMessage.set('');

    setTimeout(() => {
        this.scanStage.set('SPECTRAL_ANALYSIS');
        this.progress.set(40);
    }, 800);

    setTimeout(() => {
        this.scanStage.set('NEURAL_CLASSIFICATION');
        this.progress.set(70);
    }, 2000);

    const payload: VoiceAnalysisRequest = {
      language: this.selectedLang(),
      audioFormat: 'mp3',
      audioBase64: this.base64Audio()
    };

    this.apiService.analyzeVoice(this.googleKey(), payload)
        .pipe(
            finalize(() => {
               if (this.errorMessage()) {
                   this.scanStage.set('ERROR');
               }
            })
        )
        .subscribe({
            next: (res) => {
                this.progress.set(100);
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
    if (!this.result()) return '// Ready to receive data...';
    return JSON.stringify(this.result(), null, 2);
  }
}