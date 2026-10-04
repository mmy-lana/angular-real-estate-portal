import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

let selectSequence = 0;

/**
 * Native-select wrapper styled to the editorial system.
 *
 * A native `<select>` is used deliberately: it keeps the platform picker,
 * keyboard behaviour and screen-reader support intact on mobile, where custom
 * listboxes routinely regress accessibility.
 */
@Component({
  selector: 'ui-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5 w-full min-w-0">
      @if (label()) {
        <label [attr.for]="selectId" class="editorial-label text-(--color-brand-secondary)">{{ label() }}</label>
      }

      <div class="relative">
        <select
          [id]="selectId"
          [value]="value()"
          [disabled]="disabled()"
          [required]="required()"
          [attr.name]="name()"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="describedBy()"
          [class]="fieldClass()"
          (change)="onChange($event)"
        >
          @if (placeholder()) {
            <option value="" disabled [selected]="value() === ''">{{ placeholder() }}</option>
          }
          @for (option of options(); track option.value) {
            <option [value]="option.value" [disabled]="option.disabled ?? false">{{ option.label }}</option>
          }
        </select>

        <svg
          class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-brand-secondary)"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      @if (error(); as message) {
        <p [id]="errorId" role="alert" class="text-[11px] tracking-wide text-red-700">{{ message }}</p>
      } @else if (hint()) {
        <p [id]="hintId" class="text-[11px] tracking-wide text-(--color-brand-muted)">{{ hint() }}</p>
      }
    </div>
  `
})
export class SelectComponent {
  public readonly label = input<string>('');
  public readonly value = input<string>('');
  public readonly options = input<SelectOption[]>([]);
  public readonly placeholder = input<string>('');
  public readonly hint = input<string>('');
  public readonly error = input<string | null>(null);
  public readonly name = input<string>('');
  public readonly disabled = input<boolean>(false);
  public readonly required = input<boolean>(false);

  public readonly valueChange = output<string>();

  protected readonly selectId = `ui-select-${++selectSequence}`;
  protected readonly errorId = `${this.selectId}-error`;
  protected readonly hintId = `${this.selectId}-hint`;

  protected readonly describedBy = computed(() => {
    if (this.error()) return this.errorId;
    if (this.hint()) return this.hintId;
    return null;
  });

  protected readonly fieldClass = computed(() =>
    [
      'w-full appearance-none min-h-11 rounded-[var(--radius-brand)] border bg-transparent',
      'pl-3 pr-9 py-2 text-sm text-(--color-brand-text) cursor-pointer',
      'font-[family-name:var(--font-sans-brand)] transition-colors duration-150',
      'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand-accent)',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      this.error() ? 'border-red-600' : 'border-(--color-brand-line) focus:border-(--color-brand-primary)'
    ].join(' ')
  );

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}