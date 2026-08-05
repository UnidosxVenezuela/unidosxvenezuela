import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { emailActivo } from '@/lib/email';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_ESTADO_CORREO, ESTADOS_CORREO, claseEstadoCorreo, ETIQUETA_ENTIDAD_CORREO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonActualizar from '@/components/BotonActualizar';
import EstadoVacio from '@/components/EstadoVacio';
import Kpi from '@/components/Kpi';
import Pill, { tonoDeClase } from '@/components/Pill';
import Consejo from '@/components/Consejos';

export const metadata = { title: 'Correo institucional' };
export const dynamic = 'force-dynamic';

type SP = { estado?: string };

/** Registro de correo institucional de Alianzas Estratégicas (0217).
 *  Cada fila nace ANTES del envío: aquí se ve lo que salió, lo que falló y lo que
 *  quedó a medias. Antes de 0217 no quedaba constancia de ningún correo. */
export default async function CorreoPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  const filtro = ESTADOS_CORREO.includes(searchParams.estado ?? '') ? searchParams.estado! : null;

  // Best-effort: si la migración 0217 aún no está aplicada, la consulta falla y la
  // pantalla lo dice en vez de romperse (mismo patrón que /alianzas con 0200).
  let q = supabase.from('correo_envios')
    .select('id, folio, destinatario_email, destinatario_nombre, asunto, estado, entidad, error, creado_en, enviado_en, plantilla_id')
    .order('creado_en', { ascending: false }).limit(300);
  if (filtro) q = q.eq('estado', filtro);
  const { data, error } = await q;
  const envios = (data ?? []) as any[];
  const sinMigracion = !!error;

  // Nombre de la plantilla de cada envío (una consulta, no N).
  const nombrePlantilla = new Map<string, string>();
  const ids = Array.from(new Set(envios.map((e) => e.plantilla_id).filter(Boolean)));
  if (ids.length > 0) {
    const { data: ps } = await supabase.from('correo_plantillas').select('id, nombre').in('id', ids);
    ((ps as any[]) ?? []).forEach((p) => nombrePlantilla.set(p.id, p.nombre));
  }

  const cuenta = (e: string) => envios.filter((x) => x.estado === e).length;
  const activo = emailActivo();

  return (
    <AnimarEntrada>
      <Consejo id="correo-alianzas" titulo="Correo institucional">
        Escribe a empresas, aliados y proveedores con las <strong>plantillas aprobadas</strong> del departamento. Cada correo se <strong>registra antes de enviarse</strong>, con su folio y su resultado: aunque el envío falle, queda constancia de que se escribió.
      </Consejo>

      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> Correo institucional</h1>
          <p className="muted sub">Registro de envíos de Alianzas Estratégicas. {envios.length > 0 && <><strong>{envios.length}</strong> en el listado.</>}</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <BotonActualizar />
          <Link className="btn" href="/alianzas/correo/plantillas"><Icono nombre="pizarra" size={16} /> Plantillas</Link>
          <Link className="btn btn-primario" href="/alianzas/correo/nuevo"><Icono nombre="mas" /> Redactar</Link>
        </div>
      </div>

      {sinMigracion && (
        <div className="tarjeta" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>Aún no disponible.</strong> <span className="muted">Falta aplicar la migración <code>0217_correo_institucional.sql</code> en la base de datos.</span>
          </p>
        </div>
      )}

      {!activo && (
        <div className="tarjeta" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>El envío de correo no está configurado.</strong>{' '}
            <span className="muted">
              Falta <code>RESEND_API_KEY</code> (y conviene <code>RESEND_FROM</code> con un dominio verificado).
              Lo que se redacte quedará <strong>registrado</strong> con estado «{ETIQUETA_ESTADO_CORREO.no_configurado}», no se perderá.
            </span>
          </p>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Correos registrados" valor={envios.length} sub={filtro ? ETIQUETA_ESTADO_CORREO[filtro] : 'Todos los estados'} color="var(--azul)" icono="documento" tinte="#eef2ff" />
        <Kpi etiqueta="Enviados" valor={cuenta('enviado')} sub="Aceptados por el proveedor" color="#16a34a" icono="ok" tinte="#d1fae5" />
        <Kpi etiqueta="Con fallo" valor={cuenta('fallido') + cuenta('no_configurado')} sub="Registrados, sin salir" color="#dc2626" icono="avisos" tinte="#fee2e2" />
        <Kpi etiqueta="Pendientes" valor={cuenta('pendiente')} sub="Sin resultado anotado" color="#a16207" icono="reloj" tinte="#fef9c3" />
      </div>

      <div className="fila" style={{ gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <Link href="/alianzas/correo" className={!filtro ? 'btn btn-primario' : 'btn'} style={{ minHeight: 32, padding: '3px 12px' }}>Todos</Link>
        {ESTADOS_CORREO.map((e) => (
          <Link key={e} href={'/alianzas/correo?estado=' + e} className={filtro === e ? 'btn btn-primario' : 'btn'} style={{ minHeight: 32, padding: '3px 12px' }}>
            {ETIQUETA_ESTADO_CORREO[e]}
          </Link>
        ))}
      </div>

      {envios.length === 0 ? (
        <EstadoVacio icono="documento" titulo={filtro ? 'Sin correos en ese estado' : 'Todavía no se ha escrito ningún correo'}
          texto="Redacta el primero a partir de una plantilla: presentación de la organización, solicitud de donación, agradecimiento o seguimiento de una alianza."
          accion={{ href: '/alianzas/correo/nuevo', etiqueta: 'Redactar correo', icono: 'mas' }} />
      ) : (
        <div className="tarjeta">
          <div className="tabla-scroll"><table>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Destinatario</th><th>Asunto</th><th>Plantilla</th><th>Estado</th></tr></thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link href={'/alianzas/correo/' + e.id}>{e.folio}</Link>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(e.creado_en)}</td>
                  <td>
                    {e.destinatario_nombre ? <div>{e.destinatario_nombre}</div> : null}
                    <span className="muted" style={{ fontSize: '.82rem' }}>{e.destinatario_email}</span>
                    {e.entidad ? <span className="muted" style={{ fontSize: '.78rem' }}> · {ETIQUETA_ENTIDAD_CORREO[e.entidad] ?? e.entidad}</span> : null}
                  </td>
                  <td>{e.asunto ?? <span className="muted">—</span>}</td>
                  <td>{nombrePlantilla.get(e.plantilla_id) ?? <span className="muted">—</span>}</td>
                  <td>
                    <Pill tono={tonoDeClase(claseEstadoCorreo(e.estado))} punto={false}>
                      {ETIQUETA_ESTADO_CORREO[e.estado] ?? e.estado}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </AnimarEntrada>
  );
}
