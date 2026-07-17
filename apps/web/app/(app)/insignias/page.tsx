import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaCorta } from '@/lib/fechas';
import MedallaInsignia, { type NivelInsignia } from '@/components/MedallaInsignia';
import { cifraInsignia } from '@/components/InsigniasSaludo';
import CelebracionInsignias from '@/components/CelebracionInsignias';
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

/** Vitrina de insignias (0165): las ganadas a color con su fecha; el resto en gris con
 *  cómo se gana. La próxima medalla de cada escalera muestra una barra de progreso
 *  («8 de 25») a partir de los contadores por serie — todo con datos que ya existen. */
export default async function InsigniasPage() {
  const { user } = await requireUsuario();
  const supabase = await createClient();

  const [{ data: catalogo, error }, { data: mias }, { data: contData }, { data: horasData }] = await Promise.all([
    supabase.from('insignias').select('*').order('orden'),
    supabase.from('perfil_insignias').select('insignia_id, otorgada_en').eq('perfil_id', user!.id),
    supabase.from('perfil_contadores').select('clave, valor').eq('perfil_id', user!.id),
    supabase.from('registro_horas').select('horas').eq('perfil_id', user!.id),
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

  // Progreso hacia la próxima medalla: los contadores por serie viven en perfil_contadores
  // (la RLS deja ver los propios) y las «horas» se suman de registro_horas. Con eso, para
  // cada escalera se marca su PRÓXIMA meta (la insignia no ganada de menor umbral) con una
  // barra «cuenta de umbral». Las escaleras más lejanas quedan como «Por ganar».
  const contadores = new Map<string, number>();
  for (const c of ((contData ?? []) as { clave: string; valor: number }[])) contadores.set(c.clave, Number(c.valor));
  const horasTotal = ((horasData ?? []) as { horas: number | null }[]).reduce((a, h) => a + Number(h.horas ?? 0), 0);
  if (horasTotal > 0) contadores.set('horas', horasTotal);

  const proximaMeta = new Map<string, string>(); // serie -> id de la próxima insignia por ganar
  const seriesVistas = new Set<string>();
  for (const i of todas) {
    if (!i.serie || i.umbral == null || seriesVistas.has(i.serie)) continue;
    seriesVistas.add(i.serie);
    const pendientes = todas
      .filter((x) => x.serie === i.serie && x.umbral != null && !ganadas.has(x.id))
      .sort((a, b) => (a.umbral! - b.umbral!));
    if (pendientes[0]) proximaMeta.set(i.serie, pendientes[0].id);
  }
  const esProxima = (i: Insignia) => i.serie != null && proximaMeta.get(i.serie) === i.id;

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
        {ganadas.size > 0 && <CelebracionInsignias />}
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
                const prox = !fecha && esProxima(i) && i.umbral != null;
                const cuenta = prox ? Math.min(contadores.get(i.serie!) ?? 0, i.umbral!) : 0;
                const pct = prox && i.umbral! > 0 ? Math.round((cuenta / i.umbral!) * 100) : 0;
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
                    ) : prox ? (
                      <div className="medalla-prog" style={{ marginTop: 10 }}>
                        <div className="medalla-prog-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso: ${cuenta} de ${i.umbral}`}>
                          <div className="medalla-prog-fill" style={{ width: pct + '%' }} />
                        </div>
                        <div className="medalla-prog-txt">{cuenta} de {i.umbral}</div>
                      </div>
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
