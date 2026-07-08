import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminDigitalizacion, esVerificadorDigitalizacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_ESTADO_LUGAR, TIPOS_LUGAR } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import { actualizarLugar, verificarLugar } from '../actions';

const TONO: Record<string, 'ok' | 'aviso' | 'critica'> = { verificado: 'ok', pendiente_verificar: 'aviso', pendiente_llenado: 'critica' };

export default async function LugaresPage() {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const esAdminDig = esAdminDigitalizacion(perfil);
  const esVerif = esVerificadorDigitalizacion(perfil);
  // Moderan el admin general, el admin de Digitalización (su área) y el verificador.
  if (!esAdmin && !esAdminDig && !esVerif) redirect('/digitalizacion');
  const supabase = await createClient();

  // El verificador (que no es admin) necesita su 2ª verificación aprobada: modera
  // datos de lugares sensibles. Admin y admin de Digitalización quedan exentos.
  if (esVerif && !esAdmin && !esAdminDig) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') {
      return (
        <AnimarEntrada>
          <Link href="/digitalizacion" className="muted">← Digitalización</Link>
          <div className="tarjeta" style={{ maxWidth: 560, marginTop: 8 }}>
            <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="llave" size={20} /> Completa tu segunda verificación</h2>
            <p className="muted">Para moderar los lugares del mapa necesitas tu <strong>verificación de identidad</strong> aprobada.</p>
            <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Ir a mi verificación</Link>
          </div>
        </AnimarEntrada>
      );
    }
  }

  const { data: lugaresRaw } = await supabase.from('lugares')
    .select('id, tipo, nombre, direccion, lat, lng, estado, notas, creado_en, listados_digitalizados(count)')
    .order('estado', { ascending: true }).order('actualizado_en', { ascending: false }).limit(200);
  const lugares = (lugaresRaw ?? []) as any[];
  const nListados = (l: any) => Number(l?.listados_digitalizados?.[0]?.count ?? 0);
  const pendientes = lugares.filter((l) => l.estado !== 'verificado');

  return (
    <AnimarEntrada>
      <Link href="/digitalizacion" className="muted">← Digitalización</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="mapa" size={24} /> Lugares (moderación)</h1>
          <p className="muted sub">Completa los datos de los lugares nuevos y verifica que la información digitalizada corresponda a cada lugar. Al <strong>verificar</strong>, el lugar aparece en <strong>Centros y lugares</strong> (Acopio) para gestionarlo. {pendientes.length > 0 && <><strong>{pendientes.length}</strong> por revisar.</>}</p>
        </div>
      </div>

      {lugares.length === 0 ? (
        <EstadoVacio icono="mapa" titulo="Aún no hay lugares" texto="Cuando se digitalice una lista, su lugar aparecerá aquí para completarlo y verificarlo." />
      ) : lugares.map((l) => (
        <div key={l.id} className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="fila" style={{ gap: 8 }}>
              <strong>{l.nombre}</strong>
              <Pill tono={TONO[l.estado] ?? 'neutra'} punto={false}>{ETIQUETA_ESTADO_LUGAR[l.estado] ?? l.estado}</Pill>
            </span>
            <span className="muted" style={{ fontSize: '.82rem' }}>{nListados(l)} listado(s) · {fechaHora(l.creado_en)}</span>
          </div>
          <form action={actualizarLugar} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={l.id} />
            <div className="grid grid-2">
              <div className="campo">
                <label>Tipo</label>
                <select name="tipo" className="input" defaultValue={l.tipo}>
                  {TIPOS_LUGAR.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_LUGAR[t]}</option>)}
                </select>
              </div>
              <div className="campo"><label>Nombre</label><input name="nombre" className="input" defaultValue={l.nombre} required /></div>
              <div className="campo"><label>Latitud</label><input name="lat" className="input" inputMode="decimal" defaultValue={l.lat ?? ''} /></div>
              <div className="campo"><label>Longitud</label><input name="lng" className="input" inputMode="decimal" defaultValue={l.lng ?? ''} /></div>
              <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Dirección</label><input name="direccion" className="input" defaultValue={l.direccion ?? ''} /></div>
              <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Notas</label><input name="notas" className="input" defaultValue={l.notas ?? ''} /></div>
            </div>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              <BotonEnviar className="btn btn-primario">Guardar datos</BotonEnviar>
            </div>
          </form>
          {l.estado !== 'verificado' ? (
            (l.lat != null && l.lng != null) ? (
              <form action={verificarLugar} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={l.id} />
                <BotonEnviar className="btn btn-acento"><Icono nombre="ok" size={16} /> Marcar verificado</BotonEnviar>
                <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>Al verificar, el lugar aparece en <strong>Centros y lugares</strong> para gestionarlo (datos, capacidad, inventario). Confirma que la información corresponde realmente a este lugar.</p>
              </form>
            ) : (
              <p className="muted fila" style={{ marginTop: 8, fontSize: '.82rem', gap: 6 }}>
                <Icono nombre="ubicacion" size={14} /> Agrega <strong>latitud y longitud</strong> y guarda los datos para poder verificar (así aparece en el mapa y en Centros).
              </p>
            )
          ) : (l.lat != null && l.lng != null) ? (
            <p className="muted fila" style={{ marginTop: 8, fontSize: '.82rem', gap: 6 }}>
              <Icono nombre="ok" size={14} /> Verificado. <Link href="/acopio">Gestionar en Centros y lugares →</Link>
            </p>
          ) : (
            <p className="fila" style={{ marginTop: 8, fontSize: '.82rem', gap: 6, color: 'var(--rojo, #CE1126)' }}>
              <Icono nombre="ubicacion" size={14} /> Verificado, pero <strong>sin ubicación</strong>: no aparece en el mapa ni en Centros. Escribe latitud y longitud arriba y pulsa «Guardar datos».
            </p>
          )}
        </div>
      ))}
    </AnimarEntrada>
  );
}
