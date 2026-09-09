import { useEffect, useState } from 'react'

/** Suscribe un componente a una media query CSS. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    // El valor puede haber cambiado entre el primer render y este efecto.
    setMatches(media.matches)

    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

/** A partir de aqui caben dos o tres columnas sin apretar el contenido. */
export function useIsLargeScreen(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
