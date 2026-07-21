import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Kpi from '@/components/Kpi';
import Pill from '@/components/Pill';
import EstadoVacio from '@/components/EstadoVacio';
import Consejo from '@/components/Consejos';

export const metadata = { title: 'Alianzas Estratégicas' };
export const dynamic = 'force-dynamic';

/** Puerta de entrada del departamento de Alianzas Estratégicas (0198-0200): accesos a sus
 *  tres frentes (Captación/Prospección, Afiliación, Reportería), conteos de un vistazo, y
 *  —lo que no vive en ninguna otra pantalla— la LISTA de solicitudes que Logística escala
 *  al departamento para que busque una empresa/aliado o un voluntario profesional. */
export default async function AlianzasPage() {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  // Conteos del departamento (best-effort: si falta alguna migración, quedan en 0).
  const [empresasRes, afiliadosRes] = await Promise.all([
    supabase.from('oportunidades').select('estado'),
    supabase.from('afiliados').select('tipo'),
  ]);
  const empresas = (empresasRes.data ?? []) as any[];
  const afiliados = (afiliadosRes.data ?? []) as any[];
  const nEmpresas = empresas.length;
  const nVerificadas = empresas.filter((o) => o.estado === 'verificado' || o.estado === 'enviado').length;
  const nProf = afiliados.filter((a) => a.tipo === 'profesional').length;
  const nVol = afiliados.filter((a) => a.tipo === 'voluntario').length;

  // Solicitudes escaladas desde Logística (0200). Best-effort: si la migración aún no
  // está aplicada, el filtro por columnas inexistentes falla y la lista queda vacía.
  let escaladas: any[] = [];
  const esc = await supabase.from('solicitudes_insumo')
    .select('id, titulo, tipo, urgencia, estado, escalado_alianzas, escalado_alianzas_en, voluntariado_profesional, voluntariado_profesional_en, actualizado_en')
    .or('escalado_alianzas.eq.true,voluntariado_profesional.eq.true')
    .order('actualizado_en', { ascending: false }).limit(100);
  if (!esc.error) escaladas = (esc.data ?? []) as any[];

  const SUBS = [
    { href: '/captacion', icono: 'enlace', titulo: 'Captación y Prospección', texto: 'Registro de empresas y aliados (el «Captado»), con la Ficha de Prospección y la 2ª verificación.' },
    { href: '/afiliacion', icono: 'usuario', titulo: 'Afiliación', texto: 'Profesionales y voluntarios clasificados por cargo, en tablero.' },
    { href: '/reportes/alianzas', icono: 'documento', titulo: 'Reportería', texto: 'Respaldo descargable para presentar a las empresas (CSV / PDF).' },
  ];

  return (
    <AnimarEntrada>
      <Consejo id="alianzas" titulo="Alianzas Estratégicas">
        El departamento reúne <strong>Prospección</strong> (empresas), <strong>Captación</strong> y <strong>Afiliación</strong> (profesionales y voluntarios). Desde aquí entras a cada frente y ves las <strong>solicitudes que Logística escala</strong> para buscarles una empresa o un voluntario.
      </Consejo>

      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="enlace" size={24} /> Alianzas Estratégicas</h1>
          <p className="muted sub">Prospección · Captación · Afiliación — consecución de empresas, aliados y voluntariado profesional.</p>
        </div>
      </div>

      {/* Conteos del departamento */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Empresas captadas" valor={nEmpresas} sub={nVerificadas + ' verificadas'} color="var(--azul)" icono="enlace" tinte="#eef2ff" />
        <Kpi etiqueta="Profesionales" valor={nProf} sub="Afiliados" color="#7c3aed" icono="usuario" tinte="#ede9fe" />
        <Kpi etiqueta="Voluntarios" valor={nVol} sub="Afiliados" color="#16a34a" icono="usuario" tinte="#d1fae5" />
        <Kpi etiqueta="Escaladas de Logística" valor={escaladas.length} sub="Solicitudes por cubrir" color="#ea580c" icono="cohete" tinte="#ffedd5" />
      </div>

      {/* Accesos directos a los tres frentes */}
      <div className="grid grid-3" style={{ alignItems: 'stretch' }}>
        {SUBS.map((s) => (
          <Link key={s.href} href={s.href} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2 className="fila" style={{ gap: 8, marginTop: 0, fontSize: '1.05rem' }}><Icono nombre={s.icono} size={18} /> {s.titulo}</h2>
            <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>{s.texto}</p>
          </Link>
        ))}
      </div>

      {/* Solicitudes escaladas desde Logística — no viven en ninguna otra pantalla del dpto. */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Solicitudes escaladas desde Logística <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({escaladas.length})</span></h2>
        {escaladas.length === 0 ? (
          <EstadoVacio icono="cohete" titulo="Sin solicitudes escaladas"
            texto="Cuando Logística no pueda cubrir una solicitud con inventario o proveedores, la enviará aquí para buscar una empresa/aliado o un voluntario profesional." />
        ) : (
          <div className="fila" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            {escaladas.map((s) => (
              <Link key={s.id} href={'/insumos/' + s.id} className="tarjeta" style={{ padding: 12, textDecoration: 'none', color: 'inherit' }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{s.titulo}</strong>
                  <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {s.escalado_alianzas && <Pill tono="info" punto={false}>Alianzas</Pill>}
                    {s.voluntariado_profesional && <Pill tono="ok" punto={false}>Voluntariado Prof.</Pill>}
                    <Pill tono="neutra" punto={false}>{ETIQUETA_ESTADO_INSUMO[s.estado] ?? s.estado}</Pill>
                  </span>
                </div>
                <div className="muted" style={{ fontSize: '.82rem', marginTop: 4 }}>
                  {ETIQUETA_TIPO_INSUMO[s.tipo] ?? s.tipo} · {ETIQUETA_PRIORIDAD[s.urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? s.urgencia}
                  {s.escalado_alianzas_en ? ' · escalada ' + fechaHora(s.escalado_alianzas_en) : ''}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AnimarEntrada>
  );
}
