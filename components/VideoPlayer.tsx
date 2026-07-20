"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls, { ErrorData, Events, LevelSwitchedData } from "hls.js";
import type { Channel } from "@/types/channel";

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

interface VideoPlayerProps {
  channel: Channel | null;
  onPickAnother: () => void;
}

type PlayerStatus = "idle" | "loading" | "playing" | "buffering" | "error";

export default function VideoPlayer({ channel, onPickAnother }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityLabel, setQualityLabel] = useState("Auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Checked once per mount (not per channel) since browser capability
  // doesn't change -- avoids setting state purely as a side effect.
  const [browserSupportsHls] = useState(() => {
    if (typeof window === "undefined") return true;
    const probe = document.createElement("video");
    return Boolean(probe.canPlayType("application/vnd.apple.mpegurl")) || Hls.isSupported();
  });

  // Set up playback whenever the selected channel changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel || !browserSupportsHls) return;

    setStatus("loading");
    setErrorMessage(null);
    setQualityLabel("Auto");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const canPlayNative = video.canPlayType("application/vnd.apple.mpegurl");

    if (canPlayNative) {
      video.src = resolvePlaybackUrl(channel.streamUrl);
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.play().catch(() => undefined);
        },
        { once: true }
      );
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
        video.play().catch(() => undefined);
      });

      hls.on(Events.LEVEL_SWITCHED, (_evt, data: LevelSwitchedData) => {
        const level = hls.levels[data.level];
        if (level?.height) setQualityLabel(`Auto (${level.height}p)`);
      });

      hls.on(Events.ERROR, (_evt, data: ErrorData) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            setStatus("error");
            setErrorMessage("Este canal no está disponible en este momento.");
            hls.destroy();
            hlsRef.current = null;
        }
      });

      hls.loadSource(resolvePlaybackUrl(channel.streamUrl));
      hls.attachMedia(video);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, browserSupportsHls]);

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
    const onVideoError = () => {
      setStatus("error");
      setErrorMessage("Este canal no está disponible en este momento.");
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onVideoError);
    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onVideoError);
    };
  }, [channel]);

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

  const retry = useCallback(() => {
    if (!channel) return;
    setStatus("loading");
    setErrorMessage(null);
    const video = videoRef.current;
    if (Hls.isSupported() && video) {
      const hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1 });
      hlsRef.current = hls;
      hls.loadSource(resolvePlaybackUrl(channel.streamUrl));
      hls.attachMedia(video);
      hls.on(Events.MANIFEST_PARSED, () => video.play().catch(() => undefined));
    }
  }, [channel]);

  if (!browserSupportsHls) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-xl bg-neutral-900 px-6 text-center">
        <p className="font-medium text-white">Tu navegador no soporta la reproducción de HLS.</p>
        <p className="text-sm text-neutral-500">Prueba con una versión reciente de Chrome, Firefox, Edge o Safari.</p>
      </div>
    );
  }

  if (!channel) {
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
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        autoPlay
        onClick={togglePlay}
      />

      {(status === "loading" || status === "buffering") && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
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
              onClick={retry}
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

        <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" /> EN VIVO
        </span>

        <span className="truncate text-sm text-white">{channel.name}</span>

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
