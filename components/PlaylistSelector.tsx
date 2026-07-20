"use client";

import { useState } from "react";
import { useAppState } from "./AppStateProvider";

type AddMode = "url" | "paste";

export default function PlaylistSelector() {
  const {
    section,
    sectionPlaylists,
    activePlaylistId,
    switchPlaylist,
    addPlaylist,
    addLocalPlaylist,
    removePlaylist,
    playlistError,
  } = useAppState();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activePlaylist = sectionPlaylists.find((p) => p.id === activePlaylistId);
  const label = activePlaylist?.name ?? (section === "tv" ? "Elegir lista de TV" : "Elegir lista de películas/series");

  function resetForm() {
    setName("");
    setUrl("");
    setPastedText("");
    setShowForm(false);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (addMode === "url") {
        if (!url.trim()) {
          setFormError("Ingresa la URL de una lista .m3u o .m3u8.");
          return;
        }
        await addPlaylist(name, url, section);
      } else {
        if (!pastedText.trim()) {
          setFormError("Pegá el contenido de una lista M3U (empieza con #EXTM3U).");
          return;
        }
        await addLocalPlaylist(name, pastedText, section);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo agregar la lista.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setPastedText(text);
    if (!name.trim()) setName(file.name.replace(/\.(m3u8?|txt)$/i, ""));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
      >
        <span className="truncate">{label}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {section === "tv" ? "Listas de TV" : "Listas de películas/series"}
          </p>
          {sectionPlaylists.length === 0 && (
            <p className="px-2 py-2 text-sm text-neutral-500">Todavía no agregaste ninguna lista acá.</p>
          )}
          <ul className="max-h-56 overflow-y-auto">
            {sectionPlaylists.map((p) => (
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
                  {p.origin === "local" && (
                    <span className="ml-1.5 rounded bg-neutral-700 px-1 py-0.5 text-[10px] text-neutral-300">
                      local
                    </span>
                  )}
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
              <div className="flex gap-1 rounded-lg bg-neutral-950 p-1">
                <button
                  type="button"
                  onClick={() => setAddMode("url")}
                  className={`flex-1 rounded-md py-1 text-xs font-medium ${
                    addMode === "url" ? "bg-neutral-700 text-white" : "text-neutral-400"
                  }`}
                >
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("paste")}
                  className={`flex-1 rounded-md py-1 text-xs font-medium ${
                    addMode === "paste" ? "bg-neutral-700 text-white" : "text-neutral-400"
                  }`}
                >
                  Pegar / subir M3U
                </button>
              </div>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre (opcional)"
                className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600"
              />

              {addMode === "url" ? (
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://ejemplo.com/lista.m3u8"
                  className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600"
                />
              ) : (
                <>
                  <label className="cursor-pointer rounded-md border border-dashed border-neutral-700 px-2 py-1.5 text-center text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200">
                    Subir archivo .m3u / .m3u8
                    <input type="file" accept=".m3u,.m3u8,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={"#EXTM3U\n#EXTINF:-1 group-title=\"General\",Mi canal\nhttps://ejemplo.com/stream.m3u8"}
                    rows={6}
                    className="resize-y rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 font-mono text-xs text-white placeholder:text-neutral-600"
                  />
                </>
              )}

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
              {section === "tv" ? "+ Agregar lista de TV" : "+ Agregar lista de películas/series"}
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
