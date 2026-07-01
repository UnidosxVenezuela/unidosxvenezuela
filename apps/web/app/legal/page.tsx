import Link from 'next/link';
import { LISTA_LEGAL } from '@/lib/legal';

export const metadata = { title: 'Documentos legales — UnidosXVenezuela' };

export default function LegalIndex() {
  return (
    <main className="auth-pantalla">
      <div className="auth-caja" style={{ maxWidth: 620 }}>
        <div className="auth-marca"><span className="punto" /> UnidosXVenezuela</div>
        <div className="tarjeta">
          <h1>Documentos legales</h1>
          <p className="muted">Términos de uso, privacidad y descargo de responsabilidad de la plataforma.</p>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {LISTA_LEGAL.map((d) => (
              <Link key={d.slug} className="btn" href={'/legal/' + d.slug} style={{ justifyContent: 'space-between', width: '100%' }}>
                {d.titulo} <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: '.85rem' }}>
            Documentos en preparación; la versión final será revisada legalmente antes de su publicación.
          </p>
          <Link href="/login" className="muted" style={{ display: 'inline-block', marginTop: 8 }}>← Volver a iniciar sesión</Link>
        </div>
      </div>
    </main>
  );
}
