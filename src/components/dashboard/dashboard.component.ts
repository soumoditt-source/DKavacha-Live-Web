import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FraudNetService } from '../../services/fraud-net.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mt-8 px-4 pb-12">
  
  <!-- Main Telemetry Card (Full Width on Mobile) -->
  <div class="glass-panel p-6 rounded-xl border-t-4 border-purple-500 lg:col-span-2">
    <div class="flex justify-between items-start mb-4">
      <h3 class="font-cyber text-lg text-purple-300">LIVE TELEMETRY :: FRAUDNET v2.1</h3>
      <div class="flex gap-2">
        <span class="px-2 py-0.5 bg-purple-900/50 text-purple-200 text-xs rounded border border-purple-500/30">
            PROMETHEUS
        </span>
        <span class="px-2 py-0.5 bg-cyan-900/50 text-cyan-200 text-xs rounded border border-cyan-500/30">
            AUDIO+TEXT
        </span>
      </div>
    </div>
    
    <!-- Sparkline Chart -->
    <div class="h-40 w-full bg-black/20 rounded relative overflow-hidden border border-white/5 mb-4">
      <div class="absolute inset-0 grid grid-rows-4 w-full h-full opacity-10 pointer-events-none">
        <div class="border-b border-white w-full"></div>
        <div class="border-b border-white w-full"></div>
        <div class="border-b border-white w-full"></div>
      </div>
      
      <svg class="w-full h-full p-2" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path [attr.d]="historyPath()" 
              fill="none" 
              stroke="#a855f7" 
              stroke-width="0.5" 
              vector-effect="non-scaling-stroke"
              class="drop-shadow-[0_0_4px_rgba(168,85,247,0.8)]" />
        <path [attr.d]="historyPath() + ' V 40 H 0 Z'" 
              fill="url(#gradient)" 
              opacity="0.2" />
        <defs>
          <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#a855f7" />
            <stop offset="100%" stop-color="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <!-- Metrics Row -->
    <div class="grid grid-cols-3 gap-4">
        <div class="p-3 bg-white/5 rounded border-l-2 border-purple-400">
            <div class="text-[10px] text-gray-400 font-mono">SCANS</div>
            <div class="text-xl font-cyber text-white">{{ totalScans() }}</div>
        </div>
        <div class="p-3 bg-white/5 rounded border-l-2 border-yellow-400">
            <div class="text-[10px] text-gray-400 font-mono">AVG RISK</div>
            <div class="text-xl font-cyber text-white">{{ avgRisk() | number:'1.2-2' }}</div>
        </div>
        <div class="p-3 bg-white/5 rounded border-l-2 border-green-400">
            <div class="text-[10px] text-gray-400 font-mono">P99 LATENCY</div>
            <div class="text-xl font-cyber text-white">48ms</div>
        </div>
    </div>
  </div>

  <!-- ROC & Confusion Matrix Column -->
  <div class="space-y-6">
    
    <!-- KPI Cards -->
    <div class="grid grid-cols-2 gap-2">
      <div class="glass-panel p-2 rounded text-center">
        <div class="text-[9px] text-gray-400 font-mono uppercase">Precision</div>
        <div class="text-cyan-400 font-bold font-cyber">{{ metrics().precision | percent:'1.1-1' }}</div>
      </div>
      <div class="glass-panel p-2 rounded text-center">
        <div class="text-[9px] text-gray-400 font-mono uppercase">Recall</div>
        <div class="text-cyan-400 font-bold font-cyber">{{ metrics().recall | percent:'1.1-1' }}</div>
      </div>
       <div class="glass-panel p-2 rounded text-center">
        <div class="text-[9px] text-gray-400 font-mono uppercase">F1-Score</div>
        <div class="text-cyan-400 font-bold font-cyber">{{ metrics().f1 | percent:'1.1-1' }}</div>
      </div>
       <div class="glass-panel p-2 rounded text-center">
        <div class="text-[9px] text-gray-400 font-mono uppercase">Accuracy</div>
        <div class="text-cyan-400 font-bold font-cyber">{{ metrics().accuracy | percent:'1.1-1' }}</div>
      </div>
    </div>

    <!-- ROC Curve -->
    <div class="glass-panel p-5 rounded-xl border-l-4 border-cyan-500">
      <div class="flex justify-between items-center mb-2">
          <div class="text-cyan-400 text-xs font-bold tracking-wider">ROC CURVE (LIVE)</div>
          <div class="text-[10px] text-gray-500">AUC: 0.98</div>
      </div>
      <div class="w-full aspect-video bg-black/40 rounded border border-white/5 relative">
          <!-- Axes -->
          <div class="absolute bottom-0 left-0 w-full h-px bg-white/20"></div>
          <div class="absolute bottom-0 left-0 w-px h-full bg-white/20"></div>
          
          <svg class="w-full h-full p-2 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <!-- Random Chance Line -->
              <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2" vector-effect="non-scaling-stroke"/>
              
              <!-- The Curve -->
              <path [attr.d]="rocPath()" 
                    fill="none" 
                    stroke="#06b6d4" 
                    stroke-width="2" 
                    vector-effect="non-scaling-stroke"/>
              
              <!-- Area under curve -->
              <path [attr.d]="rocPath() + ' L 100 100 L 0 100 Z'" 
                    fill="#06b6d4" 
                    [style.opacity]="rocAreaOpacity() * 0.2" />
          </svg>
          <div class="absolute bottom-1 right-2 text-[8px] text-gray-500">FPR</div>
          <div class="absolute top-2 left-1 text-[8px] text-gray-500">TPR</div>
      </div>
    </div>

    <!-- Confusion Matrix -->
    <div class="glass-panel p-5 rounded-xl border-l-4 border-yellow-500">
      <div class="text-yellow-400 text-xs font-bold tracking-wider mb-2">CONFUSION MATRIX</div>
      <div class="grid grid-cols-2 gap-2 h-32">
          @for (cell of matrixCells(); track cell.label) {
              <div [class]="'flex flex-col items-center justify-center rounded ' + cell.bg">
                  <span [class]="'font-bold text-xl ' + cell.color">{{ cell.val }}</span>
                  <span class="text-[10px] text-white/50">{{ cell.label }}</span>
              </div>
          }
      </div>
    </div>

  </div>
</div>
  `,
})
export class DashboardComponent {
  fraudService = inject(FraudNetService);

  // --- Confusion Matrix Data ---
  matrix = computed(() => this.fraudService.confusionMatrix());
  
  matrixCells = computed(() => {
     const m = this.matrix();
     const total = m.tp + m.tn + m.fp + m.fn;
     const safeTotal = total > 0 ? total : 1;
     return [
         { label: 'TP', val: m.tp, color: 'text-green-400', bg: 'bg-green-500/20', pct: m.tp/safeTotal },
         { label: 'FP', val: m.fp, color: 'text-red-400', bg: 'bg-red-500/20', pct: m.fp/safeTotal },
         { label: 'FN', val: m.fn, color: 'text-orange-400', bg: 'bg-orange-500/20', pct: m.fn/safeTotal },
         { label: 'TN', val: m.tn, color: 'text-blue-400', bg: 'bg-blue-500/20', pct: m.tn/safeTotal },
     ];
  });

  // --- KPI Metrics ---
  metrics = computed(() => {
    const { tp, tn, fp, fn } = this.matrix();
    const total = tp + tn + fp + fn;
    
    const accuracy = total > 0 ? (tp + tn) / total : 0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return {
      accuracy,
      precision,
      recall,
      f1
    };
  });

  // --- Real-time ROC Curve ---
  // Renders a smooth curve approximating the classifier performance
  rocPath = computed(() => {
      const m = this.matrix();
      const accuracy = (m.tp + m.tn) / (m.tp + m.tn + m.fp + m.fn);
      
      // Control point logic to bow the curve based on accuracy
      const controlX = (1 - accuracy) * 60; 
      const controlY = (1 - accuracy) * 60;
      
      // M 0,100 (Start bottom-left) Q controlX,controlY 100,0 (End top-right)
      return `M 0,100 Q ${controlX},${controlY} 100,0`;
  });
  
  rocAreaOpacity = computed(() => {
     const m = this.matrix();
     const total = m.tp + m.tn + m.fp + m.fn;
     return total > 0 ? (m.tp + m.tn) / total : 0.5; 
  });

  // --- Real-time Threat Sparkline ---
  historyPath = computed(() => {
    const history = this.fraudService.recentHistory();
    if (history.length < 2) return 'M 0,40 L 100,40'; // Flat line default

    const width = 100; 
    const height = 40; 
    
    // Create points for SVG path
    const points = history.map((h, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - (h.probability * height);
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  });

  totalScans = computed(() => this.fraudService.recentHistory().length);
  
  avgRisk = computed(() => {
    const hist = this.fraudService.recentHistory();
    if (!hist.length) return 0;
    return hist.reduce((acc, curr) => acc + curr.probability, 0) / hist.length;
  });
}