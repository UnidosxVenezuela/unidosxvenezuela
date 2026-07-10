import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ROL, HABILIDADES_SUGERIDAS, PAISES } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import { actualizarPerfil, desvincularTelegram } from './actions';
import VincularTelegram from './VincularTelegram';
import { esEmailInternoWhatsapp, mostrarWhatsapp } from '@/lib/whatsapp';
import CambiarContrasena from '@/components/CambiarContrasena';
import SubirAvatar from '@/components/SubirAvatar';
import SelectorHabilidades from '@/components/SelectorHabilidades';
import EntradaTelefono from '@/components/EntradaTelefono';
import Pill from '@/components/Pill';

export default async function PerfilPage({
  searchParams,
}: { searchParams: { guardado?: string } }) {
  const { user, perfil } = await requireUsuario();
  const avatarUrl = perfil?.avatar_url ?? null;
  // Sello de identidad verificada (2ª verificación aprobada), aparte del acceso.
  const supabase = await createClient();
  const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
  const identidadVerificada = (vi as any)?.estado === 'aprobada';

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="pagina-cab">
        <div>
          <h1>Mi perfil</h1>
          <div className="fila" style={{ marginTop: 4, flexWrap: 'wrap' }}>
            {[perfil?.rol ?? 'voluntario', ...(perfil?.roles_extra ?? [])].map((r) => (
              <Pill key={r} tono="neutra" punto={false}>{ETIQUETA_ROL[r as Rol] ?? r}</Pill>
            ))}
            <Pill tono={perfil?.verificado ? 'ok' : 'aviso'}>{perfil?.verificado ? 'Verificado' : 'Sin verificar'}</Pill>
            {identidadVerificada && <Pill tono="ok" icono="llave">Identidad verificada</Pill>}
          </div>
        </div>
      </div>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <SubirAvatar nombre={perfil?.nombre_completo} urlActual={avatarUrl} />
      </div>

      {searchParams?.guardado && (
        <p className="exito" style={{ marginBottom: 12 }}>✓ Cambios guardados</p>
      )}

      <form action={actualizarPerfil} className="tarjeta">
        <div className="campo">
          <label htmlFor="nombre">Nombre completo</label>
          <input id="nombre" name="nombre" className="input" defaultValue={perfil?.nombre_completo ?? ''} required />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="telefono">WhatsApp / Teléfono</label>
            <EntradaTelefono name="telefono" defaultValue={perfil?.telefono ?? ''} />
          </div>
          <div className="campo">
            <label htmlFor="whatsapp">WhatsApp (con código de país)</label>
            <input id="whatsapp" name="whatsapp" className="input" type="tel" defaultValue={mostrarWhatsapp(perfil?.whatsapp)} placeholder="+58 412…" />
          </div>
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="organizacion">Organización</label>
            <input id="organizacion" name="organizacion" className="input" defaultValue={perfil?.organizacion ?? ''} />
          </div>
          <div className="campo">
            <label htmlFor="pais">País desde el que ayudas</label>
            <select id="pais" name="pais" className="input" defaultValue={perfil?.pais ?? ''}>
              <option value="">— Selecciona tu país —</option>
              {PAISES.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="campo">
          <label>{esEmailInternoWhatsapp(user?.email) ? 'Entras con tu WhatsApp' : 'Correo'}</label>
          <input className="input" value={esEmailInternoWhatsapp(user?.email) ? mostrarWhatsapp(perfil?.whatsapp) : (user?.email ?? '')} disabled />
        </div>
        <SelectorHabilidades iniciales={perfil?.habilidades ?? []} sugeridas={HABILIDADES_SUGERIDAS} />

        {/* Ficha del voluntario (0115): ayuda a coordinar por horario y capacidad. */}
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="ciudad">Ciudad de residencia</label>
            <input id="ciudad" name="ciudad" className="input" defaultValue={perfil?.ciudad ?? ''} placeholder="Ej.: Caracas" />
          </div>
          <div className="campo">
            <label htmlFor="horas_semana">Horas por semana</label>
            <input id="horas_semana" name="horas_semana" className="input" defaultValue={perfil?.horas_semana ?? ''} placeholder="Ej.: 5-10 horas" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="disponibilidad">Disponibilidad (horario + zona horaria)</label>
          <input id="disponibilidad" name="disponibilidad" className="input" defaultValue={perfil?.disponibilidad ?? ''} placeholder="Ej.: 4-8 pm hora Venezuela (GMT-4)" />
        </div>
        <div className="campo">
          <label htmlFor="experiencia">Experiencia relevante (opcional)</label>
          <textarea id="experiencia" name="experiencia" className="input" rows={3} defaultValue={perfil?.experiencia ?? ''} placeholder="Verificación de información, búsqueda de personas, atención humanitaria, gestión de datos…" />
        </div>
        <div className="campo">
          <label htmlFor="contacto_emergencia">Contacto de emergencia (opcional)</label>
          <input id="contacto_emergencia" name="contacto_emergencia" className="input" defaultValue={perfil?.contacto_emergencia ?? ''} placeholder="Nombre (relación) · teléfono" />
          <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>Solo lo ve la administración; nos ayuda a cuidarte.</p>
        </div>

        <button className="btn btn-primario" type="submit">Guardar cambios</button>
      </form>

      {/* Avisos por Telegram (0139): canal opcional y adicional a la campana y al push. */}
      <div id="avisos-telegram" className="tarjeta" style={{ marginTop: 12, scrollMarginTop: 80 }}>
        <h2 style={{ marginTop: 0 }}>Avisos por Telegram</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Recibe los mismos avisos también por Telegram, con un botón que abre la app. Es opcional
          y se suma a la campana y a las notificaciones del navegador.
        </p>
        {perfil?.telegram_chat_id ? (
          <div>
            <Pill tono="ok" icono="ok">
              Vinculado{perfil.telegram_username ? ' como ' + perfil.telegram_username : ''}
            </Pill>
            <form action={desvincularTelegram} style={{ marginTop: 10 }}>
              <button type="submit" className="btn">Desvincular</button>
            </form>
          </div>
        ) : (
          <VincularTelegram />
        )}
      </div>

      <CambiarContrasena />
    </div>
  );
}
