import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador } from '@/lib/auth';
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
  const { perfil } = await requireUsuario();
  if (!esAdministrador(perfil)) redirect('/digitalizacion');
  const supabase = await createClient();

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
          <p className="muted sub">Completa los datos de los lugares nuevos y verifica que la información digitalizada corresponda a cada lugar. {pendientes.length > 0 && <><strong>{pendientes.length}</strong> por revisar.</>}</p>
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
          {l.estado !== 'verificado' && (
            <form action={verificarLugar} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={l.id} />
              <BotonEnviar className="btn btn-acento"><Icono nombre="ok" size={16} /> Marcar verificado</BotonEnviar>
              <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>Confirma que los datos son correctos y que la información digitalizada corresponde realmente a este lugar.</p>
            </form>
          )}
        </div>
      ))}
    </AnimarEntrada>
  );
}
