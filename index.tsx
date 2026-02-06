import 'zone.js'; // Standard Angular Change Detection
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './src/app.component';

bootstrapApplication(AppComponent, {
  providers: []
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.
