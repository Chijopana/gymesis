import { Compass, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function NotFound() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <section className="panel max-w-md w-full p-8 text-center space-y-4 animate-in">
        <Compass size={40} className="mx-auto" style={{ color: 'var(--brand)' }} />
        <h1 className="app-title text-5xl font-bold">404</h1>
        <p className="section-subtitle">
          Esta pagina no existe. Puede que el enlace este mal o que el contenido se haya movido.
        </p>
        <Link to={isLoggedIn ? '/dashboard' : '/login'} className="btn-primary inline-flex">
          <Home size={15} />
          {isLoggedIn ? 'Volver al dashboard' : 'Ir al inicio de sesion'}
        </Link>
      </section>
    </main>
  )
}
