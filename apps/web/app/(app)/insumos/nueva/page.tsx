import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeGestionCasos } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Consejo from '@/components/Consejos';
import Icono from '@/components/Icono';
import BotonEnviar from '@/components/BotonEnviar';
import CamposSolicitudLogistica from './CamposSolicitudLogistica';
import { crearSolicitud } from '../actions';

export default async function NuevaSolicitudPage() {
  const { perfil } = await requireUsuario();
  // Gate con el HELPER, nunca con rolesDe().includes(): `puedeLogistica` incluye al MANDO
  // del grupo (líder/coordinador sin rol operativo, 0214), que la RLS sí reconoce. Antes
  // esta página solo llamaba a `requireUsuario()`: CUALQUIER cuenta entraba y sembraba
  // tareas en el tablero del área (la policy solins_insert también estaba abierta; 0223
  // la cierra).
  // Desde 0241 el alta es de las DOS áreas: Verificación y Gestión es dueña de
  // 'solicitado' y 'en gestión', y por tanto de la entrada del flujo.
  if (!puedeLogistica(perfil) && !puedeGestionCasos(perfil)) redirect('/insumos');

  const supabase = await createClient();
  const { data: puntos } = await supabase.from('puntos_acopio').select('id, nombre').order('nombre');

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/insumos" className="muted">← Logística</Link>
      <Consejo id="insumo-nuevo" titulo="Una solicitud completa se puede cubrir de verdad">
        Esta alta crea la <strong>solicitud completa</strong>, igual que las que llegan de Recopilación: con
        <strong> contacto</strong>, <strong>ubicación</strong> y <strong>desglose por ítem</strong>. Gracias a eso podrás
        adjuntar fotos que vean todas las áreas, ver los centros de acopio cercanos, anotar cuánto se cubre de cada cosa
        y pedirle a Redacción <strong>solo lo que falte</strong>.
      </Consejo>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nueva solicitud de Logística</h1>
          <p className="muted sub" style={{ maxWidth: 560 }}>
            Para lo que el área levanta por su cuenta (una visita, una llamada, un centro que se queda sin algo).
            Nace <strong>confirmada</strong>: no vuelve a pasar por Verificación, así que responde por sus datos.
          </p>
        </div>
      </div>

      <form action={crearSolicitud} className="tarjeta" style={{ marginTop: 12 }}>
        <div className="campo">
          <label htmlFor="titulo">Título de la solicitud *</label>
          <input id="titulo" name="titulo" className="input" required maxLength={200}
            placeholder="Ej.: Ambulatorio de Petare sin insumos básicos" />
        </div>
        <div className="campo">
          <label htmlFor="descripcion">¿Qué se necesita y para quién? *</label>
          <textarea id="descripcion" name="descripcion" className="input" rows={3} required
            placeholder="Descripción concreta, clara y actualizada de la ayuda que hace falta." />
        </div>

        <CamposSolicitudLogistica puntos={(puntos ?? []) as { id: string; nombre: string }[]} />

        <div className="campo">
          <label htmlFor="archivos">Adjuntar imágenes o documentos (opcional)</label>
          <input id="archivos" name="archivos" className="input" type="file" multiple
                 accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
          <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>
            Se adjuntan <strong>a la solicitud</strong>, así que las ven todas las áreas (hasta 10 MB cada uno).
          </p>
        </div>

        <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 8px' }}>
          Al crearla queda marcada como <strong>solicitud del área de Logística</strong> y se avisa a Verificación.
        </p>
        <BotonEnviar cargando="Creando…"><Icono nombre="ok" size={16} /> Crear solicitud</BotonEnviar>
      </form>
    </div>
  );
}
