'use client';
import Link from 'next/link';

/**
 * Acceso rápido a la sección «Avisos por Telegram» del perfil, en la barra
 * superior (junto a Consejos). El ícono cambia según el estado: azul con punto
 * verde = vinculado; color normal = sin vincular. Reutiliza el estilo `.btn-consejos`
 * para verse igual (y ocultar la etiqueta en móvil). Recibe solo un booleano
 * (nunca el chat_id) para no exponer datos.
 */
export default function BotonTelegram({ vinculado }: { vinculado?: boolean }) {
  // Si el bot no está configurado en este entorno, no mostramos el acceso.
  if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT) return null;
  return (
    <Link
      href="/perfil#avisos-telegram"
      className="btn-consejos"
      style={{ textDecoration: 'none', color: vinculado ? '#229ED9' : undefined }}
      title={vinculado ? 'Telegram vinculado — recibes avisos aquí' : 'Vincular Telegram para recibir avisos'}
      aria-label={vinculado ? 'Telegram vinculado' : 'Vincular Telegram'}
    >
      <span aria-hidden style={{ position: 'relative', display: 'inline-flex' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
        </svg>
        {vinculado && (
          <span
            aria-hidden
            style={{
              position: 'absolute', top: -1, right: -3, width: 8, height: 8,
              borderRadius: '50%', background: '#16a34a',
              boxShadow: '0 0 0 1.6px var(--fondo, #fff)',
            }}
          />
        )}
      </span>
      <span className="bc-txt">Telegram{vinculado ? ' ✓' : ''}</span>
    </Link>
  );
}
