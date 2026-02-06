import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepfakeApiService, VoiceAnalysisRequest, VoiceAnalysisResponse } from '../../services/deepfake-api.service';
import { finalize } from 'rxjs/operators';

type ScanStage = 'IDLE' | 'PROCESSING' | 'COMPLETE' | 'ERROR';

@Component({
  selector: 'app-deepfake-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deepfake-scanner.component.html',
  styles: [`
    .drag-zone {
        background-image: url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='%23334155FF' stroke-width='2' stroke-dasharray='12%2c 12' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
    }
    .animate-ring {
      animation: pulse-ring 2s infinite cubic-bezier(0.24, 0, 0.38, 1);
    }
    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(6, 182, 212, 0); }
      100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
    }
  `]
})
export class DeepfakeScannerComponent {
  apiService = inject(DeepfakeApiService);

  // Configuration Signals
  apiKey = signal('sk_test_123456789'); // Client Auth Key (Problem Statement)
  googleKey = signal(''); // Google AI Key (For Functionality)
  
  apiKeyError = signal('');
  googleKeyError = signal('');
  
  selectedLang = signal<'Tamil' | 'English' | 'Hindi' | 'Malayalam' | 'Telugu'>('English');
  selectedFile = signal<File | null>(null);
  base64Audio = signal<string>('');
  
  // UI State
  scanStage = signal<ScanStage>('IDLE');
  result = signal<VoiceAnalysisResponse | null>(null);
  errorMessage = signal('');

  languages = ['Tamil', 'English', 'Hindi', 'Malayalam', 'Telugu'];

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
        // Extract pure Base64 (remove data:audio/mp3;base64, prefix)
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

    this.scanStage.set('PROCESSING');
    this.result.set(null);
    this.errorMessage.set('');

    const payload: VoiceAnalysisRequest = {
      language: this.selectedLang(),
      audioFormat: 'mp3',
      audioBase64: this.base64Audio()
    };

    // Pass BOTH keys: Client Auth + Google Backend Auth
    this.apiService.analyzeVoice(this.googleKey(), payload)
        .pipe(
            finalize(() => {
               if (!this.errorMessage()) {
                   this.scanStage.set('COMPLETE');
               } else {
                   this.scanStage.set('ERROR');
               }
            })
        )
        .subscribe({
            next: (res) => {
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