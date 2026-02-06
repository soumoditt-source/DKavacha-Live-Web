import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FraudNetService } from '../../services/fraud-net.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
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