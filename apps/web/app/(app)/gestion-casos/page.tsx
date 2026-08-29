// Gestión de Casos (0239) — la bandeja del gestor y los reportes de control.
//
// Dos vistas en una pantalla porque son el mismo trabajo visto de cerca y de lejos:
// «Mis casos» es lo que me toca hoy; «Control» es lo que se está cayendo en toda la
// organización. Separarlas en dos rutas obligaría a saltar entre ellas todo el rato.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esGestorCasos, puedeAsignarGestor } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import {
  SITUACIONES_GESTION, ETIQUETA_SITUACION, QUE_HACER, TONO_SITUACION,
  esSituacionGestion, ETIQUETA_AREA_SIGUIENTE, cuantoFalta,
} from '@/lib/gestion';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import PillPais from '@/components/PillPais';
import Kpi from '@/components/Kpi';
import EstadoVacio from '@/components/EstadoVacio';
import Consejo from '@/components/Consejos';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonActualizar from '@/components/BotonActualizar';

export const dynamic = 'force-dynamic';

type SP = { vista?: string; situacion?: string };

export default async function GestionCasosPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const puedeRepartir = puedeAsignarGestor(perfil);
  // Entra el gestor (es su bandeja), su mando y administración. Nadie más: una pantalla
  // que se abre y sale vacía es peor que una que dice que no es para ti.
  if (!esGestorCasos(perfil) && !puedeRepartir) redirect('/dashboard');

  const supabase = await createClient();
  const vista = searchParams.vista === 'control' ? 'control' : 'mis';
  const fSituacion = esSituacionGestion(searchParams.situacion ?? '') ? searchParams.situacion! : '';

  const [misRes, controlRes] = await Promise.all([
    supabase.rpc('mis_casos_gestion'),
    supabase.rpc('casos_gestion_control', { p_situacion: fSituacion || null }),
  ]);

  // Sin 0239 aplicada las RPC no existen: se avisa y el resto de la app sigue igual.
  if (misRes.error && controlRes.error) {
    return (
      <div>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="tareas" size={24} /> Gestión de Casos</h1>
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>
            Todavía no está disponible: falta aplicar la migración <code>0239</code>.
          </p>
        </div>
      </div>
    );
  }

  const mios = (misRes.data ?? []) as any[];
  const control = (controlRes.data ?? []) as any[];
  const cuenta = (s: string) => control.filter((c) => c.situacion === s).length;
  const misVencidos = mios.filter((c) => c.vencido).length;

  const href = (v: 'mis' | 'control', s?: string) => {
    const p = new URLSearchParams();
    if (v === 'control') p.set('vista', 'control');
    if (s) p.set('situacion', s);
    return '/gestion-casos' + (p.toString() ? '?' + p.toString() : '');
  };

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="tareas" size={24} /> Gestión de Casos</h1>
          <p className="muted sub">Un responsable por caso, una próxima acción y una fecha vigente hasta el cierre.</p>
        </div>
        <BotonActualizar />
      </div>

      <Consejo id="gestion-casos" titulo="Cómo se usa esto">
        Cada solicitud tiene un <strong>gestor</strong> que responde por ella de principio a fin, aunque el
        trabajo lo hagan Logística, Alianzas o Redacción. El gestor no ejecuta: <strong>coordina, pide lo que
        falta y no deja que nada se detenga</strong>. Por eso solo hacen falta dos cosas en cada caso: <strong>qué
        toca ahora</strong> y <strong>para cuándo</strong>. Los casos de <strong>Desaparecidos</strong> no entran aquí: siguen el
        circuito de Búsqueda, que tiene su propio seguimiento.
      </Consejo>

      <div className="seg" aria-label="Qué ver" style={{ marginTop: 14 }}>
        <Link href={href('mis')} aria-current={vista === 'mis' ? 'page' : undefined}
          className={vista === 'mis' ? 'activo' : undefined}>Mis casos ({mios.length})</Link>
        <Link href={href('control')} aria-current={vista === 'control' ? 'page' : undefined}
          className={vista === 'control' ? 'activo' : undefined}>Control ({control.length})</Link>
      </div>

      {vista === 'control' ? (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', margin: '16px 0' }}>
            {SITUACIONES_GESTION.map((s) => (
              <Kpi key={s} etiqueta={ETIQUETA_SITUACION[s]} valor={cuenta(s)}
                sub={s === 'sin_gestor' ? 'Nadie responde' : s === 'vencido' ? 'La fecha ya pasó'
                  : s === 'sin_proxima' ? 'No dice qué toca' : 'Desglose cubierto'}
                color={s === 'sin_gestor' ? '#b91c1c' : s === 'vencido' ? '#c2410c'
                  : s === 'sin_proxima' ? '#a16207' : '#16a34a'}
                icono={s === 'por_cerrar' ? 'ok' : 'avisos'}
                tinte={s === 'sin_gestor' ? '#fee2e2' : s === 'vencido' ? '#ffedd5'
                  : s === 'sin_proxima' ? '#fef9c3' : '#d1fae5'}
                href={href('control', s)} />
            ))}
          </div>

          {fSituacion && (
            <div className="fila" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Pill tono={TONO_SITUACION[fSituacion as keyof typeof TONO_SITUACION]} punto={false}>
                {ETIQUETA_SITUACION[fSituacion as keyof typeof ETIQUETA_SITUACION]}
              </Pill>
              <span className="muted" style={{ fontSize: '.88rem' }}>
                {QUE_HACER[fSituacion as keyof typeof QUE_HACER]}
              </span>
              <Link className="btn" href={href('control')}>Ver todo</Link>
            </div>
          )}

          {control.length === 0 ? (
            <EstadoVacio icono="ok" titulo="Nada que atender"
              texto="Ningún caso está sin responsable, vencido ni parado. Cuando algo se caiga, aparecerá aquí." />
          ) : (
            <div className="tarjeta" style={{ padding: 0 }}>
              <div className="tabla-scroll"><table>
                <thead><tr><th>Solicitud</th><th>Situación</th><th>Gestor</th><th>Próxima acción</th><th>Fecha</th></tr></thead>
                <tbody>
                  {control.map((c) => {
                    const f = cuantoFalta(c.proxima_revision);
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="celda-titulo">
                            <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <Link href={'/casos?caso=' + c.id}>#{String(c.numero ?? '—').padStart(5, '0')} · {c.titulo}</Link>
                              {c.pais && <PillPais pais={c.pais} />}
                            </span>
                          </div>
                        </td>
                        <td>
                          <Pill tono={TONO_SITUACION[c.situacion as keyof typeof TONO_SITUACION] ?? 'neutra'} punto={false}>
                            {ETIQUETA_SITUACION[c.situacion as keyof typeof ETIQUETA_SITUACION] ?? c.situacion}
                          </Pill>
                        </td>
                        <td className="muted" style={{ fontSize: '.82rem' }}>{c.gestor_nombre ?? '—'}</td>
                        <td style={{ fontSize: '.86rem' }}>
                          {c.proxima_accion ?? <span className="muted">—</span>}
                          {c.area_siguiente && (
                            <div className="muted" style={{ fontSize: '.76rem' }}>
                              → {ETIQUETA_AREA_SIGUIENTE[c.area_siguiente] ?? c.area_siguiente}
                            </div>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                          {f ? <span style={{ color: f.vencido ? 'var(--critica)' : undefined }}>{f.texto}</span> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      ) : (
        <>
          {misVencidos > 0 && (
            <p className="fila" style={{ gap: 6, marginTop: 14, fontSize: '.9rem' }}>
              <Pill tono="alta" punto={false}>{misVencidos} con la fecha vencida</Pill>
              <span className="muted">Van primero en la lista.</span>
            </p>
          )}
          {mios.length === 0 ? (
            <EstadoVacio icono="tareas" titulo="No tienes casos asignados"
              texto={puedeRepartir
                ? 'Cuando le asignes casos a alguien —o a ti— aparecerán aquí. En «Control» está lo que no tiene responsable.'
                : 'El líder de tu área o administración te los asigna. En cuanto tengas uno, aparecerá aquí.'} />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 14 }}>
              {mios.map((c) => {
                const f = cuantoFalta(c.proxima_revision);
                return (
                  <Link key={c.id} href={'/casos?caso=' + c.id} className="tarjeta insumo-card">
                    <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {c.pais && <PillPais pais={c.pais} />}
                      {f && <Pill tono={f.vencido ? 'alta' : 'neutra'} punto={false}>{f.texto}</Pill>}
                    </div>
                    <strong style={{ display: 'block', margin: '6px 0 2px' }}>
                      #{String(c.numero ?? '—').padStart(5, '0')} · {c.titulo}
                    </strong>
                    {c.proxima_accion ? (
                      <div style={{ fontSize: '.86rem', marginTop: 4 }}>
                        <strong>Ahora toca:</strong> {c.proxima_accion}
                        {c.area_siguiente && (
                          <span className="muted"> · {ETIQUETA_AREA_SIGUIENTE[c.area_siguiente] ?? c.area_siguiente}</span>
                        )}
                      </div>
                    ) : (
                      <div className="fila" style={{ gap: 6, marginTop: 6 }}>
                        <Pill tono="aviso" punto={false}>Sin próxima acción</Pill>
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: '.76rem', marginTop: 6 }}>
                      Actualizada {fechaHora(c.actualizado_en)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {esAdmin && (
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 18 }}>
          El rol <strong>Gestor de Casos</strong> se asigna desde <Link href="/admin/usuarios">Administración · Usuarios</Link>.
          El reparto de casos lo hace el líder de Verificación o administración, desde la propia solicitud.
        </p>
      )}
    </AnimarEntrada>
  );
}
