/**
 * Device.ts - Authoritative device & control scheme detector
 * Accurately differentiates Desktop PC from Mobile/Tablet devices.
 */
export function isTouchControlsEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Mobile OS User Agent
  const ua = navigator.userAgent || '';
  const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  if (isMobileOS) return true;

  // 2. iPadOS on Safari pretending to be Mac
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) {
    return true;
  }

  // 3. Desktop Pointer / Mouse check (Mouse or precision trackpad on PC/laptop)
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    return false;
  }

  // 4. Coarse touch screen only (phones / tablets without mouse)
  if (window.matchMedia && window.matchMedia('(pointer: coarse) and (hover: none)').matches) {
    return true;
  }

  // Default: Desktop PC
  return false;
}
