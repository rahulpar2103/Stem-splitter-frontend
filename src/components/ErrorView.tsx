"use client";

interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-5">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
        <svg
          className="h-6 w-6 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-gray-900">
          Something went wrong
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
      </div>

      <button
        onClick={onRetry}
        className="
          inline-flex items-center gap-2 rounded-lg border border-gray-300
          px-4 py-2 text-sm font-medium text-gray-700
          hover:bg-gray-50 active:bg-gray-100
          focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2
          transition-colors duration-150
        "
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
          />
        </svg>
        Try again
      </button>
    </div>
  );
}
