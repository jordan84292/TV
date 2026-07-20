"use client";

import { useState } from "react";
import { useAppState } from "./AppStateProvider";
import { DEFAULT_PLAYLIST } from "@/lib/playlists";

export default function PlaylistSelector() {
  const {
    playlists,
    activePlaylistId,
    switchPlaylist,
    addPlaylist,
    removePlaylist,
    playlistError,
  } = useAppState();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || DEFAULT_PLAYLIST;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setFormError("Ingresa la URL de una lista .m3u o .m3u8.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await addPlaylist(name, url);
      setName("");
      setUrl("");
      setShowForm(false);
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo agregar la lista.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
      >
        <span className="truncate">{activePlaylist.name}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Listas
          </p>
          <ul className="max-h-56 overflow-y-auto">
            {playlists.map((p) => (
              <li key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => {
                    switchPlaylist(p.id);
                    setOpen(false);
                  }}
                  className={`flex-1 truncate rounded-lg px-2 py-2 text-left text-sm ${
                    p.id === activePlaylistId
                      ? "bg-neutral-800 font-semibold text-white"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {p.name}
                </button>
                {!p.isDefault && (
                  <button
                    onClick={() => removePlaylist(p.id)}
                    aria-label={`Eliminar ${p.name}`}
                    className="px-2 text-neutral-500 hover:text-red-500"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>

          {playlistError && <p className="px-2 py-1 text-xs text-red-500">{playlistError}</p>}

          {showForm ? (
            <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 border-t border-neutral-800 p-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre (opcional)"
                className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ejemplo.com/lista.m3u8"
                className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600"
              />
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {submitting ? "Agregando…" : "Agregar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-md bg-neutral-800 px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="mt-1 w-full rounded-lg border-t border-neutral-800 px-2 py-2 text-left text-sm text-red-500 hover:bg-neutral-800"
            >
              + Agregar lista m3u8
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}
