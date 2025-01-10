"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [convertedImage, setConvertedImage] = useState<string | null>(null);
  const [quality, setQuality] = useState(90);
  const [originalSize, setOriginalSize] = useState<string>("");
  const [convertedSize, setConvertedSize] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isWebPSupported, setIsWebPSupported] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 检测浏览器是否支持 WebP
  useEffect(() => {
    const checkWebPSupport = () => {
      const img = new Image();
      img.onload = () => setIsWebPSupported(true);
      img.onerror = () => setIsWebPSupported(false);
      img.src =
        "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    };

    checkWebPSupport();
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const convertImage = async (file: File, quality: number) => {
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

            const format = isWebPSupported ? "image/webp" : "image/jpeg";
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
              format,
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
    convertImage(file, quality);
  };

  // 当 quality 改变时重新转换图片
  useEffect(() => {
    if (selectedFile) {
      convertImage(selectedFile, quality);
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
      if (convertedImage) {
        URL.revokeObjectURL(convertedImage);
      }
    };
  }, [convertedImage]);

  const downloadImage = () => {
    if (convertedImage && selectedFile) {
      const originalFileName = selectedFile.name;
      const fileNameWithoutExtension = originalFileName
        .split(".")
        .slice(0, -1)
        .join(".");
      const newFileName = isWebPSupported
        ? `${fileNameWithoutExtension}.webp`
        : `${fileNameWithoutExtension}.jpg`;

      const link = document.createElement("a");
      link.href = convertedImage;
      link.download = newFileName;
      link.click();
    }
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>图片转换器</h1>

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

        {convertedImage && (
          <div className={styles.previewBox}>
            <h3>{isWebPSupported ? "WebP预览" : "JPEG预览"}</h3>
            <img src={convertedImage} alt="转换后的图片" />
            <p>大小: {convertedSize}</p>
            <button onClick={downloadImage} className={styles.downloadButton}>
              下载{isWebPSupported ? "WebP" : "JPEG"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
