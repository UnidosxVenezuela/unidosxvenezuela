import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import BotonConfirmar from '@/components/BotonConfirmar';
import EstadoVacio from '@/components/EstadoVacio';
import { crearProveedor, eliminarProveedor } from '../actions';

export default async function ProveedoresPage() {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil)) redirect('/dashboard');
  const gestor = puedeLogistica(perfil);
  const supabase = await createClient();
  const { data } = await supabase.from('proveedores').select('id, nombre, tipo, contacto, notas').order('nombre');
  const proveedores = (data ?? []) as any[];

  return (
    <div>
      <Link href="/insumos" className="muted">← Donaciones e Insumos</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div><h1>Proveedores</h1><p className="muted sub">Directorio de proveedores y transportistas para gestionar las solicitudes.</p></div>
      </div>

      {gestor && (
        <form action={crearProveedor} className="tarjeta" style={{ maxWidth: 640 }}>
          <div className="grid grid-2">
            <div className="campo"><label>Nombre</label><input name="nombre" className="input" required /></div>
            <div className="campo"><label>Tipo</label><input name="tipo" className="input" placeholder="Farmacia, mayorista, transportista…" /></div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Contacto (tel / WhatsApp)</label><input name="contacto" className="input" /></div>
            <div className="campo"><label>Notas</label><input name="notas" className="input" /></div>
          </div>
          <button className="btn btn-primario" type="submit"><Icono nombre="mas" size={16} /> Agregar proveedor</button>
        </form>
      )}

      {proveedores.length === 0 ? (
        <EstadoVacio icono="usuario" titulo="Sin proveedores" texto="Agrega proveedores y transportistas para asignarlos a las solicitudes." />
      ) : (
        <div className="grid grid-2">
          {proveedores.map((p) => (
            <div key={p.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <strong>{p.nombre}</strong>
                {p.tipo && <span className="insignia">{p.tipo}</span>}
              </div>
              {p.contacto && <div className="muted fila" style={{ gap: 4, marginTop: 4 }}><Icono nombre="whatsapp" size={14} /> {p.contacto}</div>}
              {p.notas && <p className="muted" style={{ margin: '6px 0 0', fontSize: '.85rem' }}>{p.notas}</p>}
              {gestor && (
                <form action={eliminarProveedor} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={p.id} />
                  <BotonConfirmar mensaje={'¿Eliminar a ' + p.nombre + '?'} className="btn btn-peligro" style={{ minHeight: 32, padding: '2px 10px' }}><Icono nombre="basura" size={14} /> Quitar</BotonConfirmar>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
