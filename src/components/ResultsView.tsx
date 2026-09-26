"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import type { KeyInfo, StemInfo } from "@/lib/types";
import { getStems, getStemStreamUrl, getStemDownloadUrl, renameJob } from "@/lib/api";
import WaveformCanvas from "./WaveformCanvas";

/** Stem Visual Configuration matching light theme */
interface StemConfig {
  icon: string;
  color: string;
  displayName: string;
}

const STEM_CONFIGS: Record<string, StemConfig> = {
  vocals: { icon: "🎤", color: "#0284c7", displayName: "Vocals" },
  drums: { icon: "🥁", color: "#0d9488", displayName: "Drums" },
  bass: { icon: "🎸", color: "#9333ea", displayName: "Bass" },
  guitar: { icon: "🎵", color: "#d97706", displayName: "Guitar" },
  piano: { icon: "🎹", color: "#4f46e5", displayName: "Piano" },
  other: { icon: "🎶", color: "#059669", displayName: "Other" },
};

const ALL_KEYS = [
  "C major", "C minor", "C# / Db major", "C# / Db minor",
  "D major", "D minor", "D# / Eb major", "D# / Eb minor",
  "E major", "E minor", "F major", "F minor",
  "F# / Gb major", "F# / Gb minor", "G major", "G minor",
  "G# / Ab major", "G# / Ab minor", "A major", "A minor",
  "A# / Bb major", "A# / Bb minor", "B major", "B minor",
];

interface ResultsViewProps {
  jobId: string;
  sourceName: string;
  keyInfo: KeyInfo | null;
  onNewJob: () => void;
  onRename?: (newName: string) => void;
}

interface TrackState {
  volume: number; // 0 to 100
  isMuted: boolean;
  isSolo: boolean;
}

// Convert Web Audio API AudioBuffer to standard 16-bit PCM WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * blockAlign;
  const bufferLength = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export default function ResultsView({
  jobId,
  sourceName,
  keyInfo,
  onNewJob,
  onRename,
}: ResultsViewProps) {
  const [stems, setStems] = useState<StemInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Multi-track audio synchronization state
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tempo, setTempo] = useState(1.0);
  const [masterVolume, setMasterVolume] = useState(100);
  const [isMasterMuted, setIsMasterMuted] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isExportingMix, setIsExportingMix] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(keyInfo?.label || null);
  const [showKeyPicker, setShowKeyPicker] = useState(false);

  // Project Rename state
  const [currentTitle, setCurrentTitle] = useState(sourceName);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(sourceName);
  const [isRenaming, setIsRenaming] = useState(false);

  // Per-track states (volume, mute, solo)
  const [trackStates, setTrackStates] = useState<Record<string, TrackState>>({});

  useEffect(() => {
    setCurrentTitle(sourceName);
    setEditTitleValue(sourceName);
  }, [sourceName]);

  useEffect(() => {
    if (keyInfo?.label) {
      setSelectedKey(keyInfo.label);
    }
  }, [keyInfo]);

  // Load saved mix settings on mount / job change
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(`audio_stem_settings_${jobId}`);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (typeof saved.masterVolume === "number") setMasterVolume(saved.masterVolume);
        if (typeof saved.isMasterMuted === "boolean") setIsMasterMuted(saved.isMasterMuted);
        if (typeof saved.tempo === "number") setTempo(saved.tempo);
        if (typeof saved.selectedKey === "string") setSelectedKey(saved.selectedKey);
      }
    } catch {
      // ignore
    }
  }, [jobId]);

  // Fetch stems list and apply saved track states
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getStems(jobId);
        if (!cancelled) {
          setStems(data.stems);

          let savedTrackStates: Record<string, TrackState> | null = null;
          try {
            const savedRaw = localStorage.getItem(`audio_stem_settings_${jobId}`);
            if (savedRaw) {
              const parsed = JSON.parse(savedRaw);
              if (parsed.trackStates) savedTrackStates = parsed.trackStates;
            }
          } catch {
            // ignore
          }

          const initialStates: Record<string, TrackState> = {};
          data.stems.forEach((s) => {
            if (savedTrackStates && savedTrackStates[s.name]) {
              initialStates[s.name] = {
                volume: typeof savedTrackStates[s.name].volume === "number" ? savedTrackStates[s.name].volume : 100,
                isMuted: Boolean(savedTrackStates[s.name].isMuted),
                isSolo: Boolean(savedTrackStates[s.name].isSolo),
              };
            } else {
              initialStates[s.name] = { volume: 100, isMuted: false, isSolo: false };
            }
          });
          setTrackStates(initialStates);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stems.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Auto-save mix settings to localStorage whenever they change
  useEffect(() => {
    if (loading || stems.length === 0) return;
    try {
      const settings = {
        trackStates,
        masterVolume,
        isMasterMuted,
        tempo,
        selectedKey,
      };
      localStorage.setItem(`audio_stem_settings_${jobId}`, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [jobId, trackStates, masterVolume, isMasterMuted, tempo, selectedKey, loading, stems.length]);

  // Handle Rename Project
  const handleSaveRename = async () => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || trimmed === currentTitle) {
      setIsEditingTitle(false);
      return;
    }

    setIsRenaming(true);
    try {
      await renameJob(jobId, trimmed);
      setCurrentTitle(trimmed);
      setIsEditingTitle(false);
      if (onRename) onRename(trimmed);
    } catch (err) {
      alert("Failed to rename project: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsRenaming(false);
    }
  };

  // Compute effective volumes
  useEffect(() => {
    const hasAnySolo = Object.values(trackStates).some((t) => t.isSolo);

    stems.forEach((stem) => {
      const audio = audioRefs.current[stem.name];
      if (!audio) return;

      const track = trackStates[stem.name] || { volume: 100, isMuted: false, isSolo: false };
      let effectiveVol = 0;

      if (isMasterMuted) {
        effectiveVol = 0;
      } else if (hasAnySolo) {
        effectiveVol = track.isSolo && !track.isMuted ? (track.volume / 100) * (masterVolume / 100) : 0;
      } else {
        effectiveVol = track.isMuted ? 0 : (track.volume / 100) * (masterVolume / 100);
      }

      audio.volume = Math.max(0, Math.min(1, effectiveVol));
    });
  }, [trackStates, masterVolume, isMasterMuted, stems]);

  // Sync playback rate when tempo changes
  useEffect(() => {
    Object.values(audioRefs.current).forEach((audio) => {
      if (audio) audio.playbackRate = tempo;
    });
  }, [tempo]);

  // Master Play / Pause
  const togglePlayPause = useCallback(() => {
    const audios = Object.values(audioRefs.current).filter(Boolean);
    if (audios.length === 0) return;

    if (isPlaying) {
      audios.forEach((a) => a.pause());
      setIsPlaying(false);
    } else {
      audios.forEach((a) => {
        a.currentTime = currentTime;
        a.playbackRate = tempo;
        a.play().catch(() => {});
      });
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, tempo]);

  // Keyboard spacebar shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body && !isEditingTitle) {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayPause, isEditingTitle]);

  const handleTimeUpdate = (stemName: string) => {
    const audio = audioRefs.current[stemName];
    if (!audio) return;

    const isPrimary = stemName === stems[0]?.name;
    if (isPrimary) {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && duration === 0) {
        setDuration(audio.duration);
      }
      if (audio.ended) {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = useCallback((targetTime: number) => {
    const clamped = Math.max(0, Math.min(duration || 9999, targetTime));
    setCurrentTime(clamped);
    Object.values(audioRefs.current).forEach((audio) => {
      if (audio) audio.currentTime = clamped;
    });
  }, [duration]);

  const handleTrackVolumeChange = (stemName: string, val: number) => {
    setTrackStates((prev) => ({
      ...prev,
      [stemName]: { ...prev[stemName], volume: val },
    }));
  };

  const toggleTrackMute = (stemName: string) => {
    setTrackStates((prev) => ({
      ...prev,
      [stemName]: { ...prev[stemName], isMuted: !prev[stemName]?.isMuted },
    }));
  };

  const toggleTrackSolo = (stemName: string) => {
    setTrackStates((prev) => ({
      ...prev,
      [stemName]: { ...prev[stemName], isSolo: !prev[stemName]?.isSolo },
    }));
  };

  // Export Custom Mix
  const handleExportCustomMix = async () => {
    if (stems.length === 0 || isExportingMix) return;
    setIsExportingMix(true);
    setShowExportMenu(false);

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();

      const hasAnySolo = Object.values(trackStates).some((t) => t.isSolo);
      const activeStemsWithGains: { stem: StemInfo; gain: number }[] = [];

      stems.forEach((stem) => {
        const track = trackStates[stem.name] || { volume: 100, isMuted: false, isSolo: false };
        let gain = 0;
        if (hasAnySolo) {
          gain = track.isSolo && !track.isMuted ? (track.volume / 100) * (masterVolume / 100) : 0;
        } else {
          gain = track.isMuted ? 0 : (track.volume / 100) * (masterVolume / 100);
        }
        if (gain > 0.001) {
          activeStemsWithGains.push({ stem, gain });
        }
      });

      if (activeStemsWithGains.length === 0) {
        alert("All tracks are muted or set to zero volume.");
        setIsExportingMix(false);
        return;
      }

      const decodedTracks = await Promise.all(
        activeStemsWithGains.map(async ({ stem, gain }) => {
          const url = getStemStreamUrl(jobId, stem.name);
          const res = await fetch(url);
          const arrayBuffer = await res.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(arrayBuffer);
          return { decoded, gain };
        })
      );

      const maxOriginalDuration = Math.max(...decodedTracks.map((t) => t.decoded.duration));
      const sampleRate = decodedTracks[0]?.decoded.sampleRate || 44100;
      const adjustedDuration = maxOriginalDuration / tempo;
      const renderLengthSamples = Math.ceil(sampleRate * adjustedDuration);

      const OfflineCtx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      const offlineCtx = new OfflineCtx(2, renderLengthSamples, sampleRate);

      decodedTracks.forEach(({ decoded, gain }) => {
        const source = offlineCtx.createBufferSource();
        source.buffer = decoded;
        source.playbackRate.value = tempo;

        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = gain;

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);
        source.start(0);
      });

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);

      const link = document.createElement("a");
      link.href = URL.createObjectURL(wavBlob);
      const cleanTitle = currentTitle.replace(/\.[^/.]+$/, "").substring(0, 40);
      const tempoStr = tempo !== 1.0 ? `_${tempo.toFixed(1)}x` : "";
      link.download = `${cleanTitle}_custom_mix${tempoStr}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      audioCtx.close();
    } catch (err) {
      alert("Failed to export custom mix: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsExportingMix(false);
    }
  };

  // Download all stems as a ZIP file
  const handleDownloadAllZip = async () => {
    if (stems.length === 0 || isExportingZip) return;
    setIsExportingZip(true);
    setShowExportMenu(false);
    try {
      const zip = new JSZip();
      const folder = zip.folder("stems") || zip;

      const downloads = stems.map(async (stem) => {
        const url = getStemDownloadUrl(jobId, stem.name);
        const res = await fetch(url);
        const blob = await res.blob();
        folder.file(`${stem.name}.mp3`, blob);
      });

      await Promise.all(downloads);
      const content = await zip.generateAsync({ type: "blob" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      const cleanTitle = currentTitle.replace(/\.[^/.]+$/, "").substring(0, 40);
      link.download = `${cleanTitle}_stems.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Failed to export ZIP file: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsExportingZip(false);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-3">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading multi-track studio…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={onNewJob}
          className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Back to upload
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* Hidden audio elements for multi-track streaming */}
      {stems.map((stem) => (
        <audio
          key={stem.name}
          ref={(el) => {
            if (el) audioRefs.current[stem.name] = el;
          }}
          src={getStemStreamUrl(jobId, stem.name)}
          preload="auto"
          onTimeUpdate={() => handleTimeUpdate(stem.name)}
          onLoadedMetadata={(e) => {
            const target = e.target as HTMLAudioElement;
            if (target.duration && !isNaN(target.duration) && duration === 0) {
              setDuration(target.duration);
            }
          }}
        />
      ))}

      {/* Top Header / Studio Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-gray-50/80 border-b border-gray-200">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xl shrink-0">
            🎛️
          </div>
          <div className="min-w-0">
            {/* Editable Title */}
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  autoFocus
                  disabled={isRenaming}
                  className="text-sm font-semibold text-gray-900 bg-white border border-blue-500 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveRename}
                  disabled={isRenaming}
                  className="p-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                  title="Save name"
                >
                  ✓
                </button>
                <button
                  onClick={() => setIsEditingTitle(false)}
                  className="p-1 rounded bg-gray-200 text-gray-700 text-xs hover:bg-gray-300"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group/title">
                <h2 className="text-sm font-semibold text-gray-900 truncate max-w-md">
                  {currentTitle}
                </h2>
                <button
                  onClick={() => {
                    setEditTitleValue(currentTitle);
                    setIsEditingTitle(true);
                  }}
                  className="text-gray-400 hover:text-blue-600 p-0.5 rounded opacity-70 group-hover/title:opacity-100 transition-opacity"
                  title="Rename project"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span>{stems.length} Stems</span>
              <span>•</span>
              <span className="text-blue-600 font-medium">Demucs 6s Model</span>
              {selectedKey && (
                <>
                  <span>•</span>
                  <button
                    onClick={() => setShowKeyPicker(!showKeyPicker)}
                    className="inline-flex items-center gap-1 text-amber-700 font-semibold hover:underline cursor-pointer"
                    title="Click to change/transpose key"
                  >
                    🎼 Key: {selectedKey} ▾
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons (Export Dropdown + New Track) */}
        <div className="flex items-center gap-2.5 relative">
          {/* Key Picker Dropdown Modal */}
          {showKeyPicker && (
            <div className="absolute top-12 left-0 w-64 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl p-2 z-50 text-xs">
              <div className="p-1.5 font-bold text-gray-600 border-b border-gray-100 mb-1 flex items-center justify-between">
                <span>Select Musical Key</span>
                <button
                  onClick={() => setShowKeyPicker(false)}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              {ALL_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setSelectedKey(k);
                    setShowKeyPicker(false);
                  }}
                  className={`
                    w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors
                    ${
                      selectedKey === k
                        ? "bg-amber-50 text-amber-900 font-bold"
                        : "text-gray-700 hover:bg-gray-50"
                    }
                  `}
                >
                  <span>{k}</span>
                  {selectedKey === k && <span>✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExportingZip || isExportingMix}
              className="
                inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold
                bg-gray-900 hover:bg-gray-800 active:bg-black text-white
                transition-colors duration-150 disabled:opacity-50 cursor-pointer shadow-sm
              "
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {isExportingMix
                ? "Rendering Mix…"
                : isExportingZip
                ? "Zipping Stems…"
                : "Export Audio ▾"}
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-11 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 z-50 text-xs">
                {/* Export Custom Mix */}
                <button
                  onClick={handleExportCustomMix}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 flex items-start gap-2.5 cursor-pointer group"
                >
                  <span className="text-base">🎚️</span>
                  <div>
                    <div className="font-semibold text-gray-900 group-hover:text-blue-600">
                      Export Custom Mix (.wav)
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Saves with current track volumes, mutes, solos & tempo
                    </div>
                  </div>
                </button>

                <div className="h-[1px] bg-gray-100 my-1" />

                {/* Export All Stems as ZIP */}
                <button
                  onClick={handleDownloadAllZip}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 flex items-start gap-2.5 cursor-pointer group"
                >
                  <span className="text-base">📦</span>
                  <div>
                    <div className="font-semibold text-gray-900 group-hover:text-blue-600">
                      Download All Stems (.zip)
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Downloads all 6 isolated tracks in a zip archive
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onNewJob}
            className="
              inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium
              bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 border border-gray-300
              transition-colors duration-150 cursor-pointer shadow-sm
            "
          >
            + New Track
          </button>
        </div>
      </div>

      {/* Timeline Ruler Header */}
      <div className="flex border-b border-gray-200 bg-gray-100/70 select-none text-[11px] text-gray-600">
        <div className="w-64 shrink-0 px-4 py-2 border-r border-gray-200 font-semibold flex items-center justify-between text-gray-500">
          <span>TRACKS</span>
          <span className="text-[10px] text-gray-400">M / S / VOL</span>
        </div>
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            handleSeek(ratio * duration);
          }}
          className="flex-1 relative h-8 flex items-center px-2 cursor-pointer group"
        >
          {/* Measure bar ticks */}
          <div className="flex justify-between w-full text-[10px] text-gray-400 font-mono">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <span>{i * 4 + 1}</span>
                <div className="w-[1px] h-1.5 bg-gray-300 mt-0.5" />
              </div>
            ))}
          </div>

          {/* Playhead Marker on Ruler */}
          {duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-3 -translate-x-1/2 flex flex-col items-center pointer-events-none"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            >
              <div className="w-3 h-3 bg-blue-600 rotate-45 -translate-y-1 shadow-sm" />
              <div className="w-[2px] flex-1 bg-blue-600" />
            </div>
          )}
        </div>
      </div>

      {/* Multi-Track DAW Lanes */}
      <div className="divide-y divide-gray-200 bg-white">
        {stems.map((stem) => {
          const config = STEM_CONFIGS[stem.name] || {
            icon: "🎶",
            color: "#0284c7",
            displayName: stem.display_name,
          };
          const trackState = trackStates[stem.name] || { volume: 100, isMuted: false, isSolo: false };
          const streamUrl = getStemStreamUrl(jobId, stem.name);

          return (
            <div key={stem.name} className="flex items-stretch group hover:bg-gray-50/50 transition-colors">
              {/* Left Track Control Panel */}
              <div className="w-64 shrink-0 p-3.5 border-r border-gray-200 bg-white flex flex-col justify-between gap-2.5 select-none">
                {/* Stem Name & Icon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{config.icon}</span>
                    <span className="text-xs font-semibold text-gray-900 truncate">
                      {config.displayName}
                    </span>
                  </div>

                  {/* Individual Stem Download Button */}
                  <a
                    href={getStemDownloadUrl(jobId, stem.name)}
                    download
                    title={`Download ${config.displayName} stem`}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </a>
                </div>

                {/* Volume Slider + Mute/Solo Buttons */}
                <div className="flex items-center gap-2">
                  {/* Mute Button (M) */}
                  <button
                    onClick={() => toggleTrackMute(stem.name)}
                    title={trackState.isMuted ? "Unmute" : "Mute"}
                    className={`
                      w-6 h-6 rounded text-[11px] font-bold flex items-center justify-center transition-all duration-150 cursor-pointer
                      ${
                        trackState.isMuted
                          ? "bg-red-500 text-white shadow-sm"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                      }
                    `}
                  >
                    M
                  </button>

                  {/* Solo Button (S) */}
                  <button
                    onClick={() => toggleTrackSolo(stem.name)}
                    title={trackState.isSolo ? "Unsolo" : "Solo"}
                    className={`
                      w-6 h-6 rounded text-[11px] font-bold flex items-center justify-center transition-all duration-150 cursor-pointer
                      ${
                        trackState.isSolo
                          ? "bg-amber-400 text-gray-950 font-extrabold shadow-sm"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                      }
                    `}
                  >
                    S
                  </button>

                  {/* Volume Slider with Accent */}
                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={trackState.volume}
                      disabled={trackState.isMuted}
                      onChange={(e) => handleTrackVolumeChange(stem.name, Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-[10px] text-gray-500 w-7 text-right tabular-nums font-mono">
                      {trackState.volume}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Waveform Canvas Lane */}
              <div className="flex-1 relative bg-slate-50/70 overflow-hidden">
                <WaveformCanvas
                  audioUrl={streamUrl}
                  color={config.color}
                  currentTime={currentTime}
                  duration={duration}
                  isMuted={trackState.isMuted}
                  onSeek={handleSeek}
                  height={72}
                  peaks={stem.peaks}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Master Bottom Transport Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white border-t border-gray-200 shadow-sm">
        {/* Left Track Info & Time */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-lg shrink-0">
            🎵
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate max-w-[220px]">
              {currentTitle}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono mt-0.5">
              <span className="text-blue-600 font-bold">{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Center Master Playback Controls */}
        <div className="flex items-center gap-3">
          {/* Rewind to 0 */}
          <button
            onClick={() => handleSeek(0)}
            title="Rewind to start"
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.5 12l8.5 6V6l-8.5 6zm-8 6h2V6H1.5v12z" />
            </svg>
          </button>

          {/* Jump Backward 5s */}
          <button
            onClick={() => handleSeek(currentTime - 5)}
            title="Back 5s"
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Main Master Play / Pause Button */}
          <button
            onClick={togglePlayPause}
            className="
              w-12 h-12 rounded-full bg-gray-900 hover:bg-gray-800 active:bg-black
              text-white flex items-center justify-center shadow-md shadow-gray-900/20
              transition-all duration-150 cursor-pointer transform active:scale-95
            "
            title={isPlaying ? "Pause (Space)" : "Play All Tracks (Space)"}
          >
            {isPlaying ? (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Jump Forward 5s */}
          <button
            onClick={() => handleSeek(currentTime + 5)}
            title="Forward 5s"
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Right Controls: Master Volume, Tempo, Key */}
        <div className="flex items-center gap-4">
          {/* Master Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMasterMuted(!isMasterMuted)}
              className="text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
              title={isMasterMuted ? "Unmute Master" : "Mute Master"}
            >
              {isMasterMuted || masterVolume === 0 ? (
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-3.72a.75.75 0 0 1 1.28.53v14.88a.75.75 0 0 1-1.28.53l-4.72-3.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-3.72a.75.75 0 0 1 1.28.53v14.88a.75.75 0 0 1-1.28.53l-4.72-3.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMasterMuted ? 0 : masterVolume}
              onChange={(e) => {
                setMasterVolume(Number(e.target.value));
                if (isMasterMuted) setIsMasterMuted(false);
              }}
              className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Master Tempo Stepper */}
          <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-lg p-1">
            <button
              onClick={() => setTempo((t) => Math.max(0.5, Math.round((t - 0.1) * 10) / 10))}
              disabled={tempo <= 0.5}
              className="w-5 h-5 rounded text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-200 flex items-center justify-center cursor-pointer disabled:opacity-30"
              title="Decrease tempo"
            >
              −
            </button>
            <button
              onClick={() => setTempo(1.0)}
              className="px-1 text-xs font-mono font-semibold text-blue-600 hover:underline cursor-pointer"
              title="Reset to 1.0x"
            >
              {tempo.toFixed(1)}×
            </button>
            <button
              onClick={() => setTempo((t) => Math.min(2.0, Math.round((t + 0.1) * 10) / 10))}
              disabled={tempo >= 2.0}
              className="w-5 h-5 rounded text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-200 flex items-center justify-center cursor-pointer disabled:opacity-30"
              title="Increase tempo"
            >
              +
            </button>
          </div>

          {/* Key Scale Badge with Click to change */}
          {selectedKey && (
            <button
              onClick={() => setShowKeyPicker(!showKeyPicker)}
              className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
              title="Click to change or transpose key"
            >
              <span>🎼</span>
              <span>{selectedKey}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
