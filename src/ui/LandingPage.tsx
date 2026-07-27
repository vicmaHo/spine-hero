import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Reveal } from './Reveal';
import logo from '../assets/logo.png';
import backgroundDashboard from '../assets/background-dashboard.png';
import principal from '../assets/principal.png';
import principal2 from '../assets/principal2.png';
import equipos from '../assets/equipos.png';
import feliz from '../assets/feliz.png';
import triste from '../assets/triste.png';
import ausente from '../assets/ausente.png';

/** Alto de la barra de navegación. Se usa como scroll-padding del contenedor. */
const NAV_HEIGHT = 88;

/** Enlaces de la barra de navegación, en orden de aparición. */
const NAV_LINKS = [
  { id: 'hero', label: 'Inicio' },
  { id: 'problema', label: 'El problema' },
  { id: 'juego', label: 'Mecánicas' },
  { id: 'como', label: 'Cómo funciona' },
  { id: 'progresion', label: 'Tu compañero' },
  { id: 'equipos', label: 'Equipos' },
] as const;

/** Sección 2: los tres dolores que justifican el producto. */
const PROBLEM_CARDS = [
  {
    title: 'Dolor',
    body: 'El cuello, la espalda y la zona lumbar pasan factura después de tantas horas sentado, aunque recién lo notes cuando ya es tarde.',
    color: '#c4523c',
  },
  {
    title: 'Distracción',
    body: 'Las alertas típicas para "sentate bien" se ignoran igual que cualquier otra notificación del día. Necesitás algo que de verdad te haga caso.',
    color: '#d9a938',
  },
  {
    title: 'Malos hábitos',
    body: 'Cada día que pasa encorvado suma. Una mala postura sostenida durante meses se vuelve costumbre, y después cuesta mucho más cambiarla.',
    color: '#8b5cf6',
  },
] as const;

/** Sección 3: el bucle de juego, un bloque por estado de postura. */
const MECHANIC_BLOCKS = [
  {
    state: 'Buena postura',
    color: '#6ea84a',
    img: feliz,
    items: ['La mascota sonríe.', 'Gana experiencia.', 'Aumenta el Flow.'],
  },
  {
    state: 'Mala postura',
    color: '#c4523c',
    img: triste,
    items: ['Pierde vida.', 'La mascota se marchita.'],
  },
  {
    state: 'Ausente',
    color: '#8a7a63',
    img: ausente,
    items: ['El juego se pausa sin penalizaciones cuando te levantas.'],
  },
] as const;

/** Sección 4: los cuatro pasos del flujo de uso. */
const STEPS = [
  'Calibra tu postura.',
  'Trabaja normalmente.',
  'La IA analiza tu postura usando cinco puntos del cuerpo.',
  'Haz crecer tu mascota y sube de nivel.',
] as const;

/*
 * Iconos pixel-art de la sección de equipos. Se dibujan con rects sobre una
 * rejilla de 16×16 y `shapeRendering="crispEdges"`, así los bordes no se
 * antialiasan y encajan con el resto de la estética.
 */

function IconSword() {
  return (
    <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="7" y="1" width="2" height="9" />
      <rect x="6" y="3" width="1" height="7" />
      <rect x="9" y="3" width="1" height="7" />
      <rect x="3" y="10" width="10" height="2" />
      <rect x="7" y="12" width="2" height="2" />
      <rect x="5" y="14" width="6" height="1" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {/* Anillo izquierdo */}
      <rect x="1" y="5" width="5" height="1" />
      <rect x="1" y="10" width="5" height="1" />
      <rect x="1" y="6" width="1" height="4" />
      <rect x="5" y="6" width="1" height="4" />
      {/* Eslabón central */}
      <rect x="6" y="7" width="4" height="2" />
      {/* Anillo derecho */}
      <rect x="10" y="5" width="5" height="1" />
      <rect x="10" y="10" width="5" height="1" />
      <rect x="10" y="6" width="1" height="4" />
      <rect x="14" y="6" width="1" height="4" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {/* Asas */}
      <rect x="1" y="2" width="2" height="4" />
      <rect x="3" y="5" width="1" height="1" />
      <rect x="13" y="2" width="2" height="4" />
      <rect x="12" y="5" width="1" height="1" />
      {/* Copa */}
      <rect x="4" y="1" width="8" height="6" />
      <rect x="5" y="7" width="6" height="1" />
      <rect x="6" y="8" width="4" height="1" />
      {/* Pie */}
      <rect x="7" y="9" width="2" height="2" />
      <rect x="5" y="11" width="6" height="1" />
      <rect x="3" y="12" width="10" height="2" />
    </svg>
  );
}

/** Sección 6: los tres pasos del ranking por equipos. */
const TEAM_CARDS = [
  {
    Icon: IconSword,
    title: 'Crea tu equipo',
    body: 'Crea un equipo y obtén un código único para compartir.',
    color: '#c4523c',
  },
  {
    Icon: IconLink,
    title: 'Invita a tus amigos',
    body: 'Comparte el código para que tus compañeros se unan a tu equipo en segundos.',
    color: '#3d7ea6',
  },
  {
    Icon: IconTrophy,
    title: 'Asciendan en el ranking',
    body: 'Compitan por conseguir la mayor puntuación y mantenerse en los primeros puestos.',
    color: '#d9a938',
  },
] as const;

/** Sección 5: los tres ejes de progresión. */
const PROGRESS_CARDS = [
  { tag: 'XP', title: 'Sube de nivel', body: 'Cada minuto de buena postura suma experiencia.', color: '#d9a938' },
  { tag: 'FLOW', title: 'Mantén la concentración', body: 'Las rachas largas sin encorvarte llenan la barra de Flow.', color: '#6ea84a' },
  { tag: 'LOGROS', title: 'Desbloquea recompensas', body: 'Espalda de Acero, Lord del Clean Code y más por conseguir.', color: '#8b5cf6' },
] as const;

function IconPlay() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Título de sección: mismo tratamiento en las cuatro secciones internas. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-pixel mx-auto max-w-[30ch] text-center text-[20px] leading-[1.75] text-[#f6e9c9] sm:text-[26px] lg:text-[30px]"
      style={{ textShadow: '0 4px 0 rgba(0,0,0,0.6)' }}
    >
      {children}
    </h2>
  );
}

interface LandingPageProps {
  /** Entra a la aplicación. */
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  /**
   * Desplaza a una sección por id. El scroll vive en un contenedor propio y
   * no en el documento, para poder aplicarle scroll-snap sin afectar al
   * resto de la aplicación.
   */
  const goTo = (id: string) => {
    scrollerRef.current
      ?.querySelector(`#${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative h-screen overflow-hidden">

      {/* Fondo del mundo, igual que en el dashboard */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundDashboard})`, opacity: 0.45 }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(18,14,10,0.22) 34%, rgba(18,14,10,0.62) 100%)',
        }}
        aria-hidden="true"
      />

      {/* ═══════════ Barra de navegación ═══════════ */}
      <header
        className="fixed inset-x-0 top-0 z-40 border-b-[3px] border-[#241a10]"
        style={{
          height: NAV_HEIGHT,
          background: 'linear-gradient(180deg, rgba(59,42,28,0.94) 0%, rgba(31,24,17,0.94) 100%)',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 4px 18px -4px rgba(0,0,0,0.7), inset 0 -2px 0 0 rgba(217,169,56,0.35)',
        }}
      >
        <nav className="mx-auto flex h-full max-w-[1320px] items-center gap-6 px-5 lg:px-8">
          <button
            onClick={() => goTo('hero')}
            className="shrink-0 transition-transform hover:-translate-y-[2px]"
            aria-label="Ir al inicio"
          >
            <img
              src={logo}
              alt="SPINE HERO"
              className="pixelated h-[56px] w-auto drop-shadow-[0_3px_7px_rgba(0,0,0,0.7)]"
            />
          </button>

          <ul className="ml-auto hidden items-center gap-7 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <button
                  onClick={() => goTo(link.id)}
                  className="rpg-navlink text-[15px] font-semibold text-[#e2c793] transition-colors hover:text-[#f2cf6b]"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>

          <button onClick={onStart} className="rpg-btn rpg-btn-green ml-auto shrink-0 lg:ml-0">
            <IconPlay />
            EMPEZAR AHORA
          </button>
        </nav>
      </header>

      {/* ═══════════ Contenedor con scroll-snap ═══════════ */}
      <div
        ref={scrollerRef}
        className="relative z-10 h-full snap-y snap-proximity overflow-y-auto"
        style={{ scrollPaddingTop: NAV_HEIGHT }}
      >

        {/* ─────── Sección 1: Hero ─────── */}
        <section
          id="hero"
          className="flex min-h-screen snap-start items-center px-5 lg:px-8"
          style={{ paddingTop: NAV_HEIGHT }}
        >
          <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-14">

            <Reveal>
              <div className="flex flex-col items-start gap-7">
                <h1
                  className="font-pixel text-[26px] leading-[1.65] text-[#f6e9c9] sm:text-[34px] lg:text-[40px]"
                  style={{ textShadow: '0 4px 0 rgba(0,0,0,0.7)' }}
                >
                  Tu postura, convertida en aventura.
                </h1>

                <p className="max-w-[54ch] text-[18px] leading-relaxed text-[#e2c793] lg:text-[19px]">
                  Una mascota pixel-art te acompaña mientras trabajas, juegas o estudias.
                  Mantén una buena postura para subir de nivel y desbloquear logros
                  mientras cuidas tu espalda.
                </p>

                <button onClick={onStart} className="rpg-btn rpg-btn-green rpg-btn-lg">
                  <IconPlay />
                  EMPEZAR AHORA
                </button>
              </div>
            </Reveal>

            {/* El personaje va suelto, sin marco: la imagen es solo el bicho */}
            <Reveal delay={140}>
              <div className="relative flex items-center justify-center">
                <div
                  className="animate-rpg-glow pointer-events-none absolute h-[95%] w-[95%] rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(242,207,107,0.30) 0%, transparent 68%)' }}
                  aria-hidden="true"
                />
                <img
                  src={principal}
                  alt="La mascota de SPINE HERO"
                  className="pixelated relative w-full max-w-[760px] drop-shadow-[0_18px_34px_rgba(0,0,0,0.7)]"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─────── Sección 2: Problema ─────── */}
        <section id="problema" className="flex min-h-screen snap-start flex-col justify-center px-5 py-16 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <Reveal>
              <SectionTitle>¿Te suena familiar?</SectionTitle>
            </Reveal>

            <Reveal delay={100}>
              <p className="mx-auto mt-7 max-w-[68ch] text-center text-[17px] leading-relaxed text-[#e2c793]">
                Empezás a trabajar bien sentado. Dos horas después ya estás encorvado sin
                darte cuenta. A la noche te duele el cuello y te prometés «mañana me siento
                mejor». Al otro día, lo mismo. No es falta de voluntad: es que nadie te avisa
                a tiempo.
              </p>
            </Reveal>

            <div className="mt-11 grid grid-cols-1 gap-7 md:grid-cols-3">
              {PROBLEM_CARDS.map((card, i) => (
                <Reveal key={card.title} delay={i * 120}>
                  <article className="rpg-panel rpg-hover-lift h-full px-6 pb-8 pt-10">
                    <div className="absolute -top-4 left-5">
                      <span
                        className="rpg-ribbon text-[13px]"
                        style={{
                          background: `linear-gradient(180deg, ${card.color} 0%, rgba(0,0,0,0.35) 240%)`,
                          color: '#fff',
                        }}
                      >
                        {card.title.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[17px] leading-relaxed text-[#4a3721]">{card.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─────── Sección 3: El bucle de juego ─────── */}
        <section id="juego" className="flex min-h-screen snap-start flex-col justify-center px-5 py-16 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <Reveal>
              <SectionTitle>Tu postura decide qué le pasa a tu compañero.</SectionTitle>
            </Reveal>

            <div className="mt-14 grid grid-cols-1 gap-7 md:grid-cols-3">
              {MECHANIC_BLOCKS.map((block, i) => (
                <Reveal key={block.state} delay={i * 120}>
                  <article className="rpg-panel-dark rpg-hover-lift flex h-full flex-col px-6 pb-8 pt-6">

                    {/* Retrato del estado de ánimo, con halo del color del bloque */}
                    <div className="relative mb-6 flex items-center justify-center">
                      <div
                        className="animate-rpg-glow pointer-events-none absolute h-[150px] w-[150px] rounded-full"
                        style={{ background: `radial-gradient(circle, ${block.color}44 0%, transparent 68%)` }}
                        aria-hidden="true"
                      />
                      {/* alt vacío: el estado ya lo dice el título de la tarjeta */}
                      <img
                        src={block.img}
                        alt=""
                        aria-hidden="true"
                        className="pixelated relative h-[140px] w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ background: block.color, boxShadow: `0 0 12px 3px ${block.color}80` }}
                        aria-hidden="true"
                      />
                      <h3 className="font-pixel text-[13px]" style={{ color: block.color }}>
                        {block.state.toUpperCase()}
                      </h3>
                    </div>
                    <ul className="mt-5 flex flex-col gap-3">
                      {block.items.map((item) => (
                        <li key={item} className="text-[17px] leading-relaxed text-[#e2c793]">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─────── Sección 4: Cómo funciona ─────── */}
        <section id="como" className="flex min-h-screen snap-start flex-col justify-center px-5 py-16 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <Reveal>
              <SectionTitle>Cómo funciona</SectionTitle>
            </Reveal>

            <div className="relative mt-16">
              {/* Hilo de la línea de tiempo, solo en escritorio */}
              <div
                className="pointer-events-none absolute left-0 right-0 top-[26px] hidden h-[4px] lg:block"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(217,169,56,0.6), transparent)' }}
                aria-hidden="true"
              />
              <ol className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, i) => (
                  <Reveal key={step} delay={i * 130}>
                    <li className="flex flex-col items-center gap-5 text-center">
                      <span
                        className="font-pixel relative flex h-[54px] w-[54px] items-center justify-center rounded-full text-[18px]"
                        style={{
                          background: 'linear-gradient(180deg, #f2cf6b 0%, #9c7420 100%)',
                          border: '4px solid #241a10',
                          color: '#3b2a1c',
                          boxShadow: 'inset 0 3px 0 1px rgba(255,255,255,0.55), 0 4px 0 0 rgba(20,14,8,0.5)',
                        }}
                      >
                        {i + 1}
                      </span>
                      <p className="max-w-[26ch] text-[17px] leading-relaxed text-[#e2c793]">{step}</p>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ─────── Sección 5: Progresión ─────── */}
        <section id="progresion" className="flex min-h-screen snap-start flex-col justify-center px-5 py-16 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <Reveal>
              <SectionTitle>Tu compañero evoluciona contigo.</SectionTitle>
            </Reveal>

            <div className="mt-14 grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">

              {/* Imagen a la izquierda, suelta y sin marco */}
              <Reveal>
                <div className="relative flex items-center justify-center">
                  <div
                    className="animate-rpg-glow pointer-events-none absolute h-[85%] w-[85%] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(139,191,92,0.24) 0%, transparent 66%)' }}
                    aria-hidden="true"
                  />
                  <img
                    src={principal2}
                    alt="La mascota evolucionando"
                    className="pixelated relative w-full max-w-[500px] drop-shadow-[0_14px_28px_rgba(0,0,0,0.65)]"
                  />
                </div>
              </Reveal>

              {/* Tarjetas a la derecha */}
              <div className="flex flex-col gap-5">
                {PROGRESS_CARDS.map((card, i) => (
                  <Reveal key={card.tag} delay={i * 120}>
                    <article className="rpg-panel rpg-hover-lift flex items-center gap-5 px-6 py-5">
                      <span
                        className="font-pixel shrink-0 rounded-md px-3.5 py-3 text-[12px] text-white"
                        style={{
                          background: `linear-gradient(180deg, ${card.color} 0%, rgba(0,0,0,0.3) 240%)`,
                          border: '2px solid #241a10',
                          boxShadow: 'inset 0 2px 0 1px rgba(255,255,255,0.3), 0 3px 0 0 rgba(20,14,8,0.45)',
                          textShadow: '0 1px 0 rgba(0,0,0,0.5)',
                        }}
                      >
                        {card.tag}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[19px] font-bold text-[#3b2a1c]">{card.title}</h3>
                        <p className="text-[16px] leading-snug text-[#4a3721]">{card.body}</p>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal delay={200}>
              <p className="mt-12 text-center text-[16px] text-[#e2c793]">
                Todo el análisis ocurre en tu navegador. Tu cámara nunca sale de tu ordenador.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ─────── Sección 6: Equipos ─────── */}
        <section id="equipos" className="flex min-h-screen snap-start flex-col justify-center px-5 py-16 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <Reveal>
              <SectionTitle>
                Crea un equipo, invita a tus amigos y asciendan juntos en el ranking.
              </SectionTitle>
            </Reveal>

            <Reveal delay={100}>
              <p className="mx-auto mt-6 max-w-[56ch] text-center text-[17px] leading-relaxed text-[#e2c793]">
                Los buenos hábitos se mantienen mejor en compañía. Crea un equipo, comparte
                el código y compitan por la mejor postura.
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-12">

              {/* Tarjetas a la izquierda */}
              <div className="flex flex-col gap-5">
                {TEAM_CARDS.map((card, i) => (
                  <Reveal key={card.title} delay={i * 120}>
                    <article className="rpg-panel rpg-hover-lift flex items-center gap-5 px-6 py-5">
                      <span
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg text-white"
                        style={{
                          background: `linear-gradient(180deg, ${card.color} 0%, rgba(0,0,0,0.32) 240%)`,
                          border: '3px solid #241a10',
                          boxShadow: 'inset 0 2px 0 1px rgba(255,255,255,0.3), 0 3px 0 0 rgba(20,14,8,0.45)',
                          filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.45))',
                        }}
                        aria-hidden="true"
                      >
                        <card.Icon />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[19px] font-bold text-[#3b2a1c]">{card.title}</h3>
                        <p className="text-[16px] leading-snug text-[#4a3721]">{card.body}</p>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>

              {/* Estandartes a la derecha, sueltos y sin marco */}
              <Reveal delay={160}>
                <div className="relative flex items-center justify-center">
                  <div
                    className="animate-rpg-glow pointer-events-none absolute h-[96%] w-[96%] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(217,169,56,0.30) 0%, transparent 68%)' }}
                    aria-hidden="true"
                  />
                  <img
                    src={equipos}
                    alt="Estandartes de los equipos"
                    className="pixelated relative w-full max-w-[800px] drop-shadow-[0_20px_36px_rgba(0,0,0,0.7)]"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ─────── Pie ─────── */}
        <footer className="px-5 pb-10 pt-4 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="rpg-panel-dark px-6 py-8">

              {/* Lema */}
              <div className="flex justify-center">
                <span className="rpg-ribbon text-[11px]">
                  <span style={{ color: '#f2cf6b' }}>✦</span>
                  MEJORA TU POSTURA, MEJORA TU AVENTURA
                  <span style={{ color: '#f2cf6b' }}>✦</span>
                </span>
              </div>

              {/* Separador tallado */}
              <div
                className="my-6 h-[3px] w-full rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(217,169,56,0.45), transparent)' }}
                aria-hidden="true"
              />

              {/* Navegación y derechos */}
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-between">
                <button
                  onClick={() => goTo('hero')}
                  className="shrink-0 transition-transform hover:-translate-y-[2px]"
                  aria-label="Ir al inicio"
                >
                  <img
                    src={logo}
                    alt="SPINE HERO"
                    className="pixelated h-10 w-auto drop-shadow-[0_3px_7px_rgba(0,0,0,0.7)]"
                  />
                </button>

                <nav aria-label="Navegación del pie">
                  <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    {NAV_LINKS.map((link) => (
                      <li key={link.id}>
                        <button
                          onClick={() => goTo(link.id)}
                          className="text-[14px] font-semibold text-[#e2c793] transition-colors hover:text-[#f2cf6b]"
                        >
                          {link.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>

                <p className="font-pixel shrink-0 text-[9px] text-[#9c7420]">
                  © SPINEHERO 2026
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Pista de scroll, solo en escritorio */}
      <button
        onClick={() => goTo('problema')}
        className="animate-rpg-beat fixed bottom-5 left-1/2 z-30 hidden -translate-x-1/2 text-[#f2cf6b] transition-opacity hover:opacity-70 lg:block"
        aria-label="Bajar a la siguiente sección"
      >
        <IconChevronDown />
      </button>
    </div>
  );
}
