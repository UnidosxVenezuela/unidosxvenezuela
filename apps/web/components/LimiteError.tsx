'use client';
import { Component, type ReactNode } from 'react';

/**
 * Límite de error localizado: si un widget hijo lanza una excepción (p. ej. el globo
 * WebGL en un dispositivo sin aceleración / en Modo de bajo consumo), muestra el
 * `fallback` (o nada) SIN tumbar el resto de la vista. Un componente decorativo nunca
 * debe romper el panel. Complementa a las guardas internas: es la red de seguridad.
 */
export default class LimiteError extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { fallo: boolean }
> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch() { /* silencioso a propósito: no queremos ruido por un adorno */ }
  render() { return this.state.fallo ? (this.props.fallback ?? null) : this.props.children; }
}
