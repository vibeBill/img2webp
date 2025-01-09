"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import { saveAs } from "file-saver"; // 引入 file-saver 库

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [webpImage, setWebpImage] = useState<string | null>(null);
  const [quality, setQuality] = useState(90);
  const [originalSize, setOriginalSize] = useState<string>("");
  const [webpSize, setWebpSize] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const convertToWebP = async (file: File, quality: number) => {
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

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  // 清除之前的 URL
                  if (webpImage) {
                    URL.revokeObjectURL(webpImage);
                  }
                  const url = URL.createObjectURL(blob);
                  setWebpImage(url);
                  setWebpSize(formatFileSize(blob.size));
                }
              },
              "image/webp",
              quality / 100
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
    convertToWebP(file, quality);
  };

  // 当 quality 改变时重新转换图片
  useEffect(() => {
    if (selectedFile) {
      convertToWebP(selectedFile, quality);
    }
  }, [quality]);

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
      if (webpImage) {
        URL.revokeObjectURL(webpImage);
      }
    };
  }, [webpImage]);

  const downloadWebP = () => {
    if (webpImage) {
      fetch(webpImage)
        .then((response) => response.blob())
        .then((blob) => {
          saveAs(blob, "converted.webp"); // 使用 file-saver 下载文件
        });
    }
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>图片转WebP转换器</h1>

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

      <div className={styles.previewSection}>
        {originalImage && (
          <div className={styles.previewBox}>
            <h3>原始图片</h3>
            <img src={originalImage} alt="原始图片" />
            <p>大小: {originalSize}</p>
          </div>
        )}

        {webpImage && (
          <div className={styles.previewBox}>
            <h3>WebP预览</h3>
            <img src={webpImage} alt="WebP预览" />
            <p>大小: {webpSize}</p>
            <button onClick={downloadWebP} className={styles.downloadButton}>
              下载WebP
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
