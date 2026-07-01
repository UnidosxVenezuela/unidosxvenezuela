'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Icono from './Icono';
import NavLateral from './NavLateral';
import CampanaNotificaciones from './CampanaNotificaciones';
import UserChip from './UserChip';
import SonidoBotones from './SonidoBotones';

type Usuario = { nombre: string; rol?: string | null; email?: string | null; avatarUrl?: string | null };
type Nav = { coord: boolean; aliados?: boolean; verificacion?: boolean; contenido?: boolean; espacios?: boolean; psicosocial?: boolean };

/**
 * Shell de la app: barra lateral (colapsable en escritorio, cajón off-canvas en
 * móvil) + barra superior (hamburguesa + campana + chip de usuario). Mantiene el
 * contenido (children) como Server Component; solo el cromo es cliente.
 */
export default function Shell({ usuario, nav, children }: { usuario: Usuario; nav: Nav; children: React.ReactNode }) {
  const [colapsada, setColapsada] = useState(false); // escritorio
  const [cajon, setCajon] = useState(false);          // móvil
  const ruta = usePathname();

  // Preferencia de colapso en escritorio (persistente).
  useEffect(() => { try { setColapsada(localStorage.getItem('uxv:lateral') === 'cerrada'); } catch {} }, []);

  // Al navegar, cerrar el cajón móvil.
  useEffect(() => { setCajon(false); }, [ruta]);

  const alternar = () => {
    const movil = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;
    if (movil) { setCajon((v) => !v); return; }
    setColapsada((v) => { const n = !v; try { localStorage.setItem('uxv:lateral', n ? 'cerrada' : 'abierta'); } catch {} return n; });
  };

  return (
    <div className={'app-shell' + (colapsada ? ' lateral-colapsada' : '') + (cajon ? ' lateral-movil' : '')}>
      <SonidoBotones />
      <aside className="sidebar">
        <div className="tricolor" />
        <div className="marca"><span className="punto" /> UnidosXVenezuela</div>
        <NavLateral coord={nav.coord} aliados={nav.aliados} verificacion={nav.verificacion} contenido={nav.contenido} espacios={nav.espacios} psicosocial={nav.psicosocial} />
      </aside>

      {cajon && <button className="backdrop" aria-label="Cerrar menú" onClick={() => setCajon(false)} />}

      <div className="contenido">
        <header className="topbar">
          <div className="topbar-izq">
            <button className="icono-btn" aria-label="Mostrar u ocultar el menú" aria-expanded={cajon} onClick={alternar}>
              <Icono nombre="menu" size={22} />
            </button>
            <span className="topbar-marca"><span className="punto" /> UnidosXVenezuela</span>
          </div>
          <div className="topbar-der">
            <CampanaNotificaciones />
            <UserChip nombre={usuario.nombre} rol={usuario.rol} email={usuario.email} avatarUrl={usuario.avatarUrl} />
          </div>
        </header>
        <main className="contenedor">{children}</main>
        <footer className="muted" style={{ textAlign: 'center', fontSize: '.8rem', padding: '10px 24px 24px' }}>
          <Link href="/legal/terminos">Términos</Link> · <Link href="/legal/privacidad">Privacidad</Link> · <Link href="/legal/descargo">Descargo de responsabilidad</Link>
        </footer>
      </div>
    </div>
  );
}
