import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { resumenTexto } from '@/lib/correo';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import Consejo from '@/components/Consejos';
import { guardarPlantillaCorreo } from '../actions';

export const metadata = { title: 'Plantillas de correo' };
export const dynamic = 'force-dynamic';

/** Plantillas de correo institucional (0217). El texto lo edita el propio
 *  departamento; las variables NO se declaran a mano: se deducen del texto. */
export default async function PlantillasCorreoPage() {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  const { data, error } = await supabase.from('correo_plantillas')
    .select('id, clave, nombre, asunto, cuerpo_html, variables, area, activa, actualizado_en')
    .order('activa', { ascending: false }).order('nombre');
  const plantillas = (data ?? []) as any[];

  /** Formulario compartido por «nueva» y «editar»: la RPC hace upsert por clave. */
  const Campos = ({ p }: { p?: any }) => (
    <>
      <div className="grid grid-2">
        <div className="campo">
          <label>Nombre</label>
          <input name="nombre" className="input" required maxLength={120} defaultValue={p?.nombre ?? ''} placeholder="ej.: Solicitud de donación" />
        </div>
        <div className="campo">
          <label>Clave {p ? <span className="muted">(no la cambies: identifica la plantilla)</span> : <span className="muted">(minúsculas y guion bajo)</span>}</label>
          <input name="clave" className="input" required maxLength={60} defaultValue={p?.clave ?? ''}
            readOnly={!!p} placeholder="solicitud_donacion" />
        </div>
        <div className="campo" style={{ gridColumn: '1 / -1' }}>
          <label>Asunto</label>
          <input name="asunto" className="input" required maxLength={300} defaultValue={p?.asunto ?? ''}
            placeholder="Solicitud de apoyo para {{necesidad}}" />
        </div>
        <div className="campo" style={{ gridColumn: '1 / -1' }}>
          <label>Cuerpo (HTML sencillo: <code>&lt;p&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;ul&gt;</code>…)</label>
          <textarea name="cuerpo_html" className="input" rows={10} required defaultValue={p?.cuerpo_html ?? ''}
            placeholder={'<p>Estimado/a {{nombre}}:</p>\n<p>…</p>'} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' }} />
        </div>
        <div className="campo">
          <label>Activa</label>
          <select name="activa" className="input" defaultValue={p ? String(p.activa) : 'true'}>
            <option value="true">Sí, se puede usar</option>
            <option value="false">No (queda archivada)</option>
          </select>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '.82rem', margin: '6px 0 0' }}>
        Escribe los huecos como <code>{'{{nombre}}'}</code>, <code>{'{{organizacion}}'}</code>… Se detectan solos y se piden al redactar.
      </p>
    </>
  );

  return (
    <AnimarEntrada>
      <Link href="/alianzas/correo" className="muted">← Correo institucional</Link>
      <Consejo id="correo-plantillas" titulo="Plantillas de correo">
        El texto institucional, escrito una vez y reutilizable por todo el equipo. Los <strong>huecos</strong> se marcan con <code>{'{{llaves}}'}</code> y se completan al redactar, así nadie improvisa una carta de presentación a las 2 de la mañana.
      </Consejo>

      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="pizarra" size={24} /> Plantillas de correo</h1>
          <p className="muted sub">{plantillas.length} plantilla(s). Las inactivas no aparecen al redactar.</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <Link className="btn btn-primario" href="/alianzas/correo/nuevo"><Icono nombre="cohete" size={16} /> Redactar</Link>
        </div>
      </div>

      {error && (
        <div className="tarjeta" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}><strong>Aún no disponible.</strong> <span className="muted">Falta aplicar la migración <code>0217_correo_institucional.sql</code>.</span></p>
        </div>
      )}

      {plantillas.length === 0 && !error && (
        <EstadoVacio icono="pizarra" titulo="Sin plantillas"
          texto="La migración 0217 siembra cuatro plantillas de Alianzas: presentación, solicitud de donación, agradecimiento y seguimiento. Si no aparecen, créalas aquí abajo." />
      )}

      <div className="fila" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
        {plantillas.map((p) => (
          <details key={p.id} className="tarjeta">
            <summary style={{ cursor: 'pointer' }}>
              <span className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                <strong>{p.nombre}</strong>
                <Pill tono={p.activa ? 'ok' : 'neutra'} punto={false}>{p.activa ? 'Activa' : 'Archivada'}</Pill>
                <span className="muted" style={{ fontSize: '.8rem' }}>{p.clave}</span>
              </span>
              <div className="muted" style={{ fontSize: '.82rem', marginTop: 4 }}>{resumenTexto(p.cuerpo_html)}</div>
            </summary>
            <div className="fila" style={{ gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              {((p.variables ?? []) as string[]).map((v) => (
                <Pill key={v} tono="info" punto={false}>{'{{' + v + '}}'}</Pill>
              ))}
              <span className="muted" style={{ fontSize: '.78rem' }}>actualizada {fechaHora(p.actualizado_en)}</span>
            </div>
            <form action={guardarPlantillaCorreo} style={{ borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
              <Campos p={p} />
              <div style={{ marginTop: 12 }}>
                <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Guardar cambios</BotonEnviar>
              </div>
            </form>
          </details>
        ))}
      </div>

      <details className="tarjeta" style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          <span className="fila" style={{ gap: 8 }}><Icono nombre="mas" size={16} /> Nueva plantilla</span>
        </summary>
        <form action={guardarPlantillaCorreo} style={{ marginTop: 10 }}>
          <Campos />
          <div style={{ marginTop: 12 }}>
            <BotonEnviar className="btn btn-primario"><Icono nombre="mas" size={16} /> Crear plantilla</BotonEnviar>
          </div>
        </form>
      </details>
    </AnimarEntrada>
  );
}
