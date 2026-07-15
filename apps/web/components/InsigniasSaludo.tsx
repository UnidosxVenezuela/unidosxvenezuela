import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import MedallaInsignia, { type NivelInsignia } from './MedallaInsignia';

type Fila = {
  otorgada_en: string;
  insignia: {
    id: string; nombre: string; descripcion: string; icono: string | null;
    estilo: 'E' | 'D'; nivel: NivelInsignia | null; serie: string | null; umbral: number | null;
  } | null;
};

/** Cifra que va sobre la estrella de las insignias de escalera (estilo D). */
export function cifraInsignia(serie: string | null, umbral: number | null): string | null {
  if (!umbral) return null;
  return serie === 'horas' ? `${umbral}h` : String(umbral);
}

/**
 * Fila de insignias junto al saludo del panel (0165): las más recientes primero,
 * hasta 6 medallas y un «+N más» que lleva a la vitrina. Si la migración aún no
 * está aplicada (o no hay insignias), no pinta nada.
 */
export default async function InsigniasSaludo({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('perfil_insignias')
    .select('otorgada_en, insignia:insignias(id, nombre, descripcion, icono, estilo, nivel, serie, umbral)')
    .eq('perfil_id', userId)
    .order('otorgada_en', { ascending: false });
  if (error || !data?.length) return null;

  const items = (data as unknown as Fila[]).map((r) => r.insignia).filter(Boolean) as NonNullable<Fila['insignia']>[];
  if (items.length === 0) return null;
  const visibles = items.slice(0, 6);
  const resto = items.length - visibles.length;

  return (
    <Link
      href="/insignias"
      className="insignias-saludo"
      aria-label={`Tus insignias (${items.length}). Ver todas`}
      title="Tus insignias — toca para ver la vitrina"
    >
      {visibles.map((i) => (
        <MedallaInsignia
          key={i.id}
          uid={'sal-' + i.id}
          estilo={i.estilo}
          nivel={i.nivel}
          icono={i.icono}
          texto={i.estilo === 'D' ? cifraInsignia(i.serie, i.umbral) : null}
          size={42}
          title={`${i.nombre} — ${i.descripcion}`}
        />
      ))}
      {resto > 0 && <span className="pill pill-neutra">+{resto} más</span>}
    </Link>
  );
}
