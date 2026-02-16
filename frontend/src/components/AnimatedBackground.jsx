/**
 * ============================================================================
 * AnimatedBackground.jsx — Fondo animado con blobs organicos flotantes
 * ============================================================================
 *
 * Este componente crea el fondo visual de la aplicacion: formas organicas
 * (blobs) de colores pastel que flotan lentamente detras de todo el contenido.
 *
 * --- ¿Por que blobs y no un fondo solido? ---
 * Los blobs animados crean una sensacion de "vida" y movimiento sutil que
 * hace que la aplicacion se sienta premium y moderna. Es una tecnica comun
 * en sitios como Linear, Vercel y Stripe. El movimiento lento y las formas
 * organicas generan una atmosfera relajada y acogedora.
 *
 * --- ¿Por que CSS puro y no Framer Motion? ---
 * Estas animaciones son infinitas, no interactivas, y puramente decorativas.
 * CSS @keyframes se ejecuta en el hilo del compositor del navegador (GPU),
 * separado del hilo principal de JavaScript. Esto significa:
 * 1. No bloquean el rendering de React
 * 2. Consumen menos bateria
 * 3. Son mas suaves (60fps nativos)
 * Framer Motion lo reservamos para animaciones que responden a interacciones
 * del usuario (hover, click, drag), donde necesitamos control desde JS.
 *
 * --- ¿Por que filter: blur() tan alto (70-100px)? ---
 * El blur alto es clave para el efecto visual. Sin el, los blobs se verian
 * como circulos de color solido. Con blur alto, los bordes se difuminan
 * creando gradientes suaves que se mezclan entre si y con el fondo,
 * dando una apariencia de "nube de color" organica.
 *
 * --- ¿Por que overflow-hidden en el contenedor? ---
 * Los blobs se mueven mas alla de los bordes de la pantalla (posiciones
 * negativas como top-[-10%]). Sin overflow-hidden, esto crearia barras
 * de scroll horizontal no deseadas. El overflow-hidden recorta los blobs
 * en los bordes de la ventana de forma limpia.
 *
 * --- Estructura de los blobs ---
 * Usamos 4 blobs con diferentes:
 * - Colores: alternando calidos (mocha, latte) y frios (dusty-blue)
 * - Tamanos: de 350px a 600px para variedad visual
 * - Velocidades: de 20s a 30s para que no se sincronicen
 * - Opacidades: de /20 a /35 para que sean sutiles, no dominantes
 * - Posiciones: distribuidos en las esquinas y bordes de la pantalla
 *
 * La combinacion de estos parametros evita que el patron se vea repetitivo
 * o mecanico. Cada blob se siente unico e independiente.
 */

/**
 * AnimatedBackground — Componente de fondo con blobs flotantes
 *
 * Este componente no recibe props ni maneja estado. Es puramente visual.
 * Se monta una sola vez y las animaciones corren indefinidamente via CSS.
 *
 * Se debe colocar como primer hijo del contenedor raiz de la app para
 * que quede detras de todo el contenido gracias a z-[-1].
 *
 * @returns {JSX.Element} Contenedor fijo con 4 blobs animados
 */
export default function AnimatedBackground() {
  return (
    /**
     * Contenedor principal de los blobs.
     *
     * - fixed: se queda fijo en la ventana, no se mueve con el scroll
     * - inset-0: ocupa toda la pantalla (top:0, right:0, bottom:0, left:0)
     * - z-[-1]: se posiciona DETRAS de todo el contenido (z-index negativo)
     * - overflow-hidden: recorta blobs que se salen de la pantalla
     * - pointer-events-none: permite hacer click "a traves" de los blobs
     *   sin interferir con la interaccion del usuario en los elementos de arriba
     */
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">

      {/*
       * ====================================================================
       * Blob 1 — Mocha (tono calido)
       * ====================================================================
       *
       * Posicionado en la esquina superior izquierda. Es el blob mas "calido"
       * y establece el tono de la paleta. Su posicion negativa (-10% top,
       * -5% left) hace que solo una parte sea visible, como si emergiera
       * desde fuera de la pantalla.
       *
       * - 500x500px: tamano mediano, presente pero no dominante
       * - mocha/30: opacidad del 30%, suficiente para notar el color
       * - blur(80px): difuminado alto para bordes suaves
       * - blob-1 25s: usa la primera trayectoria, ciclo de 25 segundos
       * - rounded-full: base circular antes de que la animacion deforme los bordes
       */}
      <div
        className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-mocha/30 rounded-full"
        style={{
          filter: 'blur(80px)',
          animation: 'blob-1 25s ease-in-out infinite',
        }}
      />

      {/*
       * ====================================================================
       * Blob 2 — Dusty Blue (tono frio)
       * ====================================================================
       *
       * Posicionado en la esquina superior derecha. Contrarresta el calor
       * del blob 1 con un tono azul pastel. La posicion right: -10% lo
       * saca parcialmente de la pantalla, creando un efecto de profundidad.
       *
       * - 400x400px: mas pequeno que blob 1 para variedad
       * - dusty-blue/35: un poco mas opaco para compensar su menor tamano
       * - blur(80px): mismo nivel de difuminado que blob 1
       * - blob-2 20s: segunda trayectoria, ciclo mas rapido (20s vs 25s)
       *   para que los blobs no se muevan en sincronía
       */}
      <div
        className="absolute top-[10%] right-[-10%] w-[400px] h-[400px] bg-dusty-blue/35 rounded-full"
        style={{
          filter: 'blur(80px)',
          animation: 'blob-2 20s ease-in-out infinite',
        }}
      />

      {/*
       * ====================================================================
       * Blob 3 — Latte (tono intermedio)
       * ====================================================================
       *
       * Posicionado en la parte inferior. Es el blob MAS GRANDE (600px)
       * y con mayor blur (100px), lo que lo convierte en una "base" de color
       * que soporta visualmente la parte baja de la pantalla.
       *
       * - 600x600px: el mas grande, cubre mas area
       * - latte/25: opacidad baja (25%) porque su gran tamano compensa
       * - blur(100px): el blur mas alto, lo hace ultra-suave y difuso
       * - blob-3 30s: tercera trayectoria, el ciclo mas lento (30s)
       *   para que se sienta pesado y majestuoso, como una nube grande
       */}
      <div
        className="absolute bottom-[-15%] left-[20%] w-[600px] h-[600px] bg-latte/25 rounded-full"
        style={{
          filter: 'blur(100px)',
          animation: 'blob-3 30s ease-in-out infinite',
        }}
      />

      {/*
       * ====================================================================
       * Blob 4 — Dusty Blue Light (acento sutil)
       * ====================================================================
       *
       * Posicionado en el borde izquierdo a media altura. Es el blob
       * mas pequeno y sutil, actua como "relleno" visual para evitar
       * que el centro-izquierda de la pantalla se vea vacio.
       *
       * - 350x350px: el mas pequeno de todos
       * - dusty-blue-light/20: la opacidad mas baja, casi fantasmal
       * - blur(70px): blur menor porque su tamano pequeno no necesita tanto
       * - blob-2 22s reverse: REUTILIZA la trayectoria de blob-2 pero:
       *   a) Con duracion diferente (22s vs 20s) para desincronizar
       *   b) Con "reverse" para que recorra la trayectoria al reves
       *   Esto crea la ilusion de un quinto patron de movimiento
       *   sin necesidad de definir mas @keyframes en CSS.
       */}
      <div
        className="absolute top-[50%] left-[-5%] w-[350px] h-[350px] bg-dusty-blue-light/20 rounded-full"
        style={{
          filter: 'blur(70px)',
          animation: 'blob-2 22s ease-in-out infinite reverse',
        }}
      />

    </div>
  );
}
