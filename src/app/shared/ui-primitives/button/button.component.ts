import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-(--color-brand-primary) text-(--color-brand-inverse) border border-(--color-brand-primary) hover:bg-(--color-brand-text) active:translate-y-px',
  secondary:
    'bg-(--color-brand-accent) text-(--color-brand-primary) border border-(--color-brand-accent) hover:brightness-95 active:translate-y-px',
  outline:
    'bg-transparent text-(--color-brand-primary) border border-(--color-brand-line) hover:border-(--color-brand-primary) active:translate-y-px',
  ghost:
    'bg-transparent text-(--color-brand-secondary) border border-transparent hover:text-(--color-brand-primary) hover:border-(--color-brand-line) active:translate-y-px'
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-[11px]',
  md: 'min-h-11 px-5 text-xs',
  lg: 'min-h-13 px-7 text-[13px]'
};

/**
 * Atomic action control.
 *
 * Accessibility contract:
 * - Renders a real `<button>` with an explicit `type`.
 * - Keeps a 44px minimum touch target on every size.
 * - Exposes `aria-busy` and disables interaction while loading.
 * - Emits the originating `MouseEvent` so parents can inspect modifiers.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [class]="hostClass()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() ? 'true' : null"
      [attr.aria-disabled]="disabled() || loading() ? 'true' : null"
      (click)="onClick($event)"
    >
      @if (loading()) {
        <svg
          class="animate-spin shrink-0"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
      }
      <span class="truncate max-w-full">{{ label() }}</span>
    </button>
  `
})
export class ButtonComponent {
  public readonly variant = input<ButtonVariant>('primary');
  public readonly size = input<ButtonSize>('md');
  public readonly disabled = input<boolean>(false);
  public readonly loading = input<boolean>(false);
  public readonly label = input<string>('');
  public readonly type = input<'button' | 'submit' | 'reset'>('button');
  public readonly fullWidth = input<boolean>(false);

  public readonly clicked = output<MouseEvent>();

  protected readonly hostClass = computed(() =>
    [
      'inline-flex items-center justify-center gap-2 rounded-[var(--radius-brand)]',
      'uppercase tracking-[0.18em] font-medium whitespace-nowrap',
      'transition-[background-color,color,border-color,transform,opacity] duration-150 ease-out',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand-accent)',
      'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:translate-y-0',
      VARIANT_CLASS[this.variant()],
      SIZE_CLASS[this.size()],
      this.fullWidth() ? 'w-full' : ''
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.clicked.emit(event);
  }
}