"use client";

import { useEffect, useState } from "react";
import type { JobStatusResponse } from "@/lib/types";
import { getAllJobs, deleteJob } from "@/lib/api";

interface RecentJobsProps {
  onSelectJob: (job: JobStatusResponse) => void;
  onDeleteActiveJob?: (jobId: string) => void;
  activeJobId?: string | null;
}

export default function RecentJobs({
  onSelectJob,
  onDeleteActiveJob,
  activeJobId,
}: RecentJobsProps) {
  const [jobs, setJobs] = useState<JobStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const data = await getAllJobs();
      const completed = data.filter((j) => j.status === "done");
      setJobs(completed);
    } catch {
      // Non-critical, ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [activeJobId]);

  const handleDelete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(jobId);
    try {
      await deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (activeJobId === jobId && onDeleteActiveJob) {
        onDeleteActiveJob(jobId);
      }
    } catch (err) {
      alert("Failed to delete track: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || jobs.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto pt-6 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
        >
          <span>🎵 Previous Tracks ({jobs.length})</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <span className="text-xs text-gray-400">Saved across restarts</span>
      </div>

      {isOpen && (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => onSelectJob(job)}
              className={`
                flex items-center justify-between p-3 rounded-lg border text-left cursor-pointer transition-all duration-150 group
                ${
                  activeJobId === job.id
                    ? "border-gray-900 bg-gray-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }
              `}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-base shrink-0">
                  {job.source_type === "youtube" ? "🔴" : "📁"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate max-w-md">
                    {job.source_name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <span>{new Date(job.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>6 stems</span>
                    {job.key_info && job.key_info.label && (
                      <>
                        <span>•</span>
                        <span className="text-gray-600 font-medium">{job.key_info.label}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md group-hover:bg-gray-200">
                  Open Stems →
                </span>

                {/* Delete Button */}
                <button
                  onClick={(e) => handleDelete(e, job.id)}
                  disabled={deletingId === job.id}
                  title="Delete track and stems"
                  className="
                    p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50
                    transition-colors duration-150 cursor-pointer disabled:opacity-40
                  "
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
