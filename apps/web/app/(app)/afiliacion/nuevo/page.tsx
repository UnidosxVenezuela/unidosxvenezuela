import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAfiliacion } from '@/lib/auth';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import CamposAfiliado from '../CamposAfiliado';
import { crearAfiliado } from '../actions';

export const metadata = { title: 'Nuevo afiliado' };

export default async function NuevoAfiliadoPage() {
  const { perfil } = await requireUsuario();
  if (!puedeAfiliacion(perfil)) redirect('/dashboard');
  return (
    <AnimarEntrada>
      <Link href="/afiliacion" className="muted">← Afiliación</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nuevo afiliado</h1>
          <p className="muted sub">Un profesional o voluntario del departamento, clasificado por cargo.</p>
        </div>
      </div>
      <form action={crearAfiliado} className="tarjeta">
        <CamposAfiliado />
        <div style={{ marginTop: 12 }}>
          <BotonEnviar className="btn btn-primario"><Icono nombre="mas" size={16} /> Registrar afiliado</BotonEnviar>
        </div>
      </form>
    </AnimarEntrada>
  );
}
