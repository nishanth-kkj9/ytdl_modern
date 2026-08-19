export type DownloadStatus =
  | "queued"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export type ContentMode = "audio" | "video";

export interface FormatInfo {
  format_id: string;
  ext: string;
  resolution?: string;
  filesize?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  vbr?: number;
  tbr?: number;
  channels?: number;
  audio_sample_rate?: number;
}

export interface ProbeInfo {
  id: string;
  title: string;
  uploader: string;
  duration?: number;
  thumbnail?: string;
  url: string;
  description?: string;
  formats?: FormatInfo[];
}

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  format: string;
  quality: string;
  status: DownloadStatus;
  progress: number;
  downloaded: number;
  total: number;
  speed: number;
  type: ContentMode;
  message?: string;
  filepath?: string;
  thumbnail?: string;
}

export interface MetadataResult {
  fields: Record<string, string>;
  verify: Record<string, boolean>;
  engine: string;
  container: string;
  cover_art: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  fmt: string;
  size: string;
  duration: string;
  url: string;
  downloaded_at: string;
  filepath: string;
  type: ContentMode;
  status?: DownloadStatus;
  thumbnail?: string;
}
