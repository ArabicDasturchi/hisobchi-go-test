/**
 * Ildiz layout.
 *
 * - EXPO_PUBLIC_SAFE_MODE=1 — minimal modul diagnostikasi (SafeModeRoot).
 * - EXPO_PUBLIC_STARTUP_STAGE=1..6 (yoki 4a..4d) — to'liq ilovani bosqichma-bosqich yig'ish (StartupStages).
 * - Hech biri berilmasa — to'liq ilova (AppRoot).
 * Modullar `require` orqali kechiktirilgan: tanlanmagan variant ishga tushmaydi.
 */
import type { ComponentType } from 'react';
import { installStartupErrorHandler, startupLog } from '../diagnostics/startupLog';

export { ErrorBoundary } from 'expo-router';

installStartupErrorHandler();

const SAFE_MODE = process.env.EXPO_PUBLIC_SAFE_MODE === '1';
const STARTUP_STAGE = (process.env.EXPO_PUBLIC_STARTUP_STAGE ?? '').trim().toLowerCase();

/* eslint-disable @typescript-eslint/no-require-imports */
let Root: ComponentType;
if (SAFE_MODE) {
  startupLog('rejim: SAFE_MODE');
  Root = require('../diagnostics/SafeModeRoot').default;
} else if (STARTUP_STAGE !== '') {
  const StartupStages = require('../diagnostics/StartupStages').default as ComponentType<{ stage: string }>;
  Root = () => <StartupStages stage={STARTUP_STAGE} />;
} else {
  startupLog("rejim: to'liq ilova");
  Root = require('../AppRoot').default;
}
/* eslint-enable @typescript-eslint/no-require-imports */

export default function RootLayout() {
  return <Root />;
}
