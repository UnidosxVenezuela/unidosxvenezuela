import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DOCS_LEGALES, LISTA_LEGAL, renderLegalHtml } from '@/lib/legal';

export function generateStaticParams() {
  return LISTA_LEGAL.map((d) => ({ doc: d.slug }));
}

export function generateMetadata({ params }: { params: { doc: string } }) {
  const d = Object.hasOwn(DOCS_LEGALES, params.doc) ? DOCS_LEGALES[params.doc] : undefined;
  return { title: (d?.titulo ?? 'Legal') + ' — Apoyo por Venezuela' };
}

export default function DocLegalPage({ params }: { params: { doc: string } }) {
  const d = Object.hasOwn(DOCS_LEGALES, params.doc) ? DOCS_LEGALES[params.doc] : undefined;
  if (!d) notFound();
  const html = renderLegalHtml(d.md);
  return (
    <main className="contenedor" style={{ maxWidth: 820 }}>
      <div className="fila" style={{ justifyContent: 'space-between', margin: '4px 0 10px' }}>
        <span className="auth-marca" style={{ fontSize: '1.05rem', margin: 0 }}><span className="punto" /> Apoyo por Venezuela</span>
        <Link href="/legal" className="muted">← Documentos legales</Link>
      </div>
      <div className="tricolor" style={{ marginBottom: 18 }} />
      <article className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="fila" style={{ gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        {LISTA_LEGAL.filter((x) => x.slug !== d.slug).map((x) => (
          <Link key={x.slug} className="btn" href={'/legal/' + x.slug}>{x.titulo}</Link>
        ))}
      </div>
    </main>
  );
}
