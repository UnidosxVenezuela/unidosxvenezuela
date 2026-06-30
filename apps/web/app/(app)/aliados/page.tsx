import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerAliados } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import BotonConfirmar from '@/components/BotonConfirmar';
import Pill from '@/components/Pill';
import type { EndpointAliado } from '@unidos/types';
import { crearEndpoint, eliminarEndpoint } from './actions';

export default async function AliadosPage() {
  const { user, perfil } = await requireUsuario();
  if (!puedeVerAliados(perfil?.rol)) redirect('/dashboard');
  const supabase = await createClient();

  const { data } = await supabase.from('endpoints_aliados')
    .select('id, plataforma, descripcion, url, metodo, formato, datos, auth_notas, contacto, activo, creado_por, creado_en')
    .order('plataforma');
  const endpoints = (data ?? []) as EndpointAliado[];
  const esAdmin = perfil?.rol === 'admin';

  return (
    <div>
      <RealtimeRefrescar tabla="endpoints_aliados" />
      <div className="pagina-cab">
        <div>
          <h1>Base de datos compartida</h1>
          <p className="muted sub">
            Endpoints de plataformas aliadas para unificar la data entre todas las apps de la respuesta.
            Acceso exclusivo de coordinación (admin) y líderes de plataforma aliada. <strong>Juntos somos más.</strong>
          </p>
        </div>
      </div>

      <form action={crearEndpoint} className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Compartir un endpoint</h2>
        <div className="grid grid-2">
          <div className="campo"><label>Plataforma</label><input name="plataforma" className="input" required placeholder="Ej: RescateYA" /></div>
          <div className="campo"><label>Método</label>
            <select name="metodo" className="input" defaultValue="GET">
              <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
            </select>
          </div>
        </div>
        <div className="campo"><label>Endpoint (URL https)</label><input name="url" className="input" type="url" required placeholder="https://api.tu-plataforma.org/v1/..." /></div>
        <div className="grid grid-2">
          <div className="campo"><label>Formato</label><input name="formato" className="input" placeholder="json, geojson, csv…" /></div>
          <div className="campo"><label>Contacto técnico</label><input name="contacto" className="input" placeholder="correo o WhatsApp" /></div>
        </div>
        <div className="campo"><label>¿Qué datos ofrece?</label><input name="datos" className="input" placeholder="Damnificados, refugios, inventario de acopio…" /></div>
        <div className="campo"><label>Descripción</label><input name="descripcion" className="input" /></div>
        <div className="campo"><label>Autenticación / notas de uso</label><input name="auth_notas" className="input" placeholder="API key por header, rate limits…" /></div>
        <button className="btn btn-primario"><Icono nombre="enlace" /> Compartir endpoint</button>
      </form>

      <h2>Endpoints disponibles ({endpoints.length})</h2>
      {endpoints.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="enlace" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>Aún no hay endpoints compartidos.</p>
        </div>
      ) : (
        endpoints.map((e) => {
          const h = hrefSeguro(e.url);
          return (
            <div key={e.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <div className="fila" style={{ gap: 6 }}>
                  <strong>{e.plataforma}</strong> <Pill tono="info" punto={false}>{e.metodo}</Pill>
                  {e.formato && <Pill tono="neutra" punto={false}>{e.formato}</Pill>}
                </div>
                {(esAdmin || e.creado_por === user!.id) && (
                  <form action={eliminarEndpoint}>
                    <input type="hidden" name="id" value={e.id} />
                    <BotonConfirmar mensaje="¿Eliminar este contacto aliado?" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Eliminar"><Icono nombre="basura" size={16} /></BotonConfirmar>
                  </form>
                )}
              </div>
              {e.descripcion && <p className="muted" style={{ marginBottom: 4 }}>{e.descripcion}</p>}
              {e.datos && <div><strong>Datos:</strong> {e.datos}</div>}
              <div style={{ wordBreak: 'break-all' }}>
                <strong>URL:</strong>{' '}
                {h ? <a href={h} target="_blank" rel="noopener noreferrer">{e.url}</a> : <span>{e.url}</span>}
              </div>
              {e.auth_notas && <div className="muted" style={{ fontSize: '.9rem' }}>Auth: {e.auth_notas}</div>}
              {e.contacto && <div className="muted" style={{ fontSize: '.9rem' }}>Contacto: {e.contacto}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}
