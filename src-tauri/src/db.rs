//! Base de datos SQLite: palabras, progreso, lotes diarios y ajustes.
//! Todas las funciones reciben `&Connection` y la fecha de hoy (`YYYY-MM-DD`)
//! para poder probarlas con una base en memoria y días simulados.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type DbResult<T> = Result<T, String>;

const SEED: &str = include_str!("../data/words.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    pub id: i64,
    pub word: String,
    pub translation: String,
    pub ipa: Option<String>,
    pub example_en: Option<String>,
    pub example_es: Option<String>,
    pub book: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LotWord {
    #[serde(flatten)]
    pub word: Word,
    pub learned: bool,
    pub is_hard: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LotView {
    pub lot: i64,
    pub start_id: i64,
    pub end_id: i64,
    pub size: i64,
    pub learned: i64,
    pub words: Vec<LotWord>,
    /// true si es un lote aleatorio (una lista de palabras sueltas, no un rango).
    pub random: bool,
}

/// `status`: "active" (hay lote en curso), "goal_met" (ya completó uno hoy)
/// o "finished" (no quedan palabras nuevas).
#[derive(Debug, Clone, Serialize)]
pub struct Today {
    pub status: String,
    pub lot: Option<LotView>,
    pub lots_completed_today: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Stats {
    pub total_words: i64,
    pub learned: i64,
    pub hard: i64,
    pub lots_completed: i64,
    pub accuracy: Option<f64>,
}

/// Un lote "teórico": el set troceado según `words_per_day`, con su avance real.
/// `status`: "new" (nada aprendido), "partial" o "done" (todo aprendido).
#[derive(Debug, Clone, Serialize)]
pub struct LotSummary {
    pub lot: i64,
    pub start_id: i64,
    pub end_id: i64,
    pub size: i64,
    pub learned: i64,
    pub book: Option<i64>,
    pub status: String,
    pub current: bool,
}

const SCHEMA: &str = "
BEGIN;
CREATE TABLE words (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL UNIQUE COLLATE NOCASE,
  translation TEXT NOT NULL,
  ipa TEXT,
  example_en TEXT,
  example_es TEXT,
  book INTEGER
);
CREATE TABLE progress (
  word_id INTEGER PRIMARY KEY REFERENCES words(id),
  first_seen TEXT,
  last_seen TEXT,
  learned_on TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  hard_streak INTEGER NOT NULL DEFAULT 0,
  is_hard INTEGER NOT NULL DEFAULT 0,
  hard_ok_on TEXT
);
CREATE TABLE lots (
  lot INTEGER PRIMARY KEY,
  start_id INTEGER NOT NULL,
  end_id INTEGER NOT NULL,
  started_on TEXT NOT NULL,
  completed_on TEXT,
  kind TEXT NOT NULL DEFAULT 'range'
);
CREATE TABLE lot_words (
  lot INTEGER NOT NULL REFERENCES lots(lot),
  word_id INTEGER NOT NULL REFERENCES words(id),
  PRIMARY KEY (lot, word_id)
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
PRAGMA user_version = 3;
COMMIT;
";

/// v1 -> v2: lotes aleatorios (lista de palabras sueltas). Los lotes existentes siguen siendo rangos.
const MIGRATE_V2: &str = "
BEGIN;
ALTER TABLE lots ADD COLUMN kind TEXT NOT NULL DEFAULT 'range';
CREATE TABLE lot_words (
  lot INTEGER NOT NULL REFERENCES lots(lot),
  word_id INTEGER NOT NULL REFERENCES words(id),
  PRIMARY KEY (lot, word_id)
);
PRAGMA user_version = 2;
COMMIT;
";

/// v2 -> v3: día del último acierto que cuenta para quitar una palabra de "difíciles".
const MIGRATE_V3: &str = "
BEGIN;
ALTER TABLE progress ADD COLUMN hard_ok_on TEXT;
PRAGMA user_version = 3;
COMMIT;
";

const DEFAULT_SETTINGS: &str = "
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('words_per_day', '50'), ('direction', 'es_en'), ('theme', 'system'), ('max_attempts', '3'),
  ('hotkey', 'Control+Alt+W'), ('hide_on_blur', '0'), ('always_on_top', '1'), ('speak', '1');
";

const WORD_COLUMNS: &str = "w.id, w.word, w.translation, w.ipa, w.example_en, w.example_es, w.book";

/// Convierte el error de rusqlite a texto para que viaje por `invoke`.
fn q<T>(f: impl FnOnce() -> rusqlite::Result<T>) -> DbResult<T> {
    f().map_err(|e| e.to_string())
}

fn row_word(r: &Row) -> rusqlite::Result<Word> {
    Ok(Word {
        id: r.get(0)?,
        word: r.get(1)?,
        translation: r.get(2)?,
        ipa: r.get(3)?,
        example_en: r.get(4)?,
        example_es: r.get(5)?,
        book: r.get(6)?,
    })
}

pub fn init(conn: &Connection) -> DbResult<()> {
    q(|| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version < 1 {
            conn.execute_batch(SCHEMA)?;
        } else {
            if version < 2 {
                conn.execute_batch(MIGRATE_V2)?;
            }
            if version < 3 {
                conn.execute_batch(MIGRATE_V3)?;
            }
        }
        seed(conn)?;
        conn.execute_batch(DEFAULT_SETTINGS)
    })
}

fn seed(conn: &Connection) -> rusqlite::Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM words", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let words: Vec<Word> = serde_json::from_str(SEED).expect("src-tauri/data/words.json inválido");
    let tx = conn.unchecked_transaction()?;
    {
        let mut insert = tx.prepare(
            "INSERT INTO words (id, word, translation, ipa, example_en, example_es, book)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;
        for w in &words {
            insert.execute(params![w.id, w.word, w.translation, w.ipa, w.example_en, w.example_es, w.book])?;
        }
    }
    tx.commit()
}

pub fn today(conn: &Connection) -> DbResult<String> {
    q(|| conn.query_row("SELECT date('now', 'localtime')", [], |r| r.get(0)))
}

pub fn get_settings(conn: &Connection) -> DbResult<HashMap<String, String>> {
    q(|| {
        let mut st = conn.prepare("SELECT key, value FROM settings")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        rows.collect()
    })
}

fn validate_setting(key: &str, value: &str) -> DbResult<()> {
    let one_of = |allowed: &[&str]| {
        if allowed.contains(&value) {
            Ok(())
        } else {
            Err(format!("valor no válido para {key}: {value}"))
        }
    };
    match key {
        "words_per_day" => match value.parse::<u32>() {
            Ok(n) if (1..=500).contains(&n) => Ok(()),
            _ => Err("words_per_day debe ser un número entre 1 y 500".to_string()),
        },
        "max_attempts" => match value.parse::<u32>() {
            Ok(n) if (1..=5).contains(&n) => Ok(()),
            _ => Err("max_attempts debe ser un número entre 1 y 5".to_string()),
        },
        "hotkey" => crate::hotkey::validate(value),
        "hide_on_blur" | "always_on_top" | "speak" => one_of(&["0", "1"]),
        "direction" => one_of(&["es_en", "en_es", "mixed"]),
        "theme" => one_of(&["light", "dark", "system"]),
        _ => Err(format!("ajuste desconocido: {key}")),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> DbResult<()> {
    validate_setting(key, value)?;
    q(|| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map(|_| ())
    })
}

fn words_per_day(conn: &Connection) -> rusqlite::Result<i64> {
    let value: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'words_per_day'", [], |r| r.get(0))
        .optional()?;
    Ok(value.and_then(|v| v.parse().ok()).unwrap_or(50))
}

fn lot_view(conn: &Connection, lot: i64, start_id: i64, end_id: i64, random: bool) -> rusqlite::Result<LotView> {
    // Un lote aleatorio son las palabras de `lot_words`; uno normal, el rango start..=end.
    let filter = if random { "w.id IN (SELECT word_id FROM lot_words WHERE lot = ?1)" } else { "w.id BETWEEN ?1 AND ?2" };
    let mut st = conn.prepare(&format!(
        "SELECT {WORD_COLUMNS}, p.learned_on IS NOT NULL, COALESCE(p.is_hard, 0)
         FROM words w LEFT JOIN progress p ON p.word_id = w.id
         WHERE {filter} ORDER BY w.id"
    ))?;
    let to_word = |r: &Row| -> rusqlite::Result<LotWord> {
        Ok(LotWord { word: row_word(r)?, learned: r.get(7)?, is_hard: r.get(8)? })
    };
    let words = if random {
        st.query_map(params![lot], to_word)?.collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        st.query_map(params![start_id, end_id], to_word)?.collect::<rusqlite::Result<Vec<_>>>()?
    };
    Ok(LotView {
        lot,
        start_id,
        end_id,
        size: words.len() as i64,
        learned: words.iter().filter(|w| w.learned).count() as i64,
        words,
        random,
    })
}

/// Guarda un ajuste interno (sin validar): no forma parte de lo que el usuario puede cambiar.
fn set_internal(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map(|_| ())
}

/// (lote, inicio, fin, es_aleatorio)
type LotRow = (i64, i64, i64, bool);

/// El lote en curso: el marcado en `current_lot` si sigue abierto. Si la base viene de una versión
/// anterior (sin marca), el último lote abierto.
fn current_lot(conn: &Connection) -> rusqlite::Result<Option<LotRow>> {
    let row = |r: &Row| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, String>(3)? == "random"));
    let marked: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'current_lot'", [], |r| r.get(0))
        .optional()?;
    match marked.and_then(|v| v.parse::<i64>().ok()) {
        Some(lot) => conn
            .query_row(
                "SELECT lot, start_id, end_id, kind FROM lots WHERE lot = ?1 AND completed_on IS NULL",
                [lot],
                row,
            )
            .optional(),
        None => conn
            .query_row(
                "SELECT lot, start_id, end_id, kind FROM lots WHERE completed_on IS NULL ORDER BY lot DESC LIMIT 1",
                [],
                row,
            )
            .optional(),
    }
}

/// Abre (o reutiliza, si ya hay uno abierto con el mismo rango) el lote `start..=end` y lo marca en curso.
fn open_lot(conn: &Connection, today: &str, start: i64, end: i64) -> rusqlite::Result<i64> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT lot FROM lots WHERE start_id = ?1 AND end_id = ?2 AND kind = 'range' AND completed_on IS NULL
             ORDER BY lot DESC LIMIT 1",
            params![start, end],
            |r| r.get(0),
        )
        .optional()?;
    let lot = match existing {
        Some(lot) => lot,
        None => {
            let lot: i64 = conn.query_row("SELECT COALESCE(MAX(lot), 0) + 1 FROM lots", [], |r| r.get(0))?;
            conn.execute(
                "INSERT INTO lots (lot, start_id, end_id, started_on) VALUES (?1, ?2, ?3, ?4)",
                params![lot, start, end, today],
            )?;
            lot
        }
    };
    set_internal(conn, "current_lot", &lot.to_string())?;
    Ok(lot)
}

pub fn get_today(conn: &Connection, today: &str, advance: bool) -> DbResult<Today> {
    q(|| {
        let done_today: i64 =
            conn.query_row("SELECT COUNT(*) FROM lots WHERE completed_on = ?1", [today], |r| r.get(0))?;
        let status = |status: &str, lot: Option<LotView>| Today {
            status: status.to_string(),
            lot,
            lots_completed_today: done_today,
        };

        if let Some((lot, start, end, random)) = current_lot(conn)? {
            return Ok(status("active", Some(lot_view(conn, lot, start, end, random)?)));
        }

        // El siguiente lote arranca en la primera palabra sin aprender, no después del último lote:
        // así no se saltan palabras si el usuario eligió lotes fuera de orden.
        let first_unlearned: Option<i64> = conn.query_row(
            "SELECT MIN(w.id) FROM words w LEFT JOIN progress p ON p.word_id = w.id WHERE p.learned_on IS NULL",
            [],
            |r| r.get(0),
        )?;
        let Some(start) = first_unlearned else {
            return Ok(status("finished", None));
        };
        if done_today > 0 && !advance {
            return Ok(status("goal_met", None));
        }

        let max_id: i64 = conn.query_row("SELECT COALESCE(MAX(id), 0) FROM words", [], |r| r.get(0))?;
        let end = (start + words_per_day(conn)? - 1).min(max_id);
        let lot = open_lot(conn, today, start, end)?;
        Ok(status("active", Some(lot_view(conn, lot, start, end, false)?)))
    })
}

pub fn record_answer(conn: &Connection, today: &str, word_id: i64, correct: bool) -> DbResult<()> {
    q(|| {
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT OR IGNORE INTO progress (word_id, first_seen) VALUES (?1, ?2)", params![word_id, today])?;
        if correct {
            tx.execute(
                // Para salir de "difíciles" hacen falta 2 aciertos en días distintos:
                //  - racha < 0: es el reintento justo después de fallar, no cuenta;
                //  - si el último acierto contado fue hoy, este tampoco suma;
                //  - en un día nuevo suma 1 y se recuerda el día.
                "UPDATE progress SET last_seen = ?2, attempts = attempts + 1, correct = correct + 1,
                   learned_on = COALESCE(learned_on, ?2),
                   hard_streak = CASE
                     WHEN is_hard = 0 THEN 0
                     WHEN hard_streak < 0 THEN 0
                     WHEN hard_ok_on IS NULL OR hard_ok_on <> ?2 THEN hard_streak + 1
                     ELSE hard_streak END,
                   hard_ok_on = CASE
                     WHEN is_hard = 1 AND hard_streak >= 0 AND (hard_ok_on IS NULL OR hard_ok_on <> ?2) THEN ?2
                     ELSE hard_ok_on END
                 WHERE word_id = ?1",
                params![word_id, today],
            )?;
            tx.execute(
                "UPDATE progress SET is_hard = 0, hard_streak = 0, hard_ok_on = NULL
                 WHERE word_id = ?1 AND is_hard = 1 AND hard_streak >= 2",
                params![word_id],
            )?;
        } else {
            tx.execute(
                "UPDATE progress SET last_seen = ?2, attempts = attempts + 1, wrong = wrong + 1,
                   is_hard = 1, hard_streak = -1, hard_ok_on = NULL
                 WHERE word_id = ?1",
                params![word_id, today],
            )?;
        }
        tx.commit()
    })
}

pub fn complete_lot(conn: &Connection, today: &str, lot: i64) -> DbResult<()> {
    let found: Option<(i64, i64, Option<String>, String)> = q(|| {
        conn.query_row(
            "SELECT start_id, end_id, completed_on, kind FROM lots WHERE lot = ?1",
            [lot],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
    })?;
    let (start, end, completed_on, kind) = found.ok_or_else(|| format!("El lote {lot} no existe"))?;
    if completed_on.is_some() {
        return Ok(());
    }
    let pending: i64 = q(|| {
        if kind == "random" {
            conn.query_row(
                "SELECT COUNT(*) FROM lot_words lw LEFT JOIN progress p ON p.word_id = lw.word_id
                 WHERE lw.lot = ?1 AND p.learned_on IS NULL",
                [lot],
                |r| r.get(0),
            )
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM words w LEFT JOIN progress p ON p.word_id = w.id
                 WHERE w.id BETWEEN ?1 AND ?2 AND p.learned_on IS NULL",
                params![start, end],
                |r| r.get(0),
            )
        }
    })?;
    if pending > 0 {
        return Err(format!("Faltan {pending} palabras por aprender en este lote"));
    }
    q(|| conn.execute("UPDATE lots SET completed_on = ?2 WHERE lot = ?1", params![lot, today]).map(|_| ()))
}

pub fn get_hard_words(conn: &Connection) -> DbResult<Vec<Word>> {
    q(|| {
        let mut st = conn.prepare(&format!(
            "SELECT {WORD_COLUMNS} FROM words w JOIN progress p ON p.word_id = w.id
             WHERE p.is_hard = 1 ORDER BY w.id"
        ))?;
        let rows = st.query_map([], row_word)?;
        rows.collect()
    })
}

pub fn set_hard(conn: &Connection, today: &str, word_id: i64, hard: bool) -> DbResult<()> {
    q(|| {
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT OR IGNORE INTO progress (word_id, first_seen) VALUES (?1, ?2)", params![word_id, today])?;
        tx.execute(
            "UPDATE progress SET is_hard = ?2, hard_streak = 0, hard_ok_on = NULL WHERE word_id = ?1",
            params![word_id, hard],
        )?;
        tx.commit()
    })
}

pub fn get_stats(conn: &Connection) -> DbResult<Stats> {
    q(|| {
        let count = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0));
        Ok(Stats {
            total_words: count("SELECT COUNT(*) FROM words")?,
            learned: count("SELECT COUNT(*) FROM progress WHERE learned_on IS NOT NULL")?,
            hard: count("SELECT COUNT(*) FROM progress WHERE is_hard = 1")?,
            lots_completed: count("SELECT COUNT(*) FROM lots WHERE completed_on IS NOT NULL")?,
            accuracy: conn.query_row(
                "SELECT CAST(SUM(correct) AS REAL) / NULLIF(SUM(attempts), 0) FROM progress",
                [],
                |r| r.get(0),
            )?,
        })
    })
}

pub fn get_all_words(conn: &Connection) -> DbResult<Vec<Word>> {
    q(|| {
        let mut st = conn.prepare(&format!("SELECT {WORD_COLUMNS} FROM words w ORDER BY w.id"))?;
        let rows = st.query_map([], row_word)?;
        rows.collect()
    })
}

pub fn get_lot_list(conn: &Connection) -> DbResult<Vec<LotSummary>> {
    q(|| {
        let size = words_per_day(conn)?.max(1);
        let max_id: i64 = conn.query_row("SELECT COALESCE(MAX(id), 0) FROM words", [], |r| r.get(0))?;
        let current = current_lot(conn)?.filter(|row| !row.3).map(|(_, start, end, _)| (start, end));
        let mut out = Vec::new();
        let mut start = 1;
        while start <= max_id {
            let end = (start + size - 1).min(max_id);
            let (learned, book): (i64, Option<i64>) = conn.query_row(
                "SELECT (SELECT COUNT(*) FROM progress WHERE learned_on IS NOT NULL AND word_id BETWEEN ?1 AND ?2),
                        (SELECT book FROM words WHERE id = ?1)",
                params![start, end],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let count = end - start + 1;
            out.push(LotSummary {
                lot: out.len() as i64 + 1,
                start_id: start,
                end_id: end,
                size: count,
                learned,
                book,
                status: if learned >= count { "done" } else if learned == 0 { "new" } else { "partial" }.to_string(),
                current: current == Some((start, end)),
            });
            start = end + 1;
        }
        Ok(out)
    })
}

/// Abre el lote `start_id..=end_id` para practicarlo ahora. Falla si el rango no existe o ya está aprendido
/// (para repasarlo se usa `get_lot_view`).
pub fn select_lot(conn: &Connection, today: &str, start_id: i64, end_id: i64) -> DbResult<Today> {
    let max_id: i64 = q(|| conn.query_row("SELECT COALESCE(MAX(id), 0) FROM words", [], |r| r.get(0)))?;
    if start_id < 1 || end_id < start_id || end_id > max_id {
        return Err(format!("Rango de lote no válido: {start_id} a {end_id}"));
    }
    let pending: i64 = q(|| {
        conn.query_row(
            "SELECT COUNT(*) FROM words w LEFT JOIN progress p ON p.word_id = w.id
             WHERE w.id BETWEEN ?1 AND ?2 AND p.learned_on IS NULL",
            params![start_id, end_id],
            |r| r.get(0),
        )
    })?;
    if pending == 0 {
        return Err("Ese lote ya está aprendido; puedes repasarlo".to_string());
    }
    q(|| open_lot(conn, today, start_id, end_id))?;
    get_today(conn, today, true)
}

/// Las palabras de un rango con su avance, sin abrir ni modificar ningún lote (para repasar).
pub fn get_lot_view(conn: &Connection, start_id: i64, end_id: i64) -> DbResult<LotView> {
    q(|| lot_view(conn, 0, start_id, end_id, false))
}

/// Abre un lote con `words_per_day` palabras al azar entre las que aún no se han aprendido
/// (mezcla libros). Cuenta para el progreso como cualquier otro lote.
pub fn start_random_lot(conn: &Connection, today: &str) -> DbResult<Today> {
    let ids: Vec<i64> = q(|| {
        let size = words_per_day(conn)?;
        let mut st = conn.prepare(
            "SELECT w.id FROM words w LEFT JOIN progress p ON p.word_id = w.id
             WHERE p.learned_on IS NULL ORDER BY RANDOM() LIMIT ?1",
        )?;
        let rows = st.query_map([size], |r| r.get(0))?;
        rows.collect()
    })?;
    let (Some(&min), Some(&max)) = (ids.iter().min(), ids.iter().max()) else {
        return Err("No quedan palabras nuevas para un lote aleatorio".to_string());
    };
    q(|| {
        let tx = conn.unchecked_transaction()?;
        let lot: i64 = tx.query_row("SELECT COALESCE(MAX(lot), 0) + 1 FROM lots", [], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO lots (lot, start_id, end_id, started_on, kind) VALUES (?1, ?2, ?3, ?4, 'random')",
            params![lot, min, max, today],
        )?;
        for id in &ids {
            tx.execute("INSERT INTO lot_words (lot, word_id) VALUES (?1, ?2)", params![lot, id])?;
        }
        set_internal(&tx, "current_lot", &lot.to_string())?;
        tx.commit()
    })?;
    get_today(conn, today, true)
}

/// Guarda dónde dejó el usuario la ventana (esquina superior izquierda, píxeles físicos).
pub fn save_window_position(conn: &Connection, x: i32, y: i32) -> DbResult<()> {
    q(|| set_internal(conn, "window_pos", &format!("{x},{y}")))
}

pub fn load_window_position(conn: &Connection) -> Option<(i32, i32)> {
    let raw: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'window_pos'", [], |r| r.get(0))
        .optional()
        .ok()??;
    let (x, y) = raw.split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

/// Guarda el tamaño de la ventana (área interior, píxeles físicos).
pub fn save_window_size(conn: &Connection, width: u32, height: u32) -> DbResult<()> {
    q(|| set_internal(conn, "window_size", &format!("{width},{height}")))
}

pub fn load_window_size(conn: &Connection) -> Option<(u32, u32)> {
    let raw: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'window_size'", [], |r| r.get(0))
        .optional()
        .ok()??;
    let (w, h) = raw.split_once(',')?;
    let (w, h): (u32, u32) = (w.trim().parse().ok()?, h.trim().parse().ok()?);
    (w > 0 && h > 0).then_some((w, h))
}

#[cfg(test)]
mod tests {
    use super::*;

    const D1: &str = "2026-11-20";
    const D2: &str = "2026-11-21";
    const D3: &str = "2026-11-22";
    const D4: &str = "2026-11-23";

    fn seeded_len() -> i64 {
        serde_json::from_str::<Vec<serde_json::Value>>(SEED).unwrap().len() as i64
    }

    /// Base en memoria con `words_per_day` chico y, opcionalmente, solo las primeras `keep` palabras.
    fn db(per_day: u32, keep: Option<i64>) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        if let Some(n) = keep {
            conn.execute("DELETE FROM words WHERE id > ?1", [n]).unwrap();
        }
        set_setting(&conn, "words_per_day", &per_day.to_string()).unwrap();
        conn
    }

    fn learn_all(conn: &Connection, day: &str, lot: &LotView) {
        for w in &lot.words {
            record_answer(conn, day, w.word.id, true).unwrap();
        }
    }

    fn active(t: Today) -> LotView {
        assert_eq!(t.status, "active");
        t.lot.expect("lote activo")
    }

    #[test]
    fn init_seeds_every_word_and_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        init(&conn).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM words", [], |r| r.get(0)).unwrap();
        assert_eq!(n, seeded_len());
        assert!(n > 3500);
    }

    #[test]
    fn default_settings_are_fifty_words_spanish_to_english() {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        let s = get_settings(&conn).unwrap();
        assert_eq!(s["words_per_day"], "50");
        assert_eq!(s["direction"], "es_en");
        assert_eq!(s["theme"], "system");
        assert_eq!(s["max_attempts"], "3");
    }

    #[test]
    fn set_setting_persists_valid_values_and_rejects_invalid_ones() {
        let conn = db(5, None);
        set_setting(&conn, "direction", "mixed").unwrap();
        assert_eq!(get_settings(&conn).unwrap()["direction"], "mixed");
        assert!(set_setting(&conn, "direction", "klingon").is_err());
        assert!(set_setting(&conn, "words_per_day", "0").is_err());
        assert!(set_setting(&conn, "words_per_day", "abc").is_err());
        assert!(set_setting(&conn, "words_per_day", "501").is_err());
        assert!(set_setting(&conn, "nope", "1").is_err());
        assert_eq!(get_settings(&conn).unwrap()["direction"], "mixed");
    }

    #[test]
    fn first_lot_takes_the_first_words_per_day_words() {
        let conn = db(5, None);
        let lot = active(get_today(&conn, D1, false).unwrap());
        assert_eq!((lot.lot, lot.start_id, lot.end_id, lot.size, lot.learned), (1, 1, 5, 5, 0));
        assert_eq!(lot.words.iter().map(|w| w.word.id).collect::<Vec<_>>(), vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn same_lot_is_returned_until_it_is_completed() {
        let conn = db(5, None);
        let a = active(get_today(&conn, D1, false).unwrap());
        let b = active(get_today(&conn, D2, true).unwrap());
        assert_eq!(a.lot, b.lot);
    }

    #[test]
    fn a_correct_answer_marks_the_word_learned() {
        let conn = db(5, None);
        active(get_today(&conn, D1, false).unwrap()); // abre el lote antes de contestar
        record_answer(&conn, D1, 1, true).unwrap();
        let lot = active(get_today(&conn, D1, false).unwrap());
        assert_eq!(lot.learned, 1);
        assert!(lot.words[0].learned && !lot.words[1].learned);
    }

    #[test]
    fn a_wrong_answer_marks_hard_without_learning_it() {
        let conn = db(5, None);
        record_answer(&conn, D1, 2, false).unwrap();
        let lot = active(get_today(&conn, D1, false).unwrap());
        assert!(!lot.words[1].learned);
        assert!(lot.words[1].is_hard);
        assert_eq!(get_hard_words(&conn).unwrap().iter().map(|w| w.id).collect::<Vec<_>>(), vec![2]);
    }

    #[test]
    fn answering_an_unknown_word_is_an_error() {
        let conn = db(5, None);
        assert!(record_answer(&conn, D1, 999_999, true).is_err());
    }

    #[test]
    fn complete_lot_refuses_while_words_are_pending() {
        let conn = db(3, None);
        let lot = active(get_today(&conn, D1, false).unwrap());
        record_answer(&conn, D1, lot.words[0].word.id, true).unwrap();
        let err = complete_lot(&conn, D1, lot.lot).unwrap_err();
        assert!(err.contains('2'), "debe decir cuántas faltan: {err}");
    }

    #[test]
    fn completing_a_lot_meets_the_daily_goal_and_advance_opens_the_next() {
        let conn = db(3, None);
        let lot = active(get_today(&conn, D1, false).unwrap());
        learn_all(&conn, D1, &lot);
        complete_lot(&conn, D1, lot.lot).unwrap();

        let t = get_today(&conn, D1, false).unwrap();
        assert_eq!((t.status.as_str(), t.lots_completed_today), ("goal_met", 1));
        assert!(t.lot.is_none());

        let next = active(get_today(&conn, D1, true).unwrap());
        assert_eq!((next.lot, next.start_id, next.end_id), (2, 4, 6));
    }

    #[test]
    fn the_next_day_opens_the_next_lot_without_advance() {
        let conn = db(3, None);
        let lot = active(get_today(&conn, D1, false).unwrap());
        learn_all(&conn, D1, &lot);
        complete_lot(&conn, D1, lot.lot).unwrap();
        let next = active(get_today(&conn, D2, false).unwrap());
        assert_eq!(next.lot, 2);
    }

    #[test]
    fn changing_words_per_day_only_affects_future_lots() {
        let conn = db(3, None);
        let lot = active(get_today(&conn, D1, false).unwrap());
        set_setting(&conn, "words_per_day", "10").unwrap();
        let same = active(get_today(&conn, D1, false).unwrap());
        assert_eq!((same.lot, same.size), (lot.lot, 3));
        learn_all(&conn, D1, &same);
        complete_lot(&conn, D1, same.lot).unwrap();
        let next = active(get_today(&conn, D2, false).unwrap());
        assert_eq!((next.start_id, next.size), (4, 10));
    }

    #[test]
    fn the_last_lot_is_cut_to_the_words_that_remain_and_then_it_is_finished() {
        let conn = db(2, Some(3));
        let l1 = active(get_today(&conn, D1, false).unwrap());
        learn_all(&conn, D1, &l1);
        complete_lot(&conn, D1, l1.lot).unwrap();
        let l2 = active(get_today(&conn, D2, false).unwrap());
        assert_eq!((l2.start_id, l2.end_id, l2.size), (3, 3, 1));
        learn_all(&conn, D2, &l2);
        complete_lot(&conn, D2, l2.lot).unwrap();
        let t = get_today(&conn, D2, true).unwrap();
        assert_eq!(t.status, "finished");
        assert!(t.lot.is_none());
    }

    #[test]
    fn after_a_miss_the_immediate_retry_does_not_count_toward_clearing_hard() {
        let conn = db(5, None);
        record_answer(&conn, D1, 1, false).unwrap();
        record_answer(&conn, D1, 1, true).unwrap(); // el reintento en el mismo lote: no cuenta
        record_answer(&conn, D1, 1, true).unwrap(); // un primer acierto real en un repaso: cuenta
        assert_eq!(get_hard_words(&conn).unwrap().len(), 1, "un acierto real no basta");
        record_answer(&conn, D2, 1, true).unwrap(); // el segundo, otro día
        assert!(get_hard_words(&conn).unwrap().is_empty());
    }

    #[test]
    fn two_correct_answers_on_the_same_day_do_not_clear_a_hard_word() {
        let conn = db(5, None);
        set_hard(&conn, D1, 4, true).unwrap();
        for _ in 0..4 {
            record_answer(&conn, D1, 4, true).unwrap();
        }
        assert_eq!(get_hard_words(&conn).unwrap().len(), 1, "el mismo día cuenta una sola vez");
    }

    #[test]
    fn a_miss_wipes_the_day_credit_so_two_new_days_are_needed() {
        let conn = db(5, None);
        set_hard(&conn, D1, 4, true).unwrap();
        record_answer(&conn, D1, 4, true).unwrap(); // día 1: cuenta (1 de 2)
        record_answer(&conn, D2, 4, false).unwrap(); // falla el día 2: se borra el avance
        record_answer(&conn, D2, 4, true).unwrap(); // reintento: no cuenta
        record_answer(&conn, D3, 4, true).unwrap(); // día 3: cuenta (1 de 2)
        assert_eq!(get_hard_words(&conn).unwrap().len(), 1);
        record_answer(&conn, D4, 4, true).unwrap(); // día 4: cuenta (2 de 2)
        assert!(get_hard_words(&conn).unwrap().is_empty());
    }

    #[test]
    fn a_word_marked_hard_by_hand_clears_after_correct_answers_on_two_different_days() {
        let conn = db(5, None);
        set_hard(&conn, D1, 4, true).unwrap();
        record_answer(&conn, D1, 4, true).unwrap();
        assert_eq!(get_hard_words(&conn).unwrap().len(), 1);
        record_answer(&conn, D2, 4, true).unwrap();
        assert!(get_hard_words(&conn).unwrap().is_empty());
    }

    #[test]
    fn marking_a_word_hard_by_hand_forgets_earlier_day_credit() {
        let conn = db(5, None);
        set_hard(&conn, D1, 4, true).unwrap();
        record_answer(&conn, D1, 4, true).unwrap(); // 1 de 2
        set_hard(&conn, D2, 4, true).unwrap(); // vuelve a marcarla: empieza de cero
        record_answer(&conn, D2, 4, true).unwrap(); // 1 de 2
        assert_eq!(get_hard_words(&conn).unwrap().len(), 1);
    }

    #[test]
    fn a_miss_resets_the_hard_streak() {
        let conn = db(5, None);
        record_answer(&conn, D1, 1, false).unwrap();
        record_answer(&conn, D1, 1, true).unwrap();
        record_answer(&conn, D1, 1, false).unwrap();
        record_answer(&conn, D1, 1, true).unwrap();
        assert_eq!(get_hard_words(&conn).unwrap().len(), 1);
    }

    #[test]
    fn set_hard_marks_and_unmarks_a_word_by_hand() {
        let conn = db(5, None);
        set_hard(&conn, D1, 4, true).unwrap();
        assert_eq!(get_hard_words(&conn).unwrap()[0].id, 4);
        set_hard(&conn, D1, 4, false).unwrap();
        assert!(get_hard_words(&conn).unwrap().is_empty());
    }

    #[test]
    fn stats_count_learned_hard_lots_and_accuracy() {
        let conn = db(2, None);
        let lot = active(get_today(&conn, D1, false).unwrap());
        record_answer(&conn, D1, 1, true).unwrap();
        record_answer(&conn, D1, 2, false).unwrap();
        record_answer(&conn, D1, 2, true).unwrap();
        complete_lot(&conn, D1, lot.lot).unwrap();
        let s = get_stats(&conn).unwrap();
        assert_eq!(s.total_words, seeded_len());
        assert_eq!((s.learned, s.hard, s.lots_completed), (2, 1, 1));
        let acc = s.accuracy.unwrap();
        assert!((acc - 2.0 / 3.0).abs() < 1e-9, "accuracy {acc}");
    }

    #[test]
    fn stats_accuracy_is_none_before_any_answer() {
        let conn = db(2, None);
        assert!(get_stats(&conn).unwrap().accuracy.is_none());
    }

    #[test]
    fn today_returns_an_iso_date() {
        let conn = db(2, None);
        let d = today(&conn).unwrap();
        assert_eq!(d.len(), 10);
        assert_eq!(&d[4..5], "-");
    }

    #[test]
    fn max_attempts_defaults_to_three_and_is_validated() {
        let conn = db(5, None);
        assert_eq!(get_settings(&conn).unwrap()["max_attempts"], "3");
        set_setting(&conn, "max_attempts", "5").unwrap();
        assert_eq!(get_settings(&conn).unwrap()["max_attempts"], "5");
        for bad in ["0", "6", "x", ""] {
            assert!(set_setting(&conn, "max_attempts", bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn get_all_words_returns_every_word_in_id_order() {
        let conn = db(5, None);
        let all = get_all_words(&conn).unwrap();
        assert_eq!(all.len() as i64, seeded_len());
        assert!(all.windows(2).all(|p| p[0].id < p[1].id));
    }

    #[test]
    fn lot_list_chunks_the_words_by_words_per_day() {
        let conn = db(5, Some(12));
        let list = get_lot_list(&conn).unwrap();
        let shape: Vec<_> = list.iter().map(|l| (l.lot, l.start_id, l.end_id, l.size)).collect();
        assert_eq!(shape, vec![(1, 1, 5, 5), (2, 6, 10, 5), (3, 11, 12, 2)]);
        assert!(list.iter().all(|l| l.status == "new" && l.learned == 0 && !l.current));
        assert_eq!(list[0].book, Some(1));
    }

    #[test]
    fn lot_list_reports_progress_and_marks_the_current_lot() {
        let conn = db(5, Some(12));
        active(get_today(&conn, D1, false).unwrap()); // abre el lote 1..5
        for id in 1..=6 {
            record_answer(&conn, D1, id, true).unwrap();
        }
        let list = get_lot_list(&conn).unwrap();
        let status: Vec<_> = list.iter().map(|l| (l.status.as_str(), l.learned, l.current)).collect();
        assert_eq!(status, vec![("done", 5, true), ("partial", 1, false), ("new", 0, false)]);
    }

    #[test]
    fn select_lot_opens_that_range_and_get_today_keeps_it() {
        let conn = db(5, Some(12));
        let lot = active(select_lot(&conn, D1, 6, 10).unwrap());
        assert_eq!((lot.start_id, lot.end_id, lot.size), (6, 10, 5));
        let again = active(get_today(&conn, D2, false).unwrap());
        assert_eq!((again.lot, again.start_id), (lot.lot, 6));
    }

    #[test]
    fn select_lot_reuses_an_open_lot_with_the_same_range() {
        let conn = db(5, Some(12));
        let first = active(get_today(&conn, D1, false).unwrap()); // 1..5
        let second = active(select_lot(&conn, D1, 6, 10).unwrap());
        assert_ne!(first.lot, second.lot);
        let back = active(select_lot(&conn, D1, 1, 5).unwrap());
        assert_eq!(back.lot, first.lot);
        assert_eq!(active(get_today(&conn, D1, false).unwrap()).lot, first.lot);
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM lots", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn select_lot_rejects_bad_ranges_and_lots_already_learned() {
        let conn = db(5, Some(12));
        assert!(select_lot(&conn, D1, 0, 5).is_err());
        assert!(select_lot(&conn, D1, 5, 3).is_err());
        assert!(select_lot(&conn, D1, 1, 99_999).is_err());
        for id in 1..=5 {
            record_answer(&conn, D1, id, true).unwrap();
        }
        assert!(select_lot(&conn, D1, 1, 5).unwrap_err().contains("aprendido"));
    }

    #[test]
    fn after_finishing_a_selected_lot_the_next_one_starts_at_the_first_unlearned_word() {
        let conn = db(5, Some(12));
        let lot = active(select_lot(&conn, D1, 6, 10).unwrap());
        learn_all(&conn, D1, &lot);
        complete_lot(&conn, D1, lot.lot).unwrap();
        assert_eq!(get_today(&conn, D1, false).unwrap().status, "goal_met");
        let next = active(get_today(&conn, D2, false).unwrap());
        assert_eq!((next.start_id, next.end_id), (1, 5));
    }

    #[test]
    fn get_lot_view_shows_progress_without_opening_a_lot() {
        let conn = db(5, Some(12));
        record_answer(&conn, D1, 6, true).unwrap();
        let view = get_lot_view(&conn, 6, 8).unwrap();
        assert_eq!((view.lot, view.size, view.learned), (0, 3, 1));
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM lots", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn a_database_without_current_lot_still_resumes_its_open_lot() {
        let conn = db(5, None);
        let first = active(get_today(&conn, D1, false).unwrap());
        conn.execute("DELETE FROM settings WHERE key = 'current_lot'", []).unwrap();
        assert_eq!(active(get_today(&conn, D1, false).unwrap()).lot, first.lot);
    }

    const V1_SCHEMA: &str = "
        CREATE TABLE words (id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE COLLATE NOCASE, translation TEXT NOT NULL,
          ipa TEXT, example_en TEXT, example_es TEXT, book INTEGER);
        CREATE TABLE progress (word_id INTEGER PRIMARY KEY REFERENCES words(id), first_seen TEXT, last_seen TEXT,
          learned_on TEXT, attempts INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
          wrong INTEGER NOT NULL DEFAULT 0, hard_streak INTEGER NOT NULL DEFAULT 0, is_hard INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE lots (lot INTEGER PRIMARY KEY, start_id INTEGER NOT NULL, end_id INTEGER NOT NULL,
          started_on TEXT NOT NULL, completed_on TEXT);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO lots (lot, start_id, end_id, started_on) VALUES (1, 1, 50, '2026-11-19');
        PRAGMA user_version = 1;
    ";

    #[test]
    fn a_version_1_database_is_migrated_without_losing_its_lots() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(V1_SCHEMA).unwrap();
        init(&conn).unwrap();
        init(&conn).unwrap(); // y es idempotente
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 3);
        let kind: String = conn.query_row("SELECT kind FROM lots WHERE lot = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(kind, "range");
        let active = active(get_today(&conn, D1, false).unwrap());
        assert_eq!((active.lot, active.start_id, active.random), (1, 1, false));
    }

    #[test]
    fn a_random_lot_has_words_per_day_unlearned_words_from_across_the_set() {
        let conn = db(50, None);
        for id in 1..=10 {
            record_answer(&conn, D1, id, true).unwrap();
        }
        let lot = active(start_random_lot(&conn, D1).unwrap());
        assert!(lot.random);
        assert_eq!(lot.size, 50);
        let ids: Vec<i64> = lot.words.iter().map(|w| w.word.id).collect();
        assert!(ids.iter().all(|&id| id > 10), "no repite palabras aprendidas");
        assert_eq!(ids.iter().collect::<std::collections::HashSet<_>>().len(), 50, "sin repetidas");
        let span = ids.iter().max().unwrap() - ids.iter().min().unwrap();
        assert!(span > 50, "mezcla libros, no son 50 consecutivas (span {span})");
    }

    #[test]
    fn a_random_lot_is_resumed_by_get_today_and_can_be_completed() {
        let conn = db(5, Some(12));
        let lot = active(start_random_lot(&conn, D1).unwrap());
        assert_eq!(active(get_today(&conn, D2, false).unwrap()).lot, lot.lot);
        assert!(complete_lot(&conn, D1, lot.lot).unwrap_err().contains('5'), "faltan las 5");
        learn_all(&conn, D1, &lot);
        complete_lot(&conn, D1, lot.lot).unwrap();
        assert_eq!(get_today(&conn, D1, false).unwrap().status, "goal_met");
    }

    #[test]
    fn a_random_lot_is_cut_to_the_words_that_remain() {
        let conn = db(5, Some(12));
        for id in 1..=9 {
            record_answer(&conn, D1, id, true).unwrap();
        }
        let lot = active(start_random_lot(&conn, D1).unwrap());
        let mut ids: Vec<i64> = lot.words.iter().map(|w| w.word.id).collect();
        ids.sort();
        assert_eq!(ids, vec![10, 11, 12]);
    }

    #[test]
    fn a_random_lot_needs_unlearned_words() {
        let conn = db(5, Some(3));
        for id in 1..=3 {
            record_answer(&conn, D1, id, true).unwrap();
        }
        assert!(start_random_lot(&conn, D1).unwrap_err().contains("No quedan"));
    }

    #[test]
    fn a_random_lot_does_not_mark_any_chunk_as_current_in_the_lot_list() {
        let conn = db(5, Some(12));
        start_random_lot(&conn, D1).unwrap();
        assert!(get_lot_list(&conn).unwrap().iter().all(|l| !l.current));
    }

    #[test]
    fn after_a_random_lot_the_next_range_lot_starts_at_the_first_unlearned_word() {
        let conn = db(5, Some(12));
        let lot = active(start_random_lot(&conn, D1).unwrap());
        learn_all(&conn, D1, &lot);
        complete_lot(&conn, D1, lot.lot).unwrap();
        let next = active(get_today(&conn, D2, false).unwrap());
        assert!(!next.random);
        let first_unlearned = next.words.iter().find(|w| !w.learned).unwrap().word.id;
        assert_eq!(next.start_id, first_unlearned);
    }

    #[test]
    fn window_settings_have_defaults() {
        let s = get_settings(&db(5, None)).unwrap();
        assert_eq!(s["hotkey"], "Control+Alt+W");
        assert_eq!(s["hide_on_blur"], "0");
        assert_eq!(s["always_on_top"], "1");
    }

    #[test]
    fn window_settings_are_validated() {
        let conn = db(5, None);
        set_setting(&conn, "hide_on_blur", "1").unwrap();
        set_setting(&conn, "always_on_top", "0").unwrap();
        for bad in ["2", "true", ""] {
            assert!(set_setting(&conn, "hide_on_blur", bad).is_err(), "{bad:?}");
            assert!(set_setting(&conn, "always_on_top", bad).is_err(), "{bad:?}");
        }
        set_setting(&conn, "hotkey", "Control+Shift+Space").unwrap();
        assert!(set_setting(&conn, "hotkey", "W").is_err());
        assert_eq!(get_settings(&conn).unwrap()["hotkey"], "Control+Shift+Space");
    }

    #[test]
    fn the_window_position_is_remembered() {
        let conn = db(5, None);
        assert_eq!(load_window_position(&conn), None);
        save_window_position(&conn, 120, -30).unwrap();
        assert_eq!(load_window_position(&conn), Some((120, -30)));
        save_window_position(&conn, 5, 6).unwrap();
        assert_eq!(load_window_position(&conn), Some((5, 6)));
    }

    #[test]
    fn a_garbled_window_position_is_ignored() {
        let conn = db(5, None);
        set_internal(&conn, "window_pos", "abc").unwrap();
        assert_eq!(load_window_position(&conn), None);
    }

    #[test]
    fn a_version_2_database_gains_the_day_credit_column_and_keeps_its_hard_words() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(V1_SCHEMA).unwrap();
        conn.execute_batch(
            "ALTER TABLE lots ADD COLUMN kind TEXT NOT NULL DEFAULT 'range';
             CREATE TABLE lot_words (lot INTEGER NOT NULL REFERENCES lots(lot), word_id INTEGER NOT NULL REFERENCES words(id),
               PRIMARY KEY (lot, word_id));
             PRAGMA user_version = 2;",
        )
        .unwrap();
        // El sembrado ocurre en init, así que primero se crea la palabra a mano para tener progreso previo.
        conn.execute("INSERT INTO words (id, word, translation) VALUES (7, 'agree', 'Aceptar')", []).unwrap();
        conn.execute(
            "INSERT INTO progress (word_id, learned_on, attempts, correct, wrong, hard_streak, is_hard)
             VALUES (7, '2026-11-19', 3, 2, 1, 1, 1)",
            [],
        )
        .unwrap();
        init(&conn).unwrap();
        init(&conn).unwrap(); // idempotente
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 3);
        let (streak, hard, ok_on): (i64, i64, Option<String>) = conn
            .query_row("SELECT hard_streak, is_hard, hard_ok_on FROM progress WHERE word_id = 7", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .unwrap();
        assert_eq!((streak, hard, ok_on), (1, 1, None));
    }

    #[test]
    fn speak_setting_defaults_on_and_is_validated() {
        let conn = db(5, None);
        assert_eq!(get_settings(&conn).unwrap()["speak"], "1");
        set_setting(&conn, "speak", "0").unwrap();
        assert_eq!(get_settings(&conn).unwrap()["speak"], "0");
        for bad in ["2", "true", ""] {
            assert!(set_setting(&conn, "speak", bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn the_window_size_is_remembered() {
        let conn = db(5, None);
        assert_eq!(load_window_size(&conn), None);
        save_window_size(&conn, 640, 720).unwrap();
        assert_eq!(load_window_size(&conn), Some((640, 720)));
        save_window_size(&conn, 500, 600).unwrap();
        assert_eq!(load_window_size(&conn), Some((500, 600)));
    }

    #[test]
    fn a_garbled_or_empty_window_size_is_ignored() {
        let conn = db(5, None);
        for bad in ["abc", "640", "640,", ",720", "-5,10", "0,720", "640,0"] {
            set_internal(&conn, "window_size", bad).unwrap();
            assert_eq!(load_window_size(&conn), None, "{bad:?}");
        }
    }
}
