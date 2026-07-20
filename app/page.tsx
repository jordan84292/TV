import { Suspense } from "react";
import { fetchChannels } from "@/lib/m3u";
import { AppStateProvider } from "@/components/AppStateProvider";
import AppShell from "@/components/AppShell";

export default async function Home() {
  let initialChannels: Awaited<ReturnType<typeof fetchChannels>> = [];
  let loadError: string | null = null;

  try {
    initialChannels = await fetchChannels();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "No se pudo cargar la lista de canales.";
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 px-6 text-center text-neutral-300">
        <div>
          <p className="text-lg font-semibold text-white">No se pudo cargar la lista inicial</p>
          <p className="mt-2 text-sm text-neutral-500">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <AppStateProvider initialChannels={initialChannels}>
        <AppShell />
      </AppStateProvider>
    </Suspense>
  );
}
