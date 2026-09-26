import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";

export type FileIconName =
  | "file"
  | "text"
  | "image"
  | "archive"
  | "video"
  | "audio"
  | "sheet"
  | "code";

function extensionOf(name: string | null | undefined): string {
  return (name ?? "").split(".").pop()?.toLowerCase() ?? "";
}

function categoryFor(
  name: string | null | undefined,
  mimeType?: string | null,
): FileIconName {
  const extension = extensionOf(name);
  const mime = (mimeType ?? "").toLowerCase();

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "svg", "webp"].includes(extension)) {
    return "image";
  }
  if (mime.startsWith("video/") || ["mp4", "avi", "mov", "mkv", "webm"].includes(extension)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "aac", "ogg", "flac"].includes(extension)) return "audio";
  if (mime.startsWith("text/") && extension !== "txt") return "code";
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return "archive";
  if (["xls", "xlsx", "csv", "ods"].includes(extension) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return "sheet";
  }
  if (["pdf", "doc", "docx", "odt", "rtf", "txt", "ppt", "pptx"].includes(extension) || mime.includes("pdf") || mime.includes("word") || mime.includes("presentation")) {
    return "text";
  }
  return "file";
}

const ICONS: Record<FileIconName, typeof File> = {
  file: File,
  text: FileText,
  image: FileImage,
  archive: FileArchive,
  video: FileVideo,
  audio: FileAudio,
  sheet: FileSpreadsheet,
  code: FileCode,
};

type Props = {
  name: string | null | undefined;
  mimeType?: string | null;
  /** Rendered inside a 32px `.resource-icon` / 34px `.folder-icon` slot. */
  className?: string;
};

/**
 * One icon family (Lucide) for every file, folder, action and status across
 * the product. File kind is derived from the extension first and the MIME
 * type second, because legacy archive rows often have generic MIME types.
 */
export default function FileIcon({ name, mimeType, className }: Props) {
  const Icon = ICONS[categoryFor(name, mimeType)];
  return <Icon className={className} aria-hidden="true" />;
}

export function FolderIcon({ className }: { className?: string }) {
  return <Folder className={className} aria-hidden="true" />;
}

export { categoryFor as fileIconCategory };
