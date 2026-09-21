"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./style.module.css";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropEditorProps {
  imageUrl: string;
  crop: CropRect;
  onCropChange: (crop: CropRect) => void;
  aspect: number | null;
  /** Natural pixel dimensions, used to show the real crop size. */
  naturalSize: { width: number; height: number };
  /**
   * Notifies the parent that a drag started/ended. The parent uses this to
   * skip expensive canvas re-encoding while the pointer is moving.
   */
  onDragStateChange?: (dragging: boolean) => void;
  t: (key: string) => string;
}

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";
type DragMode = "move" | ResizeHandle;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startCrop: CropRect;
  pointerId: number;
}

const MIN_SIZE = 0.02;
const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Resize a rect by dragging one handle, keeping the opposite edge anchored. */
function resizeRect(
  start: CropRect,
  mode: ResizeHandle,
  dx: number,
  dy: number,
  aspect: number
): CropRect {
  let { x, y, width, height } = start;

  const right = start.x + start.width;
  const bottom = start.y + start.height;

  if (mode.includes("w")) {
    x = clamp(start.x + dx, 0, right - MIN_SIZE);
    width = right - x;
  }
  if (mode.includes("e")) {
    width = clamp(start.width + dx, MIN_SIZE, 1 - start.x);
  }
  if (mode.includes("n")) {
    y = clamp(start.y + dy, 0, bottom - MIN_SIZE);
    height = bottom - y;
  }
  if (mode.includes("s")) {
    height = clamp(start.height + dy, MIN_SIZE, 1 - start.y);
  }

  // Enforce the locked aspect ratio by deriving the other axis from the
  // axis the user is actively dragging.
  if (Number.isFinite(aspect) && aspect > 0) {
    const widthDriven = mode.includes("e") || mode.includes("w");
    const heightDriven = mode.includes("n") || mode.includes("s");

    if (widthDriven && !heightDriven) {
      height = width / aspect;
    } else if (heightDriven && !widthDriven) {
      width = height * aspect;
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      // Corner drag: follow whichever axis the pointer moved most.
      height = width / aspect;
    } else {
      width = height * aspect;
    }

    const anchoredRight = mode.includes("w") ? right : null;
    const anchoredBottom = mode.includes("n") ? bottom : null;

    // The rect must stay inside the image. Shrink both axes by a single
    // uniform factor so the ratio survives the clamp intact.
    const maxWidth = anchoredRight !== null ? anchoredRight : 1 - x;
    const maxHeight = 1 - y;

    let scale = 1;
    if (width > maxWidth) scale = Math.min(scale, maxWidth / width);
    if (height > maxHeight) scale = Math.min(scale, maxHeight / height);
    // Keep the derived axis above the minimum size when an extreme ratio
    // would otherwise collapse it after the bounds clamp.
    const smallest = Math.min(width, height);
    if (smallest * scale < MIN_SIZE) {
      scale = Math.min(1 / Math.max(width, height), MIN_SIZE / smallest);
      // Re-apply the bounds clamp so growing back stays inside the image.
      if (width * scale > maxWidth) scale = maxWidth / width;
      if (height * scale > maxHeight) scale = maxHeight / height;
    }

    width *= scale;
    height *= scale;

    x = anchoredRight !== null ? anchoredRight - width : x;
    y = anchoredBottom !== null ? bottom - height : y;

    // Final safety clamp for floating point drift.
    x = clamp(x, 0, Math.max(0, 1 - width));
    y = clamp(y, 0, Math.max(0, 1 - height));
  } else {
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + width > 1) width = 1 - x;
    if (y + height > 1) height = 1 - y;
  }

  return { x, y, width, height };
}

export default function CropEditor({
  imageUrl,
  crop,
  onCropChange,
  aspect,
  naturalSize,
  onDragStateChange,
  t,
}: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Track the rendered (letterboxed) box so pixel math matches what is shown.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setBoxSize({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [imageUrl]);

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (boxSize.width === 0 || boxSize.height === 0) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: crop,
      pointerId: e.pointerId,
    };
    setIsDragging(true);
    onDragStateChange?.(true);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      const dx = (e.clientX - drag.startX) / boxSize.width;
      const dy = (e.clientY - drag.startY) / boxSize.height;

      const start = drag.startCrop;

      if (drag.mode === "move") {
        onCropChange({
          ...start,
          x: clamp(start.x + dx, 0, 1 - start.width),
          y: clamp(start.y + dy, 0, 1 - start.height),
        });
        return;
      }

      const ratio = aspect ?? NaN;
      const next = resizeRect(start, drag.mode, dx, dy, ratio);

      // A locked ratio can push the rect out of bounds after correction.
      if (Number.isFinite(ratio) && ratio > 0) {
        next.x = clamp(next.x, 0, 1 - next.width);
        next.y = clamp(next.y, 0, 1 - next.height);
      }

      onCropChange(next);
    },
    [aspect, boxSize.height, boxSize.width, onCropChange]
  );

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    onDragStateChange?.(false);
  };

  const toPixels = (value: number, total: number) => value * total;

  const boxStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };

  return (
    <div className={styles.editor}>
      <div
        ref={containerRef}
        className={`${styles.stage} ${isDragging ? styles.stageDragging : ""}`}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className={styles.image}
          draggable={false}
        />

        <div
          className={styles.cropBox}
          style={boxStyle}
          onPointerDown={(e) => beginDrag(e, "move")}
        >
          <div className={styles.gridLines} />

          {HANDLES.map((handle) => (
            <div
              key={handle}
              className={`${styles.handle} ${styles[`handle_${handle}`]}`}
              onPointerDown={(e) => beginDrag(e, handle)}
            />
          ))}

          {naturalSize.width > 0 && (
            <span className={styles.sizeBadge}>
              {Math.round(toPixels(crop.width, naturalSize.width))} ×{" "}
              {Math.round(toPixels(crop.height, naturalSize.height))}
            </span>
          )}
        </div>
      </div>

      <p className={styles.hint}>{t("hint")}</p>
    </div>
  );
}
