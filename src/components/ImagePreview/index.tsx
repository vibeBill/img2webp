"use client";

import styles from "./style.module.css";
import { ImageFormat } from "../ConversionControls";

interface ImagePreviewProps {
  originalImage: string | null;
  originalSize: string;
  convertedImage: string | null;
  convertedSize: string;
  targetFormat: ImageFormat;
  onDownload: () => void;
  t: (key: string) => string;
}

export default function ImagePreview({
  originalImage,
  originalSize,
  convertedImage,
  convertedSize,
  targetFormat,
  onDownload,
  t,
}: ImagePreviewProps) {
  if (!originalImage && !convertedImage) {
    return null;
  }

  return (
    <div className={styles.previewSection}>
      {originalImage && (
        <div className={styles.previewBox}>
          <h3>{t("original_image_header")}</h3>
          <img src={originalImage} alt={t("original_image_header")} />
          <p>
            {t("size_label")}: {originalSize}
          </p>
        </div>
      )}

      {convertedImage && (
        <div className={styles.previewBox}>
          <h3>
            {targetFormat.toUpperCase()} {t("preview_header_prefix")}
          </h3>
          <img
            src={convertedImage}
            alt={`${targetFormat.toUpperCase()} ${t("preview_header_prefix")}`}
          />
          <p>
            {t("size_label")}: {convertedSize}
          </p>
          <button onClick={onDownload} className={styles.downloadButton}>
            {t("download_button_prefix")} {targetFormat.toUpperCase()}
          </button>
        </div>
      )}
    </div>
  );
}
