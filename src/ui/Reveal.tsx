import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Fracción del elemento que debe verse para disparar la aparición. */
const THRESHOLD = 0.15;

interface RevealProps {
  children: ReactNode;
  /** Retardo en ms, para escalonar varios elementos de una misma fila. */
  delay?: number;
  className?: string;
}

/**
 * Envoltorio que revela su contenido cuando entra en el viewport.
 * Usa IntersectionObserver y se desconecta tras el primer disparo: la
 * aparición es de una sola vez, no se repite al volver a hacer scroll.
 */
export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    // Si el navegador no soporta la API, mostrar sin animación.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: THRESHOLD },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
