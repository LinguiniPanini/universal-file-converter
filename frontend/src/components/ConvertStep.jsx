/**
 * ============================================================================
 * ConvertStep.jsx — Paso de conversion: seleccion de formato y ejecucion
 * ============================================================================
 *
 * Este componente es el "cerebro" del paso 2 del flujo de conversion.
 * Despues de que el usuario sube un archivo (UploadStep), este componente:
 *
 * 1. Muestra informacion del archivo subido (nombre, tipo, tamano)
 * 2. Presenta una cuadricula de formatos disponibles (FormatCards)
 * 3. Ejecuta la conversion al hacer click en el boton "Convert"
 * 4. Notifica al padre cuando la conversion termina exitosamente
 *
 * --- Arquitectura: ¿por que los formatos dependen del MIME type? ---
 * No todos los formatos se pueden convertir a todos los demas.
 * Un PNG puede convertirse a JPEG o WebP, pero no a DOCX.
 * Un PDF puede convertirse a Markdown, pero no a JPEG.
 *
 * Por eso usamos un mapa CONVERSION_OPTIONS que, dado el MIME type del
 * archivo subido, retorna SOLO los formatos validos. Esto evita:
 * - Errores del usuario (seleccionar una conversion imposible)
 * - Errores de la API (enviar combinaciones invalidas)
 * - Confusion visual (mostrar opciones que no aplican)
 *
 * --- Flujo de estados ---
 *
 *   [Idle: usuario selecciona formato] → [Click Convert] →
 *   [Converting: spinner + boton deshabilitado] → [API responde OK] →
 *   [Done: check verde, 800ms] → [onConvertComplete: avanzar al paso 3]
 *
 *   Si la API falla: [Error: mensaje rojo, el usuario puede reintentar]
 *
 * --- Patron "Container/Presentational" ---
 * ConvertStep (container): maneja estado, logica de API, opciones de formato
 * FormatCard (presentational): solo renderiza una tarjeta bonita con animaciones
 *
 * @module components/ConvertStep
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileImage,
  FileText,
  FileType,
  FileDown,
  Minimize2,
  ShieldOff,
  Loader2,
  Check,
} from 'lucide-react';
import FormatCard from './FormatCard';
import { convertFile } from '../api/client';

/**
 * Mapa de opciones de conversion segun el tipo MIME del archivo fuente.
 *
 * Cada entrada es un array de objetos con la informacion necesaria para
 * renderizar un FormatCard y ejecutar la conversion:
 *
 * - label: Nombre visible al usuario (ej: "JPEG")
 * - value: Valor tecnico que determina la logica de conversion.
 *   Puede ser un MIME type (ej: "image/jpeg") para conversiones de formato,
 *   o una accion especial (ej: "compress", "strip_metadata").
 * - description: Texto de ayuda que explica que hace esta opcion
 * - icon: Componente de icono de Lucide React
 *
 * --- ¿Por que "compress" y "strip_metadata" no son MIME types? ---
 * Estas acciones no cambian el formato del archivo, sino que lo procesan:
 * - compress: reduce la calidad/tamano del archivo manteniendo el mismo formato
 * - strip_metadata: elimina datos EXIF (GPS, camara, etc.) sin cambiar el formato
 *
 * El handler handleConvert detecta estos valores especiales y construye
 * la peticion de forma diferente (enviando el MIME original como target_format
 * con opciones adicionales en el campo `options`).
 *
 * --- ¿Por que las imagenes tienen mas opciones que los documentos? ---
 * Las imagenes tienen multiples formatos inter-convertibles (PNG↔JPEG↔WebP)
 * mas operaciones de procesamiento (compress, strip_metadata).
 * Los documentos tienen conversiones mas limitadas (DOCX→PDF, PDF→Markdown)
 * porque la fidelidad de la conversion es mas dificil de mantener.
 */
const CONVERSION_OPTIONS = {
  'image/png': [
    { label: 'JPEG', value: 'image/jpeg', description: 'Lossy, smaller size', icon: FileImage },
    { label: 'WebP', value: 'image/webp', description: 'Modern format, best compression', icon: FileImage },
    { label: 'Compress', value: 'compress', description: 'Reduce file size (70% quality)', icon: Minimize2 },
    { label: 'Strip Metadata', value: 'strip_metadata', description: 'Remove EXIF data', icon: ShieldOff },
  ],
  'image/jpeg': [
    { label: 'PNG', value: 'image/png', description: 'Lossless, larger size', icon: FileImage },
    { label: 'WebP', value: 'image/webp', description: 'Modern format, best compression', icon: FileImage },
    { label: 'Compress', value: 'compress', description: 'Reduce file size (70% quality)', icon: Minimize2 },
    { label: 'Strip Metadata', value: 'strip_metadata', description: 'Remove EXIF data', icon: ShieldOff },
  ],
  'image/webp': [
    { label: 'PNG', value: 'image/png', description: 'Lossless, universal support', icon: FileImage },
    { label: 'JPEG', value: 'image/jpeg', description: 'Universal, smaller size', icon: FileImage },
    { label: 'Compress', value: 'compress', description: 'Reduce file size (70% quality)', icon: Minimize2 },
    { label: 'Strip Metadata', value: 'strip_metadata', description: 'Remove EXIF data', icon: ShieldOff },
  ],
  'application/pdf': [
    { label: 'Markdown', value: 'text/markdown', description: 'Extract text content', icon: FileText },
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { label: 'PDF', value: 'application/pdf', description: 'Universal document format', icon: FileDown },
  ],
  'text/markdown': [
    { label: 'PDF', value: 'application/pdf', description: 'Formatted document', icon: FileDown },
  ],
  'text/plain': [
    { label: 'PDF', value: 'application/pdf', description: 'Formatted document', icon: FileDown },
  ],
};

/**
 * Convierte un tipo MIME tecnico a un label legible para el usuario.
 *
 * Los MIME types son crípticos para la mayoria de los usuarios
 * (¿quien sabe que es "application/vnd.openxmlformats..."?).
 * Esta funcion los traduce a nombres amigables.
 *
 * --- ¿Por que una funcion y no un atributo del uploadResult? ---
 * El backend retorna el MIME type tecnico porque es el estandar de la
 * industria para identificar tipos de archivo. El label "bonito" es
 * una preocupacion del frontend (presentacion), asi que lo resolvemos
 * aqui en vez de contaminar la API con datos de UI.
 *
 * @param {string} mime - Tipo MIME (ej: "image/png")
 * @returns {string} Label legible (ej: "PNG Image")
 */
function mimeToLabel(mime) {
  const map = {
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
    'image/webp': 'WebP Image',
    'application/pdf': 'PDF Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'text/markdown': 'Markdown File',
    'text/plain': 'Text File',
  };
  return map[mime] || mime;
}

/**
 * ConvertStep — Paso de conversion con grid de formatos y boton de accion
 *
 * @param {Object} props
 * @param {Object} props.uploadResult - Datos del archivo subido retornados por la API.
 *   Contiene: { job_id, filename, mime_type, size }
 * @param {Function} props.onConvertComplete - Callback que se llama cuando la conversion
 *   termina exitosamente. No recibe argumentos; el componente padre (App.jsx) sabe que
 *   debe avanzar al paso de descarga.
 *
 * @returns {JSX.Element} Panel de seleccion de formato y boton de conversion
 */
export default function ConvertStep({ uploadResult, onConvertComplete }) {
  /**
   * === Estado del componente ===
   *
   * - selectedFormat: valor del formato seleccionado (ej: "image/jpeg", "compress").
   *   String vacio '' significa "ninguno seleccionado". Controla cual FormatCard
   *   tiene el estilo de seleccion y si el boton de conversion esta habilitado.
   *
   * - converting: true mientras la peticion de conversion esta en curso.
   *   Deshabilita el boton y muestra un spinner. Previene que el usuario
   *   envie multiples peticiones de conversion simultaneas.
   *
   * - convertDone: true cuando la API responde exitosamente.
   *   Muestra un check verde en el boton por 800ms antes de avanzar.
   *   Es el equivalente al "uploadDone" del UploadStep.
   *
   * - error: mensaje de error si la conversion falla. null si no hay error.
   *   Se limpia automaticamente al iniciar una nueva conversion.
   */
  const [selectedFormat, setSelectedFormat] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Opciones de conversion disponibles para el tipo de archivo subido.
   *
   * useMemo memoriza el resultado del lookup para evitar recalcularlo en
   * cada re-render. Solo se recalcula si cambia el mime_type del archivo,
   * lo cual no ocurre durante la vida de este componente (el archivo ya
   * fue subido y su tipo es inmutable).
   *
   * --- ¿Por que useMemo y no un calculo directo? ---
   * En este caso el calculo es trivial (un lookup en un objeto), asi que
   * la ganancia de performance es minima. Pero es una buena practica
   * para valores derivados que se pasan como props a componentes hijos.
   * Sin useMemo, los FormatCards se re-renderizan innecesariamente
   * porque options seria un nuevo array en cada render (referencia distinta).
   *
   * --- ¿Por que || []? ---
   * Si el MIME type del archivo no esta en CONVERSION_OPTIONS (caso edge),
   * retornamos un array vacio en vez de undefined. Esto evita errores al
   * hacer options.map() mas abajo.
   */
  const options = useMemo(
    () => CONVERSION_OPTIONS[uploadResult.mime_type] || [],
    [uploadResult.mime_type]
  );

  /**
   * Handler de conversion: envia la peticion al backend.
   *
   * --- Logica de target_format y opts ---
   * Hay tres casos segun el valor seleccionado:
   *
   * 1. "compress": El formato destino es el MISMO que el original.
   *    Enviamos action: 'compress' y quality: 70 como opciones.
   *    El backend comprime la imagen sin cambiar de formato.
   *
   * 2. "strip_metadata": Igual que compress, el formato no cambia.
   *    Enviamos action: 'strip_metadata'. El backend elimina los
   *    datos EXIF (GPS, modelo de camara, etc.) del archivo.
   *
   * 3. Cualquier otro valor (ej: "image/jpeg"): Es un MIME type real.
   *    Lo enviamos como target_format sin opciones adicionales.
   *    El backend convierte el archivo al formato especificado.
   *
   * --- ¿Por que quality: 70? ---
   * 70% de calidad JPEG/WebP es un buen balance entre:
   * - Reduccion de tamano significativa (~60-70% mas pequeño que 100%)
   * - Calidad visual aceptable (la degradacion es minima a simple vista)
   * Es el valor que usan la mayoria de sitios web para optimizar imagenes.
   *
   * --- ¿Por que setTimeout de 800ms en el exito? ---
   * Igual que en UploadStep, es un "delay de satisfaccion". El check verde
   * necesita ser visible lo suficiente para que el usuario lo procese.
   * 800ms es ligeramente menos que el 1s del upload porque la conversion
   * ya es una segunda confirmacion y el usuario esta mas impaciente por
   * ver el resultado final.
   */
  const handleConvert = async () => {
    // No hacer nada si no hay formato seleccionado
    if (!selectedFormat) return;

    setConverting(true);
    setError(null);

    // Determinar targetFormat y opciones segun la accion seleccionada
    let targetFormat;
    let opts = {};

    if (selectedFormat === 'compress') {
      // Caso 1: Compresion — mismo formato, calidad reducida
      targetFormat = uploadResult.mime_type;
      opts = { action: 'compress', quality: 70 };
    } else if (selectedFormat === 'strip_metadata') {
      // Caso 2: Eliminar metadatos — mismo formato, sin EXIF
      targetFormat = uploadResult.mime_type;
      opts = { action: 'strip_metadata' };
    } else {
      // Caso 3: Conversion de formato — MIME type diferente
      targetFormat = selectedFormat;
      opts = {};
    }

    try {
      // Enviar peticion de conversion al backend
      await convertFile(uploadResult.job_id, targetFormat, opts);

      // Exito: mostrar check verde por 800ms antes de avanzar
      setConvertDone(true);
      setTimeout(() => {
        onConvertComplete();
      }, 800);
    } catch (err) {
      // Error: mostrar mensaje del backend o uno generico
      // err.response?.data?.detail es el formato de error de FastAPI
      setError(
        err.response?.data?.detail || 'Conversion failed. Please try again.'
      );
    } finally {
      // Siempre resetear el estado de "converting" al terminar
      // (a diferencia de UploadStep donde solo se resetea en error)
      setConverting(false);
    }
  };

  return (
    /**
     * Contenedor principal con animaciones de entrada/salida.
     *
     * --- Animacion de entrada ---
     * initial: opacity 0, x: 100, scale: 0.95
     * El componente "entra" deslizandose desde la derecha. Esto es
     * consistente con la salida del UploadStep (que sale hacia la izquierda),
     * creando la ilusion de un flujo de izquierda a derecha.
     *
     * --- Animacion de salida ---
     * exit: opacity 0, x: -100, scale: 0.95
     * El componente "sale" hacia la izquierda, haciendo lugar para el
     * siguiente paso (DownloadStep) que entrara desde la derecha.
     *
     * --- Spring stiffness 300 + damping 25 ---
     * Misma configuracion que UploadStep para mantener consistencia
     * visual en las transiciones entre pasos.
     */
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      {/*
       * ================================================================
       * Tarjeta de informacion del archivo subido
       * ================================================================
       *
       * Muestra un resumen del archivo que el usuario subio para darle
       * contexto: "estas convirtiendo ESTE archivo". Sin esta info,
       * el usuario podria dudar de si subio el archivo correcto.
       *
       * La animacion de entrada (opacity + y) es sutil para no distraer
       * del contenido principal (las FormatCards). delay: 0.1 la hace
       * aparecer ligeramente despues del contenedor principal.
       */}
      <motion.div
        className="glass rounded-xl p-4 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          {/*
           * Icono del tipo de archivo.
           *
           * FileType es un icono generico de "archivo" de Lucide.
           * Lo ponemos sobre un fondo dusty-blue/15 para darle presencia
           * visual sin que sea demasiado llamativo.
           *
           * rounded-lg + p-2: mismo patron que los iconos en FormatCard
           * para mantener consistencia visual en todo el paso.
           */}
          <div className="p-2 rounded-lg bg-dusty-blue/15">
            <FileType className="w-5 h-5 text-slate-blue" />
          </div>

          {/*
           * Informacion textual del archivo.
           *
           * - Filename: truncado con truncate para nombres largos.
           *   max-w-[200px] previene que empuje otros elementos fuera
           *   del contenedor.
           * - MIME label: tipo de archivo en texto legible (ej: "PNG Image")
           *   con separador " · " (middle dot) y tamano en KB.
           *
           * --- ¿Por que mostrar el tamano en KB y no en bytes? ---
           * Los bytes son dificiles de interpretar para el usuario promedio
           * (¿52428800 bytes es mucho o poco?). KB es mas intuitivo.
           * Usamos Math.round para evitar decimales innecesarios.
           */}
          <div className="min-w-0">
            <p className="text-sm font-medium text-deep-navy truncate max-w-[200px]">
              {uploadResult.filename}
            </p>
            <p className="text-xs text-deep-navy/50">
              {mimeToLabel(uploadResult.mime_type)} · {Math.round(uploadResult.size / 1024)} KB
            </p>
          </div>
        </div>
      </motion.div>

      {/*
       * ================================================================
       * Label de la seccion "Convert to:"
       * ================================================================
       *
       * Un label simple que introduce la cuadricula de formatos.
       * delay: 0.2 lo hace aparecer despues de la tarjeta de info,
       * creando una cascada visual de arriba a abajo.
       */}
      <motion.p
        className="text-sm font-medium text-deep-navy/50 mb-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        Convert to:
      </motion.p>

      {/*
       * ================================================================
       * Cuadricula de FormatCards
       * ================================================================
       *
       * grid grid-cols-2: dos columnas para que las tarjetas se vean
       * lado a lado. En pantallas pequeñas seguiran siendo 2 columnas
       * porque las tarjetas son lo suficientemente compactas.
       *
       * gap-3: espacio entre tarjetas. Un valor mayor (gap-4+) separaria
       * demasiado y perderiamos la sensacion de "grupo de opciones".
       *
       * --- Animacion stagger ---
       * Cada tarjeta aparece con un delay incremental de 0.08s:
       * - Tarjeta 1: delay 0.28s (base 0.2 + index 0 * 0.08)
       * - Tarjeta 2: delay 0.36s (base 0.2 + index 1 * 0.08)
       * - Tarjeta 3: delay 0.44s
       * - Tarjeta 4: delay 0.52s
       *
       * Esto crea un efecto de "cascada" donde las tarjetas aparecen
       * una tras otra, de izquierda a derecha y de arriba a abajo.
       * Es mas interesante visualmente que mostrarlas todas a la vez.
       *
       * --- Spring stiffness 400 + damping 20 ---
       * Un spring mas rigido que las transiciones de contenedor (300).
       * Las tarjetas necesitan un "snap" mas energico porque son
       * elementos pequeños. Un spring suave (stiffness baja) las haria
       * sentir "flotantes" y lentas.
       */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((option, index) => (
          <motion.div
            key={option.value}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 20,
              delay: 0.2 + index * 0.08,
            }}
          >
            <FormatCard
              label={option.label}
              value={option.value}
              description={option.description}
              icon={option.icon}
              selected={selectedFormat === option.value}
              onSelect={setSelectedFormat}
            />
          </motion.div>
        ))}
      </div>

      {/*
       * ================================================================
       * Boton de conversion
       * ================================================================
       *
       * El boton tiene 4 estados visuales mutuamente excluyentes:
       *
       * 1. convertDone: Fondo verde (sage), muestra "Done!" con check
       * 2. converting: Muestra spinner + "Converting..."
       * 3. selectedFormat (formato elegido): Gradiente azul con shimmer
       * 4. sin formato: Gris deshabilitado (cursor-not-allowed)
       *
       * --- AnimatePresence mode="wait" ---
       * El contenido del boton cambia entre estados. mode="wait"
       * asegura que el contenido actual salga completamente antes de
       * que el nuevo entre, evitando superposiciones.
       *
       * --- ¿Por que mt-6 y no mt-4? ---
       * Necesitamos mas separacion entre la cuadricula y el boton
       * porque son acciones diferentes (seleccionar vs ejecutar).
       * Un gap mayor crea una jerarquia visual: "primero elige, luego clickea".
       */}
      <div className="flex justify-center mt-6">
        <motion.button
          onClick={handleConvert}
          disabled={!selectedFormat || converting}
          whileTap={selectedFormat && !converting ? { scale: 0.95 } : {}}
          className={`
            relative px-8 py-3 rounded-xl font-semibold text-sm
            transition-all duration-200
            ${convertDone
              ? 'bg-sage text-white'
              : selectedFormat
                ? 'bg-gradient-to-r from-dusty-blue to-slate-blue text-white shimmer hover:shadow-lg hover:shadow-dusty-blue/30'
                : 'bg-deep-navy/20 text-deep-navy/40 cursor-not-allowed'
            }
          `}
        >
          <AnimatePresence mode="wait">
            {convertDone ? (
              /*
               * Estado: Conversion completada — check verde + "Done!"
               *
               * El check aparece con una animacion spring (scale 0→1)
               * para dar un feedback visual satisfactorio. Es el mismo
               * patron que el check del DropZone pero en version mini.
               */
              <motion.span
                key="done"
                className="flex items-center gap-2"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  <Check className="w-4 h-4" />
                </motion.span>
                Done!
              </motion.span>
            ) : converting ? (
              /*
               * Estado: Convirtiendo — spinner + "Converting..."
               *
               * Loader2 con animate-spin (rotacion infinita via Tailwind)
               * comunica que el proceso esta en curso. El texto "Converting..."
               * confirma que la accion fue registrada.
               */
              <motion.span
                key="converting"
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Converting...
              </motion.span>
            ) : (
              /*
               * Estado: Idle — texto "Convert" o "Select format"
               *
               * Si hay un formato seleccionado, muestra "Convert" (accion clara).
               * Si no, muestra "Select a format" como hint para el usuario.
               */
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {selectedFormat ? 'Convert' : 'Select a format'}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/*
       * ================================================================
       * Mensaje de error
       * ================================================================
       *
       * Mismo patron que UploadStep: texto en soft-rose con animacion
       * de deslizamiento. Aparece debajo del boton para que el usuario
       * vea el error en contexto con la accion que lo causo.
       *
       * --- ¿Por que replicar el patron y no extraer un componente? ---
       * Es solo 10 lineas de JSX. Extraer un componente ErrorMessage
       * agregaria un archivo mas y una importacion sin beneficio real.
       * Si el patron se repitiera en 5+ lugares, entonces si valdria
       * la pena extraerlo (regla del 3: no abstraer hasta la 3ra repeticion).
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
