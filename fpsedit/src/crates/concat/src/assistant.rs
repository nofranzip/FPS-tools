// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Nova_323 (FPSedit)

//! The window's half of FPSedit's help assistant (the service half is
//! `concat_host::assistant`): the chosen AI and its key are remembered in
//! the preferences, the conversation lives here for the session, and each
//! question is asked on a thread of its own so the window never waits.

use std::cell::RefCell;
use std::rc::Rc;

use concat_host::assistant::{self, PROVIDERS, Turn};
use slint::{ComponentHandle, Model, ModelRc, SharedString, VecModel};

use crate::host::Shell;
use crate::ui::{App, ChatTurnData, Editor, FpsAssistant};

thread_local! {
    static TURNS: RefCell<Vec<Turn>> = const { RefCell::new(Vec::new()) };
}

/// Shows the provider at `index` and what goes with it.
fn show_provider(app: &App, index: usize) {
    let global = app.global::<FpsAssistant>();
    let provider = &PROVIDERS[index.min(PROVIDERS.len() - 1)];
    global.set_provider(index as i32);
    global.set_needs_key(provider.needs_key);
    global.set_key_page(provider.key_page.into());
    global.set_model_hint(if provider.model.is_empty() { "-".into() } else { provider.model.into() });
    global.set_base_hint(provider.base.into());
}

/// Fills the panel from the preferences and connects its callbacks.
pub fn wire(app: &App) {
    let global = app.global::<FpsAssistant>();
    let turns: Rc<VecModel<ChatTurnData>> = Rc::new(VecModel::default());
    global.set_turns(ModelRc::from(turns.clone()));
    global.set_providers(ModelRc::from(Rc::new(VecModel::from(
        PROVIDERS.iter().map(|p| SharedString::from(p.name)).collect::<Vec<_>>(),
    ))));

    Shell::with(|shell, app| {
        let studio = shell.studio.borrow();
        let prefs = &studio.prefs;
        let index = PROVIDERS
            .iter()
            .position(|p| Some(p.id) == prefs.assistant_provider.as_deref())
            .unwrap_or(0);
        show_provider(&app, index);
        let global = app.global::<FpsAssistant>();
        global.set_key(prefs.assistant_key.clone().unwrap_or_default().into());
        global.set_model(prefs.assistant_model.clone().unwrap_or_default().into());
        global.set_base(prefs.assistant_base.clone().unwrap_or_default().into());
        // Set up once: the strip stays closed after a key was given.
        let ready = !PROVIDERS[index].needs_key || prefs.assistant_key.as_deref().is_some_and(|k| !k.is_empty());
        global.set_setting_up(!ready);
    });

    global.on_provider_changed(|index| {
        Shell::with(|shell, app| {
            let index = (index.max(0) as usize).min(PROVIDERS.len() - 1);
            show_provider(&app, index);
            let mut studio = shell.studio.borrow_mut();
            studio.prefs.assistant_provider = Some(PROVIDERS[index].id.to_owned());
            // A key belongs to its service; a model name too.
            studio.prefs.assistant_key = None;
            studio.prefs.assistant_model = None;
            studio.prefs.assistant_base = None;
            studio.prefs.save(&studio.host.dirs);
            let global = app.global::<FpsAssistant>();
            global.set_key("".into());
            global.set_model("".into());
            global.set_base("".into());
        });
    });
    global.on_key_edited(|text| {
        Shell::with(|shell, app| {
            app.global::<FpsAssistant>().set_key(text.clone());
            let mut studio = shell.studio.borrow_mut();
            studio.prefs.assistant_key = Some(text.trim().to_owned()).filter(|t| !t.is_empty());
            studio.prefs.save(&studio.host.dirs);
        });
    });
    global.on_model_edited(|text| {
        Shell::with(|shell, app| {
            app.global::<FpsAssistant>().set_model(text.clone());
            let mut studio = shell.studio.borrow_mut();
            studio.prefs.assistant_model = Some(text.trim().to_owned()).filter(|t| !t.is_empty());
            studio.prefs.save(&studio.host.dirs);
        });
    });
    global.on_base_edited(|text| {
        Shell::with(|shell, app| {
            app.global::<FpsAssistant>().set_base(text.clone());
            let mut studio = shell.studio.borrow_mut();
            studio.prefs.assistant_base = Some(text.trim().to_owned()).filter(|t| !t.is_empty());
            studio.prefs.save(&studio.host.dirs);
        });
    });
    {
        let turns = turns.clone();
        global.on_cleared(move || {
            TURNS.with(|t| t.borrow_mut().clear());
            turns.set_vec(Vec::new());
        });
    }
    global.on_send(move |text| {
        let text = text.trim().to_owned();
        if text.is_empty() {
            return;
        }
        turns.push(ChatTurnData { from_person: true, text: text.clone().into() });
        TURNS.with(|t| t.borrow_mut().push(Turn { from_person: true, text }));
        let history = TURNS.with(|t| t.borrow().clone());
        Shell::with(|_shell, app| {
            let global = app.global::<FpsAssistant>();
            global.set_busy(true);
            global.set_error("".into());
            let index = (global.get_provider().max(0) as usize).min(PROVIDERS.len() - 1);
            let key = global.get_key().to_string();
            let model = global.get_model().to_string();
            let base = global.get_base().to_string();
            let editor = app.global::<Editor>();
            let clip = editor.get_selected_clip();
            let context = format!(
                "un proyecto de {:.0} segundos{}",
                editor.get_duration_seconds(),
                if clip.present && !clip.name.is_empty() {
                    format!(", con el clip «{}» seleccionado", clip.name)
                } else {
                    String::new()
                }
            );
            let weak = app.as_weak();
            std::thread::spawn(move || {
                let answer =
                    assistant::ask(&PROVIDERS[index], &base, &key, &model, &context, &history);
                let _ = weak.upgrade_in_event_loop(move |app| {
                    let global = app.global::<FpsAssistant>();
                    global.set_busy(false);
                    match answer {
                        Ok(answer) => {
                            TURNS.with(|t| {
                                t.borrow_mut().push(Turn { from_person: false, text: answer.clone() })
                            });
                            let model = global.get_turns();
                            if let Some(list) =
                                model.as_any().downcast_ref::<VecModel<ChatTurnData>>()
                            {
                                list.push(ChatTurnData { from_person: false, text: answer.into() });
                            }
                        }
                        Err(error) => {
                            // The question stays on screen; it is taken out
                            // of what is sent next, so a retry asks it fresh.
                            TURNS.with(|t| {
                                t.borrow_mut().pop();
                            });
                            global.set_error(error.into());
                        }
                    }
                });
            });
        });
    });
}
