import { FloorPlanHotspot, FloorPlanLevel } from '../models';

export interface ViewportTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export const IDENTITY_TRANSFORM: ViewportTransform = Object.freeze({
  scale: 1,
  translateX: 0,
  translateY: 0
});

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Clamps a hotspot ratio into the invariant domain `[0.0, 1.0]`. */
export function clampHotspotCoordinate(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.min(1.0, Math.max(0.0, ratio));
}

/**
 * Absolute CSS placement for a hotspot marker expressed in percentages, so the
 * marker tracks the plan geometry at every zoom level without recomputation.
 */
export function computeHotspotPlacement(hotspot: FloorPlanHotspot): { left: string; top: string } {
  return {
    left: `${clampHotspotCoordinate(hotspot.xRatio) * 100}%`,
    top: `${clampHotspotCoordinate(hotspot.yRatio) * 100}%`
  };
}

/** CSS transform string for the pan/zoom surface. */
export function serializeTransform(transform: ViewportTransform): string {
  return `translate3d(${transform.translateX}px, ${transform.translateY}px, 0) scale(${transform.scale})`;
}

/**
 * Strips script tags, inline event listeners, and javascript: links from raw SVG strings.
 * Scope note: Used exclusively for controlled seed and ingest data. If opening system
 * to untrusted user-uploaded SVGs, upgrade to DOMPurify with { USE_PROFILES: { svg: true } }.
 */
export function validateAndSanitizeSvgIngest(rawSvg: string): string {
  if (!rawSvg) return '';
  return rawSvg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject)<[^<]*)*<\/foreignObject>/gi, '')
    .replace(/(\son\w+\s*=\s*["'][^"']*["'])|(\son\w+\s*=\s*[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"')
    .replace(/(href|xlink:href)\s*=\s*["']\s*data:text\/html[^"']*["']/gi, '$1="#"')
    .trim();
}

/** True when the sanitiser had to strip something from the payload. */
export function svgRequiresSanitization(rawSvg: string): boolean {
  return validateAndSanitizeSvgIngest(rawSvg).length !== rawSvg.trim().length;
}

/**
 * Applies a pan/zoom delta while keeping the drawing inside the visible window.
 * Translation is bounded by the scaled overflow so the plan can never be
 * dragged completely out of sight.
 */
export function calculateBoundedTransform(
  current: ViewportTransform,
  deltaScale: number,
  deltaX: number,
  deltaY: number,
  containerWidth: number,
  containerHeight: number,
  minScale = MIN_ZOOM,
  maxScale = MAX_ZOOM
): ViewportTransform {
  const safeDeltaScale = Number.isFinite(deltaScale) && deltaScale > 0 ? deltaScale : 1;
  const nextScale = Math.min(Math.max(current.scale * safeDeltaScale, minScale), maxScale);
  const maxTranslateX = (Math.max(0, containerWidth) * (nextScale - 1)) / 2;
  const maxTranslateY = (Math.max(0, containerHeight) * (nextScale - 1)) / 2;

  const unclampedX = current.translateX + (Number.isFinite(deltaX) ? deltaX : 0);
  const unclampedY = current.translateY + (Number.isFinite(deltaY) ? deltaY : 0);

  const nextTranslateX = Math.min(Math.max(unclampedX, -maxTranslateX), maxTranslateX);
  const nextTranslateY = Math.min(Math.max(unclampedY, -maxTranslateY), maxTranslateY);

  return {
    scale: Number(nextScale.toFixed(4)),
    translateX: Number(nextTranslateX.toFixed(2)),
    translateY: Number(nextTranslateY.toFixed(2))
  };
}

/** Zooms around a focal point (zoom-at-cursor) and returns the next transform. */
export function zoomAroundPoint(
  current: ViewportTransform,
  factor: number,
  focalX: number,
  focalY: number,
  containerWidth: number,
  containerHeight: number,
  minScale = MIN_ZOOM,
  maxScale = MAX_ZOOM
): ViewportTransform {
  const centreX = containerWidth / 2;
  const centreY = containerHeight / 2;
  const offsetX = focalX - centreX - current.translateX;
  const offsetY = focalY - centreY - current.translateY;
  const nextScale = Math.min(Math.max(current.scale * factor, minScale), maxScale);
  const appliedScale = nextScale / current.scale;
  const nextTranslateX = offsetX - offsetX * appliedScale;
  const nextTranslateY = offsetY - offsetY * appliedScale;

  return calculateBoundedTransform(
    { scale: nextScale, translateX: nextTranslateX, translateY: nextTranslateY },
    1,
    0,
    0,
    containerWidth,
    containerHeight,
    minScale,
    maxScale
  );
}

/** Two-pointer pinch distance, used to derive the zoom factor between moves. */
export function pinchDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Structural guard: a level is renderable when it carries sanitized markup. */
export function isRenderableFloorPlanLevel(level: FloorPlanLevel): boolean {
  return level.svgContent.trim().startsWith('<svg') && level.width > 0 && level.height > 0;
}