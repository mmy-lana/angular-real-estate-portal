import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center p-6 bg-stone-100 text-stone-900">
      <div class="max-w-md w-full border border-stone-300 p-8 bg-white text-center">
        <span class="text-[10px] tracking-widest uppercase text-stone-400 block mb-2">404 Exception</span>
        <h1 class="text-3xl font-serif mb-4">Location Not Found</h1>
        <p class="text-sm text-stone-600 mb-8 leading-relaxed">
          The requested tenant agency domain or architectural listing cannot be located in the register.
        </p>
        <a routerLink="/t/atelier-living" class="inline-block text-xs uppercase tracking-widest px-6 py-3 bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors">
          Return to Atelier Living
        </a>
      </div>
    </div>
  `
})
export class NotFoundComponent {}
