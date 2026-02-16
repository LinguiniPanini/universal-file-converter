/**
 * ============================================================================
 * client.js - Cliente HTTP centralizado para comunicarse con el backend
 * ============================================================================
 *
 * Este archivo es el "puente" entre el frontend (React) y el backend (FastAPI).
 * Encapsula TODAS las llamadas HTTP en funciones reutilizables.
 *
 * --- Por que existe este archivo? ---
 * En lugar de hacer llamadas a `fetch()` o `axios` directamente dentro de los
 * componentes de React, centralizamos la logica de red aqui. Esto nos da:
 *
 * 1. **Un solo lugar para cambiar la URL base** - Si el backend cambia de
 *    puerto o dominio, solo modificamos `baseURL` aqui.
 * 2. **Reutilizacion** - Cualquier componente puede importar `uploadFile()`
 *    sin repetir logica de FormData, headers, etc.
 * 3. **Separacion de responsabilidades** - Los componentes se encargan de la
 *    UI; este archivo se encarga de la comunicacion con el servidor.
 * 4. **Facilidad para testing** - Podemos mockear este modulo entero en tests
 *    sin tocar los componentes.
 *
 * --- Por que Axios y no fetch()? ---
 * Axios ofrece ventajas sobre `fetch()` nativo:
 * - Transformacion automatica de JSON (no necesitas `response.json()`)
 * - Interceptores para manejar errores globalmente
 * - Soporte nativo para `onUploadProgress` (vital para la barra de progreso)
 * - Cancelacion de requests con AbortController integrado
 * - Mejor manejo de errores HTTP (fetch no rechaza en 4xx/5xx, Axios si)
 *
 * --- Patron "API Client" ---
 * Este es un patron comun en aplicaciones React profesionales. Se le conoce
 * como "API layer" o "service layer". La idea es que los componentes nunca
 * hablen directamente con el servidor; siempre pasan por estas funciones.
 *
 * @module api/client
 */

import axios from 'axios';

/**
 * Instancia preconfigurada de Axios.
 *
 * `axios.create()` nos permite crear una instancia con configuracion por defecto.
 * Todas las peticiones hechas con `api.get()`, `api.post()`, etc. heredaran
 * esta configuracion.
 *
 * --- Sobre el baseURL '/api' ---
 * En desarrollo, el frontend corre en `localhost:5173` (Vite) y el backend en
 * `localhost:8000` (FastAPI). Sin el proxy de Vite, una peticion a `/api/upload`
 * iria a `localhost:5173/api/upload` (que no existe).
 *
 * Gracias al proxy configurado en `vite.config.js`, Vite redirige cualquier
 * peticion que empiece con `/api` hacia `localhost:8000`. Asi, `/api/upload`
 * se convierte en `localhost:8000/api/upload`.
 *
 * En produccion, este baseURL seguiria funcionando si el backend sirve el
 * frontend como archivos estaticos, o se ajustaria a la URL del servidor.
 */
const api = axios.create({
  baseURL: '/api',
});

/**
 * Sube un archivo al servidor mediante una peticion POST multipart.
 *
 * --- Flujo completo ---
 * 1. El usuario suelta un archivo en el FileUploader (drag & drop)
 * 2. FileUploader llama a esta funcion con el archivo y un callback de progreso
 * 3. Esta funcion construye un FormData, lo envia via POST
 * 4. Axios reporta progreso de subida → actualizamos la barra de progreso
 * 5. El servidor responde con metadata del archivo (job_id, mime_type, etc.)
 * 6. Retornamos esa metadata al componente para que continue el flujo
 *
 * @async
 * @param {File} file - Objeto File del navegador (viene del input o del drop).
 *   El objeto File contiene: name, size, type (MIME), lastModified, y el
 *   contenido binario del archivo.
 * @param {Function} onProgress - Callback que recibe un numero del 0 al 100
 *   representando el porcentaje de subida. Se usa para actualizar la UI.
 * @returns {Promise<Object>} Respuesta del servidor con datos del archivo subido.
 *   Tipicamente: { job_id, filename, mime_type, size }
 *
 * @example
 *   const result = await uploadFile(miArchivo, (pct) => setProgress(pct));
 *   console.log(result.job_id); // UUID del trabajo de conversion
 */
export async function uploadFile(file, onProgress) {
  /**
   * FormData es una API del navegador para construir cuerpos de peticion
   * en formato `multipart/form-data`.
   *
   * --- Por que FormData y no JSON? ---
   * Los archivos son datos binarios. JSON solo puede contener texto (strings,
   * numeros, booleanos). Para enviar binarios por HTTP necesitamos `multipart`,
   * que permite mezclar campos de texto con campos de archivo en una sola
   * peticion.
   *
   * `formData.append('file', file)` agrega el archivo con la clave 'file'.
   * En el backend (FastAPI), lo recibimos como: `async def upload(file: UploadFile)`
   * La clave 'file' aqui DEBE coincidir con el nombre del parametro en el backend.
   */
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    /**
     * --- Header Content-Type: multipart/form-data ---
     * Aunque Axios normalmente detecta FormData y pone el header automaticamente,
     * lo ponemos explicito por claridad y para asegurar que el navegador genere
     * el `boundary` correcto (un delimitador unico que separa las partes del
     * multipart). Sin este boundary, el servidor no sabria donde termina un
     * campo y empieza otro.
     *
     * Nota tecnica: Axios y el navegador agregan automaticamente el boundary
     * al Content-Type. Si pusieras el boundary manualmente, probablemente
     * causarias errores.
     */
    headers: { 'Content-Type': 'multipart/form-data' },

    /**
     * --- Seguimiento de progreso de subida ---
     * `onUploadProgress` es un feature exclusivo de Axios (fetch nativo no lo tiene).
     * Recibe un evento de tipo ProgressEvent con:
     *   - e.loaded: bytes enviados hasta ahora
     *   - e.total: bytes totales del archivo (puede ser undefined si el servidor
     *     no envia Content-Length)
     *
     * Calculamos el porcentaje: (loaded / total) * 100
     * Math.round() redondea para no mostrar decimales en la UI (ej: 67% en vez de 67.34%)
     *
     * --- Por que es importante mostrar progreso? ---
     * UX: Subir archivos grandes (hasta 50MB) puede tardar segundos o minutos.
     * Sin feedback visual, el usuario pensaria que la app se congelo.
     * Una barra de progreso le comunica que la operacion esta en curso.
     */
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });

  /**
   * Axios ya parsea la respuesta JSON automaticamente.
   * `response.data` contiene el cuerpo de la respuesta como objeto JS.
   * Con fetch() nativo tendriamos que hacer: `const data = await response.json()`
   */
  return response.data;
}

/**
 * Solicita la conversion de un archivo previamente subido.
 *
 * --- Flujo ---
 * 1. El usuario selecciona un formato destino en el ConversionPanel
 * 2. El componente llama a esta funcion con el job_id y el formato deseado
 * 3. Enviamos un POST con los datos en JSON (no es multipart, son solo strings)
 * 4. El backend convierte el archivo y responde con exito o error
 *
 * --- Por que usamos job_id en vez de reenviar el archivo? ---
 * El archivo ya fue subido y esta almacenado en el servidor. Reenviar 50MB
 * solo para convertirlo seria un desperdicio de ancho de banda. En cambio,
 * usamos el `job_id` (un UUID) que el servidor nos dio al subir el archivo.
 * El backend busca el archivo por ese ID y lo convierte.
 *
 * @async
 * @param {string} jobId - Identificador unico del trabajo (UUID), obtenido
 *   de la respuesta de `uploadFile()`.
 * @param {string} targetFormat - Tipo MIME destino (ej: 'image/jpeg', 'application/pdf').
 * @param {Object} [options={}] - Opciones adicionales de conversion.
 *   Por ejemplo: { action: 'compress', quality: 70 } para comprimir imagenes,
 *   o { action: 'strip_metadata' } para eliminar metadatos EXIF.
 * @returns {Promise<Object>} Respuesta del servidor confirmando la conversion.
 */
export async function convertFile(jobId, targetFormat, options = {}) {
  /**
   * Esta peticion envia JSON (no FormData) porque no hay archivos binarios,
   * solo datos de texto (el ID y el formato). Axios serializa objetos JS a
   * JSON automaticamente y pone el header `Content-Type: application/json`.
   *
   * Nota: Usamos snake_case (job_id, target_format) porque el backend esta
   * en Python/FastAPI, que sigue la convencion de snake_case. El frontend JS
   * normalmente usa camelCase, pero aqui nos adaptamos al contrato de la API.
   */
  const response = await api.post('/convert', {
    job_id: jobId,
    target_format: targetFormat,
    options,
  });

  return response.data;
}

/**
 * Genera la URL de descarga para un archivo convertido.
 *
 * --- Por que es una funcion pura (no async)? ---
 * No hace ninguna peticion HTTP. Solo construye un string con la URL.
 * La descarga real la hace el navegador cuando el usuario clickea el enlace `<a>`.
 *
 * --- Por que no usamos Axios para descargar? ---
 * Para descargar archivos, es mas sencillo y eficiente usar un enlace `<a>` con
 * el atributo `download`. El navegador maneja la descarga nativamente, mostrando
 * su propio dialogo de "Guardar como...", sin necesidad de cargar el archivo
 * entero en memoria JavaScript.
 *
 * @param {string} jobId - UUID del trabajo cuyo archivo convertido queremos descargar.
 * @returns {string} URL relativa para la descarga (ej: '/api/download/abc-123').
 */
export function getDownloadUrl(jobId) {
  return `/api/download/${jobId}`;
}
