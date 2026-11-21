//! Validación del atajo global que muestra y oculta la ventana.
//! Se guarda y se registra en la sintaxis de `global-hotkey`: `Control+Alt+W`.

use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

const MODIFIERS: [&str; 4] = ["Control", "Alt", "Shift", "Super"];

/// Exige al menos un modificador y una tecla, para no secuestrar teclas sueltas de todo el sistema.
pub fn validate(accelerator: &str) -> Result<(), String> {
    let parts: Vec<&str> = accelerator.split('+').collect();
    if parts.len() < 2 || parts.iter().any(|p| p.is_empty()) {
        return Err("El atajo necesita al menos un modificador (Ctrl, Alt o Shift) y una tecla".to_string());
    }
    let (key, modifiers) = parts.split_last().expect("hay al menos dos partes");
    if let Some(bad) = modifiers.iter().find(|m| !MODIFIERS.contains(m)) {
        return Err(format!("«{bad}» no es un modificador válido"));
    }
    if MODIFIERS.contains(key) {
        return Err("Falta la tecla del atajo".to_string());
    }
    Shortcut::from_str(accelerator).map(|_| ()).map_err(|e| format!("Atajo no válido: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_modifiers_plus_a_key() {
        for ok in ["Control+Alt+W", "Control+Shift+Space", "Alt+F5", "Super+K", "Control+Alt+Shift+9"] {
            assert!(validate(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn rejects_a_bare_key() {
        assert!(validate("W").is_err());
        assert!(validate("F5").is_err());
    }

    #[test]
    fn rejects_only_modifiers() {
        assert!(validate("Control").is_err());
        assert!(validate("Control+Alt").is_err());
    }

    #[test]
    fn rejects_unknown_modifiers_empty_parts_and_extra_keys() {
        for bad in ["", "Foo+W", "Control++W", "Control+Alt+W+X", "+W", "Control+"] {
            assert!(validate(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn rejects_a_key_the_plugin_cannot_parse() {
        assert!(validate("Control+Alt+NoExiste").is_err());
    }
}
