import { useCallback, useEffect, useRef, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import s from "./SchemaViewer.module.scss";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_TAP_SCALE = 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetween(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Pan-and-zoom viewer for a drawing.
 *
 * Rendered as an `<img>` under a CSS transform rather than drawn onto a canvas.
 * An A1 sheet at plotting resolution runs 6000–8000 px on the long side, past
 * the 4096 px texture limit most Android GPUs impose — a canvas either refuses
 * it or silently downsamples exactly where the position numbers are. The
 * browser's own image pipeline handles the same file without complaint.
 *
 * The drawing is never downscaled on the way in for the same reason: the tags
 * are small, and a shrunk copy is unreadable precisely where it is needed.
 *
 * Shown as a modal rather than as a screen of its own. A full-bleed viewer left
 * nothing to press to get back out — the drawing covered the navigation along
 * with everything else. A modal keeps the app visible behind it and gives three
 * ways out: the close button, the backdrop, and Escape.
 */
export default function SchemaViewer({ src, alt, texts, onClose }) {
  const frameRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const dialogRef = useModalDialog({ open: true, onClose });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pointersRef = useRef(new Map());
  const gestureRef = useRef(
    /** @type {{type: "pinch", distance: number}|{type: "pan", x: number, y: number}|null} */ (
      null
    ),
  );
  const lastTapRef = useRef(0);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [src, reset]);

  const applyScale = useCallback((nextScale) => {
    setScale((current) => {
      const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      // Snapping back to fit also recentres: a drawing panned far off-screen
      // and then zoomed out would otherwise leave an empty frame.
      if (clamped === MIN_SCALE && current !== MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return clamped;
    });
  }, []);

  const handlePointerDown = useCallback((event) => {
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, event);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gestureRef.current = { type: "pinch", distance: distanceBetween(a, b) };
    } else if (pointers.size === 1) {
      gestureRef.current = {
        type: "pan",
        x: event.clientX,
        y: event.clientY,
      };
    }
  }, []);

  const handlePointerMove = useCallback(
    (event) => {
      const pointers = pointersRef.current;
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, event);

      const gesture = gestureRef.current;
      if (!gesture) return;

      if (gesture.type === "pinch" && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const distance = distanceBetween(a, b);
        if (gesture.distance > 0) {
          applyScale(scale * (distance / gesture.distance));
        }
        gestureRef.current = { type: "pinch", distance };
        return;
      }

      if (gesture.type === "pan") {
        // Panning below fit would slide the whole drawing out of a frame it
        // already fits inside.
        if (scale <= MIN_SCALE) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        gestureRef.current = {
          type: "pan",
          x: event.clientX,
          y: event.clientY,
        };
        setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
      }
    },
    [applyScale, scale],
  );

  const handlePointerUp = useCallback((event) => {
    const pointers = pointersRef.current;
    pointers.delete(event.pointerId);
    gestureRef.current =
      pointers.size === 1 ? { type: "pan", x: 0, y: 0 } : null;

    if (pointers.size === 1) {
      const [remaining] = [...pointers.values()];
      gestureRef.current = {
        type: "pan",
        x: remaining.clientX,
        y: remaining.clientY,
      };
    }
  }, []);

  const handleWheel = useCallback(
    (event) => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < 1) return;
      event.preventDefault();
      applyScale(scale * (event.deltaY > 0 ? 0.9 : 1.1));
    },
    [applyScale, scale],
  );

  const handleClick = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;
    if (!isDoubleTap) return;

    if (scale > MIN_SCALE) reset();
    else applyScale(DOUBLE_TAP_SCALE);
  }, [applyScale, reset, scale]);

  return (
    <div className={s.overlay}>
      <div className={s.backdrop} onClick={onClose} />
      <div
        ref={dialogRef}
        className={s.viewer}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
      >
        <header className={s.bar}>
          <span className={s.title}>{alt}</span>
          <span className={s.zoom}>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={reset} disabled={scale === MIN_SCALE}>
            {texts.fit}
          </button>
          <button type="button" className={s.closeBtn} onClick={onClose}>
            {texts.close}
          </button>
        </header>

        <div
          ref={frameRef}
          className={s.frame}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onClick={handleClick}
        >
          <img
            className={s.image}
            src={src}
            alt={alt}
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
        </div>

        <p className={s.hint}>{texts.hint}</p>
      </div>
    </div>
  );
}
