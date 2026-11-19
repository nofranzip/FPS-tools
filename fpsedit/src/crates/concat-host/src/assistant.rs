// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Nova_323 (FPSedit)

//! FPSedit's help assistant: a chat with whichever AI the person picks,
//! told what FPSedit is and where everything in it lives, so it can answer
//! "how do I…" in the person's own words. The person brings the service:
//! Claude, ChatGPT, Gemini or OpenRouter with a key of their own, or Ollama
//! running on the same computer with no key and nothing leaving it.
//!
//! Two ways of asking cover all of them: Anthropic's Messages API, and the
//! Chat Completions shape the rest share.

use std::time::Duration;

use serde_json::{Value, json};

/// How a service is spoken to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Protocol {
    Anthropic,
    OpenAi,
}

/// A service the assistant can use.
#[derive(Clone, Copy, Debug)]
pub struct Provider {
    /// What it is remembered as.
    pub id: &'static str,
    /// What the list shows.
    pub name: &'static str,
    /// The API's root; requests go to `/messages` or `/chat/completions`.
    pub base: &'static str,
    pub protocol: Protocol,
    /// The model asked for when none was typed.
    pub model: &'static str,
    /// A key is needed to use it.
    pub needs_key: bool,
    /// Where a key is got, said to the person who has none.
    pub key_page: &'static str,
}

/// The services, in the order the list shows them.
pub const PROVIDERS: [Provider; 6] = [
    Provider {
        id: "claude",
        name: "Claude (Anthropic)",
        base: "https://api.anthropic.com/v1",
        protocol: Protocol::Anthropic,
        model: "claude-sonnet-5-5",
        needs_key: true,
        key_page: "console.anthropic.com",
    },
    Provider {
        id: "chatgpt",
        name: "ChatGPT (OpenAI)",
        base: "https://api.openai.com/v1",
        protocol: Protocol::OpenAi,
        model: "gpt-5-mini",
        needs_key: true,
        key_page: "platform.openai.com/api-keys",
    },
    Provider {
        id: "gemini",
        name: "Gemini (Google)",
        base: "https://generativelanguage.googleapis.com/v1beta/openai",
        protocol: Protocol::OpenAi,
        model: "gemini-2.5-flash",
        needs_key: true,
        key_page: "aistudio.google.com/apikey",
    },
    Provider {
        id: "openrouter",
        name: "OpenRouter",
        base: "https://openrouter.ai/api/v1",
        protocol: Protocol::OpenAi,
        model: "openrouter/auto",
        needs_key: true,
        key_page: "openrouter.ai/keys",
    },
    Provider {
        id: "ollama",
        name: "Ollama (en tu PC, gratis)",
        base: "http://localhost:11434/v1",
        protocol: Protocol::OpenAi,
        model: "llama3.2",
        needs_key: false,
        key_page: "ollama.com",
    },
    Provider {
        id: "custom",
        name: "Otro (compatible con OpenAI)",
        base: "http://localhost:1234/v1",
        protocol: Protocol::OpenAi,
        model: "",
        needs_key: false,
        key_page: "",
    },
];

/// The provider remembered as `id`, or the first.
pub fn provider(id: &str) -> &'static Provider {
    PROVIDERS.iter().find(|p| p.id == id).unwrap_or(&PROVIDERS[0])
}

/// One turn of the conversation.
#[derive(Clone, Debug)]
pub struct Turn {
    pub from_person: bool,
    pub text: String,
}

/// What the assistant is told before anything is asked: what FPSedit is,
/// where things are, and how to answer.
pub const GUIDE: &str = "Eres el asistente de ayuda de FPSedit, un editor de video gratis para Windows \
(basado en Concat). Respondes en el idioma de la persona (normalmente español), corto, claro y paso a paso, \
nombrando los botones tal como aparecen. Si algo no existe en FPSedit, dilo y sugiere la forma más cercana.\n\n\
Dónde está cada cosa en FPSedit:\n\
- Barra izquierda (de arriba abajo): Deshacer, Rehacer, Keyframe (pone o quita un keyframe de posición, tamaño, \
rotación y opacidad del clip seleccionado en el cabezal; en clips de audio, el volumen), Dividir en el cabezal, \
Eliminar clip, Generar subtítulos (con IA, en el equipo), Asistente IA (este chat), Ajustar línea de tiempo, y abajo Ajustes.\n\
- Centro: la vista previa. Abajo: la línea de tiempo con su barra (deshacer, rehacer, keyframe, herramientas de corte, \
imán, velocidad, zoom).\n\
- Columna derecha: la rueda con Medios (biblioteca e importar), Capa (Medios, Efecto, Texto, Pegatinas, Filtros), \
Audio, Grabar (voz en off) y en el centro Subtítulos IA. Botón Exportar arriba a la derecha, Reproducir abajo.\n\
- Al seleccionar un clip, la columna derecha muestra sus ajustes (transformar, color, audio, velocidad, máscaras, \
animaciones, etc.); la flecha vuelve a la rueda y el basurero lo borra. Hacer clic en un rombo de keyframe abre el \
gráfico de keyframes en la misma columna.\n\
- La biblioteca tiene pestañas: Medios, Texto y subtítulos, Pegatinas, Formas, Efectos, Filtros, Transiciones, Audio.\n\
- Menú de arriba: Archivo (nuevo, abrir, guardar, exportar), Editar, Ver (abrir paneles), Ayuda.\n\
- Exportar: elige formato, resolución, fps y calidad; el video queda en la carpeta del proyecto.\n\
- Ajustes: idioma, tema claro/oscuro, color de acento, escala, atajos de teclado, modelos de IA, proxies.\n\
No inventes funciones; si no estás seguro de dónde está algo, dilo.";

/// Asks `provider` the conversation so far, with `context` (what is open
/// in the editor right now) added to the guide. Blocking: run it off the
/// window's thread.
pub fn ask(
    provider: &Provider,
    base: &str,
    key: &str,
    model: &str,
    context: &str,
    turns: &[Turn],
) -> Result<String, String> {
    let base = if base.trim().is_empty() { provider.base } else { base.trim() };
    let base = base.trim_end_matches('/');
    let model = if model.trim().is_empty() { provider.model } else { model.trim() };
    if model.is_empty() {
        return Err("Escribe el nombre del modelo que quieres usar.".into());
    }
    if provider.needs_key && key.trim().is_empty() {
        return Err(format!(
            "Falta la clave de {}. Puedes sacar una en {}.",
            provider.name, provider.key_page
        ));
    }
    let system = if context.is_empty() {
        GUIDE.to_owned()
    } else {
        format!("{GUIDE}\n\nLo que la persona tiene abierto ahora: {context}")
    };
    let read = Duration::from_secs(120);
    match provider.protocol {
        Protocol::Anthropic => {
            let messages: Vec<Value> = turns
                .iter()
                .map(|t| json!({"role": if t.from_person {"user"} else {"assistant"}, "content": t.text}))
                .collect();
            let body = json!({"model": model, "max_tokens": 1200, "system": system, "messages": messages});
            let text = crate::net::post_json(
                &format!("{base}/messages"),
                read,
                &[("x-api-key", key.trim()), ("anthropic-version", "2023-06-01")],
                &body,
            )?;
            let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let answer: String = value
                .get("content")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("")
                })
                .unwrap_or_default();
            if answer.is_empty() { Err(format!("Respuesta vacía: {text}")) } else { Ok(answer) }
        }
        Protocol::OpenAi => {
            let mut messages = vec![json!({"role": "system", "content": system})];
            messages.extend(turns.iter().map(
                |t| json!({"role": if t.from_person {"user"} else {"assistant"}, "content": t.text}),
            ));
            let body = json!({"model": model, "messages": messages});
            let bearer = format!("Bearer {}", key.trim());
            let headers: Vec<(&str, &str)> =
                if key.trim().is_empty() { vec![] } else { vec![("authorization", bearer.as_str())] };
            let text = crate::net::post_json(&format!("{base}/chat/completions"), read, &headers, &body)
                .map_err(|e| {
                    if provider.id == "ollama" && !e.starts_with("HTTP") {
                        format!("No se pudo conectar con Ollama. ¿Está abierto en tu PC? ({e})")
                    } else {
                        e
                    }
                })?;
            let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            value
                .pointer("/choices/0/message/content")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| format!("Respuesta vacía: {}", text.chars().take(300).collect::<String>()))
        }
    }
}
