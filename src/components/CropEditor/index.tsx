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
type DragMode = "move" | "draw" | ResizeHandle;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startCrop: CropRect;
  pointerId: number;
  /** Normalized origin of a "draw" gesture (pointer-down position). */
  originX: number;
  originY: number;
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

/**
 * Build a rect dragged from a fixed origin corner, optionally locking the
 * normalized aspect ratio, always clamped inside the image bounds.
 */
function drawRect(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  aspect: number | null,
  minW: number,
  minH: number
): CropRect {
  const dirX = pointerX >= originX ? 1 : -1;
  const dirY = pointerY >= originY ? 1 : -1;

  let width = Math.max(Math.abs(pointerX - originX), minW);
  let height = Math.max(Math.abs(pointerY - originY), minH);

  if (aspect !== null && Number.isFinite(aspect) && aspect > 0) {
    // The axis the pointer travelled further along drives the other one.
    if (Math.abs(pointerX - originX) >= Math.abs(pointerY - originY)) {
      height = width / aspect;
    } else {
      width = height * aspect;
    }
  }

  // Never grow past the image edge in the dragged direction.
  const maxW = dirX === 1 ? 1 - originX : originX;
  const maxH = dirY === 1 ? 1 - originY : originY;

  if (width > maxW) {
    width = maxW;
    if (aspect !== null && Number.isFinite(aspect) && aspect > 0) {
      height = width / aspect;
    }
  }
  if (height > maxH) {
    height = maxH;
    if (aspect !== null && Number.isFinite(aspect) && aspect > 0) {
      width = Math.min(height * aspect, maxW);
    }
  }

  return {
    x: dirX === 1 ? originX : originX - width,
    y: dirY === 1 ? originY : originY - height,
    width,
    height,
  };
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
  const cropBoxRef = useRef<HTMLDivElement>(null);
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

  const toNormPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return null;
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1),
      };
    },
    []
  );

  const beginDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (boxSize.width === 0 || boxSize.height === 0) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // preventDefault suppresses the focus that normally follows a click, so
    // focus the selection explicitly to keep arrow-key nudging reachable.
    if (mode !== "draw") cropBoxRef.current?.focus();

    const origin =
      mode === "draw" ? toNormPoint(e.clientX, e.clientY) : null;

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: crop,
      pointerId: e.pointerId,
      originX: origin?.x ?? 0,
      originY: origin?.y ?? 0,
    };
    setIsDragging(true);
    onDragStateChange?.(true);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      if (drag.mode === "draw") {
        const point = toNormPoint(e.clientX, e.clientY);
        if (!point) return;
        onCropChange(
          drawRect(
            drag.originX,
            drag.originY,
            point.x,
            point.y,
            aspect,
            naturalSize.width ? 1 / naturalSize.width : MIN_SIZE,
            naturalSize.height ? 1 / naturalSize.height : MIN_SIZE
          )
        );
        return;
      }

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
    [aspect, boxSize.height, boxSize.width, naturalSize, onCropChange, toNormPoint]
  );

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    onDragStateChange?.(false);

    // A bare click on the image (no real drag distance) must not collapse
    // the selection — restore the rect the user had before the gesture.
    // A deliberately thin strip (small on one axis only) is kept intact.
    if (drag.mode === "draw") {
      const tinyW = naturalSize.width
        ? crop.width * naturalSize.width < 2
        : crop.width < MIN_SIZE;
      const tinyH = naturalSize.height
        ? crop.height * naturalSize.height < 2
        : crop.height < MIN_SIZE;
      if (tinyW && tinyH) onCropChange(drag.startCrop);
    }
  };

  /**
   * Keyboard nudging for precise control:
   * arrow keys move the box by 1 source pixel (Shift: 10 px),
   * Alt + arrow resizes it by the same step with the top-left corner anchored.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = deltas[e.key];
    if (!dir) return;
    if (!naturalSize.width || !naturalSize.height) return;
    e.preventDefault();

    const step = e.shiftKey ? 10 : 1;
    const dx = (dir[0] * step) / naturalSize.width;
    const dy = (dir[1] * step) / naturalSize.height;
    const minW = 1 / naturalSize.width;
    const minH = 1 / naturalSize.height;

    if (!e.altKey) {
      onCropChange({
        ...crop,
        x: clamp(crop.x + dx, 0, 1 - crop.width),
        y: clamp(crop.y + dy, 0, 1 - crop.height),
      });
      return;
    }

    let next: CropRect = { ...crop };
    if (dir[0] !== 0) {
      next.width = clamp(crop.width + dx, minW, 1 - crop.x);
      if (aspect !== null && Number.isFinite(aspect) && aspect > 0) {
        next.height = next.width / aspect;
      }
    } else {
      next.height = clamp(crop.height + dy, minH, 1 - crop.y);
      if (aspect !== null && Number.isFinite(aspect) && aspect > 0) {
        next.width = next.height * aspect;
      }
    }

    if (aspect !== null && Number.isFinite(aspect) && aspect > 0) {
      // Fit the derived rect back inside the image without breaking the ratio.
      const maxW = 1 - next.x;
      const maxH = 1 - next.y;
      let scale = 1;
      if (next.width > maxW) scale = Math.min(scale, maxW / next.width);
      if (next.height > maxH) scale = Math.min(scale, maxH / next.height);
      if (scale < 1) {
        next = {
          ...next,
          width: Math.max(next.width * scale, minW),
          height: Math.max(next.height * scale, minH),
        };
      }
    }

    onCropChange(next);
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
        onPointerDown={(e) => beginDrag(e, "draw")}
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
          ref={cropBoxRef}
          className={styles.cropBox}
          style={boxStyle}
          tabIndex={0}
          role="group"
          aria-label={t("selection_aria")}
          onPointerDown={(e) => beginDrag(e, "move")}
          onKeyDown={handleKeyDown}
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
