# FPSpaint

Programa de dibujo, animación y manga para **Android** y **Windows**, hecho por Nova_323. Es parte de **FPS tools**.

## Qué trae
- 67 pinceles en Tinta, Lápiz, Marcador, Aerógrafo, Acuarela, Textura y Pixel, y una sección **Importados**:
  - Importa pinceles **.abr** de Photoshop.
  - Importa imágenes de pinceles de **ibisPaint** (lee el código QR y detecta la forma).
  - Importa formas desde cualquier imagen PNG o JPG.
- Capas con carpetas, arrastrar para ordenar, máscara de recorte, bloqueos, modos de mezcla y tramas de manga.
- Color: selector, RGB y HSB, colores recientes y paletas propias (.gpl).
- Selección (rectángulo, lazo y varita), regla, simetría, estabilizador y atenuación.
- Globos de texto (12 estilos: normal, pensamiento, grito, impacto, susurro, electrónico…)
- Texto con más de 25 fuentes y fuentes propias (.ttf, .otf).
- 40 filtros con sus propios ajustes, quitar fondo y marcos de manga.
- Animación: línea de tiempo, piel de cebolla, FPS, bucle o ida y vuelta, y duración por fotograma.
- Pixel art: exporta a tamaño real o estirado sin borroso (×2 a ×32).
- Exporta a PNG, JPEG, **PSD con capas**, GIF, video y time-lapse.
- Ventana de referencia, lienzo que se puede rotar y asistente IA (el usuario elige el proveedor y pone su propia clave).

## Estructura
| Carpeta | Qué es |
|---|---|
| `app/` | La aplicación (HTML, CSS y JS sin dependencias). Se abre con cualquier navegador. |
| `desktop/` | Envoltorio Electron e instalador NSIS para Windows. |
| `android/` | App Android (WebView) que carga `app/`. |
| `build.sh` | Compila el APK y el instalador. |

## Probar sin compilar
Abre `app/index.html` con un servidor local, por ejemplo `npx serve app`.

## Licencia
MIT. La interfaz se inspira en apps de dibujo para celular, pero no copia su código. Usa [jsQR](https://github.com/cozmo/jsQR), con licencia Apache-2.0.
