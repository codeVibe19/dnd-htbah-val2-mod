import { MODULE_ID } from "./config.js";

// ═══════════════════════════════════════════════════════════════
// SOCKETLIB – VERWALTUNG
// ═══════════════════════════════════════════════════════════════

let _socket = null;

/** Gibt das aktive socketlib-Socket zurück (null solange nicht initialisiert). */
export function getSocket() {
  return _socket;
}

/**
 * Registriert alle GM-Handler und wartet auf socketlib.ready.
 * @param {Record<string, Function>} handlers - Map von Handler-Name → Funktion
 */
export function initSocket(handlers) {
  Hooks.once("socketlib.ready", () => {
    _socket = socketlib.registerModule(MODULE_ID);
    for (const [name, fn] of Object.entries(handlers)) {
      _socket.register(name, fn);
    }
    console.log(`${MODULE_ID} | socketlib bereit.`);
  });
}
