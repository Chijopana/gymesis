# Gymesis — Web

Frontend de Gymesis: React 18, TypeScript, Vite y Tailwind CSS.

La documentacion general esta en el [README raiz](../README.md). Aqui solo lo
especifico del frontend.

## Arranque

```bash
npm install
npm run dev    # http://localhost:5173
```

El servidor de desarrollo hace de proxy de `/api` hacia `http://localhost:3000`,
asi que basta con tener el backend arrancado. No hace falta configurar nada mas.

## Comandos

| Comando              | Que hace                                          |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo con proxy a la API          |
| `npm run build`      | Comprueba tipos y genera el bundle de produccion   |
| `npm run preview`    | Sirve la build para revisarla                      |
| `npm run lint`       | ESLint                                             |
| `npm run type-check` | Solo comprobacion de tipos                         |

## Variables de entorno

Por defecto el cliente llama a `/api` (mismo origen), que es lo que quieres tanto
en desarrollo (proxy de Vite) como en produccion (proxy de nginx).

Solo necesitas `VITE_API_URL` si sirves la API desde otro dominio:

```bash
# .env.local
VITE_API_URL=https://api.tu-dominio.com/api
```

## Estilos

Los colores no se escriben sueltos en los componentes: viven como *tokens* CSS en
`src/index.css` (`--panel`, `--brand`, `--text-soft`...) y el tema oscuro solo
redefine esos tokens.

Las clases de componente (`.panel`, `.field`, `.btn-primary`...) estan dentro de
`@layer components` a proposito: asi las utilidades de Tailwind (`hidden`, `pl-8`,
`w-auto`) siguen pudiendo pisarlas cuando se combinan en un mismo elemento.

## Detalles de implementacion

- **La sesion se hidrata de forma sincrona** desde `localStorage` en el propio
  `create()` del store. Si se hiciera en un `useEffect`, el primer render veria
  al usuario como no autenticado y recargar cualquier pagina rebotaria al login.
- **Las paginas se cargan bajo demanda** con `React.lazy`; solo login y registro
  entran en el bundle inicial.
- **Errores de red**: `getErrorMessage()` en `services/api.ts` traduce cualquier
  fallo (timeout, sin conexion, 4xx, 5xx) a una frase que se puede enseñar.
- **Accesibilidad**: dialogos con foco atrapado y cierre con Escape, `aria-label`
  en los controles solo-icono, foco visible unificado y respeto por
  `prefers-reduced-motion`.
