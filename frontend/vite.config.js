/**
 * ============================================================================
 * vite.config.js - Configuracion del bundler y servidor de desarrollo Vite
 * ============================================================================
 *
 * Vite (pronunciado "vit", significa "rapido" en frances) es el bundler y
 * servidor de desarrollo que usamos para este proyecto React.
 *
 * --- Que es un bundler y por que lo necesitamos? ---
 * Los navegadores no entienden JSX, ni imports de modulos npm, ni Tailwind CSS
 * directamente. Un bundler toma todo nuestro codigo fuente (JSX, CSS, assets)
 * y lo transforma en archivos HTML/CSS/JS puros que el navegador SI entiende.
 *
 * --- Por que Vite y no Webpack/Create React App? ---
 * Vite fue creado por Evan You (creador de Vue.js) como alternativa moderna a
 * Webpack. Ventajas principales:
 *
 * 1. **Inicio instantaneo**: En desarrollo, Vite NO bundlea todo el codigo.
 *    Usa ES Modules nativos del navegador. Solo transforma los archivos que
 *    el navegador pide. Webpack bundlea TODO antes de servir.
 *
 * 2. **Hot Module Replacement (HMR) ultra rapido**: Cuando cambias un archivo,
 *    Vite solo reemplaza ESE modulo en el navegador, sin recargar la pagina.
 *    Los cambios se ven en milisegundos, no segundos.
 *
 * 3. **Build optimizado para produccion**: Usa Rollup internamente para generar
 *    bundles pequenos y eficientes con tree-shaking (elimina codigo no usado).
 *
 * 4. **Configuracion minima**: Este archivo de config tiene ~10 lineas. Un
 *    webpack.config.js equivalente tendria 50-100+ lineas.
 *
 * --- Dos modos de Vite ---
 * - `vite` (dev): Inicia servidor de desarrollo en localhost:5173 con HMR
 * - `vite build` (prod): Genera archivos optimizados en la carpeta `dist/`
 *
 * @module vite.config
 * @see https://vitejs.dev/config/
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * `defineConfig()` es un helper de Vite que provee autocompletado e inferencia
 * de tipos en el IDE (VSCode, WebStorm, etc.). Tecnicamente podriamos exportar
 * el objeto directamente, pero `defineConfig` mejora la experiencia del
 * desarrollador con IntelliSense.
 */
export default defineConfig({
  /**
   * --- Sistema de plugins ---
   * Vite tiene una arquitectura de plugins extensible (basada en Rollup).
   * Cada plugin agrega capacidades al bundler. Los plugins se ejecutan
   * en orden: primero react(), luego tailwindcss().
   *
   * `react()` - Plugin oficial de React para Vite (@vitejs/plugin-react).
   * Agrega soporte para:
   * - Transformacion de JSX → JavaScript puro (React.createElement)
   * - Fast Refresh (HMR especifico de React que preserva el estado de los
   *   componentes cuando editas el codigo)
   * - Soporte para React DevTools
   *
   * `tailwindcss()` - Plugin de Tailwind CSS para Vite (@tailwindcss/vite).
   * Procesa las clases de utilidad de Tailwind (ej: "bg-blue-500", "mt-4")
   * y genera solo el CSS que realmente usamos (tree-shaking de CSS).
   * En produccion, el CSS generado es minimo (~10KB vs 3MB+ del CSS completo).
   */
  plugins: [react(), tailwindcss()],

  /**
   * --- Configuracion del servidor de desarrollo ---
   * Estas opciones SOLO aplican en modo desarrollo (`npm run dev`).
   * No afectan el build de produccion.
   */
  server: {
    /**
     * --- Proxy para el backend ---
     * Este es uno de los conceptos MAS importantes para entender la
     * arquitectura frontend-backend.
     *
     * --- El problema ---
     * En desarrollo tenemos DOS servidores:
     * - Frontend: Vite en http://localhost:5173
     * - Backend: FastAPI en http://localhost:8000
     *
     * Cuando el frontend hace una peticion a `/api/upload`, el navegador la
     * envia a `localhost:5173/api/upload` (porque la pagina esta en :5173).
     * Pero esa ruta no existe en Vite!
     *
     * --- La solucion: proxy ---
     * Con esta configuracion, le decimos a Vite:
     * "Cualquier peticion que empiece con '/api', reenviala a localhost:8000"
     *
     * Asi, cuando el navegador pide `localhost:5173/api/upload`:
     * 1. Vite intercepta la peticion (porque empieza con '/api')
     * 2. Vite la reenvia a `localhost:8000/api/upload`
     * 3. FastAPI procesa la peticion y responde
     * 4. Vite reenvía la respuesta al navegador
     *
     * El navegador NUNCA sabe que hay dos servidores. Cree que todo viene de
     * localhost:5173. Esto tambien evita problemas de CORS (Cross-Origin
     * Resource Sharing), porque desde el punto de vista del navegador,
     * frontend y "backend" estan en el mismo origen.
     *
     * --- En produccion ---
     * Este proxy NO existe en produccion. En produccion, el backend (FastAPI)
     * sirve tanto la API como los archivos estaticos del frontend (build de Vite).
     * Todo corre en un solo servidor, asi que no hay problema de origenes cruzados.
     */
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
