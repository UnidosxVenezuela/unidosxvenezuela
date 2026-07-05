import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { crearCaso } from '../actions';
import TituloConDuplicados from './TituloConDuplicados';
import CategoriaConNna from './CategoriaConNna';
import AvisoEnlace from '@/components/AvisoEnlace';
import Consejo from '@/components/Consejos';
import BotonEnviar from '@/components/BotonEnviar';

export default async function NuevoCasoPage() {
  const { perfil } = await requireUsuario();
  if (!esAdministrador(perfil) && !rolesDe(perfil).includes('recopilacion')) redirect('/casos');

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/casos" className="muted">← Casos</Link>
      <Consejo id="caso-nuevo" titulo="Reportar bien un caso">
        Pon un <strong>título claro</strong>, la fuente y su enlace, y adjunta capturas de respaldo. Si aparece un aviso de <strong>posible duplicado</strong>, revísalo antes de crear.
      </Consejo>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nuevo caso</h1>
          <p className="muted sub">Registra la información que llega para verificar: título, categoría, fuente, fecha y archivos de respaldo.</p>
        </div>
      </div>
      <form action={crearCaso} className="tarjeta" style={{ marginTop: 12 }}>
        <TituloConDuplicados esAdmin={esAdministrador(perfil)} />
        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea id="descripcion" name="descripcion" className="input" rows={3} />
        </div>
        <div className="grid grid-2">
          <CategoriaConNna />
          <div className="campo">
            <label htmlFor="fecha_publicacion">Fecha de publicación</label>
            <input id="fecha_publicacion" name="fecha_publicacion" className="input" type="date" />
          </div>
          <div className="campo">
            <label htmlFor="fuente">Fuente</label>
            <input id="fuente" name="fuente" className="input" placeholder="Ej.: Facebook - Familia Pérez" />
          </div>
          <div className="campo">
            <label htmlFor="fuente_url">Enlace de la fuente (opcional)</label>
            <AvisoEnlace name="fuente_url" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="archivos">Adjuntar archivos (opcional)</label>
          <input id="archivos" name="archivos" className="input" type="file" multiple
                 accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
          <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>Capturas, fotos o documentos que respalden el caso (hasta 10 MB cada uno).</p>
        </div>
        <BotonEnviar cargando="Creando…">Crear caso</BotonEnviar>
      </form>
    </div>
  );
}
