'use client';
import { useCallback, useEffect, useRef } from 'react';

// Cloudflare Turnstile. La verificación del token la hace Supabase Auth
// (configura el "secret" en Supabase → Auth → Bot & Abuse). Aquí solo
// renderizamos el widget y devolvemos el token al formulario.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** ¿Hay CAPTCHA configurado? Si no, los formularios no lo exigen (dev/local). */
export function captchaActivo() {
  return !!SITE_KEY;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export default function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useCallback(onToken, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelado = false;

    const render = () => {
      if (cancelado || !contenedor.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(contenedor.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => cb(token),
        'expired-callback': () => cb(null),
        'error-callback': () => cb(null),
        theme: 'light',
      });
    };

    if (window.turnstile) {
      render();
    } else if (!document.getElementById(SCRIPT_ID)) {
      const sc = document.createElement('script');
      sc.id = SCRIPT_ID;
      sc.src = SCRIPT_SRC;
      sc.async = true;
      sc.defer = true;
      sc.onload = render;
      document.head.appendChild(sc);
    } else {
      const t = setInterval(() => {
        if (window.turnstile) { clearInterval(t); render(); }
      }, 200);
      return () => clearInterval(t);
    }

    return () => {
      cancelado = true;
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* ya retirado */ }
        widgetId.current = null;
      }
    };
  }, [cb]);

  if (!SITE_KEY) return null;
  return <div ref={contenedor} className="campo" style={{ minHeight: 65 }} />;
}
