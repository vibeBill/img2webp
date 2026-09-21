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

  // The user picks a ratio in PIXEL space (1:1 means square output), but the
  // crop rect lives in NORMALIZED 0-1 space where the axes are scaled by the
  // image's own proportions. Convert so a locked ratio yields square pixels.
  const aspect = useMemo(() => {
    const pixelAspect = RATIO_PRESETS.find((p) => p.key === ratioKey)?.value ?? null;
    if (pixelAspect === null || !naturalSize.width || !naturalSize.height) {
      return pixelAspect;
    }
    return pixelAspect * (naturalSize.height / naturalSize.width);
  }, [ratioKey, naturalSize]);

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
    };
    img.src = url;
  };

  // Render the cropped region whenever the selection or output settings change.
  // Encoding a large canvas is expensive, so it is skipped while the pointer
  // is moving and re-run once the drag ends (see the isDragging effect below).
  const renderCrop = useCallback(() => {
    const img = sourceImageRef.current;
    if (!img || !naturalSize.width || !naturalSize.height) return;

    const sx = Math.max(0, Math.min(crop.x * naturalSize.width, naturalSize.width - 1));
    const sy = Math.max(0, Math.min(crop.y * naturalSize.height, naturalSize.height - 1));
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
    if (preset.value === null || !naturalSize.width) {
      return;
    }
    setCrop(fitRatio(naturalSize, preset.value));
  };

  const resetCrop = () => {
    setRatioKey("free");
    setCrop(FULL_CROP);
  };

  const centerCrop = () => {
    setCrop((prev) => ({
      ...prev,
      x: (1 - prev.width) / 2,
      y: (1 - prev.height) / 2,
    }));
  };

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
                onCropChange={setCrop}
                aspect={aspect}
                naturalSize={naturalSize}
                onDragStateChange={setIsDragging}
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
