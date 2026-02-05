import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FraudNetService } from '../../services/fraud-net.service';

@Component({
  selector: 'app-call-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-6xl mx-auto px-4 mt-8 pb-20">
      <div class="glass-panel p-6 rounded-xl border-t-4 border-cyan-500">
        <h3 class="font-cyber text-lg text-cyan-300 mb-6">SESSION ARCHIVE</h3>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="text-xs font-mono text-gray-500 border-b border-white/10">
                <th class="p-3">SESSION ID</th>
                <th class="p-3">TIMESTAMP</th>
                <th class="p-3">DURATION</th>
                <th class="p-3">REGION</th>
                <th class="p-3">RESULT</th>
              </tr>
            </thead>
            <tbody>
              @for (session of paginatedHistory(); track session.id) {
                <tr class="text-sm border-b border-white/5 hover:bg-white/5 transition-colors font-mono">
                  <td class="p-3 text-cyan-500">{{ session.id }}</td>
                  <td class="p-3 text-gray-300">{{ session.startTime | date:'short' }}</td>
                  <td class="p-3 text-gray-400">{{ session.duration || 0 }}s</td>
                  <td class="p-3 text-gray-400">{{ session.geoRegion }}</td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold"
                          [class.bg-red-500_20]="session.finalRiskLabel === 'FRAUD'"
                          [class.text-red-400]="session.finalRiskLabel === 'FRAUD'"
                          [class.bg-green-500_20]="session.finalRiskLabel !== 'FRAUD'"
                          [class.text-green-400]="session.finalRiskLabel !== 'FRAUD'">
                      {{ session.finalRiskLabel }}
                    </span>
                  </td>
                </tr>
              }
              @if (paginatedHistory().length === 0) {
                <tr>
                  <td colspan="5" class="p-8 text-center text-gray-500 italic">No session history available.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Simple Pagination -->
        @if (totalHistory() > pageSize) {
            <div class="flex justify-between items-center mt-4 text-xs font-mono">
                <button (click)="prevPage()" [disabled]="currentPage() === 0" class="px-3 py-1 rounded border border-white/10 disabled:opacity-50 hover:bg-white/10 text-cyan-400">
                    < PREV
                </button>
                <span class="text-gray-500">PAGE {{ currentPage() + 1 }} OF {{ totalPages() }}</span>
                <button (click)="nextPage()" [disabled]="currentPage() >= totalPages() - 1" class="px-3 py-1 rounded border border-white/10 disabled:opacity-50 hover:bg-white/10 text-cyan-400">
                    NEXT >
                </button>
            </div>
        }
      </div>
    </div>
  `
})
export class CallHistoryComponent {
  fraudService = inject(FraudNetService);
  
  currentPage = signal(0);
  pageSize = 5;

  history = computed(() => this.fraudService.sessionHistory());
  totalHistory = computed(() => this.history().length);
  
  totalPages = computed(() => Math.ceil(this.totalHistory() / this.pageSize));

  paginatedHistory = computed(() => {
    const start = this.currentPage() * this.pageSize;
    return this.history().slice(start, start + this.pageSize);
  });

  nextPage() {
    if (this.currentPage() < this.totalPages() - 1) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 0) {
      this.currentPage.update(p => p - 1);
    }
  }
}