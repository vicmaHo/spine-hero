// Tamaño con el que se abre la ventana flotante la primera vez. Mantiene la
// proporción 128:176 del canvas (sprite más la franja de HUD) para que el
// avatar la llene sin bandas.
//
// Es solo el tamaño inicial: a partir de ahí el usuario la redimensiona a
// mano y su elección se conserva (ver `openPipWindow`). El mínimo al que se
// puede encoger lo decide el navegador, no esta página.
export const PIP_WIDTH = 220;
export const PIP_HEIGHT = 302;

export interface PipWindowResult {
  pipWindow: Window;
  isFallback: boolean;
}

/** Título que se muestra en la barra superior de la ventana flotante. */
export const PIP_TITLE = 'SpineHero';

/** Color de fondo del documento flotante y sugerencia para la barra superior. */
export const PIP_THEME_COLOR = '#0d0d14';

interface RequestWindowOptions {
  width: number;
  height: number;
  /** Oculta el botón "volver a la pestaña" de la barra superior de Chrome. */
  disallowReturnToOpener?: boolean;
  /** Ignora el tamaño/posición cacheados de la última apertura. */
  preferInitialWindowPlacement?: boolean;
}

/**
 * Abre la ventana flotante Picture-in-Picture.
 * DEBE invocarse dentro de un manejador de click (la API exige gesto del usuario).
 *
 * 1. Si documentPictureInPicture está disponible, usa la API nativa.
 * 2. Si no, cae a window.open() con flag isFallback: true.
 * 3. Copia los estilos del documento padre al documento de la ventana nueva.
 *
 * Limitaciones del navegador (no son bugs): la barra superior siempre muestra
 * el origen que controla la ventana (lo exige la especificación) y la web no
 * puede posicionar la ventana PiP nativa. Solo el fallback acepta posición.
 */
export async function openPipWindow(): Promise<PipWindowResult> {
  let pipWindow: Window;
  let isFallback = false;

  if ('documentPictureInPicture' in window) {
    // API nativa de Document Picture-in-Picture
    pipWindow = await (
      window as unknown as {
        documentPictureInPicture: {
          requestWindow: (opts: RequestWindowOptions) => Promise<Window>;
        };
      }
    ).documentPictureInPicture.requestWindow({
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
      disallowReturnToOpener: true,
      // Sin `preferInitialWindowPlacement`: así Chrome reutiliza el tamaño y
      // la posición que el usuario dejó la última vez en lugar de volver
      // siempre a PIP_WIDTH×PIP_HEIGHT. Redimensionarla a mano deja de ser
      // un ajuste que se pierde al cerrar y reabrir.
    });
  } else {
    // Fallback (Firefox/Safari): aquí sí se puede posicionar abajo-izquierda
    const screen = window.screen as unknown as {
      availLeft?: number;
      availTop?: number;
      availHeight: number;
    };
    const left = (screen.availLeft ?? 0) + 20;
    const top = (screen.availTop ?? 0) + screen.availHeight - PIP_HEIGHT - 60;

    const features = [
      `width=${PIP_WIDTH}`,
      `height=${PIP_HEIGHT}`,
      `left=${left}`,
      `top=${top}`,
      'popup=yes',
      'location=no',
      'toolbar=no',
      'menubar=no',
      'status=no',
      'scrollbars=no',
    ].join(',');

    const opened = window.open('', '', features);
    if (!opened) throw new Error('No se pudo abrir la ventana flotante');
    pipWindow = opened;
    isFallback = true;
  }

  // El título aparece en la barra superior de la ventana
  pipWindow.document.title = PIP_TITLE;

  // theme-color: algunos navegadores lo usan para tintar la barra superior.
  // Donde no se respete, simplemente se ignora.
  const themeMeta = pipWindow.document.createElement('meta');
  themeMeta.name = 'theme-color';
  themeMeta.content = PIP_THEME_COLOR;
  pipWindow.document.head.appendChild(themeMeta);

  // La ventana PiP tiene su propio document: las fuentes registradas con
  // FontFace en el principal no llegan aquí. Se inyecta el @font-face.
  const fontStyle = pipWindow.document.createElement('style');
  fontStyle.textContent = `
    @font-face {
      font-family: 'PressStart2P';
      src: url('/fonts/PressStart2P.ttf') format('truetype');
      font-display: block;
    }
  `;
  pipWindow.document.head.appendChild(fontStyle);

  // Copiar estilos al documento de la ventana nueva
  copyStyles(document, pipWindow.document);

  return { pipWindow, isFallback };
}

/**
 * Copia las hojas de estilo del documento origen al documento destino.
 * La ventana PiP tiene su propio document y no hereda el CSS del padre.
 *
 * - Para hojas con href (externas/CORS): crea un <link> con el href.
 * - Para hojas inline o accesibles: crea un <style> con las reglas.
 */
function copyStyles(source: Document, target: Document): void {
  for (const sheet of Array.from(source.styleSheets)) {
    if (sheet.href) {
      // Hoja externa: usar <link> para evitar problemas CORS al leer cssRules
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.head.appendChild(link);
    } else {
      // Hoja inline o accesible: copiar reglas
      try {
        const rules = sheet.cssRules;
        if (rules) {
          const style = target.createElement('style');
          for (const rule of Array.from(rules)) {
            style.textContent += rule.cssText + '\n';
          }
          target.head.appendChild(style);
        }
      } catch {
        // Si no se pueden leer las reglas (CORS), saltar
      }
    }
  }
}
