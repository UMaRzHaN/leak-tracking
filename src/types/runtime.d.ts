import "leaflet";
import "react";

declare global {
  interface Error {
    code?: string;
    /** Подстановки для перевода `errors.<code>`; см. `@/utils/appError`. */
    params?: Record<string, unknown>;
    recoveryValue?: unknown;
    failedKeys?: string[];
    existingProjectType?: string;
    incomingProjectType?: string;
    localGeneration?: number;
    incomingGeneration?: number;
    localEpochId?: string;
    incomingEpochId?: string;
  }

  interface Window {
    leakTrackingWaitingServiceWorkerRegistration?: ServiceWorkerRegistration;
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
    __EXCEL_EXPORT_METRICS__?: unknown;
    __RENDER_METRICS__?: { counts: Record<string, number> };
    __RESET_RENDER_METRICS__?: () => void;
  }

  interface HTMLImageElement {
    _removed?: boolean;
    _abortController?: AbortController;
  }
}

declare module "leaflet" {
  function markerClusterGroup(options?: Record<string, unknown>): any;

  interface TileLayer {
    _removeTile(key: string): void;
  }
}

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

export {};
