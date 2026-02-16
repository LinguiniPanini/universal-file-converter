/**
 * ============================================================================
 * UploadStep.jsx — Paso de subida de archivos con logica de API y progreso
 * ============================================================================
 *
 * Este componente es el "cerebro" del paso de subida. Mientras DropZone.jsx
 * es puramente visual (solo muestra cosas bonitas), UploadStep maneja toda
 * la logica de negocio:
 *
 * 1. Llama a la API de subida (uploadFile)
 * 2. Rastrea el progreso de la subida (0-100%)
 * 3. Maneja errores de red o del servidor
 * 4. Coordina las transiciones de estado (subiendo → completado → siguiente paso)
 *
 * --- Patron "Container/Presentational" (Smart/Dumb Components) ---
 * Este patron separa los componentes en dos categorias:
 *
 * - **Presentational (DropZone):** Solo recibe props y renderiza UI.
 *   No sabe nada de APIs, estado de la app, ni logica de negocio.
 *   Es facil de testear y reutilizar en otro contexto.
 *
 * - **Container (UploadStep):** Maneja estado, efectos secundarios y
 *   logica. Pasa datos y callbacks a los componentes presentacionales.
 *   Es el "director" que orquesta lo que pasa.
 *
 * --- ¿Por que no poner todo en un solo componente? ---
 * Separar logica y presentacion permite:
 * 1. Testear DropZone sin mockear APIs (solo pasas props)
 * 2. Reutilizar DropZone en otro contexto (ej: subida de avatar)
 * 3. Cambiar la UI sin tocar la logica, o viceversa
 * 4. Facilitar la comprension: cada archivo tiene una responsabilidad clara
 *
 * --- Flujo de estados ---
 *
 *   Idle → [usuario suelta archivo] → Uploading → [API responde OK] →
 *   UploadDone (check verde, 1 segundo) → [llama onUploadComplete] → Sale
 *
 *   Idle → [usuario suelta archivo] → Uploading → [API responde ERROR] →
 *   Error (mensaje rojo) → Idle (usuario puede reintentar)
 *
 * @module components/UploadStep
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DropZone from './DropZone';
import { uploadFile } from '../api/client';

/**
 * UploadStep — Paso de subida con barra de progreso y manejo de errores
 *
 * Renderiza el DropZone y lo conecta con la API de subida. Muestra una
 * barra de progreso animada durante la subida y un mensaje de error si falla.
 *
 * @param {Object} props
 * @param {Function} props.onUploadComplete - Callback que se llama cuando la subida
 *   termina exitosamente. Recibe el resultado de la API: { job_id, filename, mime_type, size }.
 *   El componente padre (App.jsx) usa esta informacion para avanzar al paso de conversion.
 *
 * @returns {JSX.Element} Contenedor con DropZone, barra de progreso y errores
 */
export default function UploadStep({ onUploadComplete }) {
  /**
   * === Estado del componente ===
   *
   * Usamos 4 variables de estado que en conjunto representan la
   * maquina de estados del flujo de subida:
   *
   * - progress (0-100): Porcentaje de subida. Lo actualiza el callback
   *   onUploadProgress de Axios a traves de la funcion uploadFile.
   *   Se usa para animar el ancho de la barra de progreso.
   *
   * - uploading (boolean): True desde que el usuario suelta un archivo
   *   hasta que la subida termina (sea exito o error). Controla si la
   *   barra de progreso es visible y si el DropZone esta deshabilitado.
   *
   * - uploadDone (boolean): True cuando la API responde exitosamente.
   *   Se usa para mostrar el check verde en DropZone y para esconder
   *   la barra de progreso. Se mantiene true por ~1 segundo para que
   *   el usuario vea la confirmacion antes de pasar al siguiente paso.
   *
   * - error (string | null): Mensaje de error si la subida falla.
   *   null cuando no hay error. Se limpia al intentar una nueva subida.
   */
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Callback que maneja la logica de subida cuando el usuario suelta un archivo.
   *
   * useCallback memoriza esta funcion para evitar re-renders innecesarios
   * de DropZone. Solo se recrea si cambia onUploadComplete.
   *
   * --- Flujo detallado ---
   * 1. Resetear estado: limpia errores previos, inicia progreso en 0
   * 2. Llamar a uploadFile: envia el archivo al servidor via POST
   * 3. Exito: marcar como completado, esperar 1 segundo, notificar al padre
   * 4. Error: mostrar mensaje de error, permitir reintento
   *
   * --- ¿Por que el try/catch maneja uploading de forma asimetrica? ---
   * En EXITO: NO ponemos uploading=false inmediatamente.
   *   Mantenemos uploading=true para que el DropZone permanezca deshabilitado
   *   durante el segundo de espera (el check verde). Si pusieramos
   *   uploading=false, el usuario podria intentar subir otro archivo
   *   durante la transicion, causando un estado inconsistente.
   *   uploading se resetea implicitamente cuando el componente se desmonta
   *   (porque App.jsx avanza al siguiente paso).
   *
   * En ERROR: SI ponemos uploading=false (en el catch, no en finally).
   *   El usuario necesita poder interactuar con el DropZone para
   *   intentar subir otro archivo. Si dejamos uploading=true, el
   *   DropZone quedaria deshabilitado permanentemente.
   *
   * --- ¿Por que setTimeout de 1 segundo antes de onUploadComplete? ---
   * Es un "delay de satisfaccion". El check verde necesita ser visible
   * el tiempo suficiente para que el usuario lo procese emocionalmente.
   * Sin el delay, la transicion al siguiente paso seria tan rapida
   * que el usuario no veria la confirmacion de exito.
   * 1 segundo es un balance entre:
   * - Muy corto (<500ms): el check aparece y desaparece sin ser notado
   * - Muy largo (>2s): el usuario se impacienta esperando
   */
  const handleFileDrop = useCallback(
    async (file) => {
      // Paso 1: Resetear estado para una nueva subida
      setUploading(true);
      setError(null);
      setProgress(0);
      setUploadDone(false);

      try {
        // Paso 2: Subir el archivo al servidor
        // uploadFile recibe el archivo y un callback para actualizar el progreso.
        // Internamente usa Axios con onUploadProgress para reportar el avance.
        const result = await uploadFile(file, setProgress);

        // Paso 3: Subida exitosa — mostrar check verde por 1 segundo
        setUploadDone(true);

        // Esperar 1 segundo para que el usuario vea la confirmacion visual
        // antes de avanzar al siguiente paso del flujo
        setTimeout(() => {
          onUploadComplete(result);
        }, 1000);
      } catch (err) {
        // Paso 4: Error — mostrar mensaje y permitir reintento
        // err.response?.data?.detail es el formato de error de FastAPI
        // (HTTPException(status_code=400, detail="mensaje"))
        // Si no existe (ej: error de red sin respuesta), usamos un mensaje generico
        setError(
          err.response?.data?.detail || 'Upload failed. Please try again.'
        );
        // Permitir que el usuario interactue con el DropZone de nuevo
        setUploading(false);
      }
    },
    [onUploadComplete]
  );

  return (
    /**
     * Contenedor principal con animaciones de entrada y salida.
     *
     * --- Animacion de entrada ---
     * initial: opacity 0, y: 20 (invisible y 20px abajo)
     * animate: opacity 1, y: 0 (visible en su posicion)
     * El componente "sube" suavemente desde abajo al montarse.
     *
     * --- Animacion de salida ---
     * exit: opacity 0, x: -100, scale: 0.95
     * El componente se desliza hacia la izquierda, se encoge y se desvanece.
     * Esta direccion (izquierda) sugiere que el flujo avanza "hacia adelante"
     * (el siguiente paso viene de la derecha).
     *
     * --- ¿Por que spring para la transicion? ---
     * stiffness 300 + damping 25 da un movimiento rapido pero suave,
     * sin rebote excesivo. Es consistente con las transiciones del
     * StepIndicator y otras animaciones de la app.
     *
     * Nota: Para que exit funcione, este componente DEBE estar envuelto
     * en un <AnimatePresence> en el componente padre (App.jsx).
     * AnimatePresence intercepta el desmontaje y espera a que la
     * animacion exit termine antes de remover el DOM.
     */
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      {/*
       * DropZone: componente visual de arrastrar y soltar.
       *
       * Le pasamos:
       * - onFileDrop: nuestro callback que inicia la subida
       * - disabled: true durante la subida para evitar subidas multiples
       * - uploadComplete: true cuando la API respondio OK (muestra check)
       */}
      <DropZone
        onFileDrop={handleFileDrop}
        disabled={uploading}
        uploadComplete={uploadDone}
      />

      {/*
       * ================================================================
       * Barra de progreso de subida
       * ================================================================
       *
       * Solo visible cuando estamos subiendo Y la subida no ha terminado.
       * Cuando uploadDone es true, la barra desaparece para dar paso
       * al check verde en el DropZone.
       *
       * AnimatePresence permite animar la entrada y salida de la barra.
       * La barra entra "creciendo" (height 0 → auto) y sale "encogiendose",
       * lo cual se siente mas organico que un pop abrupto.
       *
       * --- ¿Por que height: 'auto' en animate? ---
       * No sabemos la altura exacta de la barra (depende del contenido
       * y el padding). Framer Motion puede animar hacia 'auto' y
       * calculara la altura real en runtime. Es un feature muy util
       * que CSS transitions no soporta nativamente.
       */}
      <AnimatePresence>
        {uploading && !uploadDone && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/*
             * Contenedor interno de la barra con glass effect.
             *
             * glass: efecto glassmorphism (vidrio esmerilado)
             * rounded-xl: bordes redondeados
             * p-4: padding generoso para que no se vea apretado
             */}
            <div className="glass rounded-xl p-4">
              {/*
               * Label de la barra: texto "Uploading..." y porcentaje.
               *
               * El porcentaje usa motion.span con key={progress} para
               * que cada cambio de valor active una animacion.
               *
               * --- ¿Por que key={progress}? ---
               * Cuando la key de un elemento cambia, React lo desmonta
               * y lo vuelve a montar como un elemento nuevo. Esto hace
               * que Framer Motion ejecute la animacion "initial → animate"
               * cada vez que el porcentaje cambia.
               *
               * El efecto visual es un "pulso": el numero se agranda
               * brevemente (scale 1.3) y se hace semi-transparente (opacity 0.5)
               * antes de volver a su tamano normal. Esto llama la atencion
               * del usuario hacia el progreso que se esta actualizando.
               */}
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-deep-navy">
                  Uploading...
                </span>
                <motion.span
                  key={progress}
                  className="text-sm font-semibold text-slate-blue"
                  initial={{ scale: 1.3, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {progress}%
                </motion.span>
              </div>

              {/*
               * Track de la barra de progreso.
               *
               * La barra tiene dos capas:
               * 1. Track (fondo): barra gris semi-transparente (bg-white/30)
               * 2. Fill (relleno): barra con gradiente azul que se expande
               *
               * --- ¿Por que overflow-hidden en el track? ---
               * El relleno (fill) tiene rounded-full. Sin overflow-hidden
               * en el contenedor, los bordes redondeados del relleno se
               * verian aun cuando esta al 100% (sobresaldrian del track).
               * overflow-hidden los recorta limpiamente.
               *
               * --- Sobre el gradiente del relleno ---
               * from-dusty-blue to-slate-blue: va de un azul claro a un
               * azul medio. Este gradiente es consistente con los colores
               * de "accion activa" en el resto de la UI (circulos del
               * StepIndicator, bordes del DropZone, etc.).
               *
               * --- ¿Por que transition en vez de animate para el width? ---
               * El width se actualiza frecuentemente (cada pocos ms durante
               * la subida). Usando transition con duration corta (0.3s),
               * Framer Motion interpola suavemente entre valores, evitando
               * "saltos" visuales. Si usaramos animate sin transition,
               * cada actualizacion seria instantanea y se veria choppy.
               */}
              <div className="w-full h-2 bg-white/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-dusty-blue to-slate-blue"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
       * ================================================================
       * Mensaje de error
       * ================================================================
       *
       * Solo visible cuando hay un error (error !== null).
       * Aparece con una animacion de "deslizar hacia abajo" (y: -10 → 0)
       * que llama la atencion del usuario sin ser agresiva.
       *
       * --- ¿Por que text-soft-rose? ---
       * soft-rose es nuestro color de error en la paleta pastel.
       * Es un rojo suave que comunica "algo salio mal" sin ser
       * alarmante o agresivo. Coherente con la estetica tranquila
       * de toda la aplicacion.
       *
       * --- ¿Por que font-medium? ---
       * Un peso semi-grueso ayuda a que el mensaje se destaque
       * del texto normal. El usuario necesita ver el error
       * rapidamente para entender que paso.
       */}
      <AnimatePresence>
        {error && (
          <motion.p
            className="text-sm text-soft-rose text-center font-medium mt-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
