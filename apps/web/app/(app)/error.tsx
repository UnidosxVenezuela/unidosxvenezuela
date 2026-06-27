'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="tarjeta">
      <h2>Ocurrió un error</h2>
      <p className="error">{error.message}</p>
      <button className="btn btn-primario" onClick={reset}>Reintentar</button>
    </div>
  );
}
