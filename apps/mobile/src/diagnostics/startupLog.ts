/**
 * Ishga tushish jurnali — Metro terminalida "[STARTUP]" prefiksi bilan ko'rinadi.
 * Native crash'da ilova yopilsa, oxirgi chiqqan qator qaysi bosqichgacha yetib
 * borilganini ko'rsatadi. Faqat development rejimida yoziladi.
 */
import { useEffect } from 'react';

const t0 = Date.now();

export function startupLog(message: string): void {
  if (__DEV__) console.log(`[STARTUP +${Date.now() - t0}ms] ${message}`);
}

/** Komponent render va mount bo'lganini yozadi */
export function useStartupMark(name: string): void {
  startupLog(`${name}: render`);
  useEffect(() => {
    startupLog(`${name}: mount ✓`);
  }, [name]);
}

let handlerInstalled = false;

/** Global JS xatolarini jurnalga yozadi (oldingi handler saqlanadi) */
export function installStartupErrorHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  const errorUtils = (globalThis as { ErrorUtils?: {
    getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
    setGlobalHandler(h: (error: unknown, isFatal?: boolean) => void): void;
  } }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const e = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    console.error(`[STARTUP] JS ${isFatal ? 'FATAL' : 'error'}: ${e}`);
    previous(error, isFatal);
  });
}
