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
    .json-key { color: #f472b6; }
    .json-string { color: #a5f3fc; }
    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(6, 182, 212, 0); }
      100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
    }
    .animate-ring {
      animation: pulse-ring 2s infinite cubic-bezier(0.24, 0, 0.38, 1);
    }
  `]
})
export class DeepfakeScannerComponent {
  apiService = inject(DeepfakeApiService);

  // Form State
  apiKey = signal('sk_test_123456789');
  apiKeyError = signal('');
  
  selectedLang = signal<'Tamil' | 'English' | 'Hindi' | 'Malayalam' | 'Telugu'>('English');
  selectedFile = signal<File | null>(null);
  base64Audio = signal<string>('');
  
  // Real UI State (No Simulation)
  scanStage = signal<ScanStage>('IDLE');
  result = signal<VoiceAnalysisResponse | null>(null);
  errorMessage = signal('');

  languages = ['Tamil', 'English', 'Hindi', 'Malayalam', 'Telugu'];

  validateApiKey(key: string) {
      this.apiKey.set(key);
      const regex = /^sk_test_[a-zA-Z0-9]+$/;
      if (!key) {
          this.apiKeyError.set('API Key is required.');
      } else if (!regex.test(key)) {
          this.apiKeyError.set('Invalid format. Must start with "sk_test_".');
      } else {
          this.apiKeyError.set('');
      }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
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
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Max 5MB.');
      return;
    }
    this.selectedFile.set(file);
    this.result.set(null); 
    this.scanStage.set('IDLE');

    const reader = new FileReader();
    reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        this.base64Audio.set(base64String);
    };
    reader.readAsDataURL(file);
  }

  analyze() {
    this.validateApiKey(this.apiKey());
    if (this.apiKeyError() || !this.base64Audio()) return;

    this.scanStage.set('PROCESSING');
    this.result.set(null);
    this.errorMessage.set('');

    const payload: VoiceAnalysisRequest = {
      language: this.selectedLang(),
      audioFormat: 'mp3',
      audioBase64: this.base64Audio()
    };

    // CALLING REAL API SERVICE (Gemini)
    this.apiService.analyzeVoice(this.apiKey(), payload)
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
    if (!this.result()) return '';
    return JSON.stringify(this.result(), null, 2);
  }
}