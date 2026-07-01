import Link from 'next/link';
import { requireUsuario, puedePsicosocial } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TIPOS_APOYO, ETIQUETA_TIPO_APOYO, PRIORIDADES, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import { crearAcompanamiento } from '../actions';

export default async function NuevaSolicitudPsicoPage() {
  const { perfil } = await requireUsuario();
  if (!puedePsicosocial(perfil)) redirect('/dashboard');

  return (
    <div>
      <Link href="/psicosocial" className="muted">← Apoyo Psicosocial</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nueva solicitud de apoyo</h1>
          <p className="muted sub" style={{ maxWidth: 540 }}>
            Registra a la persona que necesita acompañamiento. La coordinación psicosocial
            asignará un profesional. Para proteger la privacidad, puedes usar solo el nombre
            de pila o un alias.
          </p>
        </div>
      </div>

      <form action={crearAcompanamiento} className="tarjeta" style={{ maxWidth: 580 }}>
        <div className="campo">
          <label htmlFor="persona">Persona (nombre o alias)</label>
          <input id="persona" name="persona" className="input" required maxLength={120} placeholder="Ej: María G. / «Rosa»" />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="tipo">Tipo de apoyo</label>
            <select id="tipo" name="tipo" className="input" defaultValue="otro">
              {TIPOS_APOYO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_APOYO[t]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="riesgo">Nivel de riesgo</label>
            <select id="riesgo" name="riesgo" className="input" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
            </select>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="contacto">Contacto (opcional)</label>
          <input id="contacto" name="contacto" className="input" placeholder="Teléfono o WhatsApp de la persona" />
        </div>
        <div className="campo">
          <label htmlFor="motivo">Motivo / situación (opcional)</label>
          <textarea id="motivo" name="motivo" className="input" rows={4} placeholder="Describe brevemente qué ocurre y por qué se pide apoyo. Sé prudente con los datos sensibles." />
        </div>
        <p className="muted" style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Icono nombre="admin" size={16} /> Esta información es confidencial. Solo la verán el profesional asignado y la coordinación psicosocial.
        </p>
        <button className="btn btn-primario" type="submit"><Icono nombre="ok" size={16} /> Registrar solicitud</button>
      </form>
    </div>
  );
}
