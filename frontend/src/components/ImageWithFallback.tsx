import { useEffect, useState } from "react";

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
export default function ImageWithFallback({
  src,
  alt = "",
  style,
  className,
  placeholder,
  preferIpc = true,
}: Props) {
  // Iniciar sin src para evitar que el navegador dispare un GET inmediato
  const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);
  const [triedFallback, setTriedFallback] = useState(false);

  const isHttp = !!src && /^https?:\/\//i.test(src);
  const api: any = (globalThis as any).api;
  const hasIpc = !!(api && typeof api.getBinary === "function");

  useEffect(() => {
    let cancelled = false;
    setTriedFallback(false);

    async function load() {
      if (!src) {
        setImgSrc(undefined);
        return;
      }
      // Si el navegador está "offline" pero tenemos IPC disponible, intentar IPC igualmente
      if (preferIpc && hasIpc && isHttp) {
        if (!cancelled) setImgSrc(placeholder);
        try {
          const res = await api.getBinary(src);
          if (!cancelled) {
            if (res && res.ok && res.dataUrl) {
              setImgSrc(res.dataUrl);
              return;
            }
            // Mantener placeholder para evitar errores de red en el renderer
            setImgSrc(placeholder);
          }
        } catch {
          if (!cancelled) setImgSrc(placeholder);
        }
        return;
      }
      // Si no hay IPC y estamos offline, no hacer request directa
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setImgSrc(placeholder);
        return;
      }
      setImgSrc(src);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [src, preferIpc, hasIpc, isHttp, placeholder]);

  async function tryFallback() {
    if (triedFallback) return;
    setTriedFallback(true);
    try {
      if (hasIpc && src) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          if (placeholder) setImgSrc(placeholder);
          return;
        }
        const res = await api.getBinary(src);
        if (res && res.ok && res.dataUrl) {
          setImgSrc(res.dataUrl);
          return;
        }
      }
    } catch {
      // Ignorar
    }
    if (placeholder) setImgSrc(placeholder);
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      style={style}
      className={className}
      onError={() => {
        void tryFallback();
      }}
    />
  );
}
