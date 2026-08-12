import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const handleChange = () => setMatches(media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

export function useIsLargeScreen(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

export function useIsTabletOrLarger(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
