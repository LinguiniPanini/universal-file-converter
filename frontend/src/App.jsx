/**
 * ============================================================================
 * App.jsx - Componente raiz de la aplicacion React
 * ============================================================================
 *
 * Este es el "punto de entrada" de la interfaz de usuario. Es el componente
 * de mas alto nivel en el arbol de React y actua como "orquestador" de toda
 * la aplicacion.
 *
 * --- Rol de App.jsx en la arquitectura ---
 * En React, la aplicacion se estructura como un arbol de componentes:
 *
 *   App (este archivo)
 *   ├── FileUploader      → Subida de archivos
 *   └── ConversionPanel   → Seleccion de formato + descarga
 *
 * App.jsx se encarga de:
 * 1. **Manejar el estado compartido** (uploadResult) entre componentes hermanos
 * 2. **Componer los componentes** en el layout de la pagina
 * 3. **Controlar el flujo de la aplicacion** (que se muestra y cuando)
 *
 * --- Patron "Lifting State Up" (Elevar el estado) ---
 * FileUploader necesita comunicarle a ConversionPanel que archivo se subio.
 * Como son componentes hermanos (no padre-hijo directo), no pueden comunicarse
 * entre si directamente. La solucion de React es "elevar" el estado compartido
 * al ancestro comun mas cercano: App.
 *
 * Flujo:
 * 1. App tiene el estado `uploadResult` (inicialmente null)
 * 2. App le pasa un callback `onUploadComplete` a FileUploader
 * 3. FileUploader lo llama con los datos del archivo cuando el upload termina
 * 4. App guarda los datos en `uploadResult` → se re-renderiza
 * 5. Como `uploadResult` ya no es null, App renderiza ConversionPanel
 * 6. App le pasa `uploadResult` como prop a ConversionPanel
 *
 * Este patron evita la necesidad de librerias de estado global (como Redux)
 * para aplicaciones pequenas como esta.
 *
 * --- Por que no usamos React Router? ---
 * Esta aplicacion tiene UNA sola "pagina" (single-page, single-view).
 * No necesitamos navegacion entre multiples vistas. Si tuvieramos un panel
 * de historial, configuracion, etc., entonces si usariamos React Router
 * para manejar las rutas.
 *
 * @module App
 */

import { useState } from 'react';
import FileUploader from './components/FileUploader';
import ConversionPanel from './components/ConversionPanel';

/**
 * Componente App - Raiz de la aplicacion Universal File Converter.
 *
 * --- Componentes funcionales en React ---
 * Este componente es una "funcion" que retorna JSX. Los componentes funcionales
 * son el estandar moderno de React (desde React 16.8 con Hooks). Antes se
 * usaban clases (class App extends React.Component), pero los hooks (useState,
 * useEffect, etc.) hacen que las funciones sean mas simples y poderosas.
 *
 * `export default` significa que este es el export principal del modulo.
 * Cuando otro archivo hace `import App from './App'`, obtiene esta funcion.
 *
 * @returns {JSX.Element} Layout completo de la aplicacion con FileUploader
 *   y, condicionalmente, ConversionPanel.
 */
export default function App() {
  /**
   * --- Estado principal de la aplicacion ---
   *
   * `uploadResult` contiene la metadata del archivo subido (o null si no hay).
   * Cuando es null: solo se muestra FileUploader.
   * Cuando tiene datos: se muestra FileUploader + ConversionPanel.
   *
   * --- Por que null como valor inicial? ---
   * null indica "no hay datos todavia". Es mejor que undefined porque es
   * un valor intencional (elegimos que no haya datos), mientras que undefined
   * podria significar "se nos olvido inicializarlo". En la practica, ambos
   * son falsy y funcionarian con `{uploadResult && ...}`, pero null es
   * semanticamente mas correcto.
   *
   * La estructura esperada cuando hay datos:
   * {
   *   job_id: "abc-123-def",    // UUID del trabajo
   *   filename: "foto.png",      // Nombre original
   *   mime_type: "image/png",    // Tipo MIME
   *   size: 153600               // Tamano en bytes
   * }
   */
  const [uploadResult, setUploadResult] = useState(null);

  return (
    /**
     * --- Layout principal ---
     * `min-h-screen` asegura que el contenedor ocupe AL MENOS toda la altura
     * de la ventana, evitando que el footer quede "flotando" si hay poco contenido.
     * `bg-gray-50` da un fondo ligeramente gris para que los componentes blancos
     * (ConversionPanel) se destaquen visualmente.
     */
    <div className="min-h-screen bg-gray-50">
      {/**
       * --- Contenedor centrado ---
       * `max-w-2xl` limita el ancho maximo a 672px (~42rem). Esto mejora la
       * legibilidad: lineas demasiado largas son dificiles de leer.
       * `mx-auto` centra el contenedor horizontalmente con margenes automaticos.
       * `py-16` agrega padding vertical de 64px (4rem) para separar del borde.
       * `px-4` agrega padding horizontal en pantallas pequenas (mobile).
       *
       * Esta combinacion es un patron MUY comun en aplicaciones web para crear
       * un layout centrado y responsivo sin necesidad de CSS Grid o Flexbox
       * complejo.
       */}
      <div className="max-w-2xl mx-auto py-16 px-4">
        {/* Titulo principal de la aplicacion */}
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          Universal File Converter
        </h1>
        {/* Subtitulo descriptivo - texto mas pequeno y claro */}
        <p className="mt-2 text-center text-gray-500">
          Convert images and documents between formats
        </p>

        {/**
         * --- FileUploader ---
         * Siempre visible. El usuario puede subir un archivo en cualquier momento.
         *
         * `onUploadComplete` es un callback (funcion que pasamos como prop).
         * Cuando FileUploader termina de subir, llama a esta funcion con el
         * resultado. La arrow function `(result) => setUploadResult(result)`
         * guarda ese resultado en el estado de App, lo que causa un re-render
         * y muestra el ConversionPanel.
         *
         * Nota: Podriamos pasar `setUploadResult` directamente en vez de
         * envolverlo en una arrow function. Ambas formas funcionan:
         *   onUploadComplete={setUploadResult}  ← mas conciso
         *   onUploadComplete={(result) => setUploadResult(result)}  ← mas explicito
         * Usamos la forma explicita para que sea mas claro que pasa.
         */}
        <div className="mt-10">
          <FileUploader onUploadComplete={(result) => {
            setUploadResult(result);
          }} />
        </div>

        {/**
         * --- Renderizado condicional de ConversionPanel ---
         * `{uploadResult && <ConversionPanel ... />}` es un patron comun en React.
         *
         * --- Como funciona? ---
         * El operador `&&` en JavaScript retorna:
         * - El primer valor falsy que encuentre, O
         * - El ultimo valor si todos son truthy.
         *
         * Cuando `uploadResult` es null (falsy): `null && <Component />` = null
         * → React no renderiza nada (null es un retorno valido).
         *
         * Cuando `uploadResult` tiene datos (truthy): `{datos} && <Component />`
         * = <Component /> → React renderiza el ConversionPanel.
         *
         * Alternativa equivalente con ternario:
         *   {uploadResult ? <ConversionPanel ... /> : null}
         * El patron `&&` es mas corto cuando no hay caso "else".
         */}
        {uploadResult && (
          <ConversionPanel uploadResult={uploadResult} />
        )}
      </div>
    </div>
  );
}
