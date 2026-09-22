"use client";

import { useRef, useState } from "react";
import type { ConvertResult } from "@/lib/api-contract";
import { convertDocument } from "@/lib/api-client";
import { MAX_FILE_SIZE_BYTES, formatFileSize } from "@/lib/limits";

interface UploadPanelProps {
  onConverted: (results: ConvertResult[]) => void;
  onError: (message: string) => void;
  compact?: boolean;
  hasFile?: boolean;
  multiple?: boolean;
  className?: string;
  title?: string;
}

type UploadStatus = "idle" | "uploading" | "success";

export function UploadPanel({ onConverted, onError, compact = false, hasFile = false, multiple = false, className = "", title }: UploadPanelProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    setFileName(files.map((file) => file.name).join("、"));
    const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversizedFile) {
      setStatus("idle");
      onError(`${oversizedFile.name} 超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)} 大小限制。`);
      return;
    }

    setStatus("uploading");
    try {
      const responses = await Promise.all(files.map((file) => convertDocument(file)));
      const failedIndex = responses.findIndex((response) => !response.ok || !response.data);
      if (failedIndex >= 0) {
        onError(responses[failedIndex].error?.message ?? `${files[failedIndex].name} 转换失败，请重试。`);
        setStatus("idle");
        return;
      }

      setStatus("success");
      onConverted(responses.map((response) => response.data!).filter(Boolean));
    } catch {
      setStatus("idle");
      onError("无法连接文本转换服务，请稍后重试。");
    }
  };

  const openFilePicker = () => {
    if (status !== "uploading") fileInputRef.current?.click();
  };

  return (
    <div className={`upload-box ${compact ? "upload-box-compact" : ""} ${className}`.trim()}>
      <button className="upload-control" type="button" onClick={openFilePicker} disabled={status === "uploading"}>
        <span className="upload-control-title">
          {status === "uploading" ? `解析中...${fileName ? fileName : ""}` : title ?? (compact ? (hasFile ? "重新上传" : "上传访谈文件") : "选择访谈文件")}
        </span>
        {!compact && status !== "uploading" && <span className="upload-control-meta">仅支持 .docx、文字型 .pdf，最大 {formatFileSize(MAX_FILE_SIZE_BYTES)}</span>}
      </button>
      <input
        ref={fileInputRef}
        className="upload-file-input"
        id="document-upload"
        type="file"
        multiple={multiple}
        accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
        onChange={handleFileChange}
        disabled={status === "uploading"}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="upload-status" aria-live="polite">
        {status === "success" && <span className="success-text">已完成文本提取，进入核对阶段。</span>}
        {status === "idle" && <span className="muted">原始文件只在本次请求中处理，不写入项目数据库或文件存储。</span>}
      </div>
    </div>
  );
}
