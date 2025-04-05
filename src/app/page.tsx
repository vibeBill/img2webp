"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

// 支持的图片格式
type ImageFormat = "webp" | "jpeg" | "png" | "gif";

// 格式的MIME类型映射
const formatMimeTypes: Record<ImageFormat, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

// 格式的文件扩展名映射
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const convertImage = async (
    file: File,
    quality: number,
    format: ImageFormat
  ) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = function (e) {
      if (e.target?.result) {
        img.src = e.target.result as string;
        setOriginalImage(e.target.result as string);
        setOriginalSize(formatFileSize(file.size));

        img.onload = function () {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);

            // 根据格式不同，有些格式不支持质量参数
            const useQuality = format === "webp" || format === "jpeg";

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  // 清除之前的 URL
                  if (convertedImage) {
                    URL.revokeObjectURL(convertedImage);
                  }
                  const url = URL.createObjectURL(blob);
                  setConvertedImage(url);
                  setConvertedSize(formatFileSize(blob.size));
                }
              },
              formatMimeTypes[format],
              useQuality ? quality / 100 : undefined
            );
          }
        };
      }
    };

    reader.readAsDataURL(file);
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件");
      return;
    }
    setSelectedFile(file);
    convertImage(file, quality, targetFormat);
  };

  // 当 quality 或 targetFormat 改变时重新转换图片
  useEffect(() => {
    if (selectedFile) {
      convertImage(selectedFile, quality, targetFormat);
    }
  }, [quality, targetFormat]);

  // 处理拖放
  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.add(styles.dragOver);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.remove(styles.dragOver);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.remove(styles.dragOver);
      const files = e.dataTransfer?.files;
      if (files?.length) {
        handleFileSelect(files[0]);
      }
    };

    dropZone.addEventListener("dragover", handleDragOver);
    dropZone.addEventListener("dragleave", handleDragLeave);
    dropZone.addEventListener("drop", handleDrop);

    return () => {
      dropZone.removeEventListener("dragover", handleDragOver);
      dropZone.removeEventListener("dragleave", handleDragLeave);
      dropZone.removeEventListener("drop", handleDrop);
    };
  }, []);

  // 清理 URL 对象
  useEffect(() => {
    return () => {
      if (convertedImage) {
        URL.revokeObjectURL(convertedImage);
      }
    };
  }, [convertedImage]);

  const downloadConvertedImage = () => {
    if (convertedImage && selectedFile) {
      const link = document.createElement("a");
      link.href = convertedImage;
      // 基于原始文件名生成新文件名
      const originalName = selectedFile.name.split(".").slice(0, -1).join(".");
      link.download = originalName + formatExtensions[targetFormat];
      link.click();
    }
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>图片格式转换器</h1>

      <div
        ref={dropZoneRef}
        className={styles.uploadSection}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={(e) =>
            e.target.files?.[0] && handleFileSelect(e.target.files[0])
          }
          style={{ display: "none" }}
        />
        <p>点击或拖放图片到此处</p>
      </div>

      <div className={styles.controlSection}>
        <div className={styles.formatControl}>
          <label>目标格式：</label>
          <select
            value={targetFormat}
            onChange={(e) => setTargetFormat(e.target.value as ImageFormat)}
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
              压缩质量: {quality}%
              <input
                type="range"
                min="0"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
          </div>
        )}
      </div>

      <div className={styles.previewSection}>
        {originalImage && (
          <div className={styles.previewBox}>
            <h3>原始图片</h3>
            <img src={originalImage} alt="原始图片" />
            <p>大小: {originalSize}</p>
          </div>
        )}

        {convertedImage && (
          <div className={styles.previewBox}>
            <h3>{targetFormat.toUpperCase()} 预览</h3>
            <img
              src={convertedImage}
              alt={`${targetFormat.toUpperCase()} 预览`}
            />
            <p>大小: {convertedSize}</p>
            <button
              onClick={downloadConvertedImage}
              className={styles.downloadButton}
            >
              下载 {targetFormat.toUpperCase()}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
