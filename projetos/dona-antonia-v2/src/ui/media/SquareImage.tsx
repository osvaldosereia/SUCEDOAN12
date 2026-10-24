interface Props {
  src?: string | null;
  alt: string;
  kind: 'product' | 'basket';
  priority?: boolean;
}
export function SquareImage({src,alt,kind,priority=false}:Props) {
  return <span className={'catalog-square-image '+(kind==='basket'?'basket-square-image':'product-square-image')}>
    {src ? <img src={src} alt={alt}
      width={240} height={240} loading={priority?'eager':'lazy'}
      decoding="async" fetchPriority={priority?'high':'auto'} /> :
      <span className="square-photo-placeholder" aria-hidden="true">▦</span>}
  </span>;
}
