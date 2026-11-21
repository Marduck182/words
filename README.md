# Words

App de escritorio para aprender las 3 594 palabras de *4000 Essential English Words* escribiéndolas,
50 palabras nuevas por día. Vive en la bandeja del sistema y se muestra con un atajo global
(`Ctrl+Alt+W`, configurable) como una ventana flotante sin bordes.

**Stack:** Tauri 2, Rust (`rusqlite`), React 19, TypeScript, Vite, Zustand y Tailwind CSS 4. Pensada y probada en Windows.

## Cómo funciona

- **Recuerdo activo:** ves la traducción y escribes la palabra en inglés (o al revés, o mezclado). Se ignoran los acentos.
- **Lotes diarios:** 50 palabras por día (configurable). Puedes elegir cualquier lote, repasar los completos o abrir un lote aleatorio.
- **Intentos:** hasta 3 por palabra (configurable); una palabra fallada vuelve a la cola y pasa a "Difíciles".
- **Difíciles:** salen de la lista al acertarlas en dos días distintos.
- **Ayudas:** pista progresiva, oración con hueco ("Ver en contexto") y pronunciación con la voz en inglés de Windows.
- **Dos estilos visuales** (Foco y Cuaderno), en claro y oscuro.

## Desarrollo

Requisitos: Node 22, Rust estable y WebView2 (viene con Windows 11).

```bash
npm install
npm run tauri dev      # o, en Windows, doble clic en words-dev.cmd
```

El puerto 1420 tiene que estar libre. El progreso se guarda en `%APPDATA%\mx.ilmo.words\words.db`.

## Pruebas

```bash
npx vitest run                                              # frontend
cd src-tauri && cargo test                                   # Rust
cd scripts && python -X utf8 -m unittest test_clean_words    # limpieza de datos
```

## Estructura

| Ruta | Contenido |
|---|---|
| `src-tauri/src/db.rs` | Lotes, progreso, ajustes y migraciones de la base de datos |
| `src-tauri/src/window.rs`, `hotkey.rs` | Ventana flotante, posición y tamaño recordados, atajo global |
| `src-tauri/data/words.json` | Las palabras (se siembra la base en el primer arranque) |
| `src/lib/` | Lógica de práctica: comprobación de respuestas, sesión, voz, contraste |
| `src/components/`, `src/pages/` | Interfaz |
| `scripts/clean_words.py` | Genera `words.json` a partir de los datos de origen |
| `PRODUCT.md` | Contexto de producto y principios de diseño |

## Datos

`words.json` se generó con `scripts/clean_words.py` a partir del vocabulario de
[English-PWA](https://github.com/Marduck182/English-PWA). Se quitaron el audio y las imágenes, se descartó una fila vacía, se
deduplicaron 7 palabras y se reparó la palabra `false`, que Excel había convertido en `FALSE`.
