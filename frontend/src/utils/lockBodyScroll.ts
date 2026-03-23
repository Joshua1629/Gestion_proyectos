/**
 * Bloquea el scroll del documento sin saltar al inicio de la página.
 * Usa position:fixed + restauración de scroll (patrón habitual con overlays/modales).
 */
let lockDepth = 0;
let savedScrollY = 0;

export function lockBodyScroll(): () => void {
  lockDepth += 1;
  if (lockDepth === 1) {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const b = document.body;
    b.style.position = "fixed";
    b.style.top = `-${savedScrollY}px`;
    b.style.left = "0";
    b.style.right = "0";
    b.style.width = "100%";
    b.style.overflow = "hidden";
  }
  return () => {
    lockDepth -= 1;
    if (lockDepth > 0) return;
    const b = document.body;
    b.style.position = "";
    b.style.top = "";
    b.style.left = "";
    b.style.right = "";
    b.style.width = "";
    b.style.overflow = "";
    window.scrollTo(0, savedScrollY);
  };
}
