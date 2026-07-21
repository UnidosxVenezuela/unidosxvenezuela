import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import CamposOportunidad from '../CamposOportunidad';
import { crearOportunidad } from '../actions';

export default async function NuevaOportunidadPage() {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  return (
    <AnimarEntrada>
      <Link href="/captacion" className="muted">← Captación</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nueva oportunidad</h1>
          <p className="muted sub">Empieza en «Investigación». Podrás verificarla y enviarla después.</p>
        </div>
      </div>
      <form action={crearOportunidad} className="tarjeta">
        <CamposOportunidad />
        <div style={{ marginTop: 12 }}>
          <BotonEnviar className="btn btn-primario"><Icono nombre="mas" size={16} /> Crear oportunidad</BotonEnviar>
        </div>
      </form>
    </AnimarEntrada>
  );
}
