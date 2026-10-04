import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

let sheetSequence = 0;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Responsive modal surface: a bottom sheet under 768px, a centred dialog above.
 *
 * iOS Safari specifics that the implementation has to handle explicitly:
 * - `window.visualViewport` resize drives `--sheet-max-height`, so expanding the
 *   on-screen keyboard shrinks the sheet instead of pushing it off-screen.
 * - Body scroll is locked while open and focus is trapped inside the dialog.
 */
@Component({
  selector: 'ui-sheet-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
        <div
          class="absolute inset-0 bg-(--color-brand-primary)/45 backdrop-blur-[2px]"
          (click)="requestClose()"
          aria-hidden="true"
        ></div>

        <div
          #sheet
          class="sheet-surface relative w-full max-h-[var(--sheet-max-height,85vh)] sm:max-h-[85vh]
                 bg-(--color-brand-surface) border-(--color-brand-line) border-t sm:border
                 sm:rounded-[var(--radius-brand)] shadow-2xl flex flex-col
                 pb-[env(safe-area-inset-bottom)]"
          [class.sm:max-w-lg]="!isRightDrawer()"
          [class.sm:items-stretch]="isRightDrawer()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          [attr.aria-describedby]="descriptionId"
          tabindex="-1"
        >
          <div class="sm:hidden pt-3 pb-1 flex justify-center shrink-0" aria-hidden="true">
            <span class="block h-1 w-10 rounded-full bg-(--color-brand-line)"></span>
          </div>

          <header class="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-(--color-brand-line) shrink-0">
            <div class="min-w-0">
              <h2 class="text-lg sm:text-xl editorial-serif text-(--color-brand-primary) truncate">{{ title() }}</h2>
              @if (description()) {
                <p [id]="descriptionId" class="text-xs text-(--color-brand-secondary) mt-1 text-pretty">
                  {{ description() }}
                </p>
              }
            </div>
            <button
              type="button"
              class="shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 -mr-2 -mt-1
                     text-(--color-brand-secondary) hover:text-(--color-brand-primary) transition-colors"
              aria-label="Close dialog"
              (click)="requestClose()"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <div class="px-5 py-5 overflow-y-auto overscroll-contain grow min-h-0">
            <ng-content />
          </div>

          <footer class="px-5 py-4 border-t border-(--color-brand-line) shrink-0">
            <ng-content select="[sheetFooter]" />
          </footer>
        </div>
      </div>
    }
  `
})
export class SheetModalComponent {
  public readonly isOpen = input<boolean>(false);
  public readonly title = input<string>('');
  public readonly description = input<string>('');
  public readonly position = input<'bottom' | 'right'>('bottom');
  public readonly dismissible = input<boolean>(true);

  public readonly closed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sheetRef = viewChild<ElementRef<HTMLElement>>('sheet');

  private readonly previouslyFocused = signal<HTMLElement | null>(null);
  private readonly keydownListener = (event: KeyboardEvent) => this.onKeydown(event);
  private readonly viewportListener = () => this.syncViewportHeight();

  protected readonly descriptionId = `sheet-description-${sheetSequence++}`;

  constructor() {
    effect((onCleanup) => {
      if (!this.isOpen()) {
        return;
      }

      const body = this.document.body;
      const previousOverflow = body.style.overflow;
      body.style.overflow = 'hidden';

      this.previouslyFocused.set(this.document.activeElement as HTMLElement | null);
      this.syncViewportHeight();

      const viewPort = this.document.defaultView?.visualViewport ?? null;
      viewPort?.addEventListener('resize', this.viewportListener);
      const documentRef = this.document;
      documentRef.addEventListener('keydown', this.keydownListener, true);

      afterNextRender(
        () => {
          const sheet = this.sheetRef()?.nativeElement;
          const focusable = sheet?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? sheet;
          focusable?.focus({ preventScroll: true });
        },
        { injector: this.injector }
      );

      onCleanup(() => {
        body.style.overflow = previousOverflow;
        viewPort?.removeEventListener('resize', this.viewportListener);
        documentRef.removeEventListener('keydown', this.keydownListener, true);
        this.previouslyFocused()?.focus?.({ preventScroll: true });
      });
    });

    this.destroyRef.onDestroy(() => {
      const documentRef = this.document;
      documentRef.removeEventListener('keydown', this.keydownListener, true);
      const viewPort = documentRef.defaultView?.visualViewport ?? null;
      viewPort?.removeEventListener('resize', this.viewportListener);
    });
  }

  /** True when the dialog is anchored to the right edge (desktop drawer). */
  protected readonly isRightDrawer = computed(() => this.position() === 'right');

  protected requestClose(): void {
    if (this.dismissible()) {
      this.closed.emit();
    }
  }

  private syncViewportHeight(): void {
    const viewPort = this.document.defaultView?.visualViewport ?? null;
    if (!viewPort) {
      return;
    }
    const maxHeight = Math.round(viewPort.height * 0.85);
    this.document.documentElement.style.setProperty('--sheet-max-height', `${maxHeight}px`);
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const sheet = this.sheetRef()?.nativeElement;
    if (!sheet) {
      return;
    }
    const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === this.document.activeElement
    );
    if (focusable.length === 0) {
      event.preventDefault();
      sheet.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;

    if (event.shiftKey && (active === first || active === sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}