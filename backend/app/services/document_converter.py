"""
Modulo de conversion de documentos.

Este servicio maneja conversiones entre formatos de documentos:
1. Markdown (.md) -> PDF
2. DOCX (Word) -> PDF
3. PDF -> Markdown (.md)

A diferencia del conversor de imagenes (que trabaja 100% en memoria),
este modulo NECESITA archivos temporales en disco porque las herramientas
externas (LibreOffice, pdfplumber) los requieren.

Herramientas utilizadas:
------------------------
1. **python-markdown:** Convierte texto Markdown a HTML.
   Markdown es un formato de texto ligero (ej: # Titulo, **negrita**)
   que se convierte facilmente a HTML.

2. **WeasyPrint:** Convierte HTML a PDF. Es un motor de renderizado que
   entiende CSS y produce PDFs de alta calidad. Alternativas serian
   wkhtmltopdf o Puppeteer, pero WeasyPrint es Python puro (mas facil
   de instalar y mantener).

3. **LibreOffice (headless):** Convierte DOCX a PDF. LibreOffice es la
   suite offimatica libre (como Microsoft Office pero gratuita).
   El modo "headless" permite ejecutarlo sin interfaz grafica, ideal
   para servidores. Es la forma mas confiable de convertir documentos
   de Office porque usa el mismo motor de renderizado que la aplicacion
   de escritorio.

4. **pdfplumber:** Extrae texto de PDFs. Es una libreria Python que
   analiza la estructura interna del PDF para extraer texto, tablas,
   y metadata. Alternativas incluyen PyPDF2, PyMuPDF (fitz), y Tika.

Pipeline de conversion Markdown -> PDF:
    Markdown texto -> python-markdown -> HTML string -> WeasyPrint -> PDF bytes

Pipeline de conversion DOCX -> PDF:
    DOCX bytes -> archivo temporal -> LibreOffice CLI -> PDF temporal -> PDF bytes

Pipeline de conversion PDF -> Markdown:
    PDF bytes -> archivo temporal -> pdfplumber -> texto extraido -> Markdown bytes

Seguridad: Archivos temporales
-------------------------------
Usamos tempfile.TemporaryDirectory() y tempfile.NamedTemporaryFile() que:
- Crean archivos en /tmp con permisos restrictivos (solo el usuario actual)
- Se limpian automaticamente cuando el context manager (with) termina
- Evitan conflictos de nombres entre peticiones concurrentes
"""

# subprocess: permite ejecutar programas externos (como LibreOffice)
# desde Python. Es como ejecutar un comando en la terminal.
import subprocess

# tempfile: crea archivos/directorios temporales de forma segura.
# Es la forma correcta de manejar archivos temporales en Python.
# NUNCA uses open("/tmp/mi_archivo.txt") directamente porque:
#   1. Puede haber conflictos si dos peticiones usan el mismo nombre
#   2. Si el programa crashea, el archivo queda sin borrar
#   3. Otro proceso podria explotar una condicion de carrera (race condition)
import tempfile

# pathlib.Path: API moderna de Python para manejar rutas de archivos.
# Es mas legible y segura que os.path. Ejemplo:
#   Path("/tmp") / "input.docx"  es mas claro que  os.path.join("/tmp", "input.docx")
from pathlib import Path

# python-markdown: convierte texto Markdown a HTML.
# Las "extensions" agregan funcionalidad extra:
#   - "tables": soporta tablas con sintaxis | col1 | col2 |
#   - "fenced_code": soporta bloques de codigo con ```
import markdown as md_lib

# pdfplumber: extrae texto y tablas de archivos PDF.
# Analiza la estructura interna del PDF (que internamente es como
# un lenguaje de programacion que posiciona texto y graficos en la pagina).
import pdfplumber

# WeasyPrint: convierte HTML+CSS a PDF. Usa su propio motor de renderizado
# (no depende de un navegador). Produce PDFs de alta calidad con soporte
# completo de CSS (incluyendo @media print, flexbox basico, etc.).
from weasyprint import HTML


def markdown_to_pdf(data: bytes) -> bytes:
    """
    Convierte un archivo Markdown a PDF pasando por HTML como intermediario.

    Pipeline:  Markdown (bytes) -> HTML (string) -> PDF (bytes)

    Por que pasar por HTML?
    No existe una forma directa de convertir Markdown a PDF. La ruta
    estandar es: Markdown -> HTML -> PDF. Esto tiene la ventaja de que
    podemos aplicar estilos CSS al HTML intermedio para controlar como
    se ve el PDF final.

    Parametros:
        data (bytes): Contenido del archivo Markdown en bytes.

    Retorna:
        bytes: Documento PDF generado.
    """
    # Decodificamos los bytes a string UTF-8 porque python-markdown
    # trabaja con strings, no bytes.
    # UTF-8 es la codificacion de texto mas comun en la web y soporta
    # todos los caracteres Unicode (acentos, emojis, caracteres asiaticos, etc.).
    md_text = data.decode("utf-8")

    # Convertimos Markdown a HTML usando python-markdown.
    # Las extensiones agregan funcionalidad extra al parser:
    #   "tables": permite tablas con sintaxis | col1 | col2 |
    #   "fenced_code": permite bloques de codigo con triple backtick ```
    html_content = md_lib.markdown(md_text, extensions=["tables", "fenced_code"])

    # Envolvemos el HTML generado en un documento HTML completo con CSS.
    # Esto es necesario porque:
    #   1. WeasyPrint necesita un documento HTML valido (con <html>, <head>, etc.)
    #   2. Sin CSS, el PDF se veria como texto plano sin formato
    #   3. Los estilos controlan fuente, margenes, formato de codigo, etc.
    #
    # Los dobles {{ }} en el f-string son necesarios para escapar las llaves
    # que pertenecen al CSS (Python interpreta { } como placeholder de f-string).
    styled_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8">
    <style>
        body {{ font-family: sans-serif; margin: 40px; line-height: 1.6; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
        pre {{ background: #f4f4f4; padding: 16px; border-radius: 6px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
    </style>
    </head>
    <body>{html_content}</body>
    </html>
    """

    # HTML(string=...) crea un documento WeasyPrint desde un string HTML.
    # .write_pdf() renderiza el HTML a PDF y retorna los bytes del PDF.
    # Internamente, WeasyPrint:
    #   1. Parsea el HTML y CSS
    #   2. Calcula el layout (posicion de cada elemento)
    #   3. Genera el PDF binario
    return HTML(string=styled_html).write_pdf()


def docx_to_pdf(data: bytes) -> bytes:
    """
    Convierte un archivo DOCX (Microsoft Word) a PDF usando LibreOffice.

    Por que LibreOffice?
    --------------------
    DOCX es un formato complejo (es un ZIP con XML, estilos, fuentes, etc.).
    No existe una libreria Python que lo convierta a PDF con 100% de fidelidad.
    LibreOffice tiene el mejor motor de renderizado open-source para documentos
    de Office. El modo "headless" permite ejecutarlo sin interfaz grafica.

    Pipeline: DOCX bytes -> archivo temporal -> LibreOffice CLI -> PDF temporal -> PDF bytes

    Parametros:
        data (bytes): Contenido del archivo DOCX en bytes.

    Retorna:
        bytes: Documento PDF generado.

    Raises:
        subprocess.CalledProcessError: Si LibreOffice falla (ej: no esta instalado).
        RuntimeError: Si el archivo PDF de salida no se genera.
        subprocess.TimeoutExpired: Si LibreOffice tarda mas de 60 segundos.
    """
    # TemporaryDirectory crea un directorio temporal unico (ej: /tmp/tmpXYZ123/)
    # que se elimina automaticamente al salir del 'with'.
    # Usamos un directorio temporal en vez de un solo archivo porque
    # LibreOffice genera el PDF en el mismo directorio que el input.
    with tempfile.TemporaryDirectory() as tmpdir:
        # Escribimos los bytes del DOCX a un archivo temporal.
        # LibreOffice necesita un archivo real en disco; no puede leer de stdin.
        input_path = Path(tmpdir) / "input.docx"
        input_path.write_bytes(data)

        # Ejecutamos LibreOffice en modo headless (sin GUI) para convertir.
        # Argumentos:
        #   --headless: Sin interfaz grafica (indispensable en servidores)
        #   --convert-to pdf: Formato de salida
        #   --outdir tmpdir: Directorio donde guardar el PDF resultante
        #   str(input_path): Archivo de entrada
        #
        # check=True: Si LibreOffice retorna un codigo de error (!=0),
        #   Python lanza subprocess.CalledProcessError automaticamente.
        # capture_output=True: Captura stdout y stderr para no ensuciar
        #   la consola del servidor (y para debug si hay errores).
        # timeout=60: Si tarda mas de 60 segundos, se cancela el proceso.
        #   Esto evita que un archivo corrupto o malicioso bloquee el
        #   servidor indefinidamente.
        subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to", "pdf",
                "--outdir", tmpdir,
                str(input_path),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )

        # LibreOffice genera el PDF con el mismo nombre base pero extension .pdf
        # Ejemplo: "input.docx" -> "input.pdf"
        output_path = Path(tmpdir) / "input.pdf"

        # Verificamos que el archivo de salida existe.
        # Podria no existir si LibreOffice fallo silenciosamente
        # (ej: formato no reconocido, documento corrupto).
        if not output_path.exists():
            raise RuntimeError("LibreOffice conversion failed: output file not found")

        # Leemos los bytes del PDF y los retornamos.
        # Al salir del 'with', el directorio temporal (y todos sus archivos)
        # se eliminan automaticamente.
        return output_path.read_bytes()


def pdf_to_markdown(data: bytes) -> bytes:
    """
    Extrae texto de un PDF y lo formatea como Markdown.

    Limitaciones importantes:
    -------------------------
    - Solo extrae TEXTO. Las imagenes, graficos y diagramas se pierden.
    - La estructura del texto puede no ser perfecta (encabezados, listas,
      etc.) porque PDF es un formato de PRESENTACION, no de ESTRUCTURA.
      Un PDF no tiene "esto es un titulo"; solo tiene "texto en fuente
      grande en posicion X,Y". pdfplumber hace su mejor esfuerzo.
    - Las tablas complejas pueden no extraerse correctamente.

    Pipeline: PDF bytes -> archivo temporal -> pdfplumber -> texto -> Markdown bytes

    Parametros:
        data (bytes): Contenido del archivo PDF en bytes.

    Retorna:
        bytes: Texto extraido formateado como Markdown, codificado en UTF-8.
            Cada pagina esta separada por una linea horizontal (---) de Markdown.
    """
    # Creamos un archivo temporal para el PDF porque pdfplumber necesita
    # un path de archivo, no puede leer directamente de bytes.
    # delete=False es necesario para que el archivo siga existiendo despues
    # de cerrar el file handle (pdfplumber lo abrira por separado).
    # suffix=".pdf" le da la extension correcta (algunas herramientas la requieren).
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data)
        # flush() asegura que TODOS los bytes se escribieron al disco
        # (Python puede bufferear las escrituras por rendimiento).
        f.flush()
        tmp_path = f.name

    try:
        lines = []
        # pdfplumber.open() abre el PDF y permite iterar sobre sus paginas.
        # Usa un context manager (with) para asegurar que el archivo se cierre
        # correctamente al terminar.
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                # extract_text() analiza la pagina y extrae el texto.
                # Retorna None si la pagina no tiene texto (ej: solo imagenes).
                text = page.extract_text()
                if text:
                    # Agregamos un separador "---" entre paginas (excepto la primera).
                    # En Markdown, "---" genera una linea horizontal (<hr>).
                    # Esto hace mas legible el resultado al separar visualmente
                    # el contenido de diferentes paginas.
                    if i > 0:
                        lines.append("\n---\n")
                    lines.append(text)

        # Unimos todas las lineas con doble salto de linea y codificamos a UTF-8.
        # "\n\n" crea un parrafo nuevo en Markdown (un solo \n se ignora).
        return "\n\n".join(lines).encode("utf-8")
    finally:
        # Bloque finally: se ejecuta SIEMPRE, haya o no excepciones.
        # Limpiamos el archivo temporal manualmente porque usamos delete=False.
        # missing_ok=True evita un error si el archivo ya fue borrado
        # por alguna otra razon.
        Path(tmp_path).unlink(missing_ok=True)
