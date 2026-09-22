"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import styles from "./style.module.css";

import type { ImageFormat } from "@/components/ConversionControls";
import UploadArea from "@/components/UploadArea";
import CropEditor, { type CropRect } from "@/components/CropEditor";

const formatMimeTypes: Record<ImageFormat, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

const formatExtensions: Record<ImageFormat, string> = {
  webp: ".webp",
  jpeg: ".jpg",
  png: ".png",
  gif: ".gif",
};

const RATIO_PRESETS: { key: string; label: string; value: number | null }[] = [
  { key: "free", label: "", value: null },
  { key: "1:1", label: "1:1", value: 1 },
  { key: "4:3", label: "4:3", value: 4 / 3 },
  { key: "3:4", label: "3:4", value: 3 / 4 },
  { key: "16:9", label: "16:9", value: 16 / 9 },
  { key: "9:16", label: "9:16", value: 9 / 16 },
];

const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/** Source-pixel fields the precision panel edits. */
type PixelField = "x" | "y" | "w" | "h";

const PIXEL_FIELDS: { key: PixelField; labelKey: string }[] = [
  { key: "x", labelKey: "pos_x_label" },
  { key: "y", labelKey: "pos_y_label" },
  { key: "w", labelKey: "size_w_label" },
  { key: "h", labelKey: "size_h_label" },
];

const clampInt = (value: number, min: number, max: number) =>
  Math.min(Math.max(Math.round(value), min), Math.max(min, max));

/**
 * Round a normalized rect to whole source pixels, keeping a locked pixel ratio
 * intact and clamping the result inside the image. Snapping here means the
 * precision inputs and the crop box always agree exactly.
 */
function snapToPixels(
  rect: CropRect,
  natural: { width: number; height: number },
  pixelAspect: number | null
): CropRect {
  const NW = natural.width;
  const NH = natural.height;
  if (!NW || !NH) return rect;

  let x = clampInt(rect.x * NW, 0, NW - 1);
  let y = clampInt(rect.y * NH, 0, NH - 1);
  let w = clampInt(rect.width * NW, 1, NW - x);
  let h = clampInt(rect.height * NH, 1, NH - y);

  if (pixelAspect !== null && pixelAspect > 0) {
    // Derive height from the (snapped) width, then shrink both together so
    // the ratio survives instead of being broken by the round-up.
    h = Math.round(w / pixelAspect);
    if (h > NH - y) {
      h = NH - y;
      w = Math.max(1, Math.round(h * pixelAspect));
    }
    h = Math.max(1, h);
  }

  // Extreme ratios or a late origin can push the box past the right/bottom
  // edge; pull it back without touching the freshly computed size.
  x = Math.min(x, NW - Math.max(w, 1));
  y = Math.min(y, NH - Math.max(h, 1));

  return { x: x / NW, y: y / NH, width: w / NW, height: h / NH };
}

/**
 * Apply an edit made in SOURCE PIXEL space to the normalized rect. Editing in
 * pixel space and converting back with exact divisions keeps the selection
 * pixel-accurate, so a typed "300" really crops 300 px.
 */
function applyPixelEdit(
  prev: CropRect,
  field: PixelField,
  value: number,
  natural: { width: number; height: number },
  pixelAspect: number | null
): CropRect {
  const NW = natural.width;
  const NH = natural.height;
  if (!NW || !NH || !Number.isFinite(value)) return prev;

  let x = clampInt(prev.x * NW, 0, NW);
  let y = clampInt(prev.y * NH, 0, NH);
  let w = clampInt(prev.width * NW, 1, NW - x);
  let h = clampInt(prev.height * NH, 1, NH - y);

  const v = Math.round(value);

  // Keep a locked ratio satisfied after resizing, shrinking the box if the
  // derived axis would leave the image.
  const syncFromWidth = () => {
    if (pixelAspect === null) {
      h = clampInt(h, 1, NH - y);
      return;
    }
    h = Math.round(w / pixelAspect);
    if (h > NH - y) {
      h = NH - y;
      w = Math.round(h * pixelAspect);
    }
    if (h < 1) {
      h = 1;
      w = Math.max(1, Math.round(pixelAspect));
    }
    w = clampInt(w, 1, NW - x);
  };

  const syncFromHeight = () => {
    if (pixelAspect === null) {
      w = clampInt(w, 1, NW - x);
      return;
    }
    w = Math.round(h * pixelAspect);
    if (w > NW - x) {
      w = NW - x;
      h = Math.round(w / pixelAspect);
    }
    if (w < 1) {
      w = 1;
      h = Math.max(1, Math.round(1 / pixelAspect));
    }
    h = clampInt(h, 1, NH - y);
  };

  switch (field) {
    case "x":
      x = clampInt(v, 0, NW - w);
      break;
    case "y":
      y = clampInt(v, 0, NH - h);
      break;
    case "w":
      w = clampInt(v, 1, NW - x);
      syncFromWidth();
      break;
    case "h":
      h = clampInt(v, 1, NH - y);
      syncFromHeight();
      break;
  }

  // Extreme ratios can leave the origin outside the shrunken box's range.
  x = Math.min(x, NW - w);
  y = Math.min(y, NH - h);

  return { x: x / NW, y: y / NH, width: w / NW, height: h / NH };
}

/** Build the largest normalized rect matching a PIXEL-space ratio. */
function fitRatio(
  natural: { width: number; height: number },
  pixelRatio: number
): CropRect {
  const imageRatio = natural.width / natural.height;
  // Work in pixel space so the comparison below is meaningful, then convert
  // the resulting height back into normalized units.
  let pixelWidth: number;
  let pixelHeight: number;

  if (pixelRatio >= imageRatio) {
    // Limited by width.
    pixelWidth = natural.width;
    pixelHeight = natural.width / pixelRatio;
  } else {
    // Limited by height.
    pixelHeight = natural.height;
    pixelWidth = natural.height * pixelRatio;
  }

  let width = pixelWidth / natural.width;
  let height = pixelHeight / natural.height;

  // Keep at least one pixel on each axis so a canvas can actually be made.
  const minWidth = Math.min(1, 1 / natural.width);
  const minHeight = Math.min(1, 1 / natural.height);
  if (width < minWidth) {
    width = minWidth;
    height = (width * natural.width) / pixelRatio / natural.height;
  }
  if (height < minHeight) {
    height = minHeight;
    width = ((height * natural.height) * pixelRatio) / natural.width;
  }

  width = Math.min(width, 1);
  height = Math.min(height, 1);

  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  };
}

export default function CropClient() {
  const t = useTranslations("CropPage");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [ratioKey, setRatioKey] = useState<string>("free");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ImageFormat>("png");
  const [quality, setQuality] = useState(90);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState("");

  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  // Increments per encode so stale toBlob callbacks can be discarded.
  const encodeGenerationRef = useRef(0);
  // True while the crop box is being dragged; suppresses per-frame encoding.
  const [isDragging, setIsDragging] = useState(false);
  // Raw text while the user is mid-typing in a precision field, so an
  // intermediate/clamped value never fights with what they have typed.
  const [fieldDrafts, setFieldDrafts] = useState<Partial<Record<PixelField, string>>>({});

  const pixelAspect = useMemo(
    () => RATIO_PRESETS.find((p) => p.key === ratioKey)?.value ?? null,
    [ratioKey]
  );

  // The user picks a ratio in PIXEL space (1:1 means square output), but the
  // crop rect lives in NORMALIZED 0-1 space where the axes are scaled by the
  // image's own proportions. Convert so a locked ratio yields square pixels.
  const aspect = useMemo(() => {
    if (pixelAspect === null || !naturalSize.width || !naturalSize.height) {
      return pixelAspect;
    }
    return pixelAspect * (naturalSize.height / naturalSize.width);
  }, [pixelAspect, naturalSize]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Revoke the uploaded preview URL when it is replaced or on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert(t("alert_select_image"));
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    const img = new Image();
    img.onload = () => {
      sourceImageRef.current = img;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setCrop(FULL_CROP);
      setRatioKey("free");
      setImageUrl(url);
      setSelectedFile(file);
      setResultUrl(null);
      setResultSize("");
      setFieldDrafts({});
    };
    img.src = url;
  };

  // Render the cropped region whenever the selection or output settings change.
  // Encoding a large canvas is expensive, so it is skipped while the pointer
  // is moving and re-run once the drag ends (see the isDragging effect below).
  const renderCrop = useCallback(() => {
    const img = sourceImageRef.current;
    if (!img || !naturalSize.width || !naturalSize.height) return;

    // Sample on whole source pixels so the output matches the badge / typed
    // values exactly (the origin can be fractional after centering).
    const sx = Math.max(
      0,
      Math.min(Math.round(crop.x * naturalSize.width), naturalSize.width - 1)
    );
    const sy = Math.max(
      0,
      Math.min(Math.round(crop.y * naturalSize.height), naturalSize.height - 1)
    );
    const sw = Math.min(
      Math.max(1, Math.round(crop.width * naturalSize.width)),
      naturalSize.width - sx
    );
    const sh = Math.min(
      Math.max(1, Math.round(crop.height * naturalSize.height)),
      naturalSize.height - sy
    );

    // A zero-sized canvas makes toBlob throw, so bail out defensively.
    if (sw < 1 || sh < 1) return;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // JPEG has no alpha channel: fill white so transparency does not go black.
    if (targetFormat === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sw, sh);
    }

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    // Only the most recent encode may publish its result; an older in-flight
    // callback must not revoke a URL the view is already using.
    const generation = ++encodeGenerationRef.current;

    const useQuality = targetFormat === "webp" || targetFormat === "jpeg";
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (generation !== encodeGenerationRef.current) return;
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        const url = URL.createObjectURL(blob);
        resultUrlRef.current = url;
        setResultUrl(url);
        setResultSize(formatFileSize(blob.size));
      },
      formatMimeTypes[targetFormat],
      useQuality ? quality / 100 : undefined
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, naturalSize, targetFormat, quality]);


  useEffect(() => {
    // Skip the expensive encode while dragging; the drag-end effect below
    // performs a single render once the pointer is released.
    if (imageUrl && !isDragging) renderCrop();
  }, [imageUrl, renderCrop, isDragging]);

  const applyRatio = (preset: (typeof RATIO_PRESETS)[number]) => {
    setRatioKey(preset.key);
    setFieldDrafts({});
    if (preset.value === null || !naturalSize.width) {
      return;
    }
    setCrop(fitRatio(naturalSize, preset.value));
  };

  const resetCrop = () => {
    setRatioKey("free");
    setCrop(FULL_CROP);
    setFieldDrafts({});
  };

  const centerCrop = () => {
    setCrop((prev) => ({
      ...prev,
      x: (1 - prev.width) / 2,
      y: (1 - prev.height) / 2,
    }));
  };

  /**
   * Snap a rect coming from the pointer editor to whole source pixels so the
   * selection always maps to exact crop coordinates.
   */
  const handleCropChange = useCallback(
    (rect: CropRect) => {
      setCrop(snapToPixels(rect, naturalSize, pixelAspect));
    },
    [naturalSize, pixelAspect]
  );

  // Current selection expressed in source pixels, for the precision inputs.
  const pixelValues: Record<PixelField, number> = {
    x: Math.round(crop.x * naturalSize.width),
    y: Math.round(crop.y * naturalSize.height),
    w: Math.round(crop.width * naturalSize.width),
    h: Math.round(crop.height * naturalSize.height),
  };

  const commitField = (field: PixelField, raw: string) => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    setCrop((prev) => applyPixelEdit(prev, field, value, naturalSize, pixelAspect));
  };

  const clearDraft = (field: PixelField) => {
    setFieldDrafts((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // A pointer gesture on the canvas outranks any half-typed field value, so
  // drop drafts as soon as a drag starts to keep the inputs in sync.
  const handleDragState = useCallback((dragging: boolean) => {
    if (dragging) setFieldDrafts({});
    setIsDragging(dragging);
  }, []);

  const downloadResult = () => {
    if (!resultUrl || !selectedFile) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    const baseName = selectedFile.name.split(".").slice(0, -1).join(".");
    link.download = `${baseName}-crop${formatExtensions[targetFormat]}`;
    link.click();
  };

  const outputWidth = Math.round(crop.width * naturalSize.width);
  const outputHeight = Math.round(crop.height * naturalSize.height);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{t("title")}</h1>

      <UploadArea onFileSelect={handleFileSelect} t={t} />

      {imageUrl && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.control}>
              <label>{t("ratio_label")}</label>
              <div className={styles.ratioGroup}>
                {RATIO_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyRatio(preset)}
                    className={`${styles.ratioButton} ${
                      ratioKey === preset.key ? styles.ratioButtonActive : ""
                    }`}
                  >
                    {preset.value === null ? t("free_ratio") : preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.control}>
              <label>{t("precision_label")}</label>
              <div className={styles.precisionGrid}>
                {PIXEL_FIELDS.map(({ key, labelKey }) => (
                  <div key={key} className={styles.precisionField}>
                    <label htmlFor={`crop-${key}`}>{t(labelKey)}</label>
                    <div className={styles.precisionInputWrap}>
                      <input
                        id={`crop-${key}`}
                        type="number"
                        inputMode="numeric"
                        min={key === "w" || key === "h" ? 1 : 0}
                        max={
                          key === "x"
                            ? naturalSize.width - 1
                            : key === "y"
                              ? naturalSize.height - 1
                              : key === "w"
                                ? naturalSize.width
                                : naturalSize.height
                        }
                        step={1}
                        value={fieldDrafts[key] ?? String(pixelValues[key])}
                        onChange={(e) =>
                          setFieldDrafts((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          commitField(key, e.target.value);
                          clearDraft(key);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitField(key, e.currentTarget.value);
                            clearDraft(key);
                            e.currentTarget.blur();
                            return;
                          }
                          // Arrow keys step the committed value directly,
                          // bypassing the typing draft so the box follows live.
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const draft = fieldDrafts[key];
                            const base =
                              draft !== undefined && Number.isFinite(Number(draft))
                                ? Number(draft)
                                : pixelValues[key];
                            const next = base + (e.key === "ArrowUp" ? 1 : -1);
                            commitField(key, String(next));
                            clearDraft(key);
                          }
                        }}
                      />
                      <span className={styles.precisionUnit}>px</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className={styles.precisionNote}>{t("precision_note")}</p>
            </div>

            <div className={styles.control}>
              <label>{t("target_format_label")}</label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as ImageFormat)}
              >
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
                <option value="jpeg">JPEG</option>
              </select>
            </div>

            {(targetFormat === "webp" || targetFormat === "jpeg") && (
              <div className={styles.control}>
                <label>
                  {t("quality_label")}: {quality}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
              </div>
            )}

            <div className={styles.actions}>
              <button type="button" onClick={centerCrop} className={styles.ghostButton}>
                {t("center_button")}
              </button>
              <button type="button" onClick={resetCrop} className={styles.ghostButton}>
                {t("reset_button")}
              </button>
            </div>
          </div>

          <div className={styles.workspace}>
            <div className={styles.editorColumn}>
              <CropEditor
                imageUrl={imageUrl}
                crop={crop}
                onCropChange={handleCropChange}
                aspect={aspect}
                naturalSize={naturalSize}
                onDragStateChange={handleDragState}
                t={t}
              />
            </div>

            <div className={styles.previewColumn}>
              <div className={styles.previewBox}>
                <h3>{t("preview_header_prefix")}</h3>
                {resultUrl && <img src={resultUrl} alt={t("preview_header_prefix")} />}
                <p>
                  {t("dimension_label")}: {outputWidth} × {outputHeight}
                </p>
                <p>
                  {t("size_label")}: {resultSize}
                </p>
                <button
                  onClick={downloadResult}
                  className={styles.downloadButton}
                  disabled={!resultUrl}
                >
                  {t("download_button_prefix")} {targetFormat.toUpperCase()}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
