/**
 * ============================================================================
 * FileUploader.jsx - Componente de subida de archivos con drag & drop
 * ============================================================================
 *
 * Este componente es la primera interaccion del usuario con la aplicacion.
 * Permite subir archivos arrastrando y soltando (drag & drop) o haciendo click
 * para abrir el explorador de archivos del sistema operativo.
 *
 * --- Por que un componente dedicado para esto? ---
 * La subida de archivos involucra mucha logica:
 * - Validacion de tipos MIME y tamano
 * - Construccion del FormData
 * - Seguimiento de progreso
 * - Manejo de estados (uploading, error, idle)
 * - Feedback visual durante el arrastre
 *
 * Separar todo esto en su propio componente sigue el principio de
 * "Responsabilidad Unica" (Single Responsibility Principle): cada componente
 * hace UNA cosa bien.
 *
 * --- Libreria react-dropzone ---
 * Usamos `react-dropzone` en lugar de un `<input type="file">` nativo porque:
 * - Maneja drag & drop con eventos normalizados entre navegadores
 * - Valida tipos MIME y tamano ANTES de subir (ahorra ancho de banda)
 * - Provee feedback visual (isDragActive) para mejorar la UX
 * - Expone hooks (getRootProps, getInputProps) que se integran con React
 *
 * --- Flujo del componente ---
 * 1. Estado idle: Muestra zona de arrastre con instrucciones
 * 2. Usuario arrastra archivo encima: isDragActive = true, cambia colores
 * 3. Usuario suelta archivo: onDrop se ejecuta
 *    a. Valida tipo y tamano (react-dropzone lo hace automaticamente)
 *    b. Si es valido: inicia upload, muestra barra de progreso
 *    c. Si es invalido: react-dropzone no llama onDrop (archivo rechazado)
 * 4. Upload exitoso: llama a onUploadComplete(result) del componente padre
 * 5. Upload fallido: muestra mensaje de error
 *
 * @module components/FileUploader
 */

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '../api/client';

/**
 * Mapa de tipos MIME aceptados y sus extensiones correspondientes.
 *
 * --- Por que definimos esto como constante fuera del componente? ---
 * 1. **Rendimiento**: Si estuviera dentro del componente, se recrearia en cada
 *    render. Como es un objeto estatico que nunca cambia, lo definimos afuera
 *    para que se cree UNA sola vez cuando el modulo se importa.
 * 2. **Claridad**: Es facil ver de un vistazo que formatos acepta la app.
 *
 * --- Sobre tipos MIME ---
 * Los tipos MIME (Multipurpose Internet Mail Extensions) son identificadores
 * estandar para tipos de archivo en la web. Ejemplos:
 * - 'image/png' → Imagen PNG
 * - 'application/pdf' → Documento PDF
 * - 'text/markdown' → Archivo Markdown
 *
 * El tipo MIME largo de DOCX es el estandar de Microsoft Office Open XML.
 * react-dropzone usa estos tipos para filtrar archivos en el dialogo del OS
 * y validar archivos arrastrados.
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
 * Componente FileUploader - Zona de arrastrar y soltar archivos.
 *
 * --- Patron de "componente controlado por el padre" ---
 * Este componente NO decide que hacer con el resultado del upload.
 * Solo se encarga de subir el archivo y notificar al padre via
 * `onUploadComplete`. El padre (App.jsx) decide que hacer despues
 * (mostrar el ConversionPanel). Este patron se llama "lifting state up"
 * (elevar el estado) y es fundamental en React.
 *
 * @param {Object} props - Props del componente.
 * @param {Function} props.onUploadComplete - Callback que se ejecuta cuando
 *   el archivo se sube exitosamente. Recibe el objeto de respuesta del servidor
 *   con { job_id, filename, mime_type, size }. El padre usa estos datos para
 *   mostrar las opciones de conversion.
 *
 * @returns {JSX.Element} Zona de drag & drop con feedback visual y barra de progreso.
 */
export default function FileUploader({ onUploadComplete }) {
  /**
   * --- Estado local con useState ---
   * Estos tres estados controlan la UI del componente en todo momento:
   *
   * `progress` (0-100): Porcentaje de subida. Se actualiza en tiempo real
   * gracias al callback `onUploadProgress` de Axios. Controla el ancho
   * de la barra de progreso via CSS inline.
   *
   * `uploading` (boolean): Indica si hay una subida en curso. Cuando es true:
   * - Se muestra la barra de progreso en lugar de las instrucciones
   * - Se desactiva la interaccion (pointer-events-none + opacity)
   * - Esto previene que el usuario suba multiples archivos simultaneamente
   *
   * `error` (string | null): Mensaje de error del ultimo intento fallido.
   * null cuando no hay error. Se limpia al iniciar un nuevo intento.
   */
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Handler que se ejecuta cuando el usuario suelta un archivo valido.
   *
   * --- Por que useCallback? ---
   * `useCallback` memoriza la funcion para que no se recree en cada render.
   * Sin useCallback, `onDrop` seria una funcion NUEVA en cada render, lo que
   * causaria que react-dropzone se re-inicializara innecesariamente.
   *
   * La dependencia `[onUploadComplete]` significa: "solo recrea onDrop si
   * onUploadComplete cambia". Como App.jsx pasa una arrow function inline,
   * en la practica se recrea en cada render del padre. En una app mas grande,
   * el padre usaria useCallback tambien para evitar esto.
   *
   * --- Patron async/await con try/catch/finally ---
   * - try: Intenta subir el archivo. Si todo sale bien, notifica al padre.
   * - catch: Si el servidor responde con error (4xx, 5xx), mostramos el mensaje.
   *   `err.response?.data?.detail` es encadenamiento opcional (optional chaining):
   *   si `response` o `data` son undefined, no lanza error, retorna undefined.
   *   El operador `||` proporciona un mensaje por defecto.
   * - finally: Se ejecuta SIEMPRE (exito o error). Reseteamos `uploading`
   *   para que la UI vuelva a su estado normal.
   *
   * @param {File[]} acceptedFiles - Array de archivos aceptados por react-dropzone.
   *   Como configuramos `multiple: false`, siempre tendra 0 o 1 archivo.
   */
  const onDrop = useCallback(async (acceptedFiles) => {
    // Si no hay archivos aceptados (ej: el usuario arrastro un tipo no valido), salimos
    if (acceptedFiles.length === 0) return;

    // Tomamos solo el primer archivo (multiple: false asegura que solo haya uno)
    const file = acceptedFiles[0];
    // Activamos el estado de "subiendo" para mostrar la barra de progreso
    setUploading(true);
    // Limpiamos cualquier error previo para no confundir al usuario
    setError(null);
    // Reiniciamos el progreso a 0 para este nuevo upload
    setProgress(0);

    try {
      /**
       * Llamamos a `uploadFile` de nuestro API client.
       * Pasamos `setProgress` directamente como callback de progreso.
       * Esto es posible porque `setProgress` acepta un numero (0-100),
       * que es exactamente lo que `uploadFile` le pasa al callback.
       * Elegante, no? Evitamos crear una funcion wrapper innecesaria.
       */
      const result = await uploadFile(file, setProgress);
      /**
       * Notificamos al componente padre (App.jsx) que el upload fue exitoso.
       * `result` contiene: { job_id, filename, mime_type, size }
       * El padre guardara esto en su estado y mostrara el ConversionPanel.
       */
      onUploadComplete(result);
    } catch (err) {
      /**
       * Extraemos el mensaje de error del servidor.
       * FastAPI retorna errores en `response.data.detail`.
       * Si la peticion ni siquiera llego al servidor (ej: sin internet),
       * `err.response` sera undefined, asi que usamos optional chaining (?.)
       * y un fallback con || para siempre tener un mensaje legible.
       */
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      // Siempre desactivamos el estado de "subiendo", pase lo que pase
      setUploading(false);
    }
  }, [onUploadComplete]);

  /**
   * --- Hook useDropzone ---
   * `useDropzone` es el hook principal de react-dropzone. Retorna:
   *
   * `getRootProps()`: Props para el contenedor principal (div). Incluye
   *   handlers de drag events, role="presentation", tabIndex, etc.
   *   Se aplican con el spread operator: {...getRootProps()}
   *
   * `getInputProps()`: Props para el <input type="file"> oculto. Incluye
   *   accept, multiple, onChange, style (display: none), etc.
   *
   * `isDragActive`: Boolean que es true cuando el usuario esta arrastrando
   *   un archivo sobre la zona. Lo usamos para cambiar los estilos.
   *
   * --- Configuracion ---
   * - `onDrop`: Nuestro handler definido arriba
   * - `accept`: El mapa ACCEPTED_TYPES (solo permite estos tipos de archivo)
   * - `maxSize`: 50MB en bytes (50 * 1024 * 1024). react-dropzone rechaza
   *   archivos mas grandes sin siquiera intentar subirlos.
   * - `multiple: false`: Solo permite un archivo a la vez. Simplifica la UI
   *   y el backend (un archivo = un job_id).
   */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  });

  /**
   * --- JSX del componente ---
   * Usamos renderizado condicional (ternarios anidados) para mostrar
   * diferentes contenidos segun el estado actual:
   *
   * 1. Si `uploading` es true → Muestra barra de progreso
   * 2. Si `isDragActive` es true → Muestra "Drop the file here..."
   * 3. Caso default → Muestra instrucciones de arrastrar/click
   *
   * --- Clases de Tailwind CSS ---
   * Las clases se construyen dinamicamente con template literals.
   * `border-dashed` crea el borde punteado clasico de las zonas de drop.
   * `pointer-events-none` desactiva TODA interaccion del mouse (importante
   * durante el upload para prevenir doble-click accidental).
   * `transition-colors` anima los cambios de color para una UX suave.
   */
  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      {/* Input oculto que react-dropzone necesita para el click-to-browse */}
      <input {...getInputProps()} />
      {uploading ? (
        /**
         * --- Vista de progreso de subida ---
         * Se muestra mientras `uploading` es true.
         * La barra de progreso usa CSS inline `width: ${progress}%` porque
         * Tailwind no puede generar clases dinamicas en tiempo de ejecucion.
         * (Tailwind genera CSS en build time, no puede crear `w-[67%]` al vuelo).
         * `transition-all` anima el crecimiento de la barra suavemente.
         */
        <div>
          <p className="text-lg font-medium text-gray-700">Uploading... {progress}%</p>
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : isDragActive ? (
        /**
         * --- Vista de "arrastrando" ---
         * Se muestra cuando el usuario tiene un archivo sobre la zona pero
         * aun no lo ha soltado. El color azul le da feedback visual de que
         * la zona esta "activa" y lista para recibir el archivo.
         */
        <p className="text-lg text-blue-600">Drop the file here...</p>
      ) : (
        /**
         * --- Vista por defecto (idle) ---
         * Instrucciones claras para el usuario. Mostramos ambas opciones:
         * drag & drop Y click to browse, porque no todos los usuarios
         * conocen el drag & drop (especialmente en mobile).
         * El texto de formatos soportados ayuda al usuario a saber que puede subir.
         */
        <div>
          <p className="text-lg text-gray-600">
            Drag & drop a file here, or <span className="text-blue-500 underline">click to browse</span>
          </p>
          <p className="mt-2 text-sm text-gray-400">
            PNG, JPEG, WebP, PDF, DOCX, Markdown — Max 50MB
          </p>
        </div>
      )}
      {/**
       * --- Mensaje de error ---
       * Se muestra DEBAJO del contenido principal (fuera del ternario)
       * porque queremos que sea visible sin importar el estado actual.
       * Solo aparece si `error` no es null/undefined (truthy).
       * Usamos texto rojo por convencion de UX: rojo = error.
       */}
      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
}
