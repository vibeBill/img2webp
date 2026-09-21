"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import styles from "./style.module.css";
import type { ImageFormat } from "@/components/ConversionControls";
import UploadArea from "@/components/UploadArea";
import ConversionControls from "@/components/ConversionControls";
import ImagePreview from "@/components/ImagePreview";

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

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [convertedImage, setConvertedImage] = useState<string | null>(null);
  const [quality, setQuality] = useState(90);
  const [originalSize, setOriginalSize] = useState<string>("");
  const [convertedSize, setConvertedSize] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ImageFormat>("webp");
  const convertedUrlRef = useRef<string | null>(null);
  const t = useTranslations("HomePage");

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const convertImage = async (
    file: File,
    qualityValue: number,
    format: ImageFormat
  ) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) return;

      img.src = e.target.result as string;
      setOriginalImage(e.target.result as string);
      setOriginalSize(formatFileSize(file.size));

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const useQuality = format === "webp" || format === "jpeg";
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Revoke through a ref: the state value captured in this closure
              // is from the render that started the conversion (usually null),
              // so reading it here would never release the previous URL.
              if (convertedUrlRef.current) {
                URL.revokeObjectURL(convertedUrlRef.current);
              }
              const url = URL.createObjectURL(blob);
              convertedUrlRef.current = url;
              setConvertedImage(url);
              setConvertedSize(formatFileSize(blob.size));
            }
          },
          formatMimeTypes[format],
          useQuality ? qualityValue / 100 : undefined
        );
      };
    };

    reader.readAsDataURL(file);
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert(t("alert_select_image"));
      return;
    }
    setSelectedFile(file);
    // Initial conversion
    convertImage(file, quality, targetFormat);
  };

  // Re-run conversion when quality or format changes
  useEffect(() => {
    if (selectedFile) {
      convertImage(selectedFile, quality, targetFormat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, targetFormat]);

  // Release the final object URL on unmount. Keyed on [] so it reads the ref
  // at unmount time instead of revoking the URL the preview is still showing.
  useEffect(() => {
    return () => {
      if (convertedUrlRef.current) {
        URL.revokeObjectURL(convertedUrlRef.current);
        convertedUrlRef.current = null;
      }
    };
  }, []);

  const downloadConvertedImage = () => {
    if (convertedImage && selectedFile) {
      const link = document.createElement("a");
      link.href = convertedImage;
      const originalName = selectedFile.name.split(".").slice(0, -1).join(".");
      link.download = originalName + formatExtensions[targetFormat];
      link.click();
    }
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>{t("subtitle")}</p>

      <UploadArea onFileSelect={handleFileSelect} t={t} />

      {selectedFile && (
        <ConversionControls
          targetFormat={targetFormat}
          onFormatChange={setTargetFormat}
          quality={quality}
          onQualityChange={setQuality}
          t={t}
        />
      )}

      <ImagePreview
        originalImage={originalImage}
        originalSize={originalSize}
        convertedImage={convertedImage}
        convertedSize={convertedSize}
        targetFormat={targetFormat}
        onDownload={downloadConvertedImage}
        t={t}
      />
    </main>
  );
}
