import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { FloorPlanHotspot, FloorPlanLevel } from '../../core/models';
import {
  IDENTITY_TRANSFORM,
  MIN_ZOOM,
  ViewportTransform,
  calculateBoundedTransform,
  clampHotspotCoordinate,
  computeHotspotPlacement,
  isRenderableFloorPlanLevel,
  pinchDistance,
  serializeTransform,
  zoomAroundPoint
} from '../../core/utils/floorplan-transform.util';
import { sortFloorPlanLevels } from '../../core/utils/media-resolver.util';
import { BadgeComponent } from '../../shared/ui-primitives/badge/badge.component';

interface PointerPoint {
  id: number;
  x: number;
  y: number;
}

/**
 * Pan and pinch-to-zoom floor plan viewer.
 *
 * Markup safety contract: every `svgContent` value was pushed through
 * `validateAndSanitizeSvgIngest` before it was written to IndexedDB, so the
 * viewer renders it with `bypassSecurityTrustHtml` and is never exposed to
 * script-bearing vectors. Hotspot ratios are clamped to `[0, 1]` at render time
 * regardless of what the record contains.
 */
@Component({
  selector: 'app-floor-plan-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './floor-plan-viewer.component.html'
})
export class FloorPlanViewerComponent {
  public readonly levels = input.required<FloorPlanLevel[]>();

  public readonly hotspotClicked = output<FloorPlanHotspot>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly orderedLevels = computed(() => sortFloorPlanLevels(this.levels()));
  protected readonly activeLevelIndex = signal(0);
  protected readonly transform = signal<ViewportTransform>(IDENTITY_TRANSFORM);
  protected readonly activeHotspotId = signal<string | null>(null);
  protected readonly zoomLabel = signal(`${Math.round(MIN_ZOOM * 100)}%`);

  protected readonly activeLevel = computed<FloorPlanLevel | null>(() => {
    const levels = this.orderedLevels();
    if (levels.length === 0) {
      return null;
    }
    return levels[Math.min(this.activeLevelIndex(), levels.length - 1)] ?? null;
  });

  protected readonly trustedSvg = computed<SafeHtml | null>(() => {
    const level = this.activeLevel();
    if (!level || !isRenderableFloorPlanLevel(level)) {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustHtml(level.svgContent);
  });

  protected readonly hotspots = computed(() =>
    (this.activeLevel()?.hotspots ?? []).map((hotspot) => ({
      hotspot,
      placement: computeHotspotPlacement(hotspot),
      clamped:
        hotspot.xRatio !== clampHotspotCoordinate(hotspot.xRatio) ||
        hotspot.yRatio !== clampHotspotCoordinate(hotspot.yRatio)
    }))
  );

  protected readonly transformStyle = computed(() => serializeTransform(this.transform()));
  protected readonly isZoomed = computed(() => this.transform().scale > MIN_ZOOM + 0.001);
  protected readonly hasLevels = computed(() => this.orderedLevels().length > 0);

  private pointers = new Map<number, PointerPoint>();
  private pinchStartDistance = 0;
  private pinchStartScale = 1;
  private panOrigin: { x: number; y: number; translateX: number; translateY: number } | null = null;

  constructor() {
    effect(() => {
      const levels = this.orderedLevels();
      if (this.activeLevelIndex() >= levels.length) {
        this.activeLevelIndex.set(0);
        this.resetView();
      }
    });

    afterNextRender(() => {
      const stage = this.stageRef()?.nativeElement;
      if (!stage) {
        return;
      }
      stage.addEventListener('wheel', this.wheelListener, { passive: false });
      this.destroyRef.onDestroy(() => stage.removeEventListener('wheel', this.wheelListener));
    });
  }

  protected selectLevel(index: number): void {
    if (index === this.activeLevelIndex()) {
      return;
    }
    this.activeLevelIndex.set(index);
    this.resetView();
  }

  protected resetView(): void {
    this.transform.set(IDENTITY_TRANSFORM);
    this.zoomLabel.set(`${Math.round(MIN_ZOOM * 100)}%`);
    this.pointers.clear();
    this.panOrigin = null;
  }

  protected zoomIn(): void {
    this.applyScale(1.25);
  }

  protected zoomOut(): void {
    this.applyScale(0.8);
  }

  protected onWheel(event: WheelEvent): void {
    const stage = this.stageRef()?.nativeElement;
    const rect = stage?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const factor = event.deltaY < 0 ? 1.15 : 0.87;
    this.commitTransform(
      zoomAroundPoint(
        this.transform(),
        factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      )
    );
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.hasLevels()) {
      return;
    }
    const origin = event.target as HTMLElement | null;
    if (origin?.closest('button, a, input, select')) {
      return;
    }
    this.pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

    if (this.pointers.size >= 2) {
      const [first, second] = Array.from(this.pointers.values());
      this.pinchStartDistance = pinchDistance(first, second);
      this.pinchStartScale = this.transform().scale;
      this.panOrigin = null;
      return;
    }

    const current = this.transform();
    this.panOrigin = {
      x: event.clientX,
      y: event.clientY,
      translateX: current.translateX,
      translateY: current.translateY
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }
    this.pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    const rect = this.stageRef()?.nativeElement.getBoundingClientRect();
    if (!rect) {
      return;
    }

    if (this.pointers.size >= 2) {
      const [first, second] = Array.from(this.pointers.values());
      const distance = pinchDistance(first, second);
      if (this.pinchStartDistance > 0) {
        const targetScale = this.pinchStartScale * (distance / this.pinchStartDistance);
        const factor = this.transform().scale > 0 ? targetScale / this.transform().scale : 1;
        this.commitTransform(
          zoomAroundPoint(this.transform(), factor, rect.width / 2, rect.height / 2, rect.width, rect.height)
        );
      }
      return;
    }

    if (this.panOrigin) {
      this.commitTransform(
        calculateBoundedTransform(
          this.transform(),
          1,
          event.clientX - this.panOrigin.x,
          event.clientY - this.panOrigin.y,
          rect.width,
          rect.height
        )
      );
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) {
      this.pinchStartDistance = 0;
    }
    if (this.pointers.size === 0) {
      this.panOrigin = null;
    }
  }

  protected selectHotspot(hotspot: FloorPlanHotspot): void {
    this.activeHotspotId.set(hotspot.id);
    this.hotspotClicked.emit(hotspot);
  }

  private readonly wheelListener = (event: WheelEvent): void => {
    if (!this.hasLevels()) {
      return;
    }
    event.preventDefault();
    this.onWheel(event);
  };

  private applyScale(factor: number): void {
    const rect = this.stageRef()?.nativeElement.getBoundingClientRect();
    if (!rect) {
      return;
    }
    this.commitTransform(
      zoomAroundPoint(this.transform(), factor, rect.width / 2, rect.height / 2, rect.width, rect.height)
    );
  }

  private commitTransform(next: ViewportTransform): void {
    this.transform.set(next);
    this.zoomLabel.set(`${Math.round(next.scale * 100)}%`);
  }
}