/**
 * ============================================================================
 * App.jsx - Orquestador multi-paso de la aplicacion React
 * ============================================================================
 *
 * Este es el componente raiz de la aplicacion Universal File Converter.
 * Actua como un "orquestador" que controla el flujo de la aplicacion
 * a traves de tres pasos secuenciales:
 *
 *   Paso 0: Upload   → El usuario sube un archivo
 *   Paso 1: Convert  → El usuario selecciona formato y convierte
 *   Paso 2: Download → El usuario descarga el archivo convertido
 *
 * --- Arquitectura de pasos (Step-based UI) ---
 * En vez de mostrar todos los controles a la vez (lo cual puede abrumar
 * al usuario), dividimos la experiencia en pasos claros. Esto se conoce
 * como un "wizard" o "stepper" pattern. Cada paso muestra solo lo que
 * el usuario necesita en ese momento, reduciendo la carga cognitiva.
 *
 * --- Flujo de datos ---
 * El estado se "eleva" (lifting state up) a este componente raiz:
 *
 *   1. UploadStep llama a handleUploadComplete(result)
 *      → Guardamos la metadata del archivo y avanzamos al paso 1
 *
 *   2. ConvertStep llama a handleConvertComplete()
 *      → Avanzamos al paso 2 (descarga)
 *
 *   3. DownloadStep llama a handleReset()
 *      → Regresamos al paso 0, limpiamos el estado
 *
 * --- Animaciones con Framer Motion ---
 * Usamos AnimatePresence con mode="wait" para animar las transiciones
 * entre pasos. Esto significa que el componente que sale completa su
 * animacion de salida ANTES de que entre el nuevo componente.
 * Sin mode="wait", ambos estarian visibles simultaneamente durante
 * la transicion, causando un efecto visual feo.
 *
 * --- Por que useCallback? ---
 * Los callbacks estan memoizados con useCallback para evitar re-renders
 * innecesarios. Sin useCallback, cada vez que App se re-renderiza,
 * se crearian NUEVAS funciones (nuevas referencias en memoria), lo que
 * haria que los componentes hijos se re-rendericen aunque sus datos
 * no hayan cambiado. useCallback devuelve la MISMA referencia de
 * funcion entre renders, siempre que sus dependencias no cambien.
 *
 * @module App
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Importamos los componentes de cada paso y elementos de UI.
 *
 * - AnimatedBackground: fondo animado con particulas/gradientes
 * - StepIndicator: barra visual que muestra el progreso (paso 1, 2, 3)
 * - UploadStep, ConvertStep, DownloadStep: los tres pasos del wizard
 * - Toaster: sistema de notificaciones tipo "toast" (mensajes temporales)
 *
 * Nota sobre Toaster: importamos directamente de 'sonner' en vez del
 * wrapper de shadcn/ui porque el wrapper usa `next-themes` (useTheme),
 * que es una dependencia de Next.js que NO tenemos en este proyecto
 * (usamos Vite + React). Importar del wrapper causaria un error.
 */
import AnimatedBackground from './components/AnimatedBackground';
import StepIndicator from './components/StepIndicator';
import UploadStep from './components/UploadStep';
import ConvertStep from './components/ConvertStep';
import DownloadStep from './components/DownloadStep';
import { Toaster } from 'sonner';

/**
 * Componente App - Orquestador multi-paso del Universal File Converter.
 *
 * Gestiona dos piezas de estado:
 * - `currentStep`: que paso del wizard se muestra (0, 1, o 2)
 * - `uploadResult`: metadata del archivo subido (null si no hay archivo)
 *
 * @returns {JSX.Element} Layout completo con fondo animado, indicador de
 *   pasos, y el paso activo dentro de una tarjeta glassmorphism.
 */
export default function App() {
  /**
   * --- Estado: paso actual ---
   * Controla que componente se renderiza:
   *   0 = UploadStep (subir archivo)
   *   1 = ConvertStep (seleccionar formato y convertir)
   *   2 = DownloadStep (descargar resultado)
   *
   * Usamos un numero en vez de un string (como 'upload') porque los
   * numeros facilitan la logica del StepIndicator (comparar si un
   * paso es anterior, actual, o siguiente con <, ===, >).
   */
  const [currentStep, setCurrentStep] = useState(0);

  /**
   * --- Estado: resultado del upload ---
   * Contiene la metadata que devuelve el backend despues de subir un archivo.
   * Estructura esperada:
   * {
   *   job_id: "abc-123-def",     // UUID unico del trabajo
   *   filename: "foto.png",      // Nombre original del archivo
   *   mime_type: "image/png",    // Tipo MIME detectado por el backend
   *   size: 153600               // Tamano en bytes
   * }
   *
   * Este objeto se pasa como prop a ConvertStep (para saber que formatos
   * de salida ofrecer) y a DownloadStep (para construir la URL de descarga).
   */
  const [uploadResult, setUploadResult] = useState(null);

  /**
   * --- Callback: upload completado ---
   * Se llama cuando UploadStep termina de subir un archivo exitosamente.
   * Guarda la metadata y avanza al paso de conversion.
   *
   * useCallback([fn], []) con array vacio de dependencias significa que
   * esta funcion se crea UNA sola vez y nunca cambia. Esto es seguro
   * porque usamos la forma funcional de setState (no leemos el estado
   * actual directamente dentro del callback).
   *
   * @param {Object} result - Metadata del archivo subido (job_id, filename, etc.)
   */
  const handleUploadComplete = useCallback((result) => {
    setUploadResult(result);
    setCurrentStep(1);
  }, []);

  /**
   * --- Callback: conversion completada ---
   * Se llama cuando ConvertStep termina de convertir el archivo.
   * Solo necesita avanzar al paso de descarga; el uploadResult ya
   * contiene toda la info necesaria para descargar.
   */
  const handleConvertComplete = useCallback(() => {
    setCurrentStep(2);
  }, []);

  /**
   * --- Callback: reiniciar flujo ---
   * Se llama cuando el usuario quiere convertir otro archivo.
   * Limpia el estado y regresa al paso inicial.
   *
   * Es importante limpiar uploadResult (ponerlo en null) para liberar
   * la referencia al trabajo anterior. El backend limpia los archivos
   * de S3 automaticamente con un cron job, pero en el frontend
   * queremos un estado limpio para evitar bugs.
   */
  const handleReset = useCallback(() => {
    setCurrentStep(0);
    setUploadResult(null);
  }, []);

  return (
    /**
     * --- Fragment (<> ... </>) ---
     * Usamos un Fragment porque necesitamos retornar multiples elementos
     * de nivel superior (AnimatedBackground, Toaster, div principal)
     * sin agregar un div wrapper extra al DOM. Los Fragments son
     * invisibles en el DOM — no generan ningun elemento HTML.
     */
    <>
      {/**
       * --- Fondo animado ---
       * Se renderiza detras de todo el contenido. Usa position: fixed
       * y z-index negativo para quedarse atras sin interferir con
       * la interaccion del usuario.
       */}
      <AnimatedBackground />

      {/**
       * --- Sistema de notificaciones (Toast) ---
       * Toaster de Sonner renderiza un "portal" invisible que escucha
       * llamadas a toast() desde cualquier parte de la aplicacion.
       * Cuando algun componente llama a toast.success("Listo!") o
       * toast.error("Fallo"), Toaster muestra el mensaje en la posicion
       * configurada (top-center).
       *
       * Los estilos personalizados crean un efecto "glassmorphism" en
       * las notificaciones, coherente con el diseno general de la app:
       * - background semi-transparente (rgba con 80% opacidad)
       * - backdrop-filter blur para difuminar lo que hay detras
       * - borde sutil semi-transparente
       * - color de texto que combina con el tema
       */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#4A5B6E',
          },
        }}
      />

      {/**
       * --- Contenedor principal ---
       * min-h-screen: ocupa al menos toda la altura de la ventana
       * flex flex-col items-center justify-center: centra el contenido
       *   tanto horizontal como verticalmente usando Flexbox
       * px-4 py-12: padding para que no se pegue a los bordes en mobile
       */}
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">

        {/**
         * --- Encabezado animado ---
         * motion.div es un div normal con superpoderes de animacion.
         * `initial` define el estado ANTES de que el componente aparezca.
         * `animate` define el estado FINAL (al que se anima).
         *
         * En este caso: el titulo aparece desde arriba (y: -20 → 0)
         * con un fade in (opacity: 0 → 1), tardando 0.6 segundos.
         * ease: 'easeOut' significa que la animacion desacelera al final,
         * lo que se siente mas natural que una velocidad constante.
         */}
        <motion.div
          className="text-center mb-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/**
           * --- Titulo con animacion de hover ---
           * whileHover: el titulo crece ligeramente (scale: 1.02) cuando
           * el usuario pasa el mouse encima. Es un detalle sutil que
           * hace la UI mas "viva".
           *
           * type: 'spring' usa animacion con fisica de resorte, que se
           * siente mas natural que una curva bezier. stiffness y damping
           * controlan que tan "rebotoso" es el efecto:
           * - stiffness alta (400) = movimiento rapido
           * - damping alto (20) = poco rebote
           *
           * fontFamily: var(--font-display) usa la fuente Instrument Serif
           * definida en nuestro CSS, dando al titulo un aspecto elegante
           * y distinguido del texto normal (que usa Inter).
           */}
          <motion.h1
            className="text-4xl font-bold text-deep-navy tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            Universal File Converter
          </motion.h1>

          {/**
           * --- Subtitulo con delay ---
           * El subtitulo aparece 0.3 segundos DESPUES del titulo.
           * Este efecto escalonado (staggering) crea una sensacion de
           * "revelacion progresiva" que guia la atencion del usuario.
           * text-deep-navy/50 aplica 50% de opacidad al color, haciendo
           * el subtitulo menos prominente que el titulo (jerarquia visual).
           */}
          <motion.p
            className="mt-2 text-deep-navy/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Convert images and documents in seconds
          </motion.p>
        </motion.div>

        {/**
         * --- Indicador de pasos ---
         * Muestra visualmente en que paso del proceso estamos.
         * Recibe el paso actual para resaltar el paso correcto y
         * marcar los pasos completados.
         */}
        <StepIndicator currentStep={currentStep} />

        {/**
         * --- Tarjeta principal (glassmorphism) ---
         * La clase `glass` aplica el efecto de cristal esmerilado
         * (definido en nuestro CSS global con backdrop-filter blur).
         * rounded-2xl: bordes muy redondeados (16px)
         * p-8: padding interior de 32px
         * max-w-lg: ancho maximo de 512px para mantener legibilidad
         *
         * La animacion de entrada hace que la tarjeta aparezca con
         * un efecto de "zoom in" sutil (scale: 0.95 → 1) con un
         * delay de 0.2s para que aparezca despues del header.
         * type: 'spring' da un efecto de rebote suave al aparecer.
         */}
        <motion.div
          className="glass rounded-2xl p-8 w-full max-w-lg"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/**
           * --- AnimatePresence: transiciones entre pasos ---
           * AnimatePresence detecta cuando un componente hijo se monta
           * o desmonta y le aplica animaciones de entrada/salida.
           *
           * mode="wait" es CRUCIAL: le dice a Framer Motion que espere
           * a que el componente saliente termine su animacion de salida
           * ANTES de montar el componente entrante. Sin esto, ambos
           * componentes estarian visibles al mismo tiempo durante la
           * transicion, causando un layout roto.
           *
           * Cada hijo debe tener un `key` unico para que AnimatePresence
           * sepa cuando un componente "salio" y otro "entro". Por eso
           * usamos key="upload", key="convert", key="download".
           */}
          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <UploadStep key="upload" onUploadComplete={handleUploadComplete} />
            )}
            {currentStep === 1 && uploadResult && (
              <ConvertStep
                key="convert"
                uploadResult={uploadResult}
                onConvertComplete={handleConvertComplete}
              />
            )}
            {currentStep === 2 && uploadResult && (
              <DownloadStep
                key="download"
                uploadResult={uploadResult}
                onReset={handleReset}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
