/**
 * ============================================================================
 * ConversionPanel.jsx - Panel de opciones de conversion y descarga
 * ============================================================================
 *
 * Este componente aparece DESPUES de que el usuario sube un archivo exitosamente.
 * Muestra informacion del archivo subido y permite al usuario:
 * 1. Seleccionar un formato destino (ej: PNG → JPEG)
 * 2. Ejecutar la conversion en el servidor
 * 3. Descargar el archivo convertido
 *
 * --- Arquitectura del flujo de conversion ---
 * El flujo completo de la app es un pipeline de 3 pasos:
 *   Upload (FileUploader) → Conversion (este componente) → Descarga (enlace <a>)
 *
 * Este componente maneja los pasos 2 y 3. Recibe del padre (App.jsx) el
 * resultado del upload (paso 1) como prop `uploadResult`.
 *
 * --- Patron de configuracion con datos (data-driven UI) ---
 * En lugar de hardcodear las opciones de conversion en el JSX, usamos el
 * objeto CONVERSION_OPTIONS como "configuracion". Esto significa que para
 * agregar soporte para un nuevo formato, solo necesitamos agregar una entrada
 * al objeto, sin tocar la logica del componente. Esto es un ejemplo del
 * principio Open/Closed: abierto para extension, cerrado para modificacion.
 *
 * @module components/ConversionPanel
 */

import { useState } from 'react';
import { convertFile, getDownloadUrl } from '../api/client';

/**
 * Mapa de opciones de conversion disponibles por tipo MIME de origen.
 *
 * Cada clave es un tipo MIME del archivo subido. Su valor es un array de
 * opciones que el usuario puede elegir.
 *
 * --- Estructura de cada opcion ---
 * - `label`: Texto que se muestra al usuario en el <select> (ej: "JPEG")
 * - `value`: Valor tecnico que se envia al backend. Puede ser:
 *   a) Un tipo MIME destino (ej: 'image/jpeg') para conversiones de formato
 *   b) Un string especial (ej: 'compress', 'strip_metadata') para operaciones
 *      que NO cambian el formato sino que modifican el archivo
 *
 * --- Por que esta constante vive fuera del componente? ---
 * Misma razon que ACCEPTED_TYPES en FileUploader: es un dato estatico que
 * nunca cambia durante la ejecucion. Definirlo fuera evita recrearlo en
 * cada render y facilita su mantenimiento.
 *
 * --- Nota sobre los formatos especiales ---
 * 'compress' y 'strip_metadata' no son tipos MIME reales. Son "acciones"
 * que le indican al backend que haga algo especial sin cambiar el formato.
 * El componente detecta estos casos especiales en `handleConvert()` y los
 * traduce a la estructura que el backend espera.
 */
const CONVERSION_OPTIONS = {
  'image/png': [
    { label: 'JPEG', value: 'image/jpeg' },
    { label: 'WebP', value: 'image/webp' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'image/jpeg': [
    { label: 'PNG', value: 'image/png' },
    { label: 'WebP', value: 'image/webp' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'image/webp': [
    { label: 'PNG', value: 'image/png' },
    { label: 'JPEG', value: 'image/jpeg' },
    { label: 'Compress', value: 'compress' },
    { label: 'Strip Metadata', value: 'strip_metadata' },
  ],
  'application/pdf': [
    { label: 'Markdown', value: 'text/markdown' },
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { label: 'PDF', value: 'application/pdf' },
  ],
  'text/markdown': [
    { label: 'PDF', value: 'application/pdf' },
  ],
  'text/plain': [
    { label: 'PDF', value: 'application/pdf' },
  ],
};

/**
 * Componente ConversionPanel - Permite seleccionar formato y convertir el archivo.
 *
 * --- Ciclo de vida del componente ---
 * 1. Se monta cuando el padre pone `uploadResult` en su estado (upload exitoso)
 * 2. El usuario selecciona un formato del <select>
 * 3. Hace click en "Convert" → se ejecuta handleConvert()
 * 4. Al completar, aparece el enlace de descarga
 * 5. Si el usuario sube un nuevo archivo, el padre reemplaza `uploadResult`
 *    y este componente se re-renderiza con los datos nuevos
 *
 * --- Estado vs Props ---
 * - Props (datos del padre): `uploadResult` - info del archivo subido
 * - State (datos locales): formato seleccionado, estado de conversion, etc.
 * Usamos props para datos que vienen de afuera y state para datos que
 * este componente controla internamente.
 *
 * @param {Object} props - Props del componente.
 * @param {Object} props.uploadResult - Resultado del upload exitoso.
 * @param {string} props.uploadResult.job_id - UUID del trabajo en el servidor.
 * @param {string} props.uploadResult.filename - Nombre original del archivo.
 * @param {string} props.uploadResult.mime_type - Tipo MIME del archivo subido.
 * @param {number} props.uploadResult.size - Tamano del archivo en bytes.
 *
 * @returns {JSX.Element} Panel con selector de formato, boton de conversion y enlace de descarga.
 */
export default function ConversionPanel({ uploadResult }) {
  /**
   * --- Estados locales ---
   *
   * `selectedFormat` (string): El valor del formato/accion seleccionado en el
   * <select>. Empieza vacio ('') para que el placeholder "Select format..." se
   * muestre. Esto es un "controlled component" pattern: el valor del <select>
   * esta controlado por React (via state), no por el DOM.
   *
   * `converting` (boolean): Indica si hay una conversion en curso.
   * Similar a `uploading` en FileUploader, desactiva el boton para
   * prevenir multiples conversiones simultaneas.
   *
   * `downloadReady` (boolean): Se pone en true cuando la conversion termina
   * exitosamente. Controla la visibilidad del enlace de descarga.
   *
   * `error` (string | null): Mensaje de error de la conversion, si hubo alguno.
   */
  const [selectedFormat, setSelectedFormat] = useState('');
  const [converting, setConverting] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Obtenemos las opciones de conversion disponibles para el tipo MIME
   * del archivo subido. Si el tipo MIME no esta en nuestro mapa (caso
   * improbable porque FileUploader ya filtra), usamos un array vacio.
   * El operador `|| []` es un "fallback" defensivo para evitar errores.
   */
  const options = CONVERSION_OPTIONS[uploadResult.mime_type] || [];

  /**
   * Handler del boton "Convert".
   *
   * --- Logica de conversiones especiales ---
   * Hay dos tipos de operaciones:
   *
   * 1. **Conversion de formato** (ej: PNG → JPEG):
   *    - `targetFormat` = tipo MIME destino (ej: 'image/jpeg')
   *    - `opts` = {} (sin opciones adicionales)
   *
   * 2. **Operaciones especiales** (compress, strip_metadata):
   *    - `targetFormat` = MISMO tipo MIME del archivo original
   *      (porque no cambiamos el formato, solo lo modificamos)
   *    - `opts` = { action: 'compress', quality: 70 } o { action: 'strip_metadata' }
   *
   * El backend necesita siempre un `target_format` valido, asi que para las
   * operaciones especiales le mandamos el MIME original + opciones extra.
   *
   * --- Por que quality: 70 para compress? ---
   * 70% de calidad es un buen balance entre reduccion de tamano y calidad visual.
   * En una app mas completa, esto seria configurable por el usuario con un slider.
   */
  const handleConvert = async () => {
    // Activamos el estado de "convirtiendo" para deshabilitar el boton
    setConverting(true);
    // Limpiamos errores previos
    setError(null);

    try {
      // Variables mutables (let) porque pueden cambiar segun el tipo de operacion
      let targetFormat = selectedFormat;
      let opts = {};

      /**
       * Detectamos si el usuario eligio una operacion especial (no un formato).
       * Si es 'compress', mantenemos el formato original y agregamos opciones
       * de compresion. Si es 'strip_metadata', igual mantenemos el formato
       * y solo indicamos que queremos eliminar metadatos.
       */
      if (selectedFormat === 'compress') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'compress', quality: 70 };
      } else if (selectedFormat === 'strip_metadata') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'strip_metadata' };
      }

      // Llamamos al API client para ejecutar la conversion en el servidor
      await convertFile(uploadResult.job_id, targetFormat, opts);
      // Si llegamos aqui sin error, la conversion fue exitosa
      setDownloadReady(true);
    } catch (err) {
      /**
       * Mismo patron de manejo de errores que en FileUploader.
       * FastAPI retorna errores en `detail`, con optional chaining
       * como proteccion y un mensaje por defecto como fallback.
       */
      setError(err.response?.data?.detail || 'Conversion failed');
    } finally {
      // Siempre desactivamos el estado de "convirtiendo"
      setConverting(false);
    }
  };

  /**
   * --- JSX del componente ---
   * Estructura:
   * 1. Titulo con nombre del archivo y tamano
   * 2. Fila con <select> de formato y boton "Convert"
   * 3. Enlace de descarga (solo visible si downloadReady es true)
   * 4. Mensaje de error (solo visible si hay error)
   */
  return (
    /**
     * --- Contenedor del panel ---
     * `mt-8` separa este panel del FileUploader de arriba.
     * `shadow-sm` agrega una sombra sutil que da efecto de "tarjeta elevada".
     * Esto sigue el principio de diseno Material Design de "elevation"
     * para indicar que este es un componente separado del fondo.
     */
    <div className="mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
      {/**
       * --- Encabezado con info del archivo ---
       * Mostramos el nombre original del archivo y su tamano en KB.
       * `(uploadResult.size / 1024).toFixed(1)` convierte bytes a KB
       * con 1 decimal. Ejemplo: 153600 bytes → "150.0 KB".
       * Esto ayuda al usuario a confirmar que subio el archivo correcto.
       */}
      <h3 className="text-lg font-semibold text-gray-800">
        {uploadResult.filename}
        <span className="ml-2 text-sm font-normal text-gray-400">
          ({(uploadResult.size / 1024).toFixed(1)} KB)
        </span>
      </h3>

      {/**
       * --- Fila de controles ---
       * Usamos flexbox (`flex`) para alinear el <select> y el boton
       * horizontalmente. `gap-4` agrega espacio entre ellos.
       * `items-center` los centra verticalmente.
       */}
      <div className="mt-4 flex items-center gap-4">
        {/**
         * --- Select de formato (Controlled Component) ---
         * Este es un "controlled component": su valor esta controlado por
         * React via `selectedFormat` (state), no por el DOM nativo.
         *
         * Cuando el usuario cambia la seleccion:
         * 1. `onChange` se dispara con el nuevo valor
         * 2. Actualizamos `selectedFormat` con el nuevo valor
         * 3. Reseteamos `downloadReady` a false porque un nuevo formato
         *    invalida la descarga anterior (si habia una)
         * 4. React re-renderiza con el nuevo valor seleccionado
         *
         * La primera <option> con value="" sirve como placeholder.
         * El boton "Convert" esta deshabilitado cuando value es '' (falsy).
         */}
        <select
          value={selectedFormat}
          onChange={(e) => { setSelectedFormat(e.target.value); setDownloadReady(false); }}
          className="border border-gray-300 rounded-lg px-4 py-2 text-gray-700"
        >
          <option value="">Select format...</option>
          {/**
           * --- Renderizado de opciones con .map() ---
           * Iteramos sobre el array `options` para generar un <option> por cada
           * formato disponible. El atributo `key` es OBLIGATORIO en React cuando
           * renderizamos listas: le permite a React identificar que elementos
           * cambiaron, se agregaron o se eliminaron para optimizar el re-render.
           * Usamos `opt.value` como key porque es unico dentro de cada lista.
           */}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/**
         * --- Boton de conversion ---
         * Deshabilitado en dos casos:
         * 1. `!selectedFormat` - No se ha elegido formato (valor es '')
         * 2. `converting` - Ya hay una conversion en curso
         *
         * --- Por que deshabilitamos durante la conversion? ---
         * UX: Previene que el usuario haga doble click y lance dos conversiones
         * simultaneas. Tambien comunica visualmente (opacity-50) que algo esta
         * pasando. El texto cambia a "Converting..." como feedback adicional.
         *
         * `disabled:opacity-50` y `disabled:cursor-not-allowed` son variantes
         * de Tailwind que solo aplican cuando el atributo `disabled` esta presente.
         */}
        <button
          onClick={handleConvert}
          disabled={!selectedFormat || converting}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {converting ? 'Converting...' : 'Convert'}
        </button>
      </div>

      {/**
       * --- Enlace de descarga (renderizado condicional) ---
       * Solo se muestra cuando `downloadReady` es true (conversion exitosa).
       *
       * --- Por que usamos <a> con `download` y no un boton + fetch? ---
       * El atributo HTML `download` le dice al navegador que descargue el
       * recurso en lugar de navegarlo. Combinado con la URL generada por
       * `getDownloadUrl()`, el navegador hace un GET a `/api/download/{jobId}`
       * y descarga el archivo directamente.
       *
       * Ventajas sobre hacerlo con JavaScript (fetch + Blob):
       * - El navegador maneja la descarga nativamente (dialogo de guardar, etc.)
       * - No carga el archivo en memoria JavaScript
       * - Funciona incluso si el archivo es muy grande
       * - Es mas sencillo y menos propenso a errores
       *
       * El color verde (bg-green-500) indica "accion positiva completada",
       * diferenciandolo del azul del boton de conversion.
       */}
      {downloadReady && (
        <a
          href={getDownloadUrl(uploadResult.job_id)}
          download
          className="mt-4 inline-block px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          Download Converted File
        </a>
      )}

      {/**
       * --- Mensaje de error ---
       * Mismo patron que FileUploader: solo visible si `error` es truthy.
       * Aparece debajo de todo para no obstruir los controles principales.
       */}
      {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
    </div>
  );
}
