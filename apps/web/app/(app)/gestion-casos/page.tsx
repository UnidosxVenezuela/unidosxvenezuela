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
  ETIQUETA_ESTADO_INFO, TONO_ESTADO_INFO,
} from '@/lib/gestion';
import { responderInfo } from './actions';
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

type Vista = 'mis' | 'control' | 'piden';

export default async function GestionCasosPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const puedeRepartir = puedeAsignarGestor(perfil);
  const supabase = await createClient();
  const fSituacion = esSituacionGestion(searchParams.situacion ?? '') ? searchParams.situacion! : '';

  const [misRes, controlRes, pidenRes] = await Promise.all([
    supabase.rpc('mis_casos_gestion'),
    supabase.rpc('casos_gestion_control', { p_situacion: fSituacion || null }),
    // Lo que me piden (0240). Esto NO es solo del gestor: le llega a cualquier área a la
    // que se le haya pedido un dato, y es la razón de que la pantalla no se cierre a los
    // dos roles de gestión.
    supabase.rpc('mis_solicitudes_info'),
  ]);
  const piden = (pidenRes.data ?? []) as any[];

  // Entra el gestor (es su bandeja), quien reparte, y cualquiera a quien le hayan pedido
  // algo. Una pantalla que se abre y sale vacía es peor que una que dice que no es para ti.
  const esGestor = esGestorCasos(perfil);
  if (!esGestor && !puedeRepartir && piden.length === 0) redirect('/dashboard');

  const vista: Vista = searchParams.vista === 'control' ? 'control'
    : searchParams.vista === 'piden' ? 'piden'
    // Quien solo entra porque le piden algo aterriza donde le sirve.
    : (!esGestor && !puedeRepartir) ? 'piden' : 'mis';

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

  const pidenVencidas = piden.filter((s) => s.vencida).length;

  const href = (v: Vista, s?: string) => {
    const p = new URLSearchParams();
    if (v !== 'mis') p.set('vista', v);
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
        <Link href={href('piden')} aria-current={vista === 'piden' ? 'page' : undefined}
          className={vista === 'piden' ? 'activo' : undefined}>Me piden ({piden.length})</Link>
      </div>

      {vista === 'piden' ? (
        <SeccionMePiden piden={piden} vencidas={pidenVencidas} />
      ) : vista === 'control' ? (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', margin: '16px 0' }}>
            {SITUACIONES_GESTION.map((s) => (
              <Kpi key={s} etiqueta={ETIQUETA_SITUACION[s]} valor={cuenta(s)}
                sub={s === 'sin_gestor' ? 'Nadie responde' : s === 'bloqueado' ? 'Espera un dato'
                  : s === 'vencido' ? 'La fecha ya pasó'
                  : s === 'sin_proxima' ? 'No dice qué toca' : 'Desglose cubierto'}
                color={s === 'sin_gestor' ? '#b91c1c' : s === 'bloqueado' ? '#9333ea'
                  : s === 'vencido' ? '#c2410c'
                  : s === 'sin_proxima' ? '#a16207' : '#16a34a'}
                icono={s === 'por_cerrar' ? 'ok' : s === 'bloqueado' ? 'reloj' : 'avisos'}
                tinte={s === 'sin_gestor' ? '#fee2e2' : s === 'bloqueado' ? '#f3e8ff'
                  : s === 'vencido' ? '#ffedd5'
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

/** Lo que me piden (0240): peticiones dirigidas a mí o a mi área, sin cerrar. */
function SeccionMePiden({ piden, vencidas }: { piden: any[]; vencidas: number }) {
  if (piden.length === 0) {
    return (
      <div style={{ marginTop: 14 }}>
        <EstadoVacio icono="ok" titulo="No te piden nada"
          texto="Cuando alguien necesite un dato tuyo —o de tu área— para avanzar un caso, aparecerá aquí." />
      </div>
    );
  }
  return (
    <>
      {vencidas > 0 && (
        <p className="fila" style={{ gap: 6, marginTop: 14, fontSize: '.9rem' }}>
          <Pill tono="critica" punto={false}>{vencidas} con la fecha pasada</Pill>
          <span className="muted">Cada una tiene un caso parado detrás.</span>
        </p>
      )}
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {piden.map((s) => {
          const f = cuantoFalta(s.vence_en);
          return (
            <div key={s.id} className="tarjeta">
              <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Pill tono={TONO_ESTADO_INFO[s.estado as keyof typeof TONO_ESTADO_INFO] ?? 'neutra'} punto={false}>
                  {ETIQUETA_ESTADO_INFO[s.estado as keyof typeof ETIQUETA_ESTADO_INFO] ?? s.estado}
                </Pill>
                {s.es_mia
                  ? <Pill tono="info" punto={false}>Te la pidieron a ti</Pill>
                  : s.area && <Pill tono="neutra" punto={false}>{ETIQUETA_AREA_SIGUIENTE[s.area] ?? s.area}</Pill>}
                {f && <Pill tono={f.vencido ? 'critica' : 'neutra'} punto={false}>{f.texto}</Pill>}
              </div>
              <div style={{ margin: '8px 0 2px' }}><strong>{s.dato}</strong></div>
              {s.motivo && <div className="muted" style={{ fontSize: '.85rem' }}>Por qué: {s.motivo}</div>}
              {s.resultado_esperado && (
                <div className="muted" style={{ fontSize: '.85rem' }}>Desbloquea: {s.resultado_esperado}</div>
              )}
              <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>
                {/* El caso va como TEXTO y no como enlace: quien recibe la petición puede
                    ser de un área que no lee `casos` por RLS, y el enlace la devolvería al
                    panel. Aquí ya tiene todo lo que necesita para contestar. */}
                Para #{String(s.caso_numero ?? '—').padStart(5, '0')} · {s.caso_titulo}
                {' · '}lo pidió {s.solicitante}
              </div>
              {s.estado === 'abierta' && (
                <form action={responderInfo} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="volver" value="/gestion-casos?vista=piden" />
                  <div className="fila" style={{ gap: 6, alignItems: 'flex-end' }}>
                    <div className="campo crece" style={{ marginBottom: 0 }}>
                      <label htmlFor={'mp-' + s.id}>Responder</label>
                      <input id={'mp-' + s.id} name="respuesta" className="input" required maxLength={2000}
                        placeholder="El dato, o dónde está" />
                    </div>
                    <button className="btn btn-primario" type="submit">Enviar</button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
