import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, PRIORIDADES, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import { crearSolicitud } from '../actions';

export default async function NuevaSolicitudPage() {
  await requireUsuario();
  const supabase = await createClient();
  const { data: puntos } = await supabase.from('puntos_acopio').select('id, nombre').order('nombre');

  return (
    <div>
      <Link href="/insumos" className="muted">← Donaciones e Insumos</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nueva solicitud de insumo</h1>
          <p className="muted sub" style={{ maxWidth: 520 }}>Registra qué se necesita. Cualquier persona verificada puede pedir; logística la gestiona.</p>
        </div>
      </div>
      <form action={crearSolicitud} className="tarjeta" style={{ maxWidth: 560 }}>
        <div className="campo">
          <label htmlFor="titulo">¿Qué se necesita?</label>
          <input id="titulo" name="titulo" className="input" required placeholder="Ej: Antibióticos pediátricos" />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" className="input" defaultValue="otro">
              {TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t] ?? t}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="urgencia">Urgencia</label>
            <select id="urgencia" name="urgencia" className="input" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="cantidad">Cantidad</label>
            <input id="cantidad" name="cantidad" className="input" placeholder="Ej: 50 cajas / 200 kg" />
          </div>
          <div className="campo">
            <label htmlFor="punto_id">Centro de acopio (opcional)</label>
            <select id="punto_id" name="punto_id" className="input" defaultValue="">
              <option value="">— Ninguno —</option>
              {(puntos ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Detalles (opcional)</label>
          <textarea id="descripcion" name="descripcion" className="input" rows={3} placeholder="Especificaciones, para quién, notas…" />
        </div>
        <button className="btn btn-primario" type="submit"><Icono nombre="ok" size={16} /> Crear solicitud</button>
      </form>
    </div>
  );
}
