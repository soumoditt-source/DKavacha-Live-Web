import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LiveAnalyzerComponent } from './components/live-analyzer/live-analyzer.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CallHistoryComponent } from './components/call-history/call-history.component';
import { DeepfakeScannerComponent } from './components/deepfake-scanner/deepfake-scanner.component';
import { FraudNetService } from './services/fraud-net.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    LiveAnalyzerComponent, 
    DashboardComponent, 
    CallHistoryComponent,
    DeepfakeScannerComponent
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  fraudService = inject(FraudNetService);
  
  // Tab State: 'live' | 'scanner'
  activeTab = signal<'live' | 'scanner'>('live');

  ngOnInit() {
    this.fraudService.loadModel();
  }
}