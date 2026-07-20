"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls, { Events, LevelSwitchedData } from "hls.js";
import type { ChannelSource } from "@/lib/channelMatch";

// An http:// stream can never load from an https:// page -- browsers block
// it as mixed content no matter what. Route only that case through our
// same-origin proxy; https:// streams (the majority) stay direct so most
// playback never touches our server.
function resolvePlaybackUrl(url: string): string {
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http://")) {
    return `/api/stream?url=${encodeURIComponent(url)}`;
  }
  return url;
}

// Retrying the same source uses growing delays instead of a fixed one, so a
// server that's just momentarily overloaded gets more breathing room on
// later attempts instead of being hammered at a constant rate.
const RETRY_DELAYS_MS = [800, 2000, 4000];
const MAX_RETRIES_PER_SOURCE = RETRY_DELAYS_MS.length;
const HLS_RECOVERY_DELAYS_MS = [500, 1500, 3000, 5000];
const MAX_HLS_RECOVERIES = HLS_RECOVERY_DELAYS_MS.length;
const FULL_RETRY_DELAY_MS = 6000;

interface VideoPlayerProps {
  sources: ChannelSource[];
  live: boolean;
  onPickAnother: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

type PlayerStatus = "idle" | "loading" | "playing" | "buffering" | "error";

// `sources` is expected to change identity only when the user picks a new
// channel or a different source for the same channel -- callers key this
// component on that so retry/fallback state below always starts fresh.
export default function VideoPlayer({ sources, live, onPickAnother, onNext, onPrev }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usedFullRetryRef = useRef(false);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [qualityLabel, setQualityLabel] = useState("Auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Checked once per mount (not per source) since browser capability
  // doesn't change -- avoids setting state purely as a side effect.
  const [browserSupportsHls] = useState(() => {
    if (typeof window === "undefined") return true;
    const probe = document.createElement("video");
    return Boolean(probe.canPlayType("application/vnd.apple.mpegurl")) || Hls.isSupported();
  });

  const current: ChannelSource | null = sources[sourceIndex] ?? null;

  // Sets up playback for the current source: retries it a few times with
  // growing delays, then automatically advances to the next source (the
  // same channel from a different list) if there is one. If every source
  // fails, it takes one more full pass from the top before finally giving
  // up -- covers a transient blip that took out every source at once.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current || !browserSupportsHls) return;

    let cancelled = false;
    let retries = 0;
    let hlsRecoveries = 0;

    const cleanupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const fail = () => {
      if (cancelled) return;
      cleanupHls();

      if (retries < MAX_RETRIES_PER_SOURCE) {
        const delay = RETRY_DELAYS_MS[retries];
        retries += 1;
        setStatusNote(`Reintentando "${current.playlistName}" (intento ${retries + 1} de ${MAX_RETRIES_PER_SOURCE + 1})…`);
        setTimeout(() => {
          if (!cancelled) attemptPlayback();
        }, delay);
        return;
      }

      if (sourceIndex + 1 < sources.length) {
        const next = sources[sourceIndex + 1];
        setStatusNote(`"${current.playlistName}" no respondió, probando "${next.playlistName}"…`);
        setTimeout(() => {
          if (!cancelled) setSourceIndex((i) => i + 1);
        }, RETRY_DELAYS_MS[0]);
        return;
      }

      if (!usedFullRetryRef.current) {
        usedFullRetryRef.current = true;
        setStatusNote("Ninguna fuente respondió, reintentando desde el principio…");
        setTimeout(() => {
          if (cancelled) return;
          if (sourceIndex === 0) setRetryToken((t) => t + 1);
          else setSourceIndex(0);
        }, FULL_RETRY_DELAY_MS);
        return;
      }

      setStatus("error");
      setStatusNote(null);
      setErrorMessage(
        sources.length > 1
          ? "Ninguna de las fuentes disponibles para este canal está funcionando ahora mismo."
          : "Este canal no está disponible en este momento."
      );
    };

    const attemptPlayback = () => {
      if (cancelled) return;
      setStatus("loading");
      setErrorMessage(null);
      setQualityLabel("Auto");
      cleanupHls();

      const url = resolvePlaybackUrl(current.channel.streamUrl);
      const canPlayNative = video.canPlayType("application/vnd.apple.mpegurl");

      if (canPlayNative) {
        video.src = url;
        video.addEventListener("loadedmetadata", () => video.play().catch(() => undefined), {
          once: true,
        });
        video.addEventListener("error", () => fail(), { once: true });
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          // Cap requested resolution to the actual player size, and let ABR
          // pick the best quality that fits available bandwidth -- the same
          // "start fast, adapt up" behavior YouTube uses instead of always
          // requesting the highest bitrate.
          capLevelToPlayerSize: true,
          startLevel: -1,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 90,
          enableWorker: true,
        });
        hlsRef.current = hls;

        hls.on(Events.MANIFEST_PARSED, () => {
          setStatusNote(null);
          video.play().catch(() => undefined);
        });

        hls.on(Events.LEVEL_SWITCHED, (_evt, data: LevelSwitchedData) => {
          const level = hls.levels[data.level];
          if (level?.height) setQualityLabel(`Auto (${level.height}p)`);
        });

        hls.on(Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          const recoverable =
            data.type === Hls.ErrorTypes.NETWORK_ERROR || data.type === Hls.ErrorTypes.MEDIA_ERROR;
          if (recoverable && hlsRecoveries < MAX_HLS_RECOVERIES) {
            const delay = HLS_RECOVERY_DELAYS_MS[hlsRecoveries];
            hlsRecoveries += 1;
            setTimeout(() => {
              if (cancelled) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else hls.recoverMediaError();
            }, delay);
            return;
          }
          fail();
        });

        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        fail();
      }
    };

    attemptPlayback();

    return () => {
      cancelled = true;
      cleanupHls();
      video.removeAttribute("src");
      video.load();
    };
  }, [current, sourceIndex, sources, browserSupportsHls, retryToken]);

  // Native <video> element events drive buffering/playing state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () => setStatus("buffering");
    const onPlaying = () => {
      setStatus("playing");
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
    };
  }, [current]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const changeVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
    setVolume(value);
    setIsMuted(value === 0);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen().catch(() => undefined);
  }, []);

  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 2800);
  }, []);

  const retryFromStart = useCallback(() => {
    usedFullRetryRef.current = false;
    setSourceIndex(0);
    setRetryToken((t) => t + 1);
  }, []);

  if (!browserSupportsHls) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-xl bg-neutral-900 px-6 text-center">
        <p className="font-medium text-white">Tu navegador no soporta la reproducción de HLS.</p>
        <p className="text-sm text-neutral-500">Prueba con una versión reciente de Chrome, Firefox, Edge o Safari.</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-neutral-900 text-neutral-500">
        Selecciona un canal para comenzar a ver
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      onMouseMove={wakeControls}
      onMouseLeave={() => setControlsVisible(false)}
    >
      <video ref={videoRef} className="h-full w-full" playsInline autoPlay onClick={togglePlay} />

      {onPrev && (
        <button
          onClick={onPrev}
          aria-label="Canal anterior"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
        >
          <PrevIcon />
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          aria-label="Canal siguiente"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
        >
          <NextIcon />
        </button>
      )}

      {(status === "loading" || status === "buffering") && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          {statusNote && <p className="max-w-xs text-center text-sm text-neutral-200">{statusNote}</p>}
          {status === "loading" && (
            <button
              onClick={onPickAnother}
              className="pointer-events-auto rounded-full bg-neutral-800/80 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
            >
              Elegir otro canal
            </button>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 px-6 text-center">
          <p className="text-lg font-medium text-white">{errorMessage}</p>
          <p className="text-sm text-neutral-400">
            Puedes reintentar, o elegir otro canal u otra lista si este stream sigue fallando.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              onClick={retryFromStart}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
            >
              Reintentar
            </button>
            <button
              onClick={onPickAnother}
              className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
            >
              Elegir otro canal
            </button>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/90 to-transparent px-4 py-3 transition-opacity duration-200 ${
          controlsVisible || !isPlaying ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className="text-white hover:text-red-500"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          onClick={toggleMute}
          aria-label={isMuted ? "Activar sonido" : "Silenciar"}
          className="text-white hover:text-red-500"
        >
          {isMuted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className="h-1 w-20 accent-red-600"
          aria-label="Volumen"
        />

        {live && (
          <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> EN VIVO
          </span>
        )}

        <span className="truncate text-sm text-white">{current.channel.name}</span>
        {sources.length > 1 && (
          <span className="hidden shrink-0 truncate text-xs text-neutral-400 sm:inline">
            ({current.playlistName})
          </span>
        )}

        <span className="ml-auto text-xs text-neutral-300">{qualityLabel}</span>

        <button
          onClick={toggleFullscreen}
          aria-label="Pantalla completa"
          className="text-white hover:text-red-500"
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05A4.48 4.48 0 0 0 16.5 12z" />
    </svg>
  );
}
function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.94 8.94 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
    </svg>
  );
}
function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}
function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
    </svg>
  );
}
