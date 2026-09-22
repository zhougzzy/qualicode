// Keep the upload cap below common serverless request-body limits.
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50_000;
export const SUPPORTED_EXTENSIONS = [".docx", ".pdf"] as const;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSupportedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}
