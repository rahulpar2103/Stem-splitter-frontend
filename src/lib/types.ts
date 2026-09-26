/** Shared types for the Audio Stem Splitter app. */

export type JobStatus =
  | "queued"
  | "extracting_audio"
  | "detecting_key"
  | "separating_stems"
  | "done"
  | "failed";

export interface KeyInfo {
  key: string | null;
  scale: string | null;
  label: string;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  error: string | null;
  source_type: "upload" | "youtube";
  source_name: string;
  stems: string[];
  key_info: KeyInfo | null;
  created_at: string;
  updated_at: string;
}

export interface StemInfo {
  name: string;
  display_name: string;
  download_url: string;
  stream_url: string;
  peaks?: number[];
}

export interface StemsResponse {
  stems: StemInfo[];
}

