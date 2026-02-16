# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rediseñar el frontend del Universal File Converter con un estilo minimalista sobreanimado, glassmorphism, gradientes pastel café/azul, y flujo multi-step con Framer Motion.

**Architecture:** Reescribir los 3 componentes existentes (App, FileUploader, ConversionPanel) en 8+ componentes nuevos con un flujo multi-step (Upload → Convert → Download). Cada paso tiene transiciones animadas con AnimatePresence de Framer Motion. El fondo usa blobs CSS animados con glassmorphism. La capa API (`api/client.js`) no cambia.

**Tech Stack:** React 19, Framer Motion, Tailwind CSS 4, shadcn/ui, Lucide React icons

**Design Doc:** `docs/plans/2026-02-16-frontend-redesign-design.md`

---

## Task 1: Foundation — Dependencies & shadcn Init

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/components.json` (via shadcn init)
- Modify: `frontend/src/index.css`

**Step 1: Install Framer Motion and Lucide React**

```bash
cd frontend && npm install framer-motion lucide-react
```

**Step 2: Initialize shadcn/ui**

```bash
cd frontend && npx shadcn@latest init
```

Select these options during init:
- Style: Default
- Base color: Slate
- CSS variables: Yes

This creates `components.json` and sets up `src/lib/utils.ts` (rename to `.js` since no TypeScript).

**Step 3: Install shadcn components**

```bash
cd frontend && npx shadcn@latest add button card badge progress sonner tooltip separator
```

**Step 4: Verify build compiles**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/components.json frontend/src/components/ui/ frontend/src/lib/
git commit -m "feat: add framer-motion, lucide-react, and shadcn/ui components"
```

---

## Task 2: Theme — Custom Color Palette & Blob Animations

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Add CSS custom properties for the pastel palette and blob keyframes**

Replace all of `frontend/src/index.css` with:

```css
@import "tailwindcss";

/*
 * ============================================================================
 * Tema personalizado — Paleta pastel café/azul
 * ============================================================================
 *
 * Definimos colores como CSS custom properties para usarlos tanto en Tailwind
 * (via @theme) como en CSS vanilla (para los blobs animados).
 *
 * La paleta combina tonos cálidos (sand, mocha, latte) con tonos fríos
 * (dusty-blue, slate-blue, deep-navy) para crear una sensación premium
 * y acogedora. Todos los colores son de baja saturación (pastel).
 */

@theme {
  /* --- Colores principales de la paleta --- */
  --color-sand: #E8DDD3;
  --color-warm-cream: #F5F0EB;
  --color-dusty-blue: #B8C5D6;
  --color-slate-blue: #8DA4BF;
  --color-deep-navy: #4A5B6E;
  --color-mocha: #A68B7B;
  --color-latte: #C4AD9D;
  --color-soft-rose: #D4B5B0;
  --color-sage: #A8BBA8;

  /* --- Variantes claras para fondos y bordes sutiles --- */
  --color-dusty-blue-light: #D4DEE9;
  --color-mocha-light: #C4B5A8;
  --color-sage-light: #C5D6C5;

  /* --- Fuente por defecto --- */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

/*
 * ============================================================================
 * Animaciones de los Blobs del fondo
 * ============================================================================
 *
 * Cada blob tiene su propia trayectoria (translate) y deformación
 * (border-radius) para que el movimiento se vea orgánico, no mecánico.
 * Los timings son largos (20-30s) y usan ease-in-out para suavidad.
 *
 * --- ¿Por qué CSS puro y no Framer Motion para los blobs? ---
 * Las animaciones del fondo corren infinitamente y no necesitan interacción.
 * CSS @keyframes se ejecuta en el compositor del navegador (GPU), lo cual
 * es mucho más eficiente que JavaScript. Framer Motion lo reservamos para
 * animaciones interactivas que responden a eventos del usuario.
 */

@keyframes blob-1 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    border-radius: 40% 60% 60% 40% / 60% 30% 70% 40%;
  }
  25% {
    transform: translate(80px, -60px) scale(1.1);
    border-radius: 50% 50% 40% 60% / 40% 60% 50% 50%;
  }
  50% {
    transform: translate(-40px, 80px) scale(0.95);
    border-radius: 60% 40% 50% 50% / 50% 50% 60% 40%;
  }
  75% {
    transform: translate(60px, 40px) scale(1.05);
    border-radius: 40% 60% 40% 60% / 60% 40% 60% 40%;
  }
}

@keyframes blob-2 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    border-radius: 60% 40% 40% 60% / 40% 60% 40% 60%;
  }
  33% {
    transform: translate(-70px, 50px) scale(1.08);
    border-radius: 50% 50% 60% 40% / 50% 40% 60% 50%;
  }
  66% {
    transform: translate(50px, -80px) scale(0.92);
    border-radius: 40% 60% 50% 50% / 60% 50% 40% 50%;
  }
}

@keyframes blob-3 {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%;
  }
  20% {
    transform: translate(60px, 70px) scale(1.12);
    border-radius: 60% 40% 60% 40% / 40% 60% 40% 60%;
  }
  40% {
    transform: translate(-50px, -30px) scale(0.9);
    border-radius: 40% 60% 40% 60% / 60% 40% 60% 40%;
  }
  60% {
    transform: translate(30px, -60px) scale(1.05);
    border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%;
  }
  80% {
    transform: translate(-40px, 40px) scale(0.97);
    border-radius: 60% 40% 50% 50% / 40% 60% 50% 50%;
  }
}

/*
 * ============================================================================
 * Animación del shimmer (brillo que recorre botones)
 * ============================================================================
 *
 * Crea un efecto de "luz que se desliza" sobre los botones principales.
 * Usa un gradiente translúcido que se mueve de izquierda a derecha.
 */

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/*
 * ============================================================================
 * Animación del borde que "respira" en el DropZone
 * ============================================================================
 */

@keyframes breathe {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.008);
  }
}

/*
 * ============================================================================
 * Animación de ondas (water ripple) al soltar archivo
 * ============================================================================
 */

@keyframes ripple-wave {
  0% {
    transform: scale(0);
    opacity: 0.6;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

/*
 * ============================================================================
 * Partículas de celebración en el paso de descarga
 * ============================================================================
 */

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(300px) rotate(720deg);
    opacity: 0;
  }
}

/*
 * ============================================================================
 * Pulso magnético del botón de descarga
 * ============================================================================
 */

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(168, 187, 168, 0.4);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(168, 187, 168, 0);
  }
}

/*
 * ============================================================================
 * Rotación del borde gradiente (para cards seleccionadas)
 * ============================================================================
 */

@keyframes rotate-gradient {
  0% {
    --gradient-angle: 0deg;
  }
  100% {
    --gradient-angle: 360deg;
  }
}

/*
 * ============================================================================
 * Estilos base del body
 * ============================================================================
 */

body {
  background: linear-gradient(135deg, #E8DDD3 0%, #D4DEE9 50%, #E8DDD3 100%);
  min-height: 100vh;
  overflow-x: hidden;
  color: #4A5B6E;
}

/*
 * ============================================================================
 * Clase utilitaria: glassmorphism
 * ============================================================================
 *
 * Efecto "vidrio esmerilado" que se popularizó con iOS y macOS.
 * Combina:
 * - Fondo semi-transparente (rgba)
 * - Blur del fondo (backdrop-filter)
 * - Borde semi-transparente para definir bordes
 * - Sombra con color de la paleta para profundidad
 *
 * Se aplica a las cards principales de la aplicación.
 */

.glass {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 8px 32px rgba(168, 139, 123, 0.1);
}

/*
 * Clase utilitaria: shimmer en botones
 * Agrega el efecto de brillo que recorre el elemento.
 */

.shimmer {
  position: relative;
  overflow: hidden;
}

.shimmer::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.25) 50%,
    transparent 100%
  );
  animation: shimmer 2.5s ease-in-out infinite;
}
```

**Step 2: Verify build compiles with new theme**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add custom pastel theme, glassmorphism, and CSS animations"
```

---

## Task 3: AnimatedBackground Component

**Files:**
- Create: `frontend/src/components/AnimatedBackground.jsx`

**Step 1: Create the animated blobs background**

```jsx
/**
 * ============================================================================
 * AnimatedBackground.jsx — Fondo animado con blobs orgánicos
 * ============================================================================
 *
 * Este componente renderiza formas orgánicas (blobs) que flotan lentamente
 * en el fondo de la aplicación. Usa CSS puro para las animaciones porque:
 * 1. Son infinitas y no responden a interacción del usuario
 * 2. CSS animations corren en el compositor del GPU (más eficiente)
 * 3. No necesitan React re-renders para animar
 *
 * Los blobs son div's con border-radius orgánico y colores de la paleta
 * pastel. Están posicionados con `fixed` para que no afecten el scroll
 * y `z-[-1]` para que queden detrás de todo el contenido.
 *
 * --- ¿Por qué filter: blur(80px)? ---
 * Un blur muy alto difumina los bordes de los blobs, creando un efecto
 * de "ambiente" o "atmósfera" en lugar de formas definidas. Esto es
 * la base del efecto glassmorphism: contenido borroso detrás de
 * paneles semi-transparentes.
 *
 * @module components/AnimatedBackground
 */

export default function AnimatedBackground() {
  return (
    /**
     * Contenedor fijo que cubre toda la pantalla.
     * `pointer-events-none` evita que los blobs intercepten clicks.
     * `overflow-hidden` oculta partes de blobs que se salen de la pantalla.
     */
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
      {/*
        Blob 1 — Mocha (cálido)
        Posicionado arriba-izquierda, se mueve en trayectoria diagonal.
        Tamaño: 500px (grande para que el blur lo difumine bien).
      */}
      <div
        className="absolute w-[500px] h-[500px] bg-mocha/30 top-[-10%] left-[-5%]"
        style={{
          filter: 'blur(80px)',
          animation: 'blob-1 25s ease-in-out infinite',
        }}
      />

      {/*
        Blob 2 — Dusty Blue (frío)
        Posicionado arriba-derecha, contrapeso visual del blob 1.
        Ligeramente más pequeño y más rápido.
      */}
      <div
        className="absolute w-[400px] h-[400px] bg-dusty-blue/35 top-[10%] right-[-10%]"
        style={{
          filter: 'blur(80px)',
          animation: 'blob-2 20s ease-in-out infinite',
        }}
      />

      {/*
        Blob 3 — Latte (intermedio)
        Posicionado centro-abajo. Es el más grande y lento,
        da un "colchón" de color cálido en la parte inferior.
      */}
      <div
        className="absolute w-[600px] h-[600px] bg-latte/25 bottom-[-15%] left-[20%]"
        style={{
          filter: 'blur(100px)',
          animation: 'blob-3 30s ease-in-out infinite',
        }}
      />

      {/*
        Blob 4 — Dusty Blue Light (acento sutil)
        Posicionado centro-izquierda. Más pequeño y sutil,
        agrega variación sin dominar la composición.
      */}
      <div
        className="absolute w-[350px] h-[350px] bg-dusty-blue-light/20 top-[50%] left-[-5%]"
        style={{
          filter: 'blur(70px)',
          animation: 'blob-2 22s ease-in-out infinite reverse',
        }}
      />
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/AnimatedBackground.jsx
git commit -m "feat: add animated background with floating pastel blobs"
```

---

## Task 4: StepIndicator Component

**Files:**
- Create: `frontend/src/components/StepIndicator.jsx`

**Step 1: Create the animated step indicator**

```jsx
/**
 * ============================================================================
 * StepIndicator.jsx — Indicador visual de progreso multi-step
 * ============================================================================
 *
 * Muestra tres pasos (Upload, Convert, Download) con una línea de progreso
 * animada entre ellos. El paso actual se resalta con un gradiente animado
 * y los pasos completados muestran un check.
 *
 * --- Animaciones ---
 * - Los círculos de cada paso escalan con spring al activarse
 * - La línea de progreso entre pasos se llena con un gradiente animado
 * - Los labels aparecen con fade-in
 * - El paso activo tiene un anillo de pulso sutil (pulse-glow)
 *
 * @module components/StepIndicator
 */

import { motion } from 'framer-motion';
import { Upload, ArrowRightLeft, Download, Check } from 'lucide-react';

/**
 * Configuración de los tres pasos del flujo.
 * Cada paso tiene un label para el usuario y un icono de Lucide.
 */
const STEPS = [
  { label: 'Upload', icon: Upload },
  { label: 'Convert', icon: ArrowRightLeft },
  { label: 'Download', icon: Download },
];

/**
 * @param {Object} props
 * @param {number} props.currentStep — Paso actual (0, 1, o 2)
 */
export default function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-md mx-auto my-8">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const Icon = step.icon;

        return (
          <div key={step.label} className="flex items-center">
            {/* --- Círculo del paso --- */}
            <div className="flex flex-col items-center">
              <motion.div
                className={`
                  relative w-12 h-12 rounded-full flex items-center justify-center
                  transition-colors duration-500
                  ${isCompleted
                    ? 'bg-sage text-white'
                    : isActive
                      ? 'bg-gradient-to-br from-dusty-blue to-slate-blue text-white'
                      : 'bg-white/50 text-deep-navy/40 border border-white/40'
                  }
                `}
                initial={false}
                animate={{
                  scale: isActive ? 1 : 0.9,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={isActive ? { animation: 'pulse-glow 2s ease-in-out infinite' } : {}}
              >
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  >
                    <Check size={20} strokeWidth={3} />
                  </motion.div>
                ) : (
                  <Icon size={20} />
                )}
              </motion.div>

              {/* --- Label debajo del círculo --- */}
              <motion.span
                className={`
                  mt-2 text-xs font-medium
                  ${isActive ? 'text-deep-navy' : 'text-deep-navy/40'}
                `}
                animate={{ opacity: isActive || isCompleted ? 1 : 0.4 }}
              >
                {step.label}
              </motion.span>
            </div>

            {/* --- Línea de conexión entre pasos (no después del último) --- */}
            {index < STEPS.length - 1 && (
              <div className="w-16 h-[2px] bg-white/30 mx-2 rounded-full overflow-hidden relative">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-dusty-blue to-sage rounded-full"
                  initial={{ width: '0%' }}
                  animate={{
                    width: index < currentStep ? '100%' : '0%',
                  }}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/StepIndicator.jsx
git commit -m "feat: add animated StepIndicator with spring transitions"
```

---

## Task 5: DropZone Component

**Files:**
- Create: `frontend/src/components/DropZone.jsx`

**Step 1: Create the animated drop zone**

This is the most animation-heavy component. Key animations:
- Breathing border (CSS `breathe` keyframe)
- Gradient border on hover (conic-gradient trick)
- Water ripple on file drop
- Icon morphs from upload cloud to check

```jsx
/**
 * ============================================================================
 * DropZone.jsx — Zona de arrastrar y soltar con animaciones avanzadas
 * ============================================================================
 *
 * Componente de drag & drop que extiende react-dropzone con animaciones:
 * - Borde que "respira" (scale sutil en loop) en estado idle
 * - Borde gradiente rotativo al hacer hover
 * - Expansión suave al arrastrar un archivo encima
 * - Efecto "water ripple" al soltar el archivo
 * - Icono que se transforma de upload → check con animación
 *
 * --- Separación de responsabilidades ---
 * DropZone SOLO maneja la UI/animaciones del drag & drop.
 * La lógica de upload (API calls, progress) vive en UploadStep.
 * Esto permite reusar DropZone o cambiar la lógica de upload
 * sin tocar las animaciones.
 *
 * @module components/DropZone
 */

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudUpload, Check, FileUp } from 'lucide-react';

/**
 * Tipos MIME aceptados — misma lista que el backend.
 * Definido fuera del componente para evitar recreación en cada render.
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
 * @param {Object} props
 * @param {Function} props.onFileDrop — Callback cuando el usuario suelta un archivo válido.
 *   Recibe el objeto File del navegador.
 * @param {boolean} props.disabled — Deshabilita la interacción (durante upload).
 * @param {boolean} props.uploadComplete — Muestra estado de "completado" con check.
 */
export default function DropZone({ onFileDrop, disabled = false, uploadComplete = false }) {
  /**
   * showRipple controla la animación de ondas que aparece al soltar un archivo.
   * Se activa por 800ms y luego se desactiva automáticamente.
   */
  const [showRipple, setShowRipple] = useState(false);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    /* Dispara la animación de ripple */
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 800);

    onFileDrop(acceptedFiles[0]);
  }, [onFileDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false,
    disabled,
  });

  return (
    <motion.div
      {...getRootProps()}
      className={`
        relative rounded-2xl p-16 text-center cursor-pointer
        transition-all duration-300 overflow-hidden
        ${disabled ? 'pointer-events-none opacity-60' : ''}
        ${isDragActive
          ? 'bg-dusty-blue/10 border-2 border-dusty-blue'
          : 'glass border-2 border-dashed border-mocha-light/40 hover:border-mocha/60'
        }
      `}
      animate={{
        scale: isDragActive ? 1.02 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={!isDragActive && !disabled ? { animation: 'breathe 4s ease-in-out infinite' } : {}}
    >
      <input {...getInputProps()} />

      {/* --- Ripple effect al soltar archivo --- */}
      <AnimatePresence>
        {showRipple && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute top-1/2 left-1/2 w-20 h-20 rounded-full border-2 border-dusty-blue/40"
                initial={{ scale: 0, opacity: 0.6, x: '-50%', y: '-50%' }}
                animate={{ scale: 4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, delay: i * 0.15, ease: 'easeOut' }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* --- Contenido central: icono + texto --- */}
      <AnimatePresence mode="wait">
        {uploadComplete ? (
          <motion.div
            key="complete"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-sage/20 flex items-center justify-center mb-4">
              <Check className="text-sage" size={32} strokeWidth={3} />
            </div>
            <p className="text-lg font-medium text-sage">File uploaded!</p>
          </motion.div>
        ) : isDragActive ? (
          <motion.div
            key="drag"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="flex flex-col items-center"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <FileUp className="text-dusty-blue mb-4" size={48} />
            </motion.div>
            <p className="text-lg font-medium text-slate-blue">Drop it here...</p>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center"
          >
            <motion.div
              whileHover={{ y: -4, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <CloudUpload className="text-mocha/60 mb-4" size={48} />
            </motion.div>
            <p className="text-lg font-medium text-deep-navy/70">
              Drag & drop your file here
            </p>
            <p className="mt-1 text-sm text-deep-navy/40">
              or <span className="text-dusty-blue underline underline-offset-2">browse files</span>
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {['PNG', 'JPEG', 'WebP', 'PDF', 'DOCX', 'MD'].map((fmt) => (
                <motion.span
                  key={fmt}
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-white/50 text-deep-navy/50 border border-white/40"
                >
                  {fmt}
                </motion.span>
              ))}
            </div>
            <p className="mt-3 text-xs text-deep-navy/30">Max 50 MB</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/DropZone.jsx
git commit -m "feat: add DropZone with breathing border, ripple, and icon morph"
```

---

## Task 6: UploadStep Component

**Files:**
- Create: `frontend/src/components/UploadStep.jsx`

**Step 1: Create the upload step that wraps DropZone with progress logic**

```jsx
/**
 * ============================================================================
 * UploadStep.jsx — Paso 1: Subida de archivos
 * ============================================================================
 *
 * Orquesta la lógica de upload: maneja el estado de progreso, errores,
 * y la comunicación con el API. Delega la UI del drag & drop a DropZone.
 *
 * --- ¿Por qué separar UploadStep de DropZone? ---
 * DropZone es un componente puramente visual (animaciones + drag events).
 * UploadStep contiene la lógica de negocio (API calls, state management).
 * Esto sigue el patrón "presentational vs container components" que
 * facilita el mantenimiento y testing.
 *
 * --- Animación de la barra de progreso ---
 * Usa Framer Motion `layout` para animar el cambio de ancho suavemente.
 * El contenedor de progreso aparece con un slide-down cuando inicia el upload
 * y desaparece con fade-out al completar.
 *
 * @module components/UploadStep
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DropZone from './DropZone';
import { uploadFile } from '../api/client';

/**
 * @param {Object} props
 * @param {Function} props.onUploadComplete — Se llama con el resultado del upload
 *   ({ job_id, filename, mime_type, size }) cuando termina exitosamente.
 */
export default function UploadStep({ onUploadComplete }) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Maneja cuando el usuario suelta un archivo en el DropZone.
   * Inicia el upload al backend con seguimiento de progreso.
   */
  const handleFileDrop = useCallback(async (file) => {
    setUploading(true);
    setError(null);
    setProgress(0);
    setUploadDone(false);

    try {
      const result = await uploadFile(file, setProgress);

      /* Mostramos el estado "completado" brevemente antes de avanzar */
      setUploadDone(true);

      /* Esperamos 1s para que el usuario vea la animación de éxito */
      setTimeout(() => {
        onUploadComplete(result);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Please try again.');
      setUploading(false);
    }
  }, [onUploadComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <DropZone
        onFileDrop={handleFileDrop}
        disabled={uploading}
        uploadComplete={uploadDone}
      />

      {/* --- Barra de progreso animada --- */}
      <AnimatePresence>
        {uploading && !uploadDone && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-deep-navy/70">
                  Uploading...
                </span>
                <motion.span
                  className="text-sm font-bold text-slate-blue"
                  key={progress}
                  initial={{ scale: 1.3, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {progress}%
                </motion.span>
              </div>
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

      {/* --- Mensaje de error --- */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 text-sm text-soft-rose text-center font-medium"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/UploadStep.jsx
git commit -m "feat: add UploadStep with animated progress bar"
```

---

## Task 7: FormatCard Component

**Files:**
- Create: `frontend/src/components/FormatCard.jsx`

**Step 1: Create the interactive format card with 3D tilt and ripple**

```jsx
/**
 * ============================================================================
 * FormatCard.jsx — Card interactiva para selección de formato
 * ============================================================================
 *
 * Cada formato de conversión se presenta como una card con animaciones:
 * - Tilt 3D basado en la posición del mouse (perspective + rotateX/Y)
 * - Ripple desde el punto de click
 * - Scale bounce al seleccionar
 * - Borde gradiente animado cuando está seleccionada
 *
 * --- ¿Cómo funciona el tilt 3D? ---
 * Al mover el mouse sobre la card, calculamos qué tan lejos está el cursor
 * del centro. Esa distancia se convierte en grados de rotación en X e Y.
 * Con `perspective(800px)` creamos el efecto de profundidad 3D.
 * El resultado: la card parece "seguir" al mouse como una superficie real.
 *
 * @module components/FormatCard
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * @param {Object} props
 * @param {string} props.label — Nombre del formato (ej: "JPEG", "PDF")
 * @param {string} props.value — Valor técnico (ej: "image/jpeg", "compress")
 * @param {string} props.description — Descripción breve de la conversión
 * @param {React.ReactNode} props.icon — Icono de Lucide para el formato
 * @param {boolean} props.selected — Si esta card está seleccionada
 * @param {Function} props.onSelect — Callback al hacer click
 */
export default function FormatCard({ label, value, description, icon: Icon, selected, onSelect }) {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [ripple, setRipple] = useState(null);

  /**
   * Calcula los ángulos de tilt basándose en la posición del mouse
   * relativa al centro de la card.
   *
   * --- Matemáticas del tilt ---
   * 1. Obtenemos las coordenadas del mouse relativas a la card (offsetX, offsetY)
   * 2. Normalizamos a rango [-0.5, 0.5] dividiendo por dimensiones
   * 3. Multiplicamos por maxTilt (8°) para obtener grados de rotación
   * 4. Invertimos Y porque CSS rotateX positivo rota "hacia atrás"
   */
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const maxTilt = 8;
    setTilt({ x: y * -maxTilt, y: x * maxTilt });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  /**
   * Al hacer click: activa el ripple desde el punto de click y selecciona la card.
   */
  const handleClick = (e) => {
    const rect = cardRef.current.getBoundingClientRect();
    setRipple({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      key: Date.now(),
    });
    onSelect(value);
  };

  return (
    <motion.button
      ref={cardRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`
        relative overflow-hidden rounded-xl p-5 text-left w-full
        transition-shadow duration-300 cursor-pointer
        ${selected
          ? 'glass border-2 border-dusty-blue shadow-lg shadow-dusty-blue/20'
          : 'glass border border-transparent hover:shadow-md hover:shadow-mocha/10'
        }
      `}
      style={{
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
      whileTap={{ scale: 0.97 }}
    >
      {/* --- Ripple desde el punto de click --- */}
      {ripple && (
        <motion.span
          key={ripple.key}
          className="absolute bg-dusty-blue/20 rounded-full pointer-events-none"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
          }}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 15, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          onAnimationComplete={() => setRipple(null)}
        />
      )}

      {/* --- Contenido de la card --- */}
      <div className="relative z-10 flex items-start gap-3">
        <div className={`
          p-2 rounded-lg
          ${selected ? 'bg-dusty-blue/20 text-slate-blue' : 'bg-white/40 text-deep-navy/50'}
          transition-colors duration-300
        `}>
          {Icon && <Icon size={20} />}
        </div>
        <div>
          <p className={`
            font-semibold text-sm
            ${selected ? 'text-slate-blue' : 'text-deep-navy/70'}
            transition-colors duration-300
          `}>
            {label}
          </p>
          {description && (
            <p className="text-xs text-deep-navy/40 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* --- Indicador de selección --- */}
      {selected && (
        <motion.div
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-dusty-blue flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      )}
    </motion.button>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/FormatCard.jsx
git commit -m "feat: add FormatCard with 3D tilt, ripple, and selection glow"
```

---

## Task 8: ConvertStep Component

**Files:**
- Create: `frontend/src/components/ConvertStep.jsx`

**Step 1: Create the conversion step with format grid and conversion animation**

```jsx
/**
 * ============================================================================
 * ConvertStep.jsx — Paso 2: Selección de formato y conversión
 * ============================================================================
 *
 * Muestra una grilla de FormatCards basada en el tipo MIME del archivo subido.
 * El usuario selecciona un formato, hace click en "Convert", y el componente
 * llama al API para realizar la conversión.
 *
 * --- Animaciones ---
 * - FormatCards aparecen con stagger delay (0.1s entre cada una)
 * - Botón de conversión tiene shimmer effect
 * - Al convertir: botón se transforma en un spinner circular
 * - Al completar: spinner se convierte en check con bounce
 *
 * @module components/ConvertStep
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileImage, FileText, FileType, FileDown,
  Minimize2, ShieldOff, Loader2, Check
} from 'lucide-react';
import FormatCard from './FormatCard';
import { convertFile } from '../api/client';

/**
 * Mapa de opciones de conversión por tipo MIME de origen.
 * Cada opción incluye label, value, descripción para la card, e ícono.
 * Esta estructura permite renderizar FormatCards ricas sin lógica en el JSX.
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
 * Formatea el tipo MIME a un nombre amigable para mostrar al usuario.
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
 * @param {Object} props
 * @param {Object} props.uploadResult — Resultado del upload: { job_id, filename, mime_type, size }
 * @param {Function} props.onConvertComplete — Se llama cuando la conversión termina exitosamente
 */
export default function ConvertStep({ uploadResult, onConvertComplete }) {
  const [selectedFormat, setSelectedFormat] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [error, setError] = useState(null);

  const options = useMemo(
    () => CONVERSION_OPTIONS[uploadResult.mime_type] || [],
    [uploadResult.mime_type]
  );

  /**
   * Ejecuta la conversión en el backend.
   * Maneja los casos especiales (compress, strip_metadata) que requieren
   * enviar el MIME original como target + opciones adicionales.
   */
  const handleConvert = async () => {
    if (!selectedFormat) return;

    setConverting(true);
    setError(null);

    try {
      let targetFormat = selectedFormat;
      let opts = {};

      if (selectedFormat === 'compress') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'compress', quality: 70 };
      } else if (selectedFormat === 'strip_metadata') {
        targetFormat = uploadResult.mime_type;
        opts = { action: 'strip_metadata' };
      }

      await convertFile(uploadResult.job_id, targetFormat, opts);
      setConvertDone(true);

      /* Pausa breve para que el usuario vea la animación de éxito */
      setTimeout(() => {
        onConvertComplete();
      }, 800);
    } catch (err) {
      setError(err.response?.data?.detail || 'Conversion failed. Please try again.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      {/* --- Info del archivo subido --- */}
      <motion.div
        className="glass rounded-xl p-4 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dusty-blue/15">
            <FileType className="text-slate-blue" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-deep-navy text-sm truncate">
              {uploadResult.filename}
            </p>
            <p className="text-xs text-deep-navy/40">
              {mimeToLabel(uploadResult.mime_type)} · {(uploadResult.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      </motion.div>

      {/* --- Label de sección --- */}
      <motion.p
        className="text-sm font-medium text-deep-navy/50 mb-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Convert to:
      </motion.p>

      {/* --- Grid de FormatCards con stagger --- */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => (
          <motion.div
            key={opt.value}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 20,
              delay: 0.2 + i * 0.08,
            }}
          >
            <FormatCard
              label={opt.label}
              value={opt.value}
              description={opt.description}
              icon={opt.icon}
              selected={selectedFormat === opt.value}
              onSelect={setSelectedFormat}
            />
          </motion.div>
        ))}
      </div>

      {/* --- Botón de conversión --- */}
      <motion.div
        className="mt-6 flex justify-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <motion.button
          onClick={handleConvert}
          disabled={!selectedFormat || converting || convertDone}
          className={`
            relative px-8 py-3 rounded-xl font-semibold text-white
            transition-all duration-300 shimmer
            ${convertDone
              ? 'bg-sage'
              : selectedFormat
                ? 'bg-gradient-to-r from-dusty-blue to-slate-blue hover:shadow-lg hover:shadow-dusty-blue/30'
                : 'bg-deep-navy/20 cursor-not-allowed'
            }
            disabled:cursor-not-allowed
          `}
          whileTap={selectedFormat && !converting ? { scale: 0.95 } : {}}
        >
          <AnimatePresence mode="wait">
            {convertDone ? (
              <motion.span
                key="done"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2"
              >
                <Check size={18} /> Done!
              </motion.span>
            ) : converting ? (
              <motion.span
                key="converting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2"
              >
                <Loader2 size={18} className="animate-spin" /> Converting...
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Convert
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      {/* --- Error --- */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 text-sm text-soft-rose text-center font-medium"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/ConvertStep.jsx
git commit -m "feat: add ConvertStep with stagger grid and conversion animation"
```

---

## Task 9: DownloadStep Component

**Files:**
- Create: `frontend/src/components/DownloadStep.jsx`

**Step 1: Create the download step with celebration and magnetic button**

```jsx
/**
 * ============================================================================
 * DownloadStep.jsx — Paso 3: Descarga y celebración
 * ============================================================================
 *
 * Muestra una animación de celebración cuando la conversión se completa
 * y ofrece un botón de descarga con efecto magnético (se mueve hacia el cursor).
 *
 * --- Animaciones ---
 * - Partículas de confetti que caen en colores de la paleta
 * - Icono de check con entrada tipo "explosion" (scale desde 0)
 * - Botón de descarga con pulse-glow y efecto magnético
 * - Botón "Convert another" con entrada retrasada
 *
 * --- Efecto magnético ---
 * El botón de descarga se mueve ligeramente hacia la posición del cursor
 * cuando el mouse está cerca. Esto crea una sensación de "atracción"
 * que hace la interacción más satisfactoria.
 *
 * @module components/DownloadStep
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, RotateCcw, PartyPopper } from 'lucide-react';
import { getDownloadUrl } from '../api/client';

/**
 * Colores de la paleta para las partículas de confetti.
 */
const CONFETTI_COLORS = ['#B8C5D6', '#A68B7B', '#C4AD9D', '#A8BBA8', '#D4B5B0', '#8DA4BF'];

/**
 * Genera partículas de confetti con posiciones y delays aleatorios.
 * Se ejecuta una vez al montar el componente.
 */
function generateConfetti(count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,           // posición horizontal (%)
    delay: Math.random() * 0.8,        // delay de aparición
    duration: 1.5 + Math.random() * 1, // duración de caída
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 4 + Math.random() * 6,       // tamaño (px)
    rotation: Math.random() * 360,     // rotación inicial
  }));
}

/**
 * @param {Object} props
 * @param {Object} props.uploadResult — Resultado del upload: { job_id, filename }
 * @param {Function} props.onReset — Callback para volver al paso 1
 */
export default function DownloadStep({ uploadResult, onReset }) {
  const [confetti] = useState(() => generateConfetti());
  const btnRef = useRef(null);
  const [btnOffset, setBtnOffset] = useState({ x: 0, y: 0 });

  /**
   * Efecto magnético: calcula el desplazamiento del botón basado en
   * la distancia del cursor. Solo se activa si el cursor está cerca.
   */
  const handleMouseMove = useCallback((e) => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = e.clientX - centerX;
    const distY = e.clientY - centerY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    /* Solo atrae si el cursor está a menos de 150px */
    if (distance < 150) {
      const strength = (1 - distance / 150) * 12;
      setBtnOffset({
        x: (distX / distance) * strength,
        y: (distY / distance) * strength,
      });
    } else {
      setBtnOffset({ x: 0, y: 0 });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setBtnOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="text-center relative overflow-hidden py-8"
      onMouseLeave={handleMouseLeave}
    >
      {/* --- Confetti particles --- */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {confetti.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-sm"
            style={{
              left: `${particle.x}%`,
              top: -10,
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              rotate: particle.rotation,
            }}
            initial={{ y: -20, opacity: 0 }}
            animate={{
              y: 300,
              opacity: [0, 1, 1, 0],
              rotate: particle.rotation + 720,
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              ease: 'easeIn',
            }}
          />
        ))}
      </div>

      {/* --- Icono de éxito --- */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 12,
          delay: 0.2,
        }}
        className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-sage/20 mb-6"
      >
        <PartyPopper className="text-sage" size={36} />
      </motion.div>

      {/* --- Mensaje de éxito --- */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-2xl font-bold text-deep-navy mb-2"
      >
        Conversion Complete!
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-deep-navy/50 mb-8"
      >
        Your file is ready to download
      </motion.p>

      {/* --- Botón de descarga (magnético) --- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 20 }}
      >
        <motion.a
          ref={btnRef}
          href={getDownloadUrl(uploadResult.job_id)}
          download
          className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-sage to-dusty-blue hover:shadow-xl transition-shadow duration-300"
          style={{
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}
          animate={{
            x: btnOffset.x,
            y: btnOffset.y,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          whileTap={{ scale: 0.95 }}
        >
          <Download size={20} />
          Download File
        </motion.a>
      </motion.div>

      {/* --- Botón de reset --- */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={onReset}
        className="mt-6 inline-flex items-center gap-2 text-sm text-deep-navy/40 hover:text-deep-navy/70 transition-colors"
      >
        <RotateCcw size={14} />
        Convert another file
      </motion.button>
    </motion.div>
  );
}
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/components/DownloadStep.jsx
git commit -m "feat: add DownloadStep with confetti, magnetic button, and celebration"
```

---

## Task 10: Rewrite App.jsx as Multi-Step Orchestrator

**Files:**
- Modify: `frontend/src/App.jsx`

**Step 1: Replace App.jsx with the multi-step orchestrator**

Replace the entire content of `frontend/src/App.jsx` with:

```jsx
/**
 * ============================================================================
 * App.jsx — Orquestador multi-step del Universal File Converter
 * ============================================================================
 *
 * Este componente raíz gestiona el flujo de 3 pasos de la aplicación:
 *   Paso 0: Upload  — El usuario sube un archivo
 *   Paso 1: Convert — El usuario selecciona formato y convierte
 *   Paso 2: Download — El usuario descarga el archivo convertido
 *
 * --- Arquitectura multi-step ---
 * En lugar de mostrar todo en una sola vista, cada paso tiene su propio
 * componente que ocupa el área principal. Las transiciones entre pasos
 * usan AnimatePresence de Framer Motion para animar la salida del paso
 * actual y la entrada del siguiente.
 *
 * --- Estado compartido ---
 * `currentStep` controla qué paso se muestra (0, 1, o 2).
 * `uploadResult` almacena la metadata del archivo subido (se usa en pasos 1 y 2).
 * `handleReset` vuelve todo al estado inicial (paso 0).
 *
 * --- AnimatePresence mode="wait" ---
 * El mode="wait" le dice a Framer Motion: "espera a que el componente
 * que sale termine su animación de salida ANTES de montar el nuevo".
 * Esto evita que ambos pasos sean visibles simultáneamente.
 *
 * @module App
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedBackground from './components/AnimatedBackground';
import StepIndicator from './components/StepIndicator';
import UploadStep from './components/UploadStep';
import ConvertStep from './components/ConvertStep';
import DownloadStep from './components/DownloadStep';
import { Toaster } from 'sonner';

export default function App() {
  /**
   * --- Estado principal ---
   * currentStep: 0 = Upload, 1 = Convert, 2 = Download
   * uploadResult: null hasta que el upload sea exitoso, luego contiene
   *   { job_id, filename, mime_type, size }
   */
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);

  /**
   * Se ejecuta cuando el upload termina exitosamente.
   * Guarda el resultado y avanza al paso de conversión.
   */
  const handleUploadComplete = useCallback((result) => {
    setUploadResult(result);
    setCurrentStep(1);
  }, []);

  /**
   * Se ejecuta cuando la conversión termina exitosamente.
   * Avanza al paso de descarga.
   */
  const handleConvertComplete = useCallback(() => {
    setCurrentStep(2);
  }, []);

  /**
   * Resetea toda la aplicación al estado inicial.
   * El usuario puede subir un nuevo archivo desde cero.
   */
  const handleReset = useCallback(() => {
    setCurrentStep(0);
    setUploadResult(null);
  }, []);

  return (
    <>
      {/* Fondo animado con blobs — siempre visible, detrás de todo */}
      <AnimatedBackground />

      {/* Toast notifications (sonner) — posicionado globalmente */}
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

      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        {/* --- Header con glassmorphism --- */}
        <motion.div
          className="text-center mb-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <motion.h1
            className="text-4xl font-bold text-deep-navy tracking-tight"
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            Universal File Converter
          </motion.h1>
          <motion.p
            className="mt-2 text-deep-navy/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Convert images and documents in seconds
          </motion.p>
        </motion.div>

        {/* --- Step Indicator --- */}
        <StepIndicator currentStep={currentStep} />

        {/* --- Contenedor principal con glassmorphism --- */}
        <motion.div
          className="glass rounded-2xl p-8 w-full max-w-lg"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/*
            AnimatePresence mode="wait" asegura que las animaciones de salida
            terminen antes de montar el nuevo componente. Cada paso necesita
            una `key` única para que Framer Motion detecte el cambio.
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
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: rewrite App.jsx as multi-step orchestrator with AnimatePresence"
```

---

## Task 11: Cleanup and Final Integration

**Files:**
- Delete: `frontend/src/components/FileUploader.jsx`
- Delete: `frontend/src/components/ConversionPanel.jsx`
- Modify: `frontend/src/main.jsx` (if needed — verify imports)

**Step 1: Delete the old components**

```bash
rm frontend/src/components/FileUploader.jsx
rm frontend/src/components/ConversionPanel.jsx
```

**Step 2: Verify main.jsx doesn't import old components**

Read `frontend/src/main.jsx` — it should only import `App.jsx`, which is fine.

**Step 3: Full build verification**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

**Step 4: Dev server visual verification**

```bash
cd frontend && npm run dev
```

Verify in browser at `http://localhost:5173`:
1. Background blobs animate smoothly
2. Step indicator shows step 1 (Upload) as active
3. DropZone breathing animation works
4. Drag a file → ripple animation plays
5. Upload progress bar appears with percentage
6. Transition to step 2 (Convert) is animated
7. FormatCards appear with stagger
8. 3D tilt on FormatCards works
9. Convert button shimmer works
10. Transition to step 3 (Download)
11. Confetti animation plays
12. Download button has magnetic effect
13. "Convert another" resets to step 1

**Step 5: Commit cleanup**

```bash
git add -u frontend/src/components/FileUploader.jsx frontend/src/components/ConversionPanel.jsx
git commit -m "chore: remove old FileUploader and ConversionPanel components"
```

---

## Task 12: Polish — Micro-interactions and Responsiveness

**Files:**
- May modify any component for tweaks

**Step 1: Test on mobile viewport (Chrome DevTools)**

Verify:
- FormatCards grid collapses to 1 column on small screens
- Drop zone is usable on touch devices
- Text is readable, nothing overflows

**Step 2: Fix any visual issues found during testing**

(This step depends on what issues are found during manual testing)

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: frontend redesign complete — pastel glassmorphism with Framer Motion"
```

---

## Summary of New File Structure

```
frontend/src/
├── api/
│   └── client.js               ← UNCHANGED
├── components/
│   ├── ui/                     ← NEW (shadcn components)
│   │   ├── button.jsx
│   │   ├── card.jsx
│   │   ├── badge.jsx
│   │   ├── progress.jsx
│   │   ├── separator.jsx
│   │   └── tooltip.jsx
│   ├── AnimatedBackground.jsx  ← NEW
│   ├── StepIndicator.jsx       ← NEW
│   ├── DropZone.jsx            ← NEW
│   ├── UploadStep.jsx          ← NEW
│   ├── FormatCard.jsx          ← NEW
│   ├── ConvertStep.jsx         ← NEW
│   └── DownloadStep.jsx        ← NEW
├── lib/
│   └── utils.js                ← NEW (shadcn utility)
├── App.jsx                     ← REWRITTEN
├── main.jsx                    ← UNCHANGED
└── index.css                   ← REWRITTEN
```

## Dependencies Added

- `framer-motion` — Animation engine
- `lucide-react` — Icons
- shadcn/ui components (button, card, badge, progress, sonner, tooltip, separator)
