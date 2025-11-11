import { useEffect, useState } from 'react';

type Props = {
  src?: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string; // data URL o ruta local
  preferIpc?: boolean; // en Electron: intentar primero vía IPC para evitar errores en consola
};

// Carga una imagen desde URL http(s). Si falla por restricciones de red del renderer (ERR_INTERNET_DISCONNECTED),
// intenta obtener el binario desde el proceso principal de Electron vía preload (api.getBinary) y lo coloca como data URL.
export default function ImageWithFallback({ src, alt = '', style, className, placeholder, preferIpc = true }: Props) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src);
  const [triedFallback, setTriedFallback] = useState(false);

  const isHttp = !!src && /^https?:\/\//i.test(src);
  const api: any = (globalThis as any).api;
  const hasIpc = !!(api && typeof api.getBinary === 'function');

  useEffect(() => {
    let cancelled = false;
    setTriedFallback(false);

    async function load() {
      if (!src) { setImgSrc(undefined); return; }
      // Evitar la petición directa si podemos usar IPC primero (para no ensuciar consola)
      if (preferIpc && hasIpc && isHttp) {
        // mostrar placeholder mientras llega el binario
        if (!cancelled) setImgSrc(placeholder);
        try {
          const res = await api.getBinary(src);
          if (!cancelled) {
            if (res && res.ok && res.dataUrl) setImgSrc(res.dataUrl);
            else setImgSrc(src); // fallback a URL directa
          }
        } catch {
          if (!cancelled) setImgSrc(src);
        }
      } else {
        setImgSrc(src);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [src, preferIpc, hasIpc, isHttp, placeholder]);

  async function tryFallback() {
    if (triedFallback) return;
    setTriedFallback(true);
    try {
      if (hasIpc && src) {
        const res = await api.getBinary(src);
        if (res && res.ok && res.dataUrl) {
          setImgSrc(res.dataUrl);
          return;
        }
      }
    } catch {}
    if (placeholder) setImgSrc(placeholder);
  }

  return (
    <img src={imgSrc} alt={alt} style={style} className={className}
         onError={() => { void tryFallback(); }} />
  );
}
