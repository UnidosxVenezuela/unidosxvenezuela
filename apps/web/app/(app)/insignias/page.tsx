import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaCorta } from '@/lib/fechas';
import MedallaInsignia, { type NivelInsignia } from '@/components/MedallaInsignia';
import { cifraInsignia } from '@/components/InsigniasSaludo';
import Icono from '@/components/Icono';

export const metadata = { title: 'Mis insignias' };

type Insignia = {
  id: string; nombre: string; descripcion: string; icono: string | null;
  categoria: 'base' | 'hito' | 'nivel' | 'liderazgo';
  estilo: 'E' | 'D'; nivel: NivelInsignia | null; serie: string | null; umbral: number | null; orden: number;
};

const GRUPOS: { clave: Insignia['categoria']; titulo: string; nota: string }[] = [
  { clave: 'base',      titulo: 'La base',   nota: 'Por ser parte de Apoyo por Venezuela.' },
  { clave: 'hito',      titulo: 'Hitos',     nota: 'La primera vez de cada cosa: se ganan una sola vez.' },
  { clave: 'nivel',     titulo: 'Niveles',   nota: 'Bronce, plata y oro por constancia. Cada escalón es una insignia nueva.' },
  { clave: 'liderazgo', titulo: 'Liderazgo', nota: 'Por asumir la responsabilidad. Se conservan para siempre, aunque dejes el cargo.' },
];

/** Vitrina de insignias (0165): las ganadas a color con su fecha; el resto en gris con cómo se gana. */
export default async function InsigniasPage() {
  const { user } = await requireUsuario();
  const supabase = await createClient();

  const [{ data: catalogo, error }, { data: mias }] = await Promise.all([
    supabase.from('insignias').select('*').order('orden'),
    supabase.from('perfil_insignias').select('insignia_id, otorgada_en').eq('perfil_id', user!.id),
  ]);

  if (error || !catalogo?.length) {
    return (
      <div>
        <div className="pagina-cab"><div><h1>Mis insignias</h1></div></div>
        <div className="tarjeta vacio">
          <Icono nombre="avisos" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>
            El catálogo de insignias aún no está disponible. Si eres administrador, aplica la migración <code>0165_insignias.sql</code>.
          </p>
        </div>
      </div>
    );
  }

  const todas = catalogo as Insignia[];
  const ganadas = new Map<string, string>(((mias ?? []) as { insignia_id: string; otorgada_en: string }[]).map((m) => [m.insignia_id, m.otorgada_en]));

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>Mis insignias</h1>
          <p className="muted sub">
            Llevas <strong>{ganadas.size}</strong> de <strong>{todas.length}</strong>. Se otorgan solas por tu trabajo —
            nadie las asigna a mano — y <strong>ninguna se pierde</strong>. 💛💙❤️
          </p>
        </div>
      </div>

      {GRUPOS.map((g) => {
        const grupo = todas.filter((i) => i.categoria === g.clave);
        if (grupo.length === 0) return null;
        const n = grupo.filter((i) => ganadas.has(i.id)).length;
        return (
          <section key={g.clave} style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 2 }}>{g.titulo} <span className="muted" style={{ fontWeight: 400, fontSize: '.95rem' }}>· {n} de {grupo.length}</span></h2>
            <p className="muted" style={{ marginTop: 0 }}>{g.nota}</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {grupo.map((i) => {
                const fecha = ganadas.get(i.id);
                return (
                  <div key={i.id} className="tarjeta" style={{ textAlign: 'center', padding: '14px 12px' }}>
                    <MedallaInsignia
                      uid={'vit-' + i.id}
                      estilo={i.estilo}
                      nivel={i.nivel}
                      icono={i.icono}
                      texto={i.estilo === 'D' ? cifraInsignia(i.serie, i.umbral) : null}
                      size={84}
                      title={i.nombre}
                      apagada={!fecha}
                    />
                    <div style={{ fontWeight: 700, marginTop: 6 }}>{i.nombre}</div>
                    <div className="muted" style={{ fontSize: '.85rem', marginTop: 2 }}>{i.descripcion}</div>
                    {fecha ? (
                      <div className="pill pill-ok" style={{ marginTop: 8 }}>Ganada el {fechaCorta(fecha)}</div>
                    ) : (
                      <div className="pill pill-neutra" style={{ marginTop: 8 }}>Por ganar</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
