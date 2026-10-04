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
 * Elements that can execute code, pull in foreign documents or re-reference
 * external markup. They are removed wholesale rather than attribute-filtered.
 */
const FORBIDDEN_SVG_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'style',
  'use',
  'handler'
]);

/** Schemes that can execute or exfiltrate when resolved from a rendered SVG. */
const DANGEROUS_URL_SCHEME = /(?:javascript|vbscript|data|file|blob)\s*:/i;

/** CSS constructs that can fetch, execute or bind behaviour inside a style attribute. */
const DANGEROUS_STYLE_VALUE = /(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behaviou?r\s*:|-moz-binding)/i;

function isHrefAttribute(name: string): boolean {
  return name === 'href' || name === 'xlink:href' || name.endsWith(':href');
}

/**
 * Removes every attribute and element that can carry script from a parsed node.
 *
 * Attribute inspection happens on the DOM tree, so entity encoding
 * (`jav&#x61;script:`), non-whitespace attribute delimiters (`<svg/onload=>`)
 * and nested payloads are all resolved before the allow/deny decision is made.
 */
function sanitizeSvgNode(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();

    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'style' && DANGEROUS_STYLE_VALUE.test(value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (isHrefAttribute(name) && DANGEROUS_URL_SCHEME.test(value)) {
      element.setAttribute(attribute.name, '#');
    }
  }

  for (const child of Array.from(element.children)) {
    if (FORBIDDEN_SVG_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    sanitizeSvgNode(child);
  }
}

/**
 * Conservative textual pass used only when no DOM parser exists (unit tests in a
 * non-DOM runtime). It is strictly weaker than the DOM walker and never used in
 * the browser.
 */
function sanitizeSvgText(trimmed: string): string {
  return trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignobject\b[^<]*(?:(?!<\/foreignobject>)<[^<]*)*<\/foreignobject>/gi, '')
    .replace(/<[a-z]+\b[^>]*(?:\bon\w+\s*=\s*"[^"]*"|\bon\w+\s*=\s*'[^']*')[^>]*>/gi, (tag) =>
      tag.replace(/\s*\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    )
    .replace(/(href|xlink:href)\s*=\s*["']\s*(?:javascript|vbscript|data)\s*:[^"']*["']/gi, 'href="#"')
    .trim();
}

/**
 * Parses and sanitizes SVG markup through the XML DOM before serialization.
 *
 * The renderer trusts this output (it is painted with
 * `bypassSecurityTrustHtml`), so anything that cannot be parsed into a tree is
 * discarded outright rather than passed through with regex surgery. Malformed,
 * empty or non-`<svg>` payloads return an empty string.
 */
export function validateAndSanitizeSvgIngest(rawSvg: string): string {
  if (!rawSvg || typeof rawSvg !== 'string') {
    return '';
  }

  const trimmed = rawSvg.trim();
  if (trimmed === '' || !trimmed.toLowerCase().includes('<svg')) {
    return '';
  }

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return sanitizeSvgText(trimmed);
  }

  try {
    const documentNode = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
    if (documentNode.querySelector('parsererror')) {
      return '';
    }

    const root = documentNode.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') {
      return '';
    }

    sanitizeSvgNode(root);
    return new XMLSerializer().serializeToString(root);
  } catch {
    return '';
  }
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