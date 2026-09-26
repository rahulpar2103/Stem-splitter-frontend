/** API client for communicating with the FastAPI backend. */

import type { JobStatusResponse, StemsResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // Use default message
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

/** Submit an uploaded file for stem separation. */
export async function submitUpload(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/jobs/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await handleResponse<{ job_id: string }>(res);
  return data.job_id;
}

/** Submit a YouTube URL for stem separation. */
export async function submitYouTubeUrl(url: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/jobs/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const data = await handleResponse<{ job_id: string }>(res);
  return data.job_id;
}

/** Poll the status of a job. */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  return handleResponse<JobStatusResponse>(res);
}

/** Get all previous jobs. */
export async function getAllJobs(): Promise<JobStatusResponse[]> {
  const res = await fetch(`${API_BASE}/api/jobs`);
  return handleResponse<JobStatusResponse[]>(res);
}

/** Delete a job and its files. */
export async function deleteJob(jobId: string): Promise<{ status: string; job_id: string }> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
    method: "DELETE",
  });
  return handleResponse<{ status: string; job_id: string }>(res);
}

/** Rename a job/project. */
export async function renameJob(jobId: string, name: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleResponse<JobStatusResponse>(res);
}

/** Get the list of stems for a completed job. */
export async function getStems(jobId: string): Promise<StemsResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/stems`);
  return handleResponse<StemsResponse>(res);
}

/** Build a full URL for streaming a stem. */
export function getStemStreamUrl(jobId: string, stemName: string): string {
  return `${API_BASE}/api/jobs/${jobId}/stems/${stemName}?stream=true`;
}

/** Build a full URL for downloading a stem. */
export function getStemDownloadUrl(jobId: string, stemName: string): string {
  return `${API_BASE}/api/jobs/${jobId}/stems/${stemName}`;
}
