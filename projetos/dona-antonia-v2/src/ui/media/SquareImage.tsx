interface Props {
  src?: string | null;
  alt: string;
  kind: 'product' | 'basket';
  priority?: boolean;
}
/** Área 1:1 com dimensions reservadas e ícone neutro quando ainda não há foto real. */
export function SquareImage({ src, alt, kind, priority = false }: Props) {
  return (
    <span
      className={
        'catalog-square-image ' +
        (kind === 'basket' ? 'basket-square-image' : 'product-square-image')
      }
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          width={240}
          height={240}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
        />
      ) : (
        <span className="square-photo-placeholder" aria-hidden="true">
          {kind === 'basket' ? (
            <svg
              viewBox="0 0 80 80"
              width="55%"
              height="55%"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
            >
              <path d="M18 33 29 14M62 33 51 14M11 33h58l-6 35H17z" />
              <path d="M23 46h34M27 55h26M34 33l3 35M46 33l-3 35" />
              <path d="M24 22h10M47 22h10" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 80 80"
              width="49%"
              height="49%"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.6"
            >
              <path d="M40 12 67 26v30L40 70 13 56V26zM13 26l27 15 27-15M40 41v29" />
              <path d="m27 19 27 15v13" />
            </svg>
          )}
        </span>
      )}
    </span>
  );
}
