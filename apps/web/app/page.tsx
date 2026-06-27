import Link from 'next/link';

export default function Home() {
  return (
    <main className="contenedor" style={{ maxWidth: 640 }}>
      <h1>Plataforma Unidos</h1>
      <p className="muted">
        Coordinación de equipos, tareas y recursos para la respuesta al terremoto
        de Venezuela. Identifícate para continuar.
      </p>
      <div className="fila" style={{ marginTop: 16 }}>
        <Link className="btn btn-primario" href="/login">Iniciar sesión</Link>
        <Link className="btn" href="/registro">Crear cuenta</Link>
      </div>
    </main>
  );
}
