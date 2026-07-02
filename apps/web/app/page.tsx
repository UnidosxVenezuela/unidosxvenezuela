import Link from 'next/link';

export default function Home() {
  return (
    <main className="auth-pantalla">
      <div className="auth-caja" style={{ textAlign: 'center' }}>
        <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
        <h1>Coordinación de respuesta — Venezuela</h1>
        <p className="muted">
          Equipos, tareas y recursos para la respuesta al terremoto. Identifícate para continuar.
        </p>
        <div className="fila" style={{ marginTop: 18, justifyContent: 'center' }}>
          <Link className="btn btn-primario" href="/login">Iniciar sesión</Link>
          <Link className="btn btn-acento" href="/registro">Crear cuenta</Link>
        </div>
      </div>
    </main>
  );
}
