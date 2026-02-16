/**
 * ============================================================================
 * DownloadStep.jsx — Paso final: celebracion y descarga del archivo convertido
 * ============================================================================
 *
 * Este componente es la "recompensa" del usuario al final del flujo de conversion.
 * Despues de subir (UploadStep) y convertir (ConvertStep), el usuario llega aqui
 * donde ve:
 *
 * 1. Una lluvia de confeti celebrando el exito de la conversion
 * 2. Un icono de fiesta animado con efecto spring
 * 3. El mensaje "Conversion Complete!" con subtitulo
 * 4. Un boton de descarga "magnetico" que sigue sutilmente al cursor
 * 5. Un enlace para convertir otro archivo (reiniciar el flujo)
 *
 * --- Filosofia de diseño: la celebracion importa ---
 * Las micro-interacciones al final de un flujo exitoso generan una respuesta
 * emocional positiva en el usuario. Estudios de UX muestran que estos "momentos
 * de deleite" (delight moments) aumentan la satisfaccion y la probabilidad de
 * que el usuario regrese. El confeti, el icono de fiesta y el boton magnetico
 * son elementos que transforman una accion mundana (descargar un archivo) en
 * una experiencia memorable.
 *
 * --- Patron "Magnetic Button" ---
 * El boton de descarga se desplaza ligeramente hacia el cursor del mouse cuando
 * este se acerca (a menos de 150px). Este efecto se llama "boton magnetico" y
 * es una tecnica popular en sitios web premium (Apple, Stripe, etc.). La idea
 * es que el boton "invita" al usuario a hacer click, reduciendo la distancia
 * que el cursor necesita recorrer. Tecnicamente, usamos:
 * - getBoundingClientRect() para obtener la posicion del boton
 * - Calculo de distancia euclidiana para detectar la proximidad
 * - Un offset proporcional a la distancia (mas cerca = mas offset)
 * - framer-motion spring para suavizar el movimiento
 *
 * --- Sobre el confeti ---
 * Las particulas se generan UNA sola vez con useState(lazy init) para evitar
 * re-generarlas en cada render. Cada particula tiene propiedades aleatorias
 * (posicion, delay, duracion, color, tamano, rotacion) que le dan al conjunto
 * un aspecto natural y no repetitivo. Usamos framer-motion para animar cada
 * particula individualmente con su propia configuracion de timing.
 *
 * @module components/DownloadStep
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, RotateCcw, PartyPopper } from 'lucide-react';
import { getDownloadUrl } from '../api/client';

/**
 * Paleta de colores para las particulas de confeti.
 *
 * Estos colores son versiones de nuestra paleta pastel personalizada:
 * - #B8C5D6: dusty-blue (tono frio principal)
 * - #A68B7B: mocha (tono calido de acento)
 * - #C4AD9D: latte (tono calido suave)
 * - #A8BBA8: sage (verde suave, color de "exito")
 * - #D4B5B0: soft-rose (rosa calido)
 * - #8DA4BF: slate-blue (azul medio)
 *
 * --- ¿Por que no usar los nombres de Tailwind directamente? ---
 * Las particulas se renderizan con estilos inline (style={{backgroundColor}})
 * porque cada una tiene un color aleatorio distinto. Tailwind es genial para
 * clases estaticas, pero para valores dinamicos por instancia necesitamos
 * inline styles. Por eso definimos los hex directamente.
 */
const CONFETTI_COLORS = ['#B8C5D6', '#A68B7B', '#C4AD9D', '#A8BBA8', '#D4B5B0', '#8DA4BF'];

/**
 * Genera un array de configuraciones para las particulas de confeti.
 *
 * Cada particula es un objeto con propiedades aleatorias que determinan
 * su apariencia y comportamiento de animacion. La aleatoriedad es lo que
 * hace que el confeti se vea natural — si todas las particulas tuvieran
 * las mismas propiedades, se verian como una cortina uniforme.
 *
 * --- Desglose de cada propiedad ---
 * - id: Identificador unico para la key de React (necesario en .map())
 * - x: Posicion horizontal en porcentaje (0-100%). Distribucion uniforme
 *   para cubrir todo el ancho del contenedor.
 * - delay: Retraso antes de que la particula aparezca (0-0.8s).
 *   Esto evita que todas aparezcan al mismo tiempo, creando un efecto
 *   de "explosion" que se desenvuelve gradualmente.
 * - duration: Duracion de la caida (1.5-2.5s). La variacion hace que
 *   unas particulas caigan mas rapido que otras (efecto de peso diferente).
 * - color: Color aleatorio de la paleta. Math.floor + Math.random asegura
 *   una seleccion uniforme del array de colores.
 * - size: Tamano en pixeles (4-10px). Particulas de diferentes tamanos
 *   crean sensacion de profundidad (las grandes parecen mas cercanas).
 * - rotation: Rotacion inicial en grados (0-360°). Cada particula empieza
 *   con una orientacion diferente para evitar uniformidad.
 *
 * @param {number} count - Cantidad de particulas a generar (default: 20)
 * @returns {Array<Object>} Array de configuraciones de particulas
 */
function generateConfetti(count = 35) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 1.5 + Math.random() * 1,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));
}

/**
 * DownloadStep — Pantalla de celebracion con descarga y boton magnetico
 *
 * @param {Object} props
 * @param {Object} props.uploadResult - Datos del archivo subido por la API.
 *   Necesitamos { job_id, filename } para construir la URL de descarga.
 *   job_id es el UUID que identifica el archivo en el backend/S3.
 * @param {Function} props.onReset - Callback para reiniciar la app al paso 0.
 *   Se llama cuando el usuario clickea "Convert another file".
 *   El componente padre (App.jsx) usa esto para limpiar todo el estado
 *   y volver al UploadStep.
 *
 * @returns {JSX.Element} Pantalla de descarga con confeti y animaciones
 */
export default function DownloadStep({ uploadResult, onReset }) {
  /**
   * === Particulas de confeti ===
   *
   * Usamos la forma "lazy initializer" de useState:
   *   useState(() => generateConfetti())
   *
   * --- ¿Por que lazy init y no useState(generateConfetti())? ---
   * Sin lazy init: `useState(generateConfetti())` ejecuta generateConfetti()
   * en CADA render del componente. Aunque useState solo usa el valor del
   * primer render e ignora los subsiguientes, la funcion se ejecuta siempre
   * desperdiciando CPU creando arrays que nunca se usan.
   *
   * Con lazy init: `useState(() => generateConfetti())` pasa una FUNCION
   * a useState. React solo la ejecuta en el PRIMER render. En renders
   * subsiguientes, ni siquiera la llama. Esto es mas eficiente para
   * valores iniciales costosos de calcular (como generar 20 objetos random).
   *
   * Nota: En este caso el calculo es barato, pero es una buena practica
   * para valores que involucran Math.random o creacion de objetos.
   */
  const [confetti] = useState(() => generateConfetti());

  /**
   * === Sistema de boton magnetico ===
   *
   * btnRef: Referencia al elemento DOM del boton de descarga.
   * Lo necesitamos para calcular su posicion con getBoundingClientRect().
   *
   * --- ¿Por que useRef y no document.querySelector? ---
   * useRef es el patron idomatic de React para acceder al DOM.
   * querySelector requiere un selector CSS (id o clase) que podria
   * colisionar con otros elementos. useRef crea una referencia directa
   * y segura al elemento especifico, incluso si hay multiples instancias
   * del componente (que en este caso no aplica, pero es buena practica).
   *
   * btnOffset: Desplazamiento actual del boton en pixeles {x, y}.
   * Se aplica como transformacion CSS via framer-motion animate prop.
   * Cuando el mouse esta lejos, es {0, 0} (posicion original).
   * Cuando el mouse esta cerca (<150px), se calcula un offset proporcional
   * a la distancia: mas cerca = mas desplazamiento.
   */
  const btnRef = useRef(null);
  const [btnOffset, setBtnOffset] = useState({ x: 0, y: 0 });

  /**
   * Handler del efecto magnetico: calcula el offset del boton segun
   * la posicion del cursor del mouse.
   *
   * --- Algoritmo paso a paso ---
   * 1. Verificar que el boton existe en el DOM (btnRef.current)
   * 2. Obtener las dimensiones y posicion del boton con getBoundingClientRect()
   *    Nota: rect.left, rect.top son coordenadas relativas al viewport
   * 3. Calcular el centro del boton:
   *    - centerX = left + width/2
   *    - centerY = top + height/2
   * 4. Calcular la distancia euclidiana del cursor al centro:
   *    - distance = sqrt((cursorX - centerX)^2 + (cursorY - centerY)^2)
   *    Esta es la formula de distancia entre dos puntos del plano.
   * 5. Si distance < 150px (el cursor esta "cerca"):
   *    - Calcular un factor de fuerza: strength = (1 - distance/150) * 12
   *      Cuando distance=0 → strength=12 (maximo desplazamiento: 12px)
   *      Cuando distance=150 → strength=0 (sin desplazamiento)
   *      La relacion es lineal: a la mitad de la distancia, la mitad de la fuerza
   *    - Calcular la direccion: (cursorX - centerX) / distance
   *      Esto normaliza el vector de direccion para obtener solo la direccion,
   *      no la magnitud (que ya se maneja con strength)
   *    - offset = direccion * strength
   * 6. Si distance >= 150px: offset = {0, 0} (sin efecto)
   *
   * --- ¿Por que 150px como umbral? ---
   * Es un balance entre:
   * - Muy pequeño (<80px): el efecto es imperceptible, el cursor tiene que
   *   estar casi encima del boton para notarlo
   * - Muy grande (>250px): el boton se mueve cuando el cursor esta lejos,
   *   lo cual se siente raro y distrae
   * 150px es aprox. 3-4 veces el tamano del boton, lo que crea una zona
   * de influencia natural.
   *
   * --- ¿Por que 12 como fuerza maxima? ---
   * 12px de desplazamiento es lo suficiente para notar el movimiento
   * sin que el boton "huya" del cursor. Valores mayores (>20px) pueden
   * frustrar al usuario porque el boton se mueve demasiado y es dificil
   * de clickear.
   *
   * --- ¿Por que useCallback? ---
   * Este handler se registra como event listener de window.mousemove.
   * Sin useCallback, cada render crearia una nueva funcion, y el
   * useEffect de abajo tendria que remove/add el listener en cada render.
   * Con useCallback, la funcion se memoriza y el listener se mantiene
   * estable entre renders.
   */
  const handleMouseMove = useCallback((e) => {
    if (!btnRef.current) return;

    // Obtener posicion y dimensiones del boton en el viewport
    const rect = btnRef.current.getBoundingClientRect();

    // Calcular el punto central del boton
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Distancia euclidiana del cursor al centro del boton
    const distance = Math.sqrt(
      (e.clientX - centerX) ** 2 + (e.clientY - centerY) ** 2
    );

    if (distance < 150) {
      // El cursor esta dentro de la zona de influencia magnetica
      // Calcular la fuerza: inversamente proporcional a la distancia
      const strength = (1 - distance / 150) * 12;

      // Calcular offset: direccion normalizada * fuerza
      setBtnOffset({
        x: ((e.clientX - centerX) / distance) * strength,
        y: ((e.clientY - centerY) / distance) * strength,
      });
    } else {
      // El cursor esta fuera de la zona — resetear a posicion original
      setBtnOffset({ x: 0, y: 0 });
    }
  }, []);

  /**
   * Handler para cuando el mouse sale del contenedor del componente.
   *
   * Reseteamos el offset a {0, 0} para que el boton vuelva a su posicion
   * original. Sin esto, si el usuario mueve el mouse fuera del viewport
   * rapidamente, el boton podria quedarse "atascado" en la ultima posicion
   * calculada porque el evento mousemove de window no se dispara fuera
   * del viewport.
   */
  const handleMouseLeave = useCallback(() => {
    setBtnOffset({ x: 0, y: 0 });
  }, []);

  /**
   * Efecto para registrar/desregistrar el listener de mousemove en window.
   *
   * --- ¿Por que window y no el contenedor? ---
   * El efecto magnetico debe funcionar cuando el cursor esta CERCA del
   * boton, no solo SOBRE el boton. Si pusieramos el listener en el boton
   * o su contenedor inmediato, solo detectariamos movimiento cuando el
   * cursor ya esta encima (demasiado tarde para el efecto "magnetico").
   *
   * Con el listener en window, detectamos el movimiento del mouse en
   * cualquier parte de la pagina y calculamos la distancia al boton.
   *
   * --- Cleanup: por que es importante ---
   * La funcion de retorno del useEffect se ejecuta cuando el componente
   * se desmonta (ej: el usuario clickea "Convert another file").
   * Si no removemos el listener, seguiria ejecutandose handleMouseMove
   * en cada movimiento del mouse incluso despues de que este componente
   * ya no existe, causando:
   * 1. Memory leak (la funcion retiene referencias al componente desmontado)
   * 2. Errores (btnRef.current seria null)
   * 3. Desperdicio de CPU (calculando distancias sin proposito)
   */
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return (
    /**
     * Contenedor principal con animaciones de entrada/salida.
     *
     * Seguimos el mismo patron que UploadStep y ConvertStep para
     * mantener consistencia visual en las transiciones entre pasos:
     *
     * --- Entrada ---
     * opacity 0 → 1, x: 100 → 0, scale: 0.95 → 1
     * El componente "entra" deslizandose desde la derecha, igual que
     * ConvertStep. Esto refuerza la metafora de flujo izquierda→derecha.
     *
     * --- Salida ---
     * opacity 1 → 0, x: 0 → -100, scale: 1 → 0.95
     * Sale hacia la izquierda. Aunque en teoria este es el ultimo paso,
     * si el usuario clickea "Convert another file", necesitamos una
     * salida elegante antes de que UploadStep entre de nuevo.
     *
     * --- Spring stiffness 300 + damping 25 ---
     * Misma configuracion que los otros pasos. La consistencia en las
     * transiciones crea cohesion visual — el usuario percibe que todos
     * los pasos son "parte de la misma experiencia".
     */
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative text-center"
      onMouseLeave={handleMouseLeave}
    >
      {/*
       * ================================================================
       * Contenedor de particulas de confeti
       * ================================================================
       *
       * absolute inset-0: cubre todo el area del componente padre.
       * pointer-events-none: las particulas no interceptan clicks del mouse.
       * Sin esto, las particulas (que son divs posicionados absolutamente)
       * podrian bloquear el click en el boton de descarga.
       *
       * overflow-hidden: evita que las particulas que caen mas alla del
       * borde inferior del contenedor causen scroll horizontal o vertical.
       * Las particulas se "recortan" limpiamente al salir del contenedor.
       *
       * --- ¿Por que z-0 y no z-10? ---
       * El confeti es decorativo y debe estar DEBAJO del contenido
       * interactivo (boton, textos). z-0 lo pone en la capa base.
       * Los elementos de contenido no necesitan z-index explicito
       * porque el orden del DOM ya los pone encima (last in DOM = on top
       * cuando ambos estan en el mismo stacking context).
       */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {confetti.map((particle) => (
          /**
           * Cada particula de confeti es un div animado individualmente.
           *
           * --- Posicionamiento ---
           * - absolute: posicion libre dentro del contenedor
           * - left: {x}% — posicion horizontal aleatoria (0-100% del ancho)
           * - top: -10px — empieza fuera del contenedor (arriba), invisible
           *
           * --- Dimensiones ---
           * - width y height: segun particle.size (4-10px)
           * - rounded-sm: bordes ligeramente redondeados (cuadrados con esquinas suaves)
           *   En lugar de circulos (rounded-full), los cuadrados redondeados
           *   se ven mas como confeti real (papel cortado)
           *
           * --- Animacion con framer-motion ---
           * - y: [-20, 300] — la particula cae de arriba (-20px) a abajo (300px)
           * - opacity: [0, 1, 1, 0] — aparece, se mantiene visible, y se desvanece
           *   Los 4 valores crean keyframes: 0%, 33%, 66%, 100%
           *   Asi la particula es visible durante la mayor parte de la caida
           *   y solo se desvanece al final
           * - rotate: [rotation, rotation + 720] — gira 720° (2 vueltas completas)
           *   Cada particula empieza con una rotacion diferente, lo que evita
           *   que todas giren sincronizadas
           *
           * --- Timing ---
           * - duration: 1.5-2.5s (de particle.duration). La variacion crea
           *   la ilusion de particulas de diferente peso/resistencia al aire
           * - delay: 0-0.8s (de particle.delay). No todas aparecen al mismo
           *   tiempo, creando un efecto de "explosion" gradual
           * - ease: 'easeIn' — la particula ACELERA al caer, simulando gravedad.
           *   En la vida real, los objetos caen cada vez mas rapido por la
           *   aceleracion gravitacional. easeIn emula esto (lento al inicio,
           *   rapido al final)
           */
          <motion.div
            key={particle.id}
            className="absolute rounded-sm"
            style={{
              left: `${particle.x}%`,
              top: -10,
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
            }}
            initial={{ opacity: 0 }}
            animate={{
              y: [-20, 300],
              opacity: [0, 1, 1, 0],
              rotate: [particle.rotation, particle.rotation + 720],
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              ease: 'easeIn',
            }}
          />
        ))}
      </div>

      {/*
       * ================================================================
       * Icono de celebracion (PartyPopper)
       * ================================================================
       *
       * El icono de fiesta es el primer elemento que el usuario ve.
       * Aparece con una animacion spring dramatica:
       *
       * --- scale: 0 → 1 ---
       * El icono "explota" desde nada hasta su tamano completo.
       * Es un efecto comun en notificaciones de exito (piensa en el
       * check verde de WhatsApp o el confeti de Slack).
       *
       * --- rotate: -180 → 0 ---
       * El icono gira media vuelta mientras crece. Esto agrega energia
       * visual al "pop" de aparicion. Sin rotacion, el scale solo
       * se veria como un simple zoom, menos interesante.
       *
       * --- Spring stiffness 400 + damping 12 ---
       * Stiffness alta (400 vs 300 en los contenedores) = movimiento
       * mas rapido y energico. Damping bajo (12 vs 25) = mas rebote.
       * Esta combinacion crea un "pop" elastico perfecto para un
       * momento de celebracion. La poca amortiguacion deja que el
       * icono rebote un poco, lo cual se siente festivo.
       *
       * --- delay: 0.2 ---
       * Espera a que el contenedor principal haya empezado su animacion
       * de entrada. Si apareciera al mismo tiempo, competiria con la
       * transicion del contenedor y ambas se perderian visualmente.
       *
       * --- Fondo circular (w-20 h-20 rounded-full bg-sage/20) ---
       * El icono esta dentro de un circulo verde suave (sage con 20%
       * de opacidad). Esto le da presencia y peso visual al icono,
       * separandolo del fondo. El sage/20 es consistente con el color
       * de "exito" usado en el check del DropZone.
       */}
      <motion.div
        className="flex justify-center mb-4"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 12,
          delay: 0.2,
        }}
      >
        <div className="w-20 h-20 rounded-full bg-sage/20 flex items-center justify-center">
          <PartyPopper className="w-10 h-10 text-sage" />
        </div>
      </motion.div>

      {/*
       * ================================================================
       * Titulo "Conversion Complete!"
       * ================================================================
       *
       * Texto principal que confirma el exito de la operacion.
       * Aparece con un simple fade-in (opacity 0→1) con delay 0.4s.
       *
       * --- ¿Por que delay 0.4 y no 0.3? ---
       * El icono de fiesta tiene delay 0.2 y tarda ~0.3s en completar
       * su animacion spring. El titulo aparece a 0.4s, justo cuando
       * el icono ya se estabilizo. Esto crea una secuencia:
       * 1. Contenedor se desliza (0s)
       * 2. Icono hace "pop" (0.2s)
       * 3. Titulo aparece (0.4s)
       * 4. Subtitulo aparece (0.5s)
       * 5. Boton sube (0.6s)
       * 6. Link "Convert another" aparece (1.0s)
       *
       * Esta cascada guia el ojo del usuario de arriba a abajo,
       * en el orden de importancia de los elementos.
       *
       * --- text-2xl font-bold text-deep-navy ---
       * Tamano grande y peso bold para que sea el elemento mas prominente
       * despues del icono. deep-navy es el color de texto principal.
       */}
      <motion.h2
        className="text-2xl font-bold text-deep-navy mb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        Conversion Complete!
      </motion.h2>

      {/*
       * ================================================================
       * Subtitulo "Your file is ready to download"
       * ================================================================
       *
       * Texto secundario que le dice al usuario que hacer a continuacion.
       * text-deep-navy/50: 50% de opacidad para jerarquia visual
       * (mas suave que el titulo, indicando que es informacion de soporte).
       *
       * delay: 0.5 — aparece 100ms despues del titulo, continuando
       * la cascada de animaciones.
       */}
      <motion.p
        className="text-deep-navy/50 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        Your file is ready to download
      </motion.p>

      {/*
       * ================================================================
       * Boton de descarga magnetico
       * ================================================================
       *
       * Este es el elemento interactivo principal del componente.
       * Es un enlace <a> (no un <button>) porque descarga un archivo
       * directamente desde el servidor.
       *
       * --- ¿Por que <a> y no <button> con fetch? ---
       * Para descargas de archivos, un enlace <a> con atributo `download`
       * es la forma nativa y mas eficiente del navegador:
       * - El navegador maneja la descarga con su gestor nativo
       * - No carga el archivo entero en memoria JavaScript
       * - Muestra el dialogo nativo de "Guardar como..."
       * - Soporta archivos grandes sin problemas de memoria
       * Con fetch(), tendriamos que descargar el blob a memoria JS,
       * crear un URL.createObjectURL(), y simular un click — mas complejo
       * y menos eficiente.
       *
       * --- Animacion de entrada ---
       * opacity: 0→1, y: 20→0 — el boton "sube" desde abajo.
       * delay: 0.6 — aparece despues del subtitulo, completando
       * la cascada visual. Para cuando el boton aparece, el usuario
       * ya leyo "Conversion Complete!" y "ready to download", asi que
       * el boton es la accion logica siguiente.
       *
       * --- Efecto magnetico (animate={{ x, y }}) ---
       * btnOffset.x y btnOffset.y se calculan en handleMouseMove
       * basandose en la posicion del cursor. framer-motion interpola
       * suavemente entre la posicion actual y la nueva con un spring:
       * - stiffness 200: menos rigido que las transiciones de entrada (300)
       *   para un movimiento mas suave y fluido al seguir al cursor
       * - damping 15: amortiguacion moderada para un ligero rebote
       *   que se siente "jugueton" y magnetico
       *
       * --- whileTap: scale 0.95 ---
       * Retroalimentacion tactil al clickear: el boton se encoge 5%.
       * Es un patron estandar en botones modernos que confirma al
       * usuario que su click fue registrado.
       *
       * --- Clase pulse-glow ---
       * Definida en index.css, crea un anillo verde pulsante alrededor
       * del boton usando box-shadow animado. Esto llama la atencion
       * del usuario hacia la accion principal (descargar).
       *
       * --- Gradiente from-sage to-dusty-blue ---
       * Verde→azul es un gradiente que comunica "exito + accion".
       * sage (verde) refuerza el exito de la conversion.
       * dusty-blue (azul) invita a la accion (los botones de accion
       * suelen ser azules por convencion).
       */}
      <motion.div
        className="flex justify-center mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <motion.a
          ref={btnRef}
          href={getDownloadUrl(uploadResult.job_id)}
          download
          animate={{ x: btnOffset.x, y: btnOffset.y }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-sage via-dusty-blue to-slate-blue hover:shadow-xl transition-shadow"
          style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
        >
          <Download className="w-5 h-5" />
          Download File
        </motion.a>
      </motion.div>

      {/*
       * ================================================================
       * Enlace "Convert another file"
       * ================================================================
       *
       * Permite al usuario reiniciar todo el flujo desde cero.
       * Es el elemento con el delay mas largo (1s) porque es la accion
       * MENOS importante — el usuario primero debe descargar su archivo.
       * Al aparecer tarde, no distrae de la accion principal.
       *
       * --- ¿Por que <button> y no <a>? ---
       * No navega a ninguna URL. Ejecuta una funcion JavaScript (onReset)
       * que cambia el estado de la app. Semanticamente, un <button> es
       * correcto para acciones que no son navegacion.
       *
       * --- Estilo intencional: text-deep-navy/40 ---
       * Opacidad 40% = texto muy suave, casi invisible. Esto lo relega
       * visualmente a un papel secundario. Solo al hacer hover sube a 70%
       * (hover:text-deep-navy/70), lo que lo hace legible pero no prominente.
       * Es la misma tecnica que usan los enlaces "Forgot password?" en
       * formularios de login: presentes pero no distractores.
       *
       * --- Icono RotateCcw ---
       * Una flecha circular que comunica "repetir" o "reiniciar".
       * Es un simbolo universal de "volver a hacer". Lucide lo ofrece
       * como RotateCcw (counter-clockwise rotation).
       */}
      <motion.button
        onClick={onReset}
        className="inline-flex items-center gap-2 text-sm text-deep-navy/40 hover:text-deep-navy/70 transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.4 }}
      >
        <RotateCcw className="w-4 h-4" />
        Convert another file
      </motion.button>
    </motion.div>
  );
}
