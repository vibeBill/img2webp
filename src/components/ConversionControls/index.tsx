"use client";

import styles from "./style.module.css";

export type ImageFormat = "webp" | "jpeg" | "png" | "gif";

interface ConversionControlsProps {
  targetFormat: ImageFormat;
  onFormatChange: (format: ImageFormat) => void;
  quality: number;
  onQualityChange: (quality: number) => void;
  t: (key: string) => string;
}

export default function ConversionControls({
  targetFormat,
  onFormatChange,
  quality,
  onQualityChange,
  t,
}: ConversionControlsProps) {
  return (
    <div className={styles.controlSection}>
      <div className={styles.formatControl}>
        <label>{t("target_format_label")}</label>
        <select
          value={targetFormat}
          onChange={(e) => onFormatChange(e.target.value as ImageFormat)}
        >
          <option value="webp">WebP</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
          <option value="gif">GIF</option>
        </select>
      </div>

      {(targetFormat === "webp" || targetFormat === "jpeg") && (
        <div className={styles.qualityControl}>
          <label>
            {t("quality_label")}: {quality}%
            <input
              type="range"
              min="0"
              max="100"
              value={quality}
              onChange={(e) => onQualityChange(Number(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
}
