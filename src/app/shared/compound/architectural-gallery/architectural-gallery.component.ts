import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { TemplateRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewContainerRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { PropertyMedia } from '../../../core/models';
import {
  MEDIA_TYPE_LABELS,
  buildResponsiveImageUrl,
  sortMediaByOrder
} from '../../../core/utils/media-resolver.util';

interface LightboxContext {
  media: PropertyMedia[];
  index: number;
}

/**
 * High-resolution image carousel with a body-level lightbox.
 *
 * The viewer is rendered through a CDK `Overlay` portal attached directly to the
 * document body. Rendering it inline would trap it inside any ancestor that
 * establishes a containing block (transform, filter, perspective), which on
 * iOS Safari clips a full-screen viewer and breaks its fixed positioning.
 *
 * Swipe navigation uses Pointer Events so mouse, touch and pen share one code
 * path, and the gesture axis is locked to horizontal so vertical page scrolling
 * keeps working while a photo is on screen.
 */
@Component({
  selector: 'app-architectural-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './architectural-gallery.component.html'
})
export class ArchitecturalGalleryComponent implements OnDestroy {
  public readonly media = input.required<PropertyMedia[]>();
  public readonly initialIndex = input<number>(0);

  public readonly indexChange = output<number>();

  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly viewportRef = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly lightboxTemplate = viewChild.required<TemplateRef<unknown>>('lightboxTemplate');

  protected readonly index = signal(0);
  protected readonly dragging = signal(false);
  protected readonly lightboxOpen = signal(false);
  protected readonly lightboxContext = signal<LightboxContext | null>(null);

  protected readonly orderedMedia = computed(() => sortMediaByOrder(this.media()));
  protected readonly mediaTypeLabel = MEDIA_TYPE_LABELS;

  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerId: number | null = null;
  private axisLocked: 'x' | 'y' | null = null;
  private overlayRef: OverlayRef | null = null;
  private documentKeydownListener: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    effect(() => {
      const total = this.orderedMedia().length;
      const requested = Math.min(Math.max(this.initialIndex(), 0), Math.max(0, total - 1));
      if (requested !== this.index()) {
        this.index.set(requested);
      }
    });

    afterNextRender(() => {
      const viewport = this.viewportRef()?.nativeElement;
      viewport?.setAttribute('role', 'region');
      viewport?.setAttribute('aria-roledescription', 'carousel');
      viewport?.setAttribute('aria-label', 'Residence photography');
    });
  }

  ngOnDestroy(): void {
    this.disposeLightbox();
  }

  protected imageUrl(item: PropertyMedia | undefined, size: 'thumb' | 'full'): string {
    if (!item) {
      return '';
    }
    return size === 'thumb'
      ? buildResponsiveImageUrl(item.url, 320)
      : buildResponsiveImageUrl(item.url, 1600);
  }

  protected goTo(position: number): void {
    const total = this.orderedMedia().length;
    if (total === 0) {
      return;
    }
    const next = ((position % total) + total) % total;
    if (next === this.index()) {
      return;
    }
    this.index.set(next);
    this.indexChange.emit(next);
  }

  protected step(delta: number): void {
    this.goTo(this.index() + delta);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.orderedMedia().length < 2 || !event.isPrimary || event.button !== 0) {
      return;
    }
    // Pointer capture retargets the follow-up click to the capturing element,
    // which would swallow presses on the carousel's own controls. A gesture
    // therefore only starts from the image surface itself.
    const origin = event.target as HTMLElement | null;
    if (origin?.closest('button, a, input, select, textarea')) {
      return;
    }
    this.pointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.axisLocked = null;
    this.dragging.set(true);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging() || this.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - this.pointerStartX;
    const deltaY = event.clientY - this.pointerStartY;

    if (this.axisLocked === null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
        return;
      }
      this.axisLocked = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
      if (this.axisLocked === 'y') {
        this.cancelDrag();
        return;
      }
    }

    if (this.axisLocked === 'x') {
      event.preventDefault();
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - this.pointerStartX;
    const axis = this.axisLocked;
    this.cancelDrag();

    const viewport = this.viewportRef()?.nativeElement;
    const threshold = viewport ? Math.max(48, viewport.clientWidth * 0.15) : 48;
    if (axis === 'x' && Math.abs(deltaX) > threshold) {
      this.step(deltaX < 0 ? 1 : -1);
    }
  }

  protected openLightbox(): void {
    const media = this.orderedMedia();
    if (media.length === 0 || this.overlayRef) {
      return;
    }

    this.lightboxContext.set({ media, index: this.index() });
    this.lightboxOpen.set(true);

    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.noop(),
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically()
    });
    this.overlayRef.attach(
      new TemplatePortal(this.lightboxTemplate(), this.viewContainerRef, {
        lightbox: this.lightboxContext
      })
    );
    this.overlayRef.backdropClick().subscribe(() => this.closeLightbox());

    // The overlay pane is not focus-trapped, so keyboard events land on the
    // document. Listening there guarantees Escape and arrow navigation always
    // reach the viewer regardless of what currently holds focus.
    const documentRef = this.overlayRef.overlayElement.ownerDocument ?? document;
    this.documentKeydownListener = (event: KeyboardEvent) => this.handleLightboxKey(event);
    documentRef.addEventListener('keydown', this.documentKeydownListener);
  }

  private handleLightboxKey(event: Event): void {
    if (!this.overlayRef) {
      return;
    }
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault();
      this.closeLightbox();
    } else if (keyboardEvent.key === 'ArrowRight') {
      keyboardEvent.preventDefault();
      this.stepInLightbox(1);
    } else if (keyboardEvent.key === 'ArrowLeft') {
      keyboardEvent.preventDefault();
      this.stepInLightbox(-1);
    }
  }

  protected closeLightbox(): void {
    this.disposeLightbox();
  }

  protected stepInLightbox(delta: number): void {
    const context = this.lightboxContext();
    const total = context?.media.length ?? 0;
    if (!context || total === 0) {
      return;
    }
    const next = (((context.index + delta) % total) + total) % total;
    this.lightboxContext.set({ media: context.media, index: next });
    this.index.set(next);
    this.indexChange.emit(next);
  }

  private cancelDrag(): void {
    this.dragging.set(false);
    this.pointerId = null;
    this.axisLocked = null;
  }

  private disposeLightbox(): void {
    if (this.documentKeydownListener) {
      const documentRef = this.overlayRef?.overlayElement.ownerDocument ?? document;
      documentRef.removeEventListener('keydown', this.documentKeydownListener);
      this.documentKeydownListener = null;
    }
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
    this.lightboxOpen.set(false);
    this.lightboxContext.set(null);
  }
}