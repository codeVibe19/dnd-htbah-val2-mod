/**
 * HTBAH VAL-2 Combat v1.9
 * Foundry V13 | Requires: lib-wrapper, socketlib
 *
 * Einstiegspunkt — importiert alle Teilmodule und verdrahtet
 * Socket-Handler, libWrapper und die init/setup/ready Hooks.
 */

import { MODULE_ID } from "./config.js";
import { initSocket, getSocket } from "./socket.js";

// Teilmodule — deren Top-Level-Hooks werden beim Import registriert
import "./conditions.js";
import "./combat.js";
import "./item-sheet.js";
import "./ammo-bar.js";

// GM-Handler für Socket
import {
  gmApplyDamage,
  gmApplyHealing,
  gmSetAmmo,
  gmConsumeItem,
  gmReloadFromPool,
  gmCreateGrenadeTemplate,
  gmApplyGrenadeEffect,
  gmCreateSmokeTile,
} from "./gm-handlers.js";

import {
  gmApplyBlindedCondition,
  gmApplyTokenRestrictions,
  gmRemoveTokenRestrictions,
} from "./conditions.js";

// Combat-Handler für libWrapper
import { handleWeaponRoll, handleHealpackRoll, handleGrenadeThrow } from "./combat.js";
import { getWeaponConfig, getGrenadeConfig, getHealpackValue } from "./helpers.js";

// ═══════════════════════════════════════════════════════════════
// SOCKET
// ═══════════════════════════════════════════════════════════════

initSocket({
  applyDamage:              gmApplyDamage,
  applyHealing:             gmApplyHealing,
  setAmmo:                  gmSetAmmo,
  consumeItem:              gmConsumeItem,
  reloadFromPool:           gmReloadFromPool,
  createGrenadeTemplate:    gmCreateGrenadeTemplate,
  applyGrenadeEffect:       gmApplyGrenadeEffect,
  createSmokeTile:          gmCreateSmokeTile,
  applyBlindedCondition:    gmApplyBlindedCondition,
  applyTokenRestrictions:   gmApplyTokenRestrictions,
  removeTokenRestrictions:  gmRemoveTokenRestrictions,
});

// ═══════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════

Hooks.once("init", () => {
  const style = document.createElement("style");
  style.id = `${MODULE_ID}-styles`;
  style.textContent = `
    #val2-ammo-bar {
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: rgba(6,8,16,.88); border: 1px solid rgba(69,186,255,.22);
      border-radius: 10px; padding: 6px 14px; display: flex; align-items: center;
      gap: 14px; pointer-events: none; z-index: 60;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px; color: #cfe7ff; white-space: nowrap;
    }
    #val2-ammo-bar .val2-ammo-actor {
      color: #7ea6c8; font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
    }
    #val2-ammo-bar ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 16px; }
    #val2-ammo-bar .val2-ammo-item { display: flex; align-items: center; gap: 6px; }
    #val2-ammo-bar .val2-ammo-name { color: #7ea6c8; font-size: 10px; }
    #val2-ammo-bar .val2-ammo-bar-bg {
      width: 50px; height: 5px; background: rgba(255,255,255,.1);
      border-radius: 3px; overflow: hidden;
    }
    #val2-ammo-bar .val2-ammo-bar-fill { height: 100%; border-radius: 3px; transition: width .3s ease; }
    #val2-ammo-bar .val2-ammo-value { font-size: 11px; font-weight: bold; min-width: 32px; }
  `;
  document.head.appendChild(style);
  console.log(`${MODULE_ID} | Init.`);
});

// ═══════════════════════════════════════════════════════════════
// LIBWRAPPER – item.roll() abfangen
// setup kommt nach init — HTBAH hat CONFIG.Item.documentClass bereits gesetzt
// ═══════════════════════════════════════════════════════════════

Hooks.once("setup", () => {
  if (!game.modules.get("lib-wrapper")?.active) {
    ui.notifications.error("htbah-val2-combat: lib-wrapper wird benötigt!");
    return;
  }
  if (!game.howtobeahero?.HowToBeAHeroItem) {
    console.error(`${MODULE_ID} | HTBAH nicht geladen.`);
    return;
  }

  // Original-Funktion speichern BEVOR wir registrieren
  const originalRoll = game.howtobeahero.HowToBeAHeroItem.prototype.roll;
  console.log(`${MODULE_ID} | originalRoll gespeichert:`, typeof originalRoll);

  libWrapper.register(
    MODULE_ID,
    "game.howtobeahero.HowToBeAHeroItem.prototype.roll",
    async function(wrapped, ...args) {
      console.log(`${MODULE_ID} | roll() aufgerufen - wrapped type:`, typeof wrapped, "originalRoll type:", typeof originalRoll);
      if (getWeaponConfig(this))  { await handleWeaponRoll(this);   return; }
      if (getGrenadeConfig(this)) { await handleGrenadeThrow(this); return; }
      if (getHealpackValue(this)) { await handleHealpackRoll(this); return; }
      // Alle anderen Items: Standard HTBAH-Verhalten
      if (typeof wrapped === "function") {
        return wrapped.call(this, ...args);
      } else if (typeof originalRoll === "function") {
        return originalRoll.call(this, ...args);
      }
    },
    "WRAPPER"
  );

  console.log(`${MODULE_ID} | libWrapper registriert.`);
});

// ═══════════════════════════════════════════════════════════════
// READY
// ═══════════════════════════════════════════════════════════════

Hooks.once("ready", () => {
  if (!getSocket() && game.user.isGM)
    ui.notifications.warn("htbah-val2-combat: socketlib nicht geladen.");
  console.log(`${MODULE_ID} | Bereit.`);
});
