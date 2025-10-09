"use client";

import { useRef, useEffect } from "react";
import styles from "./style.module.css";

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  t: (key: string) => string;
}

export default function UploadArea({ onFileSelect, t }: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

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
        onFileSelect(files[0]);
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
  }, [onFileSelect]);

  return (
    <div
      ref={dropZoneRef}
      className={styles.uploadSection}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <p>{t("upload_prompt")}</p>
    </div>
  );
}
