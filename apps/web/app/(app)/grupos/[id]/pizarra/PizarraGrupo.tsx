'use client';
import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

// Excalidraw usa APIs del navegador → solo en el cliente.
const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((m) => m.Excalidraw),
  { ssr: false, loading: () => <div className="muted" style={{ padding: 24 }}>Cargando pizarra…</div> },
);

type Escena = { elements?: any[]; appState?: any } | null;

export default function PizarraGrupo({ grupoId, escenaInicial, miId }: { grupoId: string; escenaInicial: Escena; miId: string }) {
  const supabase = createClient();
  const apiRef = useRef<any>(null);
  const primera = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = useCallback((elements: readonly any[], appState: any) => {
    if (primera.current) { primera.current = false; return; } // ignora el onChange de carga
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const escena = { elements, appState: { viewBackgroundColor: appState?.viewBackgroundColor ?? '#ffffff' } };
      void supabase.from('pizarra_grupo').upsert(
        { grupo_id: grupoId, escena, actualizado_por: miId, actualizado_en: new Date().toISOString() },
        { onConflict: 'grupo_id' },
      );
    }, 1500);
  }, [grupoId, miId, supabase]);

  // Realtime: si otra persona guarda, traemos su escena (último que guarda gana).
  useEffect(() => {
    const ch = supabase.channel('pizarra-' + grupoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pizarra_grupo', filter: 'grupo_id=eq.' + grupoId },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.actualizado_por === miId) return;
          apiRef.current?.updateScene({ elements: row.escena?.elements ?? [] });
        })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [grupoId, miId, supabase]);

  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: 460, border: '1px solid var(--borde)', borderRadius: 12, overflow: 'hidden' }}>
      <Excalidraw
        initialData={escenaInicial ?? undefined}
        excalidrawAPI={(api: any) => { apiRef.current = api; }}
        onChange={onChange}
        langCode="es-ES"
      />
    </div>
  );
}
