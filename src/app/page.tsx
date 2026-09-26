"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadForm from "@/components/UploadForm";
import ProgressView from "@/components/ProgressView";
import ErrorView from "@/components/ErrorView";
import ResultsView from "@/components/ResultsView";
import RecentJobs from "@/components/RecentJobs";
import { getJobStatus, submitUpload, submitYouTubeUrl } from "@/lib/api";
import type { JobStatus, JobStatusResponse, KeyInfo } from "@/lib/types";

type AppState = "input" | "processing" | "done" | "error";

const POLL_INTERVAL_MS = 2500;

export default function Home() {
  const [appState, setAppState] = useState<AppState>("input");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("queued");
  const [sourceName, setSourceName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const status = await getJobStatus(id);
        setJobStatus(status.status);

        if (status.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          setKeyInfo(status.key_info || null);
          setAppState("done");
        } else if (status.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage(status.error || "An unknown error occurred.");
          setAppState("error");
        }
      } catch {
        // Don't crash on a single poll failure — just retry next interval
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const handleSubmitFile = useCallback(
    async (file: File) => {
      setSubmitting(true);
      try {
        const id = await submitUpload(file);
        setJobId(id);
        setSourceName(file.name);
        setJobStatus("queued");
        setAppState("processing");
        startPolling(id);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to upload file."
        );
        setAppState("error");
      } finally {
        setSubmitting(false);
      }
    },
    [startPolling]
  );

  const handleSubmitUrl = useCallback(
    async (url: string) => {
      setSubmitting(true);
      try {
        const id = await submitYouTubeUrl(url);
        setJobId(id);
        setSourceName(url);
        setJobStatus("queued");
        setAppState("processing");
        startPolling(id);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to submit YouTube URL."
        );
        setAppState("error");
      } finally {
        setSubmitting(false);
      }
    },
    [startPolling]
  );

  const handleSelectRecentJob = useCallback((job: JobStatusResponse) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setJobId(job.id);
    setSourceName(job.source_name);
    setKeyInfo(job.key_info || null);
    setJobStatus(job.status);
    setAppState("done");
  }, []);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setAppState("input");
    setJobId(null);
    setJobStatus("queued");
    setSourceName("");
    setErrorMessage("");
    setSubmitting(false);
    setKeyInfo(null);
  }, []);

  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleReset}>
            <svg
              className="h-6 w-6 text-gray-800"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
              />
            </svg>
            <h1 className="text-base font-semibold text-gray-900">
              Stem Splitter
            </h1>
          </div>
          <div className="text-xs text-gray-400">
            NVIDIA GPU / CPU Ready
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        {appState === "input" && (
          <div className="w-full space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-gray-900">
                Split audio into stems
              </h2>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Upload an audio or video file, or paste a YouTube link.
                The audio will be separated into vocals, drums, bass, guitar, piano, and other.
              </p>
            </div>
            <UploadForm
              onSubmitFile={handleSubmitFile}
              onSubmitUrl={handleSubmitUrl}
              disabled={submitting}
            />

            {/* Recent / Saved tracks library */}
            <RecentJobs
              onSelectJob={handleSelectRecentJob}
              onDeleteActiveJob={handleReset}
              activeJobId={jobId}
            />
          </div>
        )}

        {appState === "processing" && (
          <ProgressView status={jobStatus} sourceName={sourceName} />
        )}

        {appState === "done" && jobId && (
          <div className="w-full space-y-8">
            <ResultsView
              jobId={jobId}
              sourceName={sourceName}
              keyInfo={keyInfo}
              onNewJob={handleReset}
              onRename={(newName) => setSourceName(newName)}
            />
            <RecentJobs
              onSelectJob={handleSelectRecentJob}
              onDeleteActiveJob={handleReset}
              activeJobId={jobId}
            />
          </div>
        )}

        {appState === "error" && (
          <div className="w-full space-y-8">
            <ErrorView message={errorMessage} onRetry={handleReset} />
            <RecentJobs
              onSelectJob={handleSelectRecentJob}
              onDeleteActiveJob={handleReset}
              activeJobId={jobId}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-3">
        <p className="text-center text-xs text-gray-400">
          Powered by Demucs · htdemucs_6s model
        </p>
      </footer>
    </main>
  );
}
