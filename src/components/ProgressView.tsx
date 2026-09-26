"use client";

import type { JobStatus } from "@/lib/types";

interface ProgressViewProps {
  status: JobStatus;
  sourceName: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; description: string; step: number }
> = {
  queued: {
    label: "Queued",
    description: "Your job is in the queue and will start shortly.",
    step: 0,
  },
  extracting_audio: {
    label: "Extracting Audio",
    description: "Downloading and converting audio to the right format…",
    step: 1,
  },
  detecting_key: {
    label: "Detecting Key",
    description: "Analyzing the musical key and scale of the track…",
    step: 2,
  },
  separating_stems: {
    label: "Separating Stems",
    description:
      "Running stem separation — this can take several minutes, especially on CPU. Hang tight.",
    step: 3,
  },
};

const TOTAL_STEPS = 4;

export default function ProgressView({ status, sourceName }: ProgressViewProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const progressPercent = ((config.step + 0.5) / TOTAL_STEPS) * 100;

  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6">
      {/* Source info */}
      <p className="text-sm text-gray-500 truncate">
        Processing: <span className="font-medium text-gray-700">{sourceName}</span>
      </p>

      {/* Progress bar */}
      <div className="space-y-3">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex justify-between text-xs text-gray-400">
          {Object.values(STATUS_CONFIG).map((s) => (
            <span
              key={s.label}
              className={s.step <= config.step ? "text-gray-900 font-medium" : ""}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Current status */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin h-4 w-4 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700">{config.label}</span>
        </div>
        <p className="text-sm text-gray-500">{config.description}</p>
      </div>
    </div>
  );
}
