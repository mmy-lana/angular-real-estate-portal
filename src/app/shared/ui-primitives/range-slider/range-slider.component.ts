import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { clampHotspotCoordinate } from '../../../core/utils/floorplan-transform.util';

type ActiveThumb = 'min' | 'max' | null;

/**
 * Dual-thumb numeric range with pointer + touch support.
 *
 * The component keeps a local draft while a drag is in flight and only emits
 * `rangeChange` once the gesture settles, so downstream filtering is not
 * recomputed on every pointer move.
 */
@Component({
  selector: 'ui-range-slider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './range-slider.component.html',
  styleUrl: './range-slider.component.css'
})
export class RangeSliderComponent {
  public readonly min = input<number>(0);
  public readonly max = input<number>(100);
  public readonly step = input<number>(1);
  public readonly currentMin = input<number>(0);
  public readonly currentMax = input<number>(100);
  public readonly label = input<string>('');
  public readonly formatValue = input<(value: number) => string>((value) => String(value));
  public readonly disabled = input<boolean>(false);

  public readonly rangeChange = output<[number, number]>();

  private readonly trackRef = viewChild<ElementRef<HTMLDivElement>>('track');

  protected readonly localMin = signal(0);
  protected readonly localMax = signal(100);
  protected readonly activeThumb = signal<ActiveThumb>(null);

  constructor() {
    effect(() => {
      const lower = this.clampToDomain(this.currentMin());
      const upper = this.clampToDomain(this.currentMax());
      this.localMin.set(lower);
      this.localMax.set(Math.max(lower, upper));
    });
  }

  protected readonly minPercent = computed(() => this.toPercent(this.localMin()));
  protected readonly maxPercent = computed(() => this.toPercent(this.localMax()));

  protected readonly valueText = computed(
    () => `${this.formatValue()(this.localMin())} — ${this.formatValue()(this.localMax())}`
  );

  protected onTrackPointerDown(event: PointerEvent, thumb: ActiveThumb): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.activeThumb.set(thumb);
    this.updateFromPointer(event, thumb);
  }

  protected onPointerMove(event: PointerEvent): void {
    const thumb = this.activeThumb();
    if (!thumb || this.disabled()) {
      return;
    }
    event.preventDefault();
    this.updateFromPointer(event, thumb);
  }

  protected onPointerUp(event: PointerEvent): void {
    const thumb = this.activeThumb();
    if (!thumb) {
      return;
    }
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.activeThumb.set(null);
    this.rangeChange.emit([this.localMin(), this.localMax()]);
  }

  protected onThumbKeydown(event: KeyboardEvent, thumb: ActiveThumb): void {
    if (this.disabled()) {
      return;
    }
    const stepMagnitude = Math.abs(this.step()) || 1;
    let delta = 0;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        delta = -stepMagnitude;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        delta = stepMagnitude;
        break;
      case 'Home':
        delta = Number.NEGATIVE_INFINITY;
        break;
      case 'End':
        delta = Number.POSITIVE_INFINITY;
        break;
      default:
        return;
    }

    event.preventDefault();
    if (thumb === 'min') {
      const next = this.snap(delta === Number.NEGATIVE_INFINITY ? this.min() : this.localMin() + delta);
      this.localMin.set(Math.min(next, this.localMax()));
    } else {
      const next = this.snap(delta === Number.POSITIVE_INFINITY ? this.max() : this.localMax() + delta);
      this.localMax.set(Math.max(next, this.localMin()));
    }
    this.rangeChange.emit([this.localMin(), this.localMax()]);
  }

  private updateFromPointer(event: PointerEvent, thumb: ActiveThumb): void {
    const track = this.trackRef()?.nativeElement;
    if (!track) {
      return;
    }
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const ratio = clampHotspotCoordinate((event.clientX - rect.left) / rect.width);
    const value = this.snap(this.min() + ratio * (this.max() - this.min()));

    if (thumb === 'min') {
      this.localMin.set(Math.min(value, this.localMax()));
    } else {
      this.localMax.set(Math.max(value, this.localMin()));
    }
  }

  private snap(value: number): number {
    const step = Math.abs(this.step()) || 1;
    const stepped = Math.round((value - this.min()) / step) * step + this.min();
    const fixed = Number(stepped.toFixed(6));
    return Math.min(this.max(), Math.max(this.min(), fixed));
  }

  private clampToDomain(value: number): number {
    return Math.min(this.max(), Math.max(this.min(), Number.isFinite(value) ? value : this.min()));
  }

  private toPercent(value: number): number {
    const span = this.max() - this.min();
    if (span <= 0) {
      return 0;
    }
    return ((value - this.min()) / span) * 100;
  }
}