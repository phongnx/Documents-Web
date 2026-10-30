import { useEffect, useState } from 'react';

// Theo dõi 1 media query (VD '(max-width: 839px)') — dùng khi bố cục phải đổi cả cấu trúc
// DOM theo khổ màn (CSS @media không đủ), tự cập nhật khi xoay máy / kéo cửa sổ.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
