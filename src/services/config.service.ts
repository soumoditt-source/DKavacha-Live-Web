import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  // State for the API Key
  private _apiKey = signal<string>('');
  
  // Derived state to check if the app is unlocked
  isUnlocked = computed(() => this._apiKey().length > 10 && this._apiKey().startsWith('AIza'));
  
  // Signal to expose the key securely to services
  apiKey = computed(() => this._apiKey());

  constructor() {
    // Optional: Attempt to restore session (SessionStorage only for security)
    const stored = sessionStorage.getItem('dkavacha_temp_key');
    if (stored) {
      this._apiKey.set(stored);
    }
  }

  setApiKey(key: string) {
    if (!key) return;
    this._apiKey.set(key);
    sessionStorage.setItem('dkavacha_temp_key', key);
  }

  clearSession() {
    this._apiKey.set('');
    sessionStorage.removeItem('dkavacha_temp_key');
  }
}