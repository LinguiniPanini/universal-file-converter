/**
 * ============================================================================
 * DropZone.jsx — Zona de arrastrar y soltar archivos con animaciones ricas
 * ============================================================================
 *
 * Este componente es el corazon visual del paso de subida de archivos.
 * Implementa una zona de drop con tres estados visuales distintos:
 *
 * 1. **Idle (reposo):** Muestra un icono de nube, texto instructivo y badges
 *    de formatos aceptados. El borde "respira" con una animacion CSS sutil.
 *
 * 2. **Drag Active (arrastrando sobre la zona):** El contenedor se agranda
 *    ligeramente (spring scale), el borde cambia de dashed a solid azul,
 *    y el icono se convierte en FileUp con un bounce infinito.
 *
 * 3. **Upload Complete (subida completada):** Un icono de check verde aparece
 *    con una animacion de rotacion + spring, comunicando exito.
 *
 * --- ¿Por que tantas animaciones? ---
 * La subida de archivos es un punto critico de la experiencia del usuario.
 * Si el drop zone se ve estatico y aburrido, el usuario duda: "¿puedo soltar
 * aqui?", "¿funciono?". Las animaciones responden a estas preguntas:
 * - El borde pulsante dice "estoy vivo, estoy listo"
 * - El scale + cambio de color al arrastrar dice "¡si, suelta aqui!"
 * - Las ondas (ripple) al soltar dicen "¡recibido!"
 * - El check verde dice "¡exito!"
 *
 * --- ¿Por que react-dropzone + framer-motion? ---
 * - react-dropzone maneja toda la logica de drag & drop (eventos del navegador,
 *   validacion de tipos, manejo de input file). Es la libreria estandar de la
 *   industria para esto en React.
 * - framer-motion maneja las animaciones interactivas. Su API declarativa
 *   (animate, initial, exit, AnimatePresence) es mucho mas limpia que
 *   manejar CSS transitions manualmente.
 *
 * --- Patron de separacion (DropZone vs UploadStep) ---
 * Este componente es PURAMENTE VISUAL. No hace llamadas HTTP ni maneja
 * estado de progreso. Solo recibe callbacks y estados via props.
 * La logica de negocio (upload, progreso, errores) vive en UploadStep.jsx.
 * Esta separacion sigue el principio de "presentational vs container components",
 * un patron clasico de React que facilita la reutilizacion y el testing.
 *
 * @module components/DropZone
 */

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudUpload, Check, FileUp } from 'lucide-react';

/**
 * Tipos MIME aceptados por el backend.
 *
 * Este objeto mapea tipos MIME a extensiones de archivo. react-dropzone usa
 * este formato para:
 * 1. Filtrar el dialogo de seleccion de archivos (solo muestra estos tipos)
 * 2. Validar archivos soltados via drag & drop
 * 3. Rechazar archivos con MIME type incorrecto
 *
 * --- ¿Por que definirlos aqui y no importarlos del backend? ---
 * El frontend y el backend validan independientemente. El backend es la
 * "fuente de verdad" (rechaza archivos invalidos con HTTP 400), pero validar
 * en el frontend mejora la UX: el usuario ve el rechazo inmediatamente
 * sin esperar una respuesta del servidor.
 *
 * --- ¿Por que incluir tanto MIME como extensiones? ---
 * Algunos navegadores determinan el tipo por MIME, otros por extension.
 * Incluir ambos maximiza la compatibilidad.
 */
const ACCEPTED_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/markdown': ['.md'],
};

/**
 * Tamano maximo de archivo en bytes (50 MB).
 *
 * 50 * 1024 * 1024 = 52,428,800 bytes
 *
 * Este limite coincide con el del backend (MAX_FILE_SIZE en config.py).
 * Si un usuario intenta subir un archivo mas grande, react-dropzone lo
 * rechaza inmediatamente sin enviarlo al servidor.
 */
const MAX_SIZE = 50 * 1024 * 1024;

/**
 * Badges de formatos aceptados que se muestran en el estado idle.
 *
 * Son las extensiones que el usuario puede ver rapidamente para saber
 * que tipos de archivos se aceptan, sin tener que leer los MIME types.
 */
const FORMAT_BADGES = ['PNG', 'JPEG', 'WebP', 'PDF', 'DOCX', 'MD'];

/**
 * DropZone — Componente de arrastrar y soltar con animaciones ricas
 *
 * Renderiza una zona interactiva donde el usuario puede arrastrar archivos
 * o hacer click para abrir el explorador de archivos. Incluye multiples
 * estados visuales con animaciones para cada transicion.
 *
 * @param {Object} props
 * @param {Function} props.onFileDrop - Callback que recibe el File cuando el usuario suelta un archivo valido.
 *   Se llama con un solo File (no un array) porque solo aceptamos un archivo a la vez.
 * @param {boolean} [props.disabled=false] - Deshabilita toda interaccion. Se usa durante la subida
 *   para evitar que el usuario suelte otro archivo mientras uno se esta subiendo.
 * @param {boolean} [props.uploadComplete=false] - Activa el estado de exito con check verde.
 *   Se controla desde UploadStep cuando la subida termina exitosamente.
 *
 * @returns {JSX.Element} Zona de drop con animaciones
 */
export default function DropZone({ onFileDrop, disabled = false, uploadComplete = false }) {
  /**
   * Estado para controlar la animacion de ondas (water ripple).
   *
   * Cuando el usuario suelta un archivo, showRipple se pone en true
   * durante 800ms. Durante ese tiempo, se renderizan 3 circulos
   * concentricos que se expanden desde el centro, creando un efecto
   * visual de "ondas en el agua" que comunica que el archivo fue recibido.
   *
   * --- ¿Por que 800ms? ---
   * Es la duracion de la animacion de los circulos (scale 0→4 en 0.8s).
   * Despues de 800ms, los circulos ya desaparecieron (opacity 0) asi que
   * los desmontamos limpiando el estado.
   */
  const [showRipple, setShowRipple] = useState(false);

  /**
   * Callback que se ejecuta cuando el usuario suelta archivos validos.
   *
   * useCallback memoriza esta funcion para evitar que react-dropzone
   * se re-renderice innecesariamente. Solo se recrea si cambia onFileDrop.
   *
   * --- Flujo ---
   * 1. react-dropzone valida el archivo (tipo MIME, tamano, cantidad)
   * 2. Si pasa la validacion, llama a onDrop con un array de Files
   * 3. Nosotros tomamos el primer (y unico) archivo del array
   * 4. Activamos la animacion de ripple por 800ms
   * 5. Llamamos al callback del padre (onFileDrop) con el archivo
   *
   * --- ¿Por que acceptedFiles[0]? ---
   * Configuramos maxFiles: 1, asi que el array siempre tiene maximo 1
   * archivo. Pero igual verificamos que exista para evitar errores
   * si por alguna razon el array llega vacio.
   */
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      // Activar animacion de ondas (ripple)
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 800);

      // Pasar el archivo al componente padre (UploadStep)
      onFileDrop(acceptedFiles[0]);
    },
    [onFileDrop]
  );

  /**
   * Hook de react-dropzone que configura la zona de drop.
   *
   * getRootProps(): Props para el contenedor (onClick, onDragEnter, etc.)
   * getInputProps(): Props para el <input type="file"> oculto
   * isDragActive: true cuando el usuario esta arrastrando un archivo sobre la zona
   *
   * --- ¿Por que accept, maxSize y maxFiles? ---
   * Son validaciones del lado del cliente que mejoran la UX:
   * - accept: solo muestra tipos validos en el dialogo de archivo
   * - maxSize: rechaza archivos grandes ANTES de intentar subirlos
   * - maxFiles: evita confusion — un archivo a la vez
   * - disabled: previene interaccion durante la subida
   *
   * --- ¿Por que noClick: false y noKeyboard: false? ---
   * Son los defaults de react-dropzone. Los mencionamos implicitamente
   * al no desactivarlos. Esto permite que el usuario:
   * - Haga click en la zona para abrir el explorador de archivos
   * - Use Tab + Enter para accesibilidad via teclado
   */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    disabled,
  });

  /**
   * Determina las clases CSS del contenedor segun el estado actual.
   *
   * Hay tres estados mutuamente excluyentes:
   * 1. disabled: gris, sin interaccion (pointer-events-none)
   * 2. isDragActive: fondo azul claro, borde solido azul
   * 3. idle (default): glass con borde dashed que "respira"
   *
   * --- ¿Por que glass en idle? ---
   * El efecto glassmorphism (vidrio esmerilado) definido en index.css
   * da profundidad visual y deja entrever los blobs animados del fondo.
   * Es coherente con el resto de la UI que usa glass en todas las cards.
   *
   * --- ¿Por que la animacion "breathe" solo en idle? ---
   * El borde pulsante dice al usuario "estoy listo para recibir un archivo".
   * No tiene sentido que pulse cuando ya esta arrastrando (isDragActive tiene
   * su propio feedback) o cuando esta deshabilitado (no puede recibir nada).
   */
  const containerClasses = `
    rounded-2xl p-10 sm:p-16 text-center cursor-pointer overflow-hidden relative
    ${disabled
      ? 'pointer-events-none opacity-60'
      : isDragActive
        ? 'bg-dusty-blue/10 border-2 border-dusty-blue'
        : 'glass border-2 border-dashed border-mocha-light/40 hover:border-mocha/60'
    }
  `;

  return (
    /**
     * motion.div como contenedor principal con animacion de escala.
     *
     * Cuando isDragActive es true, el contenedor crece ligeramente (1.02)
     * usando una transicion spring. Esto da un feedback fisico de que
     * "la zona esta lista para recibir el archivo".
     *
     * --- ¿Por que spring y no easing? ---
     * El spring con stiffness 300 y damping 25 crea un movimiento
     * elastico que se siente mas natural que un ease-in-out lineal.
     * El ligero "overshoot" del spring imita la fisica real (como si
     * la zona se inflara un poco al detectar el archivo).
     *
     * --- ¿Por que style con animation para breathe? ---
     * La animacion CSS "breathe" solo aplica en estado idle (no isDragActive,
     * no disabled). Se aplica via style porque es una animacion CSS pura
     * (definida con @keyframes en index.css), no una animacion de Framer Motion.
     * Framer Motion y CSS animations pueden coexistir en el mismo elemento
     * sin conflictos.
     */
    <motion.div
      {...getRootProps()}
      className={containerClasses}
      animate={{ scale: isDragActive ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={
        !isDragActive && !disabled
          ? { animation: 'breathe 4s ease-in-out infinite' }
          : {}
      }
    >
      {/* Input oculto que react-dropzone usa internamente */}
      <input {...getInputProps()} />

      {/*
       * ================================================================
       * Animacion de ondas (water ripple) al soltar archivo
       * ================================================================
       *
       * Cuando showRipple es true (800ms despues de soltar un archivo),
       * renderizamos 3 circulos concentricos que se expanden desde el centro.
       *
       * --- ¿Por que AnimatePresence? ---
       * AnimatePresence permite animar la SALIDA de los circulos cuando
       * showRipple cambia a false. Sin AnimatePresence, los circulos
       * desaparecerian abruptamente al desmontarse.
       *
       * --- ¿Por que 3 circulos con stagger? ---
       * Un solo circulo se veria como un "zoom". Tres circulos con
       * un retraso escalonado (0, 0.15s, 0.30s) crean la ilusion de
       * ondas en el agua, como cuando dejas caer una piedra en un lago.
       *
       * --- ¿Por que pointer-events-none? ---
       * Los circulos son puramente decorativos. Sin pointer-events-none,
       * bloquearian los clicks en los elementos debajo de ellos durante
       * la animacion.
       */}
      <AnimatePresence>
        {showRipple && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={`ripple-${i}`}
                className="absolute top-1/2 left-1/2 w-20 h-20 border-2 border-dusty-blue/40 rounded-full pointer-events-none"
                style={{
                  /* Centrar el circulo respecto al contenedor */
                  marginLeft: '-2.5rem',  /* mitad de w-20 (5rem) */
                  marginTop: '-2.5rem',
                }}
                initial={{ scale: 0, opacity: 0.6 }}
                animate={{ scale: 4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.15,   /* Stagger: 0s, 0.15s, 0.30s */
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/*
       * ================================================================
       * Contenido central (cambia segun el estado)
       * ================================================================
       *
       * AnimatePresence con mode="wait" asegura que el contenido actual
       * SALGA completamente antes de que el nuevo contenido ENTRE.
       * Sin mode="wait", ambos contenidos se superpondrian brevemente
       * durante la transicion.
       *
       * Hay 3 estados posibles, en orden de prioridad:
       * 1. uploadComplete: check verde + "File uploaded!"
       * 2. isDragActive: icono de subida rebotando + "Drop it here..."
       * 3. idle: icono de nube + instrucciones + badges de formato
       *
       * Cada estado tiene una key unica para que AnimatePresence detecte
       * cuando un estado sale y otro entra. La key debe cambiar cuando
       * cambia el contenido visual.
       */}
      <AnimatePresence mode="wait">
        {uploadComplete ? (
          /* ============================================================
           * Estado: Subida completada (check verde)
           * ============================================================
           *
           * Mostramos un icono de check dentro de un circulo verde (sage/20)
           * con una animacion spring de "aparicion con giro":
           * - scale: 0 → 1 (crece desde invisible)
           * - rotate: -180 → 0 (gira media vuelta mientras crece)
           *
           * Esta combinacion crea un efecto de "sello" que comunica
           * exito de forma visceral y satisfactoria. El spring con
           * stiffness 200 y damping 15 da un rebote moderado.
           *
           * El circulo verde sage/20 da contexto de color (verde = exito)
           * sin ser demasiado intenso gracias a la baja opacidad.
           */
          <motion.div
            key="complete"
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <motion.div
              className="w-16 h-16 rounded-full bg-sage/20 flex items-center justify-center"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <Check className="w-8 h-8 text-sage" />
            </motion.div>
            <p className="text-deep-navy font-medium">File uploaded!</p>
          </motion.div>
        ) : isDragActive ? (
          /* ============================================================
           * Estado: Arrastrando archivo sobre la zona (drag active)
           * ============================================================
           *
           * Mostramos el icono FileUp con una animacion de "rebote"
           * (bouncing) infinita: sube 8px, baja, repite cada 1.5s.
           * Esto crea una sensacion de "anticipacion" — la zona esta
           * lista y esperando que sueltes el archivo.
           *
           * --- ¿Por que repeat: Infinity? ---
           * La animacion debe continuar mientras el usuario mantiene
           * el archivo sobre la zona. No sabemos cuando va a soltar,
           * asi que repetimos indefinidamente.
           *
           * --- ¿Por que y: [0, -8, 0]? ---
           * Es un ciclo completo: posicion normal → arriba → normal.
           * Usar un array de valores crea una animacion con multiples
           * keyframes. Framer Motion interpola suavemente entre ellos.
           */
          <motion.div
            key="drag-active"
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <FileUp className="w-12 h-12 text-slate-blue" />
            </motion.div>
            <p className="text-slate-blue font-medium text-lg">Drop it here...</p>
          </motion.div>
        ) : (
          /* ============================================================
           * Estado: Reposo (idle) — Estado por defecto
           * ============================================================
           *
           * Es el estado mas rico visualmente porque es lo primero que
           * ve el usuario. Debe comunicar:
           * 1. ¿Que hace esta zona? (arrastrar o buscar archivos)
           * 2. ¿Que formatos acepta? (badges con extensiones)
           * 3. ¿Cual es el limite? (50 MB)
           *
           * El icono de nube (CloudUpload) tiene una animacion whileHover
           * que lo mueve ligeramente hacia arriba y lo agranda. Esto es
           * un "affordance" visual: comunica que el icono es interactivo
           * y que la accion esperada es "subir algo al cielo/nube".
           */
          <motion.div
            key="idle"
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/*
             * Icono de nube con animacion hover.
             *
             * whileHover es exclusivo de Framer Motion — aplica estilos
             * solo mientras el cursor esta sobre el elemento. Es mas
             * poderoso que CSS :hover porque puede animar propiedades
             * que CSS no puede (como spring physics).
             *
             * y: -4 lo mueve 4px arriba, scale: 1.05 lo agranda un 5%.
             * Juntos crean un efecto de "flotacion" sutil.
             */}
            <motion.div whileHover={{ y: -4, scale: 1.05 }}>
              <CloudUpload className="w-14 h-14 text-mocha" />
            </motion.div>

            {/* Texto principal de instruccion */}
            <div>
              <p className="text-deep-navy font-medium text-lg">
                Drag & drop your file here
              </p>
              {/*
               * Enlace "or browse files".
               *
               * Aunque es un <span> estilizado como enlace, el click
               * funciona porque react-dropzone pone un onClick en el
               * contenedor raiz (getRootProps) que abre el dialogo
               * de seleccion de archivos. Cualquier click dentro de
               * la zona activa el explorador de archivos.
               *
               * --- ¿Por que span y no <a>? ---
               * No es un enlace real (no navega a ninguna URL).
               * Es solo texto estilizado para parecer un enlace y
               * comunicar al usuario que puede hacer click ademas
               * de arrastrar.
               */}
              <p className="text-sm text-deep-navy/50 mt-1">
                or{' '}
                <span className="text-dusty-blue hover:text-slate-blue underline cursor-pointer transition-colors">
                  browse files
                </span>
              </p>
            </div>

            {/*
             * Badges de formatos aceptados.
             *
             * Cada badge es un pill que muestra una extension de archivo.
             * whileHover los eleva ligeramente (y: -2) y los agranda (1.1)
             * para dar feedback interactivo.
             *
             * --- ¿Por que badges individuales y no una lista de texto? ---
             * Los badges son mas escanables visualmente. El usuario puede
             * ver de un vistazo todos los formatos sin leer una oracion.
             * Es un patron de UI comun en servicios de conversion online.
             *
             * --- Sobre los colores ---
             * bg-white/60: fondo semi-transparente que hereda el glass
             * text-deep-navy/70: texto ligeramente atenuado para no competir
             *   con el texto principal de instruccion
             */}
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {FORMAT_BADGES.map((format) => (
                <motion.span
                  key={format}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-white/60 text-deep-navy/70 border border-white/40"
                  whileHover={{ scale: 1.1, y: -2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {format}
                </motion.span>
              ))}
            </div>

            {/*
             * Nota de tamano maximo.
             *
             * Informacion critica para el usuario: si intenta subir un
             * archivo de 100MB, es mejor que sepa de antemano que el
             * limite es 50MB. Esto evita frustacion y llamadas
             * innecesarias al servidor que serian rechazadas.
             */}
            <p className="text-xs text-deep-navy/40 mt-1">Max 50 MB</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
