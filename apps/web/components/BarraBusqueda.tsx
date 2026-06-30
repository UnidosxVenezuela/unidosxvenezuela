import Icono from './Icono';

/** Input de búsqueda con ícono de lupa adentro (para usar dentro de un <form method="get">). */
export default function BarraBusqueda({ name = 'q', placeholder = 'Buscar…', defaultValue, className }: {
  name?: string; placeholder?: string; defaultValue?: string; className?: string;
}) {
  return (
    <div className={'buscador' + (className ? ' ' + className : '')}>
      <Icono nombre="buscar" size={18} />
      <input name={name} className="input" placeholder={placeholder} defaultValue={defaultValue} />
    </div>
  );
}
