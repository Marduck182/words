# Revisión de Words (para Antigravity)

Eres un revisor independiente. Otro agente (Claude) construyó esta app y quiere una segunda opinión honesta sobre **las pruebas** y **el diseño**. Una calificación inflada no sirve: si algo está mal, dilo y di dónde.

## Reglas para ti

- **No edites ningún archivo del proyecto.** Lo único que puedes crear es `revision/RESPUESTA-ANTIGRAVITY.md`.
- **No ejecutes** `npm run tauri dev`, `npm run dev` ni abras la app: el usuario la tiene abierta y usa el puerto 1420.
- **No toques** `%APPDATA%\mx.ilmo.words` (es la base de datos real del usuario).
- Comandos que sí puedes correr (desde la carpeta del proyecto):
  - `npx vitest run` (frontend)
  - `cd src-tauri && cargo test` (Rust)
  - `cd scripts && python -X utf8 -m unittest test_clean_words` (limpieza de datos)
- Si no puedes ver las imágenes o no puedes correr algo, **dilo explícitamente** en vez de suponer el resultado. Marca como "no verificado" lo que no comprobaste.

## Qué es Words

App de escritorio (Tauri 2 + React + TypeScript + SQLite) para aprender las 3 594 palabras de *4000 Essential English Words*. La persona escribe la palabra en inglés al ver su traducción (o al revés), 50 palabras nuevas por día, ignorando acentos. Es una **ventana flotante de 480×640 sin bordes**, de cristal translúcido, que se muestra y oculta con un atajo global (`Ctrl+Alt+W`) y vive en la bandeja del sistema.

Contexto de producto y principios de diseño: lee `PRODUCT.md` en la raíz.

Decisiones ya tomadas por el usuario (no las re-discutas, aunque puedes señalar si chocan con algo):
- Sin audio ni imágenes. Sin repaso espaciado: lotes diarios; las falladas van a "Difíciles".
- Siempre se escribe la respuesta (recuerdo activo), 3 intentos por palabra (configurable).
- Dos estilos visuales a comparar: **Foco** (calma, Inter, ámbar) y **Cuaderno** (serif Literata, subrayador). Ambos en claro y oscuro.
- No debe parecer: gamificación infantil, dashboard SaaS genérico, oscuro "hacker" neón.

## Parte A: las pruebas

Dónde están:
- Rust: módulos `#[cfg(test)]` en `src-tauri/src/db.rs`, `hotkey.rs` y `window.rs` (52 pruebas).
- Frontend: `src/lib/*.test.ts`, `src/components/*.test.tsx`, `src/pages/*.test.tsx` (110 pruebas).
- Python: `scripts/test_clean_words.py` (10 pruebas).

Qué necesito de ti:
1. Corre las tres suites y reporta el resultado **tal cual salió** (cuántas pasan y fallan).
2. Revisa la calidad, no solo que pasen: ¿hay pruebas que pasarían aunque el código estuviera roto (aserciones vacías o demasiado laxas)? ¿pruebas acopladas a la implementación en vez de al comportamiento? ¿riesgo de intermitencia (hay pausas de 600 ms y temporizadores)?
3. Señala **comportamientos sin probar** que importen al usuario. Propón como máximo **8 pruebas nuevas**, cada una con nombre y qué afirmaría.
4. Revisa los casos borde de las reglas de negocio en `src-tauri/src/db.rs` (lotes, lote aleatorio, racha de "difíciles", migración v1→v2) y dime si algún escenario realista rompe algo.

Límite conocido y honesto: lo que depende de Windows y de Tauri (bandeja, registro del atajo global, arrastre, aplicar la posición guardada) **no tiene pruebas automáticas**; el autor lo verificó a mano con el proceso real.

## Parte B: el diseño

Capturas en `revision/capturas/` (tomadas en un navegador a 480×640 sobre fondo opaco; en la app real el panel es translúcido sobre el acrílico de Windows, así que se ve más oscuro/claro según lo que haya detrás):

| Archivo | Pantalla |
|---|---|
| `hoy-foco-light.png`, `hoy-foco-dark.png` | Inicio, estilo Foco |
| `hoy-cuaderno-light.png`, `hoy-cuaderno-dark.png` | Inicio, estilo Cuaderno |
| `practica-foco-light.png`, `practica-foco-dark.png` | Práctica, Foco |
| `practica-cuaderno-light.png`, `practica-cuaderno-dark.png` | Práctica, Cuaderno |
| `lotes-foco-claro.png` | Elegir lote |
| `ajustes-cuaderno-oscuro.png` | Ajustes |

El código de estilos está en `src/index.css` y `src/screens.css` (tokens en OKLCH al inicio de `index.css`).

### Rúbrica (califica de 1 a 10, **por estilo**: Foco y Cuaderno)

| Criterio | Qué mirar |
|---|---|
| Jerarquía visual | ¿Se ve primero lo importante? En práctica, ¿la palabra manda? |
| Legibilidad y contraste | Texto secundario, placeholders, estados; claro y oscuro |
| Consistencia | Botones, controles, espaciado y radios coherentes entre pantallas |
| Ergonomía del flujo | Práctica con teclado, pistas, atajos visibles, retroalimentación de acierto y error |
| Ajuste al formato widget 480×640 | Densidad, desbordes, uso del espacio, barra superior |
| Personalidad | ¿Tiene identidad propia o parece plantilla genérica? |
| Accesibilidad | Foco visible, no depender solo del color, tamaños táctiles y de texto |
| Calidad del texto en español | Claridad, tono, coherencia de verbos |

Para cada puntuación escribe **una frase de justificación que cite un elemento concreto** de una captura (por ejemplo, "el texto 'Palabras 1 a 50' en `lotes-foco-claro.png` tiene poco contraste"). Sin justificación concreta, la nota no cuenta.

Además:
- Una nota global por estilo y **cuál recomiendas dejar** (el usuario eventualmente se quedará con uno), con el porqué.
- Lo que se ve **mal o roto** en las capturas (lista concreta).
- **Las 5 mejores ideas** de mejora, ordenadas por impacto/esfuerzo, cada una con una sola frase de cómo implementarla.

## Formato de tu respuesta

Crea `revision/RESPUESTA-ANTIGRAVITY.md` con estas secciones, en este orden:

1. **Lo que pude y no pude verificar** (corrí las pruebas: sí/no; vi las imágenes: sí/no).
2. **Resultado de las pruebas** (salida tal cual).
3. **Calidad de las pruebas** (hallazgos y las ≤8 pruebas nuevas propuestas).
4. **Tabla de calificación del diseño** (criterio × estilo, con justificación).
5. **Recomendación de estilo, fallos visibles y las 5 ideas.**
