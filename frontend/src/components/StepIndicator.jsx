/**
 * ============================================================================
 * StepIndicator.jsx — Indicador de pasos animado con transiciones de resorte
 * ============================================================================
 *
 * Este componente muestra visualmente en que paso del flujo de conversion se
 * encuentra el usuario: Subir archivo -> Convertir -> Descargar.
 *
 * --- ¿Por que un indicador de pasos? ---
 * En UX, cuando un proceso tiene multiples etapas, el usuario necesita saber:
 * 1. ¿Donde estoy ahora? (paso activo)
 * 2. ¿Que ya complete? (pasos completados)
 * 3. ¿Que me falta? (pasos futuros)
 * Sin esta retroalimentacion, el usuario se siente perdido y ansioso.
 * El indicador de pasos responde a las tres preguntas de un vistazo.
 *
 * --- ¿Por que Framer Motion y no CSS puro para las animaciones? ---
 * A diferencia de los blobs del fondo (que son infinitos y decorativos),
 * las animaciones del StepIndicator son REACTIVAS: cambian en respuesta
 * a acciones del usuario (subir un archivo, completar una conversion).
 * Framer Motion nos da:
 * - Animaciones tipo "spring" (resorte) que se sienten fisicas y naturales
 * - Control declarativo: solo definimos el estado final, FM calcula la transicion
 * - AnimatePresence para montar/desmontar iconos con animacion
 *
 * --- ¿Por que animaciones tipo spring (resorte)? ---
 * Las animaciones lineales o con easing se sienten "roboticas".
 * Las animaciones tipo spring imitan la fisica del mundo real:
 * - Un resorte tiene inercia (overshoots un poco antes de estabilizarse)
 * - Se siente mas vivo y satisfactorio
 * - stiffness controla que tan rapido se mueve (mas alto = mas rapido)
 * - damping controla que tanto rebota (mas alto = menos rebote)
 *
 * --- Estructura visual ---
 * El componente renderiza algo como:
 *
 *   ○────────●────────○
 *  Subir   Convertir  Descargar
 *
 * Donde ● es el paso activo, ○ son pasos inactivos, y las lineas
 * entre ellos se llenan progresivamente conforme avanza el flujo.
 */

import { motion } from 'framer-motion';
import { Upload, ArrowRightLeft, Download, Check } from 'lucide-react';

/**
 * Configuracion de los pasos del flujo de conversion.
 *
 * Cada paso tiene:
 * - label: texto que se muestra debajo del circulo
 * - icon: componente de icono de lucide-react que representa la accion
 *
 * Este array es la "fuente de verdad" del flujo. Si algun dia se agrega
 * un paso (ej: "Previsualizar"), solo hay que agregarlo aqui y el
 * componente se adapta automaticamente gracias al .map().
 */
const STEPS = [
  { label: 'Upload', icon: Upload },
  { label: 'Convert', icon: ArrowRightLeft },
  { label: 'Download', icon: Download },
];

/**
 * StepIndicator — Componente indicador de progreso por pasos
 *
 * Muestra tres circulos conectados por lineas, indicando visualmente
 * el paso actual del flujo de conversion de archivos.
 *
 * Cada circulo puede estar en uno de tres estados:
 * - Completado (index < currentStep): check verde con animacion de rotacion
 * - Activo (index === currentStep): gradiente azul con pulso brillante
 * - Futuro (index > currentStep): gris apagado, escala reducida
 *
 * @param {Object} props
 * @param {number} props.currentStep - Paso actual (0=Upload, 1=Convert, 2=Download)
 * @returns {JSX.Element} Indicador visual de pasos con animaciones
 */
export default function StepIndicator({ currentStep }) {
  return (
    /**
     * Contenedor principal del indicador de pasos.
     *
     * - flex items-center justify-center: centra los circulos y lineas horizontalmente
     * - max-w-md mx-auto: limita el ancho maximo y centra el componente en la pagina
     * - my-8: margen vertical para separarlo del contenido superior e inferior
     *
     * ¿Por que max-w-md? Si el indicador fuera muy ancho, las lineas entre
     * circulos se verian desproporcionadamente largas y los elementos se
     * perderian visualmente. max-w-md (28rem/448px) mantiene todo compacto.
     */
    <div className="flex items-center justify-center max-w-md mx-auto my-8">
      {STEPS.map((step, index) => {
        /*
         * Determinamos el estado de cada paso comparando su indice
         * con el paso actual. Esto define:
         * - Que color y estilo tiene el circulo
         * - Que icono se muestra (el propio del paso o un check)
         * - Si la linea de conexion esta llena o vacia
         */
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        return (
          /**
           * Fragment con key para agrupar cada "paso" (circulo + linea).
           *
           * Usamos React.Fragment (via <> con key) porque cada iteracion
           * del map produce DOS elementos: el circulo del paso y la linea
           * que lo conecta con el siguiente. Sin Fragment, tendriamos que
           * envolver todo en un div extra que romperia el layout flex.
           *
           * La key usa el index porque la lista de pasos es estatica y
           * nunca cambia de orden (es seguro usar index como key en este caso).
           */
          <div key={index} className="flex items-center">
            {/*
             * ================================================================
             * Columna del paso: circulo + etiqueta
             * ================================================================
             *
             * Agrupamos el circulo y la etiqueta en un flex column para
             * que la etiqueta quede centrada debajo del circulo.
             * items-center centra ambos elementos horizontalmente.
             */}
            <div className="flex flex-col items-center">

              {/*
               * ==============================================================
               * Circulo del paso (animado con Framer Motion)
               * ==============================================================
               *
               * motion.div nos permite animar propiedades CSS de forma
               * declarativa. Solo definimos el estado final en "animate"
               * y Framer Motion calcula la transicion automaticamente.
               *
               * La animacion de escala (scale) es clave:
               * - Completado/Activo: scale 1 (tamano normal)
               * - Futuro: scale 0.9 (ligeramente encogido)
               * Esto crea una jerarquia visual donde los pasos futuros
               * se ven "recogidos" y menos importantes.
               *
               * La transicion spring con stiffness 300 y damping 20
               * da un rebote sutil que se siente satisfactorio sin
               * ser excesivo (damping alto = menos rebote).
               */}
              <motion.div
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center
                  transition-colors duration-300
                  ${isCompleted
                    ? 'bg-sage text-white'
                    : isActive
                      ? 'bg-gradient-to-br from-dusty-blue to-slate-blue text-white'
                      : 'bg-white/50 text-deep-navy/40 border border-white/40'
                  }
                `}
                animate={{
                  scale: isActive || isCompleted ? 1 : 0.9,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 20,
                }}
                /*
                 * La clase pulse-glow crea un resplandor que pulsa
                 * alrededor del circulo activo, llamando la atencion
                 * del usuario hacia el paso en el que se encuentra.
                 *
                 * Solo se aplica al paso activo para no distraer con
                 * multiples elementos pulsando a la vez.
                 *
                 * La animacion pulse-glow esta definida en index.css como
                 * @keyframes que modifica box-shadow. Usamos CSS puro para
                 * esta animacion porque es infinita y decorativa (como los blobs).
                 */
                style={isActive ? { animation: 'pulse-glow 2s ease-in-out infinite' } : {}}
              >
                {/*
                 * ============================================================
                 * Icono dentro del circulo
                 * ============================================================
                 *
                 * Si el paso esta completado, mostramos un icono de Check
                 * con una animacion de "aparicion con giro":
                 * - initial: scale 0 (invisible) y rotado -180 grados
                 * - animate: scale 1 (visible) y rotacion 0
                 * - spring stiffness 400, damping 15: mas rigido y con un
                 *   poco mas de rebote que el circulo, para que el check
                 *   "rebote" de forma satisfactoria al aparecer
                 *
                 * Esta animacion comunica al usuario: "¡completado!" de forma
                 * visceral. El giro de 180 grados + el rebote del spring crean
                 * una microinteraccion memorable.
                 *
                 * Si el paso NO esta completado, mostramos el icono del paso
                 * (Upload, ArrowRightLeft, o Download) sin animacion especial.
                 */}
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 15,
                    }}
                  >
                    <Check className="w-5 h-5" />
                  </motion.div>
                ) : (
                  /**
                   * step.icon es un componente de lucide-react (Upload, etc.)
                   * Lo renderizamos dinamicamente con JSX: <StepIcon />
                   *
                   * Asignamos el componente a una variable con nombre en
                   * PascalCase (StepIcon) porque React requiere que los
                   * componentes empiecen con mayuscula para distinguirlos
                   * de elementos HTML nativos (div, span, etc.).
                   */
                  (() => {
                    const StepIcon = step.icon;
                    return <StepIcon className="w-5 h-5" />;
                  })()
                )}
              </motion.div>

              {/*
               * ==============================================================
               * Etiqueta del paso (texto debajo del circulo)
               * ==============================================================
               *
               * Mostramos el nombre del paso debajo del circulo.
               * La opacidad cambia segun el estado:
               * - Activo/Completado: totalmente visible (opacity-100)
               * - Futuro: atenuado (opacity-40) para indicar que aun no aplica
               *
               * text-xs: tamano pequeno para no competir con el circulo
               * font-medium: peso semi-grueso para legibilidad a tamano pequeno
               * mt-2: separacion del circulo (8px)
               *
               * El color siempre es deep-navy (nuestro color de texto principal)
               * pero la opacidad cambia para crear la jerarquia visual.
               */}
              <span
                className={`
                  text-xs font-medium mt-2
                  ${isActive || isCompleted
                    ? 'text-deep-navy opacity-100'
                    : 'text-deep-navy/40 opacity-40'
                  }
                `}
              >
                {step.label}
              </span>
            </div>

            {/*
             * ================================================================
             * Linea de conexion entre pasos
             * ================================================================
             *
             * Solo renderizamos la linea si NO es el ultimo paso.
             * (No tiene sentido poner una linea despues de "Download"
             * porque no hay un paso siguiente al que conectar.)
             *
             * La linea tiene dos capas:
             * 1. Contenedor: barra gris semi-transparente (el "track" o riel)
             * 2. Relleno: barra con gradiente que se expande de 0% a 100%
             *
             * El relleno usa motion.div para animar su width:
             * - 0% cuando el paso anterior NO esta completado
             * - 100% cuando el paso anterior SI esta completado
             *
             * La transicion es de 0.6 segundos con easeInOut, que es un
             * ritmo agradable: no tan rapido que se pierda, no tan lento
             * que impaciente al usuario.
             *
             * --- ¿Por que relative + absolute para las dos capas? ---
             * El contenedor (relative) define el tamano de la linea.
             * El relleno (absolute inset-y-0 left-0) se posiciona dentro
             * del contenedor y ocupa toda su altura, pero su ancho se
             * controla via la animacion. Esto permite que el relleno
             * "crezca" de izquierda a derecha dentro del track.
             */}
            {index < STEPS.length - 1 && (
              <div className="w-10 sm:w-16 h-[2px] bg-white/30 mx-2 rounded-full overflow-hidden relative">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-slate-blue via-dusty-blue to-sage rounded-full"
                  initial={{ width: '0%' }}
                  animate={{
                    width: index < currentStep ? '100%' : '0%',
                  }}
                  transition={{
                    duration: 0.6,
                    ease: 'easeInOut',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
