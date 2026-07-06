import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminVerificacion, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import AsistenteDigitalizacion from '../AsistenteDigitalizacion';

export default async function NuevaDigitalizacionPage() {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const roles = rolesDe(perfil);
  const esDig = roles.includes('digitalizador');
  // El Admin de Verificaciones digitaliza en su área (la RLS/acción exigen su 2ª verificación).
  if (!esAdmin && !esDig && !esAdminVerificacion(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  // El digitalizador necesita 2ª verificación aprobada; admin exento.
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') redirect('/digitalizacion');
  }

  // El digitalizador trabaja todos los tipos de lugar (sin frontera).
  const tiposPermitidos = ['hospital', 'albergue', 'acopio', 'otro'];

  const { data: centrosData } = await supabase.from('puntos_acopio').select('id, nombre, lat, lng').eq('activo', true).order('nombre');
  const centros = centrosData ?? [];

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
