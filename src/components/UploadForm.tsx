"use client";

import { useCallback, useRef, useState } from "react";

const ALLOWED_EXTENSIONS = [
  ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".opus",
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv",
];

const MAX_SIZE_MB = 500;

interface UploadFormProps {
  onSubmitFile: (file: File) => void;
  onSubmitUrl: (url: string) => void;
  disabled: boolean;
}

export default function UploadForm({ onSubmitFile, onSubmitUrl, disabled }: UploadFormProps) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type "${ext}". Accepted formats: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_SIZE_MB} MB.`;
    }
    if (file.size === 0) {
      return "File is empty.";
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setFileError(null);
      const error = validateFile(file);
      if (error) {
        setFileError(error);
        return;
      }
      onSubmitFile(file);
    },
    [validateFile, onSubmitFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [handleFile]
  );

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setUrlError(null);
      const trimmed = youtubeUrl.trim();
      if (!trimmed) {
        setUrlError("Please enter a YouTube URL.");
        return;
      }
      // Basic client-side check
      const isYoutube =
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/.test(trimmed) ||
        /^https?:\/\/youtu\.be\//.test(trimmed) ||
        /^https?:\/\/(www\.)?youtube\.com\/shorts\//.test(trimmed) ||
        /^https?:\/\/music\.youtube\.com\/watch\?v=/.test(trimmed);

      if (!isYoutube) {
        setUrlError("Please enter a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)");
        return;
      }
      onSubmitUrl(trimmed);
    },
    [youtubeUrl, onSubmitUrl]
  );

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* File upload area */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload an audio or video file
        </label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-10 text-center cursor-pointer
            transition-colors duration-150
            ${dragOver
              ? "border-gray-900 bg-gray-50"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50"
            }
            ${disabled ? "opacity-50 pointer-events-none" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={handleFileInput}
            disabled={disabled}
          />
          <div className="space-y-2">
            <svg
              className="mx-auto h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">Click to browse</span>{" "}
              or drag and drop
            </p>
            <p className="text-xs text-gray-400">
              MP3, WAV, FLAC, MP4, MOV, and more — up to {MAX_SIZE_MB} MB
            </p>
          </div>
        </div>
        {fileError && (
          <p className="mt-2 text-sm text-red-600">{fileError}</p>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* YouTube URL input */}
      <div>
        <label
          htmlFor="youtube-url"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Paste a YouTube link
        </label>
        <form onSubmit={handleUrlSubmit} className="flex gap-3">
          <input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => {
              setYoutubeUrl(e.target.value);
              setUrlError(null);
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={disabled}
            className={`
              flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm
              placeholder:text-gray-400 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-shadow duration-150
            `}
          />
          <button
            type="submit"
            disabled={disabled || !youtubeUrl.trim()}
            className={`
              rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white
              hover:bg-gray-800 active:bg-gray-950
              focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150
            `}
          >
            Submit
          </button>
        </form>
        {urlError && (
          <p className="mt-2 text-sm text-red-600">{urlError}</p>
        )}
      </div>
    </div>
  );
}
