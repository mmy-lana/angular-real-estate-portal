import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'accent' | 'inverse' | 'outline';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-(--color-brand-surface) text-(--color-brand-secondary) border-(--color-brand-line)',
  accent: 'bg-(--color-brand-accent) text-(--color-brand-primary) border-(--color-brand-accent)',
  inverse: 'bg-(--color-brand-primary) text-(--color-brand-inverse) border-(--color-brand-primary)',
  outline: 'bg-transparent text-(--color-brand-secondary) border-(--color-brand-line)'
};

/** Small status/metadata chip used on listing cards, specs rows and dialogs. */
@Component({
  selector: 'ui-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="hostClass()">
      <ng-content />
    </span>
  `
})
export class BadgeComponent {
  public readonly tone = input<BadgeTone>('neutral');
  public readonly solid = input<boolean>(false);

  protected readonly hostClass = computed(() =>
    [
      'inline-flex items-center gap-1.5 rounded-[var(--radius-brand)] border px-2 py-1',
      'text-[10px] uppercase tracking-[0.18em] leading-none whitespace-nowrap',
      TONE_CLASS[this.solid() ? 'inverse' : this.tone()]
    ].join(' ')
  );
}