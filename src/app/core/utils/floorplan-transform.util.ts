export interface ViewportTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export function clampHotspotCoordinate(ratio: number): number {
  return Math.min(1.0, Math.max(0.0, ratio));
}

export function validateAndSanitizeSvgIngest(rawSvg: string): string {
  if (!rawSvg) return '';
  return rawSvg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/(\son\w+\s*=\s*["'][^"']*["'])|(\son\w+\s*=\s*[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .trim();
}

export function calculateBoundedTransform(
  current: ViewportTransform,
  deltaScale: number,
  deltaX: number,
  deltaY: number,
  containerWidth: number,
  containerHeight: number,
  minScale = 1.0,
  maxScale = 4.0
): ViewportTransform {
  const nextScale = Math.min(Math.max(current.scale * deltaScale, minScale), maxScale);
  const maxTranslateX = (containerWidth * (nextScale - 1)) / 2;
  const maxTranslateY = (containerHeight * (nextScale - 1)) / 2;

  const unclampedX = current.translateX + deltaX;
  const unclampedY = current.translateY + deltaY;

  const nextTranslateX = Math.min(Math.max(unclampedX, -maxTranslateX), maxTranslateX);
  const nextTranslateY = Math.min(Math.max(unclampedY, -maxTranslateY), maxTranslateY);

  return {
    scale: Number(nextScale.toFixed(4)),
    translateX: Number(nextTranslateX.toFixed(2)),
    translateY: Number(nextTranslateY.toFixed(2))
  };
}
