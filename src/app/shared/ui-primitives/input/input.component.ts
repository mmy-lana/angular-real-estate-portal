import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let inputSequence = 0;

/**
 * High-precision editorial text field.
 *
 * Accessibility contract:
 * - Real `<label>` bound through a generated id.
 * - `aria-invalid` and `aria-describedby` wired to the error/hint nodes.
 * - Error state is announced politely instead of only being visual.
 */
@Component({
  selector: 'ui-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5 w-full min-w-0">
      @if (label()) {
        <label [attr.for]="inputId" class="editorial-label text-(--color-brand-secondary)">{{ label() }}</label>
      }

      <input
        [id]="inputId"
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [readonly]="readonly()"
        [required]="required()"
        [attr.inputmode]="inputMode()"
        [attr.autocomplete]="autocomplete()"
        [attr.maxlength]="maxlength()"
        [attr.min]="min()"
        [attr.max]="max()"
        [attr.step]="step()"
        [attr.name]="name()"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        [class]="fieldClass()"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />

      @if (error(); as message) {
        <p [id]="errorId" role="alert" class="text-[11px] tracking-wide text-red-700">{{ message }}</p>
      } @else if (hint()) {
        <p [id]="hintId" class="text-[11px] tracking-wide text-(--color-brand-muted)">{{ hint() }}</p>
      }
    </div>
  `
})
export class InputComponent {
  public readonly label = input<string>('');
  public readonly error = input<string | null>(null);
  public readonly type = input<string>('text');
  public readonly value = input<string>('');
  public readonly placeholder = input<string>('');
  public readonly hint = input<string>('');
  public readonly name = input<string>('');
  public readonly disabled = input<boolean>(false);
  public readonly readonly = input<boolean>(false);
  public readonly required = input<boolean>(false);
  public readonly maxlength = input<number | null>(null);
  public readonly min = input<number | null>(null);
  public readonly max = input<number | null>(null);
  public readonly step = input<number | null>(null);
  public readonly inputMode = input<'text' | 'email' | 'tel' | 'numeric' | 'decimal' | 'search' | 'url' | null>(null);
  public readonly autocomplete = input<string | null>(null);

  public readonly valueChange = output<string>();
  public readonly blurred = output<void>();

  protected readonly inputId = `ui-input-${++inputSequence}`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly hintId = `${this.inputId}-hint`;

  protected readonly describedBy = computed(() => {
    if (this.error()) return this.errorId;
    if (this.hint()) return this.hintId;
    return null;
  });

  protected readonly fieldClass = computed(() =>
    [
      'w-full min-h-11 rounded-[var(--radius-brand)] border bg-transparent px-3 py-2',
      'font-[family-name:var(--font-sans-brand)] text-sm text-(--color-brand-text)',
      'placeholder:text-(--color-brand-muted) transition-colors duration-150',
      'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand-accent)',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      this.error()
        ? 'border-red-600 focus-visible:outline-red-600'
        : 'border-(--color-brand-line) focus:border-(--color-brand-primary)'
    ].join(' ')
  );

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.valueChange.emit(target.value);
  }

  protected onBlur(): void {
    this.blurred.emit();
  }
}