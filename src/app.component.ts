import { Component, inject, OnInit } from '@angular/core';
import { LiveAnalyzerComponent } from './components/live-analyzer/live-analyzer.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CallHistoryComponent } from './components/call-history/call-history.component';
import { FraudNetService } from './services/fraud-net.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LiveAnalyzerComponent, DashboardComponent, CallHistoryComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  fraudService = inject(FraudNetService);

  ngOnInit() {
    this.fraudService.loadModel();
  }
}