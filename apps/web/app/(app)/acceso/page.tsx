import { requireUsuario, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ROL, etiquetaArea } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import { solicitarGrupo, solicitarRol, cancelarSolicitud } from './actions';

const SECCIONES: { rol: Rol; etiqueta: string; desc: string }[] = [
  { rol: 'logistica', etiqueta: 'Logística (Insumos)', desc: 'Gestionar solicitudes, proveedores, envíos y donaciones.' },
  { rol: 'verificador', etiqueta: 'Verificación de casos', desc: 'Revisar y confirmar los casos reportados.' },
  { rol: 'recopilacion', etiqueta: 'Recopilación', desc: 'Reportar información (casos) para verificar.' },
  { rol: 'redaccion', etiqueta: 'Redacción', desc: 'Escribir el contenido de los casos.' },
  { rol: 'diseno_grafico', etiqueta: 'Diseño Gráfico', desc: 'Crear las piezas gráficas.' },
  { rol: 'edicion_video', etiqueta: 'Edición de Videos', desc: 'Editar los videos / reels.' },
  { rol: 'redes_sociales', etiqueta: 'Redes Sociales', desc: 'Publicar el contenido final.' },
];

export default async function AccesoPage() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const misRoles = rolesDe(perfil);
  const [{ data: gruposPriv }, { data: misSol }] = await Promise.all([
    supabase.rpc('grupos_solicitables'),
    supabase.from('solicitudes_acceso')
      .select('id, tipo, grupo_id, rol, estado, creado_en, grupos(nombre)')
      .eq('perfil_id', user!.id).order('creado_en', { ascending: false }),
  ]);
  const solicitudes = (misSol ?? []) as any[];
  const privados = (gruposPriv ?? []) as any[];
  const pendGrupo = new Set(solicitudes.filter((s) => s.tipo === 'grupo' && s.estado === 'pendiente').map((s) => s.grupo_id));
  const pendRol = new Set(solicitudes.filter((s) => s.tipo === 'rol' && s.estado === 'pendiente').map((s) => s.rol));

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Solicitar acceso</h1>
          <p className="muted sub">Pide unirte a un <strong>grupo privado</strong> o acceder a una <strong>sección</strong>. Un líder, coordinación o admin revisará tu solicitud.</p>
        </div>
      </div>

      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="grupos" size={20} /> Grupos privados</h2>
      {privados.length === 0 ? (
        <div className="tarjeta"><span className="muted">No hay grupos privados disponibles para solicitar.</span></div>
      ) : (
        <div className="grid grid-2">
          {privados.map((g) => (
            <div key={g.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <strong>{g.nombre}</strong>
                <span className="insignia">{etiquetaArea(g.area)}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                {pendGrupo.has(g.id) ? <Pill tono="aviso">Solicitud pendiente</Pill> : (
                  <form action={solicitarGrupo}>
                    <input type="hidden" name="grupo_id" value={g.id} />
                    <button className="btn btn-acento">Solicitar acceso</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="llave" size={20} /> Secciones</h2>
      <div className="grid grid-2">
        {SECCIONES.map((s) => {
          const tiene = misRoles.includes(s.rol);
          return (
            <div key={s.rol} className="tarjeta">
              <strong>{s.etiqueta}</strong>
              <p className="muted" style={{ margin: '4px 0 10px', fontSize: '.85rem' }}>{s.desc}</p>
              {tiene ? <Pill tono="ok">Ya tienes acceso</Pill>
                : pendRol.has(s.rol) ? <Pill tono="aviso">Solicitud pendiente</Pill> : (
                  <form action={solicitarRol}>
                    <input type="hidden" name="rol" value={s.rol} />
                    <button className="btn btn-acento">Solicitar acceso</button>
                  </form>
                )}
            </div>
          );
        })}
      </div>

      {solicitudes.length > 0 && (
        <>
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="historial" size={20} /> Mis solicitudes</h2>
          <div className="tarjeta">
            <div className="tabla-scroll"><table>
              <thead><tr><th>Qué</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.tipo === 'grupo' ? (s.grupos?.nombre || 'Grupo') : (ETIQUETA_ROL[s.rol as Rol] ?? s.rol)}</td>
                    <td><Pill tono={s.estado === 'aprobada' ? 'ok' : s.estado === 'rechazada' ? 'critica' : 'aviso'}>{s.estado}</Pill></td>
                    <td>{s.estado === 'pendiente' && (
                      <form action={cancelarSolicitud}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="btn" style={{ minHeight: 30, padding: '2px 10px' }}>Cancelar</button>
                      </form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </AnimarEntrada>
  );
}
