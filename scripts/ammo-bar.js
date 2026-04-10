import { MODULE_ID } from "./config.js";
import { getWeaponConfig, getCurrentAmmo } from "./helpers.js";

// ═══════════════════════════════════════════════════════════════
// MUNITIONSLEISTE (adaptiert von Party Resources)
// ═══════════════════════════════════════════════════════════════

const Val2AmmoBar = {
  BAR_ID: "val2-ammo-bar",

  _getWeapons(actor) {
    if (!actor) return [];
    return actor.items
      .filter(i => i.type === "weapon" && i.getFlag(MODULE_ID, "weaponType"))
      .map(i => {
        const cfg         = getWeaponConfig(i);
        const currentAmmo = cfg?.magazine !== null ? getCurrentAmmo(i) : null;
        const magazine    = cfg?.magazine ?? null;
        const pct         = magazine ? Math.max(0, (currentAmmo / magazine) * 100) : null;
        const color       = pct === null ? "#aaa"
                          : pct > 40    ? "#44ffb2"
                          : pct > 15    ? "#ffcf66"
                          :               "#ff4b73";
        return { id: i.id, label: cfg?.label ?? i.name, ammo: currentAmmo, max: magazine, pct, color, isMelee: magazine === null };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
  },

  _buildHTML(weapons, actorName) {
    if (!weapons.length) return "";
    const items = weapons.map(w => {
      if (w.isMelee) return `
        <li class="val2-ammo-item" title="${w.label}">
          <span class="val2-ammo-name">${w.label}</span>
          <span class="val2-ammo-value" style="color:#aaa;">∞</span>
        </li>`;
      return `
        <li class="val2-ammo-item" title="${w.label}: ${w.ammo}/${w.max}">
          <span class="val2-ammo-name">${w.label}</span>
          <div class="val2-ammo-bar-bg">
            <div class="val2-ammo-bar-fill" style="width:${w.pct}%; background:${w.color};"></div>
          </div>
          <span class="val2-ammo-value" style="color:${w.color};">${w.ammo}/${w.max}</span>
        </li>`;
    }).join("");
    return `<div id="${this.BAR_ID}"><span class="val2-ammo-actor">${actorName}</span><ul>${items}</ul></div>`;
  },

  render() {
    $(`#${this.BAR_ID}`).remove();
    const token = canvas?.tokens?.controlled?.[0]
               ?? (game.user.character ? { actor: game.user.character } : null);
    if (!token?.actor) return;
    const weapons = this._getWeapons(token.actor);
    if (!weapons.length) return;
    const html = this._buildHTML(weapons, token.actor.name);
    if (html) $("footer#ui-bottom").append(html);
  },

  clear() { $(`#${this.BAR_ID}`).remove(); }
};

Hooks.on("controlToken",  ()               => Val2AmmoBar.render());
Hooks.on("updateItem",    (item, changes)  => { if (changes?.flags?.[MODULE_ID]) Val2AmmoBar.render(); });
Hooks.on("canvasReady",   ()               => Val2AmmoBar.clear());
