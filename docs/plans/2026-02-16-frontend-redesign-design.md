# Frontend Redesign — Universal File Converter

**Fecha:** 2026-02-16
**Estado:** Aprobado
**Objetivo:** Rediseñar el frontend con un estilo minimalista, sobreanimado, con gradientes pastel café/azul, glassmorphism, y flujo multi-step.

---

## 1. Paleta de Colores

| Token | Hex | Uso |
|-------|-----|-----|
| `sand` | `#E8DDD3` | Fondo principal |
| `warm-cream` | `#F5F0EB` | Fondo de cards |
| `dusty-blue` | `#B8C5D6` | Acciones primarias |
| `slate-blue` | `#8DA4BF` | Hover states |
| `deep-navy` | `#4A5B6E` | Texto principal |
| `mocha` | `#A68B7B` | Acentos secundarios |
| `latte` | `#C4AD9D` | Elementos decorativos |
| `soft-rose` | `#D4B5B0` | Estado de error |
| `sage` | `#A8BBA8` | Estado de éxito |

### Gradientes

- **Background:** `sand → dusty-blue` (diagonal sutil)
- **Cards:** glassmorphism `bg-white/40 + backdrop-blur-xl + border-white/30`
- **Botones primarios:** `dusty-blue → slate-blue` (shimmer animado)
- **Blobs decorativos:** `mocha ↔ dusty-blue ↔ latte` (loop lento ~25s)

---

## 2. Arquitectura de Componentes

```
App.jsx (orquestador de pasos + state management)
├── AnimatedBackground.jsx    — Blobs + gradientes flotantes (siempre visible)
├── StepIndicator.jsx         — Indicador de paso (1→2→3) con línea de progreso animada
├── Step 1: UploadStep.jsx    — Drag & drop con animaciones de splash/ondas
│   └── DropZone.jsx          — Zona de drop con borde que respira y efectos al soltar
├── Step 2: ConvertStep.jsx   — Selección de formato con cards interactivas
│   └── FormatCard.jsx        — Card por formato con tilt 3D, ripple, glow
├── Step 3: DownloadStep.jsx  — Celebración + botón de descarga magnético
└── Sonner                    — Toast notifications globales
```

### Flujo Multi-Step

1. **Upload** → archivo sube con progress bar → card se encoge y transiciona al paso 2
2. **Convert** → FormatCards aparecen con stagger → usuario selecciona → spinner creativo durante conversión
3. **Download** → partículas de celebración → botón pulsante → opción de "convertir otro" que regresa al paso 1

---

## 3. Sistema de Animaciones

### Motor: Framer Motion

Todas las animaciones usan spring physics para naturalidad.

### Background (CSS puro — performance)

- 3-4 blobs con `border-radius` orgánico
- Trayectorias circulares lentas (20-30s CSS keyframes)
- Colores: mocha, dusty-blue, latte @ 40% opacidad + blur enorme (`filter: blur(80px)`)
- `position: fixed`, `z-index: -1`, `pointer-events: none`

### DropZone

| Trigger | Animación |
|---------|-----------|
| Idle | Borde dashed "respira" (scale 0.98→1.02, loop 3s) |
| Hover | Borde se solidifica + gradiente rotativo (conic-gradient animado) |
| Drag over | Dropzone se expande, blobs del fondo aceleran |
| Drop | Ring de ondas desde el centro (water ripple) + icono cloud→check |

### FormatCards

| Trigger | Animación |
|---------|-----------|
| Entrada | Stagger 0.1s: `scale(0.8)→1, opacity 0→1, y: 20→0` |
| Hover | Tilt 3D (perspective + rotateX/Y basado en mouse position) + sombra dinámica |
| Click | Ripple desde punto de click + scale bounce (1→0.95→1.02→1) |
| Seleccionada | Borde gradiente animado + glow sutil |

### Transiciones entre Steps

- **Salida:** `x: 0→-100, opacity: 1→0, scale: 1→0.9` (spring, 0.4s)
- **Entrada:** `x: 100→0, opacity: 0→1, scale: 0.9→1` (spring, 0.5s)
- Usa `AnimatePresence` de Framer Motion con `mode="wait"`

### Botón de Conversión

1. Shimmer recorre el botón (gradiente translúcido, loop)
2. Click → botón se transforma en progress circular
3. Completado → progress explota en partículas → aparece check

### Descarga

- Partículas de celebración en colores de la paleta
- Botón magnético (se mueve ligeramente hacia el cursor)
- Icono de flecha con bounce descendente

### Micro-interacciones Globales

- `whileTap: { scale: 0.97 }` en todos los botones
- Tooltips con spring animation
- Step indicator: línea de progreso se llena con gradiente
- Toasts: entran con bounce desde arriba
- Elementos cercanos al cursor: parallax ligero

---

## 4. Dependencias

### Nuevas

| Paquete | Propósito |
|---------|-----------|
| `framer-motion` | Motor de animaciones React |
| `lucide-react` | Iconos (viene con shadcn) |

### Componentes shadcn

| Componente | Uso |
|------------|-----|
| `button` | Botones re-estilizados con paleta custom |
| `card` | Base para glassmorphism cards |
| `badge` | Indicadores de tipo de archivo |
| `select` | Fallback selección de formato |
| `progress` | Barra de progreso upload |
| `sonner` | Toast notifications |
| `tooltip` | Hints informativos |
| `separator` | Divisores visuales |

### Se mantienen

- `react-dropzone` — drag & drop upload
- `axios` — HTTP client con progress tracking

---

## 5. Layout

```
┌─────────────────────────────────────────────┐
│  ░░░ ANIMATED GRADIENT BACKGROUND ░░░░░░░   │
│  ░░░ (blobs floating, pastel colors) ░░░░   │
│                                             │
│    ┌─ Glassmorphism Header ───────────┐     │
│    │  🔄 Universal File Converter     │     │
│    │     Convierte archivos fácil     │     │
│    └──────────────────────────────────┘     │
│                                             │
│    ○───────●───────○   Step Indicator        │
│    1       2       3                        │
│                                             │
│    ┌─ Main Card (glassmorphism) ─────┐     │
│    │                                  │     │
│    │   [Current Step Content]         │     │
│    │   (animated transitions)         │     │
│    │                                  │     │
│    └──────────────────────────────────┘     │
│                                             │
│    Supported formats badges (subtle)        │
│                                             │
└─────────────────────────────────────────────┘
```

### Responsividad

- Desktop: `max-w-2xl`, cards con padding generoso
- Tablet: mismo layout, padding reducido
- Mobile: stack vertical, FormatCards en 2 columnas → 1 columna

---

## 6. Archivos a Crear/Modificar

### Crear

- `frontend/src/components/AnimatedBackground.jsx`
- `frontend/src/components/StepIndicator.jsx`
- `frontend/src/components/UploadStep.jsx`
- `frontend/src/components/DropZone.jsx`
- `frontend/src/components/ConvertStep.jsx`
- `frontend/src/components/FormatCard.jsx`
- `frontend/src/components/DownloadStep.jsx`

### Modificar

- `frontend/src/App.jsx` — reescribir como orquestador multi-step
- `frontend/src/index.css` — agregar custom CSS variables, keyframes para blobs
- `frontend/package.json` — nuevas dependencias
- `frontend/tailwind.config.js` — crear con colores custom (o CSS variables en Tailwind 4)

### Eliminar

- `frontend/src/components/FileUploader.jsx` — reemplazado por UploadStep + DropZone
- `frontend/src/components/ConversionPanel.jsx` — reemplazado por ConvertStep + DownloadStep

### Se mantiene sin cambios

- `frontend/src/api/client.js` — la capa HTTP no cambia
- `frontend/vite.config.js` — proxy sigue igual
