'use client';
// Tarjeta para activar/desactivar las notificaciones push en ESTE dispositivo.
// Registra el service worker (/sw.js), pide permiso, se suscribe con la clave
// VAPID pública y guarda la suscripción con una Server Action. Si el navegador
// no soporta push o falta la clave pública, no se muestra nada.
import { useEffect, useState } from 'react';
import { guardarSuscripcion, borrarSuscripcion } from '@/app/(app)/notificaciones/push-actions';
import Icono from './Icono';

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function base64ToUint8(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Estado = 'cargando' | 'oculto' | 'activo' | 'inactivo' | 'bloqueado';

export default function ActivarNotificaciones() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const soportado = typeof window !== 'undefined'
      && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!VAPID || !soportado) { setEstado('oculto'); return; }
    if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub ? 'activo' : 'inactivo');
      } catch { setEstado('inactivo'); }
    })();
  }, []);

  async function activar() {
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { setEstado('bloqueado'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(VAPID),
      });
      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
      const r = await guardarSuscripcion({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      });
      setEstado(r.ok ? 'activo' : 'inactivo');
    } catch {
      setEstado('inactivo');
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await borrarSuscripcion(sub.endpoint); await sub.unsubscribe(); }
    } catch { /* no-op */ } finally {
      setEstado('inactivo');
      setOcupado(false);
    }
  }

  if (estado === 'cargando' || estado === 'oculto') return null;

  return (
    <div className="tarjeta fila" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <div className="fila" style={{ gap: 10, alignItems: 'center' }}>
        <Icono nombre="avisos" size={20} />
        <div>
          <strong>Notificaciones en este dispositivo</strong>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            {estado === 'activo' && 'Activadas: recibirás avisos aunque no tengas la página abierta.'}
            {estado === 'inactivo' && 'Recibe avisos de tu grupo y tus tareas aunque no tengas la página abierta.'}
            {estado === 'bloqueado' && 'Están bloqueadas en el navegador. Actívalas en los ajustes del sitio (icono del candado) y recarga.'}
          </div>
        </div>
      </div>
      {estado === 'inactivo' && (
        <button className="btn btn-primario" onClick={activar} disabled={ocupado}>
          {ocupado ? 'Activando…' : 'Activar'}
        </button>
      )}
      {estado === 'activo' && (
        <button className="btn" onClick={desactivar} disabled={ocupado}>
          {ocupado ? 'Quitando…' : 'Desactivar'}
        </button>
      )}
    </div>
  );
}
