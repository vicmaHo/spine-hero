// Dimensiones de la ventana flotante
export const PIP_WIDTH = 320;
export const PIP_HEIGHT = 200;

export interface PipWindowResult {
  pipWindow: Window;
  isFallback: boolean;
}

/**
 * Abre la ventana flotante Picture-in-Picture.
 * DEBE invocarse dentro de un manejador de click (la API exige gesto del usuario).
 *
 * 1. Si documentPictureInPicture está disponible, usa la API nativa.
 * 2. Si no, cae a window.open() con flag isFallback: true.
 * 3. Copia los estilos del documento padre al documento de la ventana nueva.
 */
export async function openPipWindow(): Promise<PipWindowResult> {
  let pipWindow: Window;
  let isFallback = false;

  if ('documentPictureInPicture' in window) {
    // API nativa de Document Picture-in-Picture
    pipWindow = await (
      window as unknown as {
        documentPictureInPicture: {
          requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
        };
      }
    ).documentPictureInPicture.requestWindow({
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
    });
  } else {
    // Fallback para Firefox/Safari
    const opened = window.open('', '', `width=${PIP_WIDTH},height=${PIP_HEIGHT},popup=yes`);
    if (!opened) throw new Error('No se pudo abrir la ventana flotante');
    pipWindow = opened;
    isFallback = true;
  }

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
