/**
 * ============================================================================
 * FormatCard.jsx — Tarjeta interactiva para seleccion de formato con 3D tilt
 * ============================================================================
 *
 * Este componente es una tarjeta que el usuario puede clickear para seleccionar
 * un formato de conversion (ej: "JPEG", "PDF", "Compress"). Incluye tres
 * efectos visuales avanzados que la hacen sentir premium y tactil:
 *
 * 1. **3D Tilt (inclinacion):** La tarjeta se inclina sutilmente en la
 *    direccion del cursor, creando una ilusion de profundidad 3D. Es el
 *    mismo efecto que usan las tarjetas de credito holograficas.
 *
 * 2. **Ripple (onda al click):** Al hacer click, una onda circular se
 *    expande desde el punto exacto donde el usuario clickeo. Inspirado
 *    en Material Design de Google, comunica "tu click fue registrado".
 *
 * 3. **Selection glow (brillo de seleccion):** Cuando la tarjeta esta
 *    seleccionada, aparece un borde azul con sombra luminosa y un check
 *    animado. Esto deja claro cual formato esta activo.
 *
 * --- ¿Por que tanto esfuerzo visual en una "simple seleccion"? ---
 * La seleccion de formato es el paso donde el usuario toma una decision.
 * Los efectos visuales hacen que esta decision se sienta:
 * - Responsiva (el tilt y ripple responden al instante)
 * - Clara (el glow y check muestran que se selecciono)
 * - Satisfactoria (los springs dan peso y fisicidad a la interaccion)
 *
 * Sin estos efectos, seleccionar un formato se sentiria como clickear un
 * boton de radio generico — funcional pero aburrido.
 *
 * --- Patron de componente "controlado" ---
 * FormatCard no maneja su propio estado de seleccion. Recibe `selected`
 * como prop y llama `onSelect(value)` al clickear. El estado vive en el
 * componente padre (ConvertStep), que decide cual tarjeta esta seleccionada.
 * Esto sigue el patron de "single source of truth" de React.
 *
 * @module components/FormatCard
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * FormatCard — Tarjeta de formato con tilt 3D, ripple y brillo de seleccion
 *
 * @param {Object} props
 * @param {string} props.label - Nombre del formato visible al usuario (ej: "JPEG", "PDF")
 * @param {string} props.value - Valor tecnico que se envia a la API (ej: "image/jpeg", "compress")
 * @param {string} props.description - Descripcion corta del formato (ej: "Lossy, smaller size")
 * @param {React.Component} props.icon - Componente de icono de Lucide React (ej: FileImage)
 * @param {boolean} props.selected - Si esta tarjeta esta actualmente seleccionada
 * @param {Function} props.onSelect - Callback que recibe `value` al hacer click
 *
 * @returns {JSX.Element} Tarjeta interactiva con efectos 3D
 */
export default function FormatCard({ label, value, description, icon: Icon, selected, onSelect }) {
  /**
   * === Estado del efecto ripple ===
   *
   * Almacenamos la posicion {x, y} del click y un `key` unico para
   * cada ripple. El key usa Date.now() para garantizar que cada click
   * genera un nuevo ripple (incluso si el usuario clickea en el mismo
   * punto dos veces seguidas).
   *
   * --- ¿Por que key con Date.now() y no un contador? ---
   * Date.now() es mas simple y no requiere un ref adicional para
   * mantener el contador. Ademas, es unico en la practica porque
   * el usuario no puede clickear dos veces en el mismo milisegundo.
   * Framer Motion usa el key para saber cuando remontar el elemento
   * y re-ejecutar la animacion initial → animate.
   */
  const [ripple, setRipple] = useState(null);

  /**
   * === Estado del efecto 3D tilt ===
   *
   * Almacenamos los angulos de rotacion en grados: {x, y}.
   * Estos valores se aplican directamente al transform CSS:
   *   transform: perspective(800px) rotateX(Xdeg) rotateY(Ydeg)
   *
   * Ambos empiezan en 0 (sin rotacion). Se actualizan en onMouseMove
   * y se resetean a 0 en onMouseLeave.
   */
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  /**
   * Ref al elemento DOM de la tarjeta.
   *
   * Necesitamos acceso al DOM real para calcular las dimensiones y
   * posicion de la tarjeta con getBoundingClientRect(). Esto nos permite
   * saber donde esta el cursor RELATIVO a la tarjeta (no a la ventana).
   *
   * --- ¿Por que useRef y no event.target? ---
   * event.target podria apuntar a un hijo de la tarjeta (el icono, el texto)
   * si el cursor esta sobre ellos. Con useRef, siempre obtenemos el elemento
   * raiz de la tarjeta, independientemente de donde este el cursor.
   */
  const cardRef = useRef(null);

  /**
   * Handler del movimiento del mouse para el efecto 3D tilt.
   *
   * --- Algoritmo de calculo del tilt ---
   * 1. Obtener las dimensiones y posicion de la tarjeta (getBoundingClientRect)
   * 2. Calcular la posicion relativa del cursor:
   *    - x = (clientX - rect.left) / rect.width  → valor de 0 a 1
   *    - Restar 0.5 para centrar: rango de -0.5 a 0.5
   * 3. Multiplicar por maxTilt (8 grados) para obtener la rotacion:
   *    - Si el cursor esta en el borde izquierdo: x=-0.5, rotateY=-4°
   *    - Si esta en el centro: x=0, rotateY=0°
   *    - Si esta en el borde derecho: x=0.5, rotateY=4°
   *
   * --- ¿Por que rotateX usa Y y rotateY usa X? ---
   * Esto es CONTRA-INTUITIVO pero correcto en CSS 3D:
   * - rotateX gira alrededor del eje X (horizontal), lo que mueve la
   *   tarjeta hacia arriba/abajo. El movimiento vertical del cursor (Y)
   *   determina esta rotacion.
   * - rotateY gira alrededor del eje Y (vertical), lo que mueve la
   *   tarjeta hacia izquierda/derecha. El movimiento horizontal (X)
   *   determina esta rotacion.
   *
   * El signo negativo en rotateX invierte la direccion para que la
   * tarjeta "siga" al cursor (si el cursor sube, la parte superior
   * de la tarjeta se inclina hacia el usuario).
   *
   * --- ¿Por que maxTilt = 8? ---
   * 8 grados es sutil pero perceptible. Valores mayores (15-20°) se
   * sienten exagerados y distraen. Valores menores (2-3°) son casi
   * imperceptibles y no vale la pena el costo computacional.
   *
   * @param {MouseEvent} e - Evento de movimiento del mouse
   */
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const maxTilt = 8;

    // Posicion normalizada del cursor: -0.5 (borde izq/arriba) a 0.5 (borde der/abajo)
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    // Convertir a grados de rotacion (ver explicacion arriba sobre la inversion X/Y)
    setTilt({
      x: y * -maxTilt,  // Movimiento vertical del cursor → rotacion horizontal
      y: x * maxTilt,   // Movimiento horizontal del cursor → rotacion vertical
    });
  };

  /**
   * Resetear el tilt cuando el cursor sale de la tarjeta.
   *
   * La tarjeta vuelve suavemente a su posicion neutra (0, 0) gracias
   * a la transicion CSS definida en el style del motion.button.
   * Sin este reset, la tarjeta quedaria inclinada despues de que el
   * cursor se fuera, lo cual se sentiria roto.
   */
  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  /**
   * Handler del click que activa el ripple y notifica la seleccion.
   *
   * --- ¿Por que calcular la posicion del click? ---
   * El ripple se expande desde el punto exacto donde el usuario clickeo,
   * no desde el centro de la tarjeta. Esto es mas natural y es el
   * comportamiento estandar de Material Design.
   *
   * --- ¿Por que llamamos onSelect DESPUES de setRipple? ---
   * El ripple es una animacion local. La seleccion es un cambio de estado
   * en el padre. Ambos son independientes, asi que el orden no importa
   * funcionalmente, pero ponemos el ripple primero para que la animacion
   * inicie inmediatamente mientras React procesa el cambio de estado.
   *
   * @param {MouseEvent} e - Evento de click del mouse
   */
  const handleClick = (e) => {
    const rect = cardRef.current.getBoundingClientRect();

    // Posicion del click relativa a la esquina superior izquierda de la tarjeta
    setRipple({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      key: Date.now(), // Key unico para que Framer Motion remonte el span
    });

    // Notificar al padre que este formato fue seleccionado
    onSelect(value);
  };

  return (
    /**
     * Boton principal de la tarjeta con efecto tilt 3D.
     *
     * --- ¿Por que motion.button y no motion.div? ---
     * Semanticamente es un boton (el usuario lo clickea para seleccionar).
     * Usar <button> da accesibilidad gratuita: foco con Tab, activacion
     * con Enter/Space, y lectores de pantalla lo anuncian como interactivo.
     *
     * --- Sobre el transform con perspective ---
     * perspective(800px) define la "distancia del ojo" al plano 3D.
     * Valores menores (200-400px) crean un efecto mas dramatico (como
     * una camara gran angular). 800px es sutil y elegante.
     *
     * --- ¿Por que transition inline y no en Framer Motion? ---
     * La transicion CSS (0.15s ease-out) se aplica al transform del tilt.
     * Si usaramos Framer Motion animate, tendriamos que calcular los
     * angulos en cada frame de onMouseMove, lo cual es menos eficiente.
     * CSS transitions son manejadas por el compositor (GPU) y son mas
     * suaves para animaciones continuas como el seguimiento del cursor.
     *
     * --- whileTap: scale 0.97 ---
     * Un feedback tactil sutil al presionar. La tarjeta "se hunde"
     * ligeramente, imitando la fisica de presionar un boton real.
     *
     * --- Clases condicionales de seleccion ---
     * Selected: borde azul solido, sombra azul, glass
     * Unselected: borde transparente, sin sombra, hover sutil
     * La transicion entre estados es suave gracias a transition-all en CSS.
     */
    <motion.button
      ref={cardRef}
      type="button"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileTap={{ scale: 0.97 }}
      className={`
        relative overflow-hidden rounded-xl p-5 text-left w-full
        transition-all duration-200
        ${selected
          ? 'glass border-2 border-dusty-blue shadow-lg shadow-dusty-blue/20'
          : 'glass border border-transparent hover:shadow-md hover:shadow-mocha/10'
        }
      `}
      style={{
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      {/*
       * ================================================================
       * Checkmark de seleccion (esquina superior derecha)
       * ================================================================
       *
       * Un circulo azul con un check SVG que aparece con animacion spring
       * cuando la tarjeta esta seleccionada. La animacion scale 0→1 con
       * stiffness alto (500) y damping bajo (20) crea un "pop" satisfactorio.
       *
       * --- ¿Por que stiffness 500? ---
       * Un spring rigido (high stiffness) hace que la animacion sea rapida
       * y snappy. Queremos que el check "aparezca" con energia, no que
       * flote suavemente. El damping 20 evita que rebote demasiado.
       *
       * --- ¿Por que absolute top-2 right-2? ---
       * Posicionado en la esquina para no interferir con el contenido
       * principal (icono, label, descripcion). Es un patron de UI comun
       * para indicadores de seleccion en tarjetas/chips.
       */}
      {selected && (
        <motion.div
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-dusty-blue flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        >
          {/*
           * SVG de check minimalista.
           *
           * Usamos un SVG inline en vez de un icono de Lucide porque
           * necesitamos control total del tamano (10x10px es muy pequeño
           * para los iconos estandar de Lucide que vienen en 24x24).
           *
           * viewBox="0 0 24 24" con w-2.5 h-2.5 escala el icono
           * proporcionalmente sin distorsion.
           *
           * strokeWidth 3 hace las lineas mas gruesas para que sean
           * visibles en un tamano tan pequeño.
           */}
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}

      {/*
       * ================================================================
       * Efecto ripple (onda al click)
       * ================================================================
       *
       * Cuando el usuario clickea, renderizamos un circulo en la posicion
       * del click que se expande rapidamente (scale 0→15) mientras se
       * desvanece (opacity 0.5→0).
       *
       * --- ¿Por que scale 15? ---
       * El circulo inicial es muy pequeño. Necesitamos que crezca lo
       * suficiente para cubrir toda la tarjeta. Un scale de 15 asegura
       * que incluso si el click es en una esquina, la onda cubra toda
       * la superficie antes de desvanecerse.
       *
       * --- ¿Por que w-4 h-4 con position absolute? ---
       * El circulo base es de 16x16px (w-4 h-4). Lo centramos en el
       * punto de click con left/top y un translate de -50% en ambos ejes.
       * Al escalar 15x, cubre un area de 240x240px, mas que suficiente
       * para la mayoria de tarjetas.
       *
       * --- onAnimationComplete ---
       * Limpiamos el estado del ripple cuando la animacion termina.
       * Sin esto, el span invisible quedaria en el DOM innecesariamente.
       * Ademas, si no limpiamos, el proximo click con la misma key
       * no re-dispararia la animacion.
       */}
      {ripple && (
        <motion.span
          key={ripple.key}
          className="absolute bg-dusty-blue/20 rounded-full w-4 h-4 pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 15, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          onAnimationComplete={() => setRipple(null)}
        />
      )}

      {/*
       * ================================================================
       * Contenido de la tarjeta (icono + texto)
       * ================================================================
       *
       * Layout horizontal (flex items-start gap-3):
       * [Icono] [Label    ]
       *         [Descripcion]
       *
       * items-start alinea el icono con la parte superior del texto,
       * no con el centro. Esto se ve mejor cuando la descripcion
       * ocupa dos lineas (el icono no queda flotando en el medio).
       */}
      <div className="flex items-start gap-3">
        {/*
         * Contenedor del icono con fondo condicional.
         *
         * Selected: fondo azul semitransparente (dusty-blue/20) con
         *   icono en slate-blue (mas oscuro). Comunica "activo".
         * Unselected: fondo blanco semitransparente (white/40) con
         *   icono atenuado (deep-navy/50). Comunica "disponible pero inactivo".
         *
         * rounded-lg: bordes redondeados que complementan el rounded-xl del card.
         * p-2: padding generoso alrededor del icono.
         */}
        <div
          className={`p-2 rounded-lg ${
            selected
              ? 'bg-dusty-blue/20 text-slate-blue'
              : 'bg-white/40 text-deep-navy/50'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>

        {/*
         * Textos: label y descripcion.
         *
         * El label usa colores mas fuertes que la descripcion para
         * establecer jerarquia visual. El usuario escanea los labels
         * primero y lee las descripciones solo si necesita mas contexto.
         *
         * truncate en el label previene que nombres largos rompan el layout.
         */}
        <div className="min-w-0">
          <p
            className={`font-semibold text-sm ${
              selected ? 'text-slate-blue' : 'text-deep-navy/70'
            }`}
          >
            {label}
          </p>
          <p className="text-xs text-deep-navy/40">{description}</p>
        </div>
      </div>
    </motion.button>
  );
}
