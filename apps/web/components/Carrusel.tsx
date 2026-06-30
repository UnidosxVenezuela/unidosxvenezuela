/** Carrusel horizontal de tarjetas (secciones tipo "Listos para…"). Cada hijo
 *  debería tener la clase `carrusel-item` (además de `tarjeta`). */
export default function Carrusel({ children }: { children: React.ReactNode }) {
  return <div className="carrusel">{children}</div>;
}
