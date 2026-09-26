"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface WaveformCanvasProps {
  audioUrl: string;
  color: string;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  onSeek: (time: number) => void;
  height?: number;
  peaks?: number[];
}

// In-memory cache for decoded peak data
const peakCache = new Map<string, number[]>();

export default function WaveformCanvas({
  audioUrl,
  color,
  currentTime,
  duration,
  isMuted,
  onSeek,
  height = 72,
  peaks: serverPeaks,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>(() => {
    if (serverPeaks && serverPeaks.length > 0) return serverPeaks;
    return peakCache.get(audioUrl) || [];
  });
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Use server peaks if provided, or fetch & decode audio waveform peaks
  useEffect(() => {
    if (serverPeaks && serverPeaks.length > 0) {
      setPeaks(serverPeaks);
      return;
    }

    let cancelled = false;

    if (peakCache.has(audioUrl)) {
      setPeaks(peakCache.get(audioUrl)!);
      return;
    }

    const loadWaveform = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        // Use AudioContext to decode audio
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        // Extract peaks from channel data (e.g. 350 data points)
        const rawData = audioBuffer.getChannelData(0);
        const samples = 350;
        const blockSize = Math.floor(rawData.length / samples);
        const extractedPeaks: number[] = [];

        for (let i = 0; i < samples; i++) {
          const blockStart = blockSize * i;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[blockStart + j]);
          }
          extractedPeaks.push(sum / blockSize);
        }

        // Normalize peaks between 0.05 and 1.0
        const maxPeak = Math.max(...extractedPeaks) || 1;
        const normalized = extractedPeaks.map((p) => Math.max(0.04, p / maxPeak));

        peakCache.set(audioUrl, normalized);
        if (!cancelled) {
          setPeaks(normalized);
        }
        audioCtx.close();
      } catch {
        // Leave empty or generate subtle baseline if decoding fails
        if (!cancelled) {
          const fallback = Array.from({ length: 250 }, () => 0.08);
          setPeaks(fallback);
        }
      }
    };

    loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, serverPeaks]);

  // Draw waveform on canvas whenever currentTime, peaks, or dimensions change
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const canvasHeight = height;

    canvas.width = width * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, canvasHeight);

    // Draw subtle grid lines (beat markers) matching the light/website theme
    ctx.strokeStyle = "rgba(0, 0, 0, 0.04)";
    ctx.lineWidth = 1;
    const gridSpacing = width / 16;
    for (let x = gridSpacing; x < width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    if (peaks.length === 0) {
      // Loading pulse line
      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, canvasHeight / 2);
      ctx.lineTo(width, canvasHeight / 2);
      ctx.stroke();
      return;
    }

    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const progressX = progress * width;
    const numBars = peaks.length;
    const barWidth = width / numBars;
    const centerY = canvasHeight / 2;
    const maxBarHeight = canvasHeight * 0.88;

    // Draw peaks
    for (let i = 0; i < numBars; i++) {
      const x = i * barWidth;
      const peakVal = peaks[i];
      const barH = peakVal * (maxBarHeight / 2);

      const isPlayed = x <= progressX;

      if (isMuted) {
        ctx.fillStyle = isPlayed ? "rgba(156, 163, 175, 0.4)" : "rgba(203, 213, 225, 0.4)";
      } else if (isPlayed) {
        // Vibrant played color
        ctx.fillStyle = color;
      } else {
        // Unplayed color matching light clean theme
        ctx.fillStyle = "rgba(15, 23, 42, 0.18)";
      }

      // Draw mirrored bar from center
      const actualBarWidth = Math.max(1.5, barWidth - 1);
      ctx.fillRect(x, centerY - barH, actualBarWidth, barH * 2);
    }

    // Draw playhead vertical line
    if (progress > 0 && progress < 1) {
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(2, 132, 199, 0.5)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, canvasHeight);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    }
  }, [peaks, currentTime, duration, color, isMuted, height]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Handle canvas click / seek
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(ratio * duration);
    setHoverX(x);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoverX(null);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full h-full cursor-pointer select-none group flex items-center bg-slate-50/70 hover:bg-slate-50 transition-colors overflow-hidden"
      style={{ height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />

      {/* Hover position tooltip & vertical cursor line */}
      {hoverX !== null && hoverTime !== null && (
        <>
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-blue-500/40 pointer-events-none"
            style={{ left: `${hoverX}px` }}
          />
          <div
            className="absolute top-1 -translate-x-1/2 bg-gray-900 text-[10px] text-white px-1.5 py-0.5 rounded pointer-events-none shadow-sm z-10 tabular-nums"
            style={{ left: `${hoverX}px` }}
          >
            {formatTime(hoverTime)}
          </div>
        </>
      )}
    </div>
  );
}
