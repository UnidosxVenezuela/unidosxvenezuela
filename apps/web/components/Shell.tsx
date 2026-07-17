'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Icono from './Icono';
import NavLateral from './NavLateral';
import CampanaNotificaciones from './CampanaNotificaciones';
import Presencia from './Presencia';
import { ToggleConsejos } from './Consejos';
import BotonTelegram from './BotonTelegram';
import UserChip from './UserChip';
import SonidoBotones from './SonidoBotones';
import TemaToggle from './TemaToggle';
import PaletaComandos from './PaletaComandos';

import type { NavFlags } from '@/lib/nav-flags';

type Usuario = { nombre: string; rol?: string | null; email?: string | null; avatarUrl?: string | null; estadoPresencia?: string | null; telegramVinculado?: boolean };

/**
 * Shell de la app: barra lateral (colapsable en escritorio, cajón off-canvas en
 * móvil) + barra superior (hamburguesa + campana + chip de usuario). Mantiene el
 * contenido (children) como Server Component; solo el cromo es cliente.
 */
export default function Shell({ usuario, nav, children }: { usuario: Usuario; nav: NavFlags; children: React.ReactNode }) {
  const [colapsada, setColapsada] = useState(false); // escritorio
  const [cajon, setCajon] = useState(false);          // móvil
  const [esMovil, setEsMovil] = useState(false);
  const ruta = usePathname();
  const asideRef = useRef<HTMLElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  // Preferencia de colapso en escritorio (persistente).
  useEffect(() => { try { setColapsada(localStorage.getItem('uxv:lateral') === 'cerrada'); } catch {} }, []);

  // Al navegar, cerrar el cajón móvil.
  useEffect(() => { setCajon(false); }, [ruta]);

  // Saber si estamos en móvil (para desactivar el foco del lateral oculto).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const on = () => setEsMovil(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Cajón móvil como diálogo accesible: al abrir enfoca el primer enlace; Escape cierra.
  useEffect(() => {
    if (!cajon) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarCajon(); };
    document.addEventListener('keydown', onKey);
    asideRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajon]);

  // Cerrar el cajón devolviendo el foco a la hamburguesa (no en navegación).
  const cerrarCajon = () => { setCajon(false); botonRef.current?.focus(); };

  const alternar = () => {
    if (esMovil) { setCajon((v) => !v); return; }
    setColapsada((v) => { const n = !v; try { localStorage.setItem('uxv:lateral', n ? 'cerrada' : 'abierta'); } catch {} return n; });
  };

  // El lateral está fuera de pantalla (y no debe recibir foco ni lectores) cuando:
  // en móvil el cajón está cerrado, o en escritorio está colapsado.
  const oculto = esMovil ? !cajon : colapsada;

  return (
    <div className={'app-shell' + (colapsada ? ' lateral-colapsada' : '') + (cajon ? ' lateral-movil' : '')}>
      <a href="#contenido-principal" className="skip-link">Saltar al contenido</a>
      <SonidoBotones />
      <PaletaComandos flags={nav} />
      <aside ref={asideRef} id="menu-lateral" className="sidebar" {...(oculto ? ({ inert: '' } as any) : {})}>
        <div className="tricolor" />
        {/* eslint-disable-next-line @next/next/no-img-element -- logo estático local, sin optimizador */}
        <div className="marca"><img className="marca-logo" src="/logo.png" alt="" width={34} height={31} /> Apoyo por Venezuela</div>
        <NavLateral flags={nav} />
        <div className="sidebar-firma">Hecho con 💛💙❤️ por la comunidad</div>
      </aside>

      {cajon && <button className="backdrop" aria-label="Cerrar menú" onClick={cerrarCajon} />}

      <div className="contenido">
        <header className="topbar">
          <div className="topbar-izq">
            <button ref={botonRef} className="icono-btn" aria-label="Mostrar u ocultar el menú"
              aria-controls="menu-lateral" aria-expanded={esMovil ? cajon : !colapsada} onClick={alternar}>
              <Icono nombre="menu" size={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- logo estático local, sin optimizador */}
            <span className="topbar-marca"><img src="/logo.png" alt="" width={26} height={24} /> Apoyo por Venezuela</span>
          </div>
          <div className="topbar-der">
            <ToggleConsejos />
            <BotonTelegram vinculado={usuario.telegramVinculado} />
            <Presencia estadoInicial={usuario.estadoPresencia} />
            <TemaToggle />
            <CampanaNotificaciones />
            <UserChip nombre={usuario.nombre} rol={usuario.rol} email={usuario.email} avatarUrl={usuario.avatarUrl} />
          </div>
        </header>
        <main id="contenido-principal" tabIndex={-1} className="contenedor">{children}</main>
        <footer className="muted" style={{ textAlign: 'center', fontSize: '.8rem', padding: '10px 24px max(24px, env(safe-area-inset-bottom))' }}>
          <Link href="/legal/terminos">Términos</Link> · <Link href="/legal/privacidad">Privacidad</Link> · <Link href="/legal/descargo">Descargo de responsabilidad</Link>
        </footer>
      </div>
    </div>
  );
}
