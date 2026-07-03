import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import AsistenteDigitalizacion from '../AsistenteDigitalizacion';

export default async function NuevaDigitalizacionPage() {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const roles = rolesDe(perfil);
  const esBusq = roles.includes('busqueda');
  const esLog = roles.includes('logistica');
  if (!esAdmin && !esBusq && !esLog) redirect('/dashboard');
  const supabase = await createClient();

  let identidadOK = esAdmin;
  if (!esAdmin && esBusq) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    identidadOK = (vi as any)?.estado === 'aprobada';
  }

  // Tipos de lugar permitidos según el rol (D-Quién): Búsqueda con 2ª verif →
  // hospital/albergue/otro; Logística → acopio/albergue; admin → todos.
  const permitidos = new Set<string>();
  if (esAdmin || (esBusq && identidadOK)) ['hospital', 'albergue', 'otro'].forEach((t) => permitidos.add(t));
  if (esAdmin || esLog) ['acopio', 'albergue'].forEach((t) => permitidos.add(t));
  const tiposPermitidos = ['hospital', 'albergue', 'acopio', 'otro'].filter((t) => permitidos.has(t));
  if (tiposPermitidos.length === 0) redirect('/digitalizacion');

  let centros: any[] = [];
  if (permitidos.has('acopio')) {
    const { data } = await supabase.from('puntos_acopio').select('id, nombre, lat, lng').eq('activo', true).order('nombre');
    centros = data ?? [];
  }

  return (
    <AnimarEntrada>
      <Link href="/digitalizacion" className="muted">← Digitalización</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="imagen" size={24} /> Nueva digitalización</h1>
          <p className="muted sub">Sube una foto o escaneo de la lista. El reconocimiento corre en tu dispositivo; confirma cada línea antes de guardar.</p>
        </div>
      </div>
      <AsistenteDigitalizacion tiposPermitidos={tiposPermitidos} centros={centros} />
    </AnimarEntrada>
  );
}
