import { MODULE_ID, WEAPON_TYPE_OPTIONS, GRENADE_TYPE_OPTIONS } from "./config.js";

// ═══════════════════════════════════════════════════════════════
// ITEM-SHEET ERWEITERUNG
// FIX v1.4: Hooks.on("renderHowToBeAHeroItemSheet") statt libWrapper._onRender
// Stabiler weil HTBAH diesen Hook selbst nutzt (verifiziert in how-to-be-a-hero.mjs)
// ═══════════════════════════════════════════════════════════════

function injectWeaponTypeField(html, item) {
  if (html.querySelector(".val2-weapontype-row")) return;
  const currentType = item.getFlag(MODULE_ID, "weaponType") ?? "";
  const options = WEAPON_TYPE_OPTIONS
    .map(o => `<option value="${o.value}" ${o.value === currentType ? "selected" : ""}>${o.label}</option>`)
    .join("");

  const row = document.createElement("div");
  row.className = "form-group val2-weapontype-row";
  row.style.cssText = "border-top:1px solid rgba(69,186,255,.2); margin-top:10px; padding-top:10px;";
  row.innerHTML = `
    <label style="color:#7ea6c8; font-size:12px; letter-spacing:.05em; font-weight:bold;">VAL-2 WAFFENTYP</label>
    <select class="val2-weapontype-select" style="width:100%; margin-top:4px;">${options}</select>
    <p style="color:#666; font-size:11px; margin:4px 0 0;">Bestimmt Schaden, Magazin und Feuermodus</p>
  `;
  row.querySelector("select").addEventListener("change", async (e) => {
    const val = e.target.value;
    if (val) await item.setFlag(MODULE_ID, "weaponType", val);
    else await item.unsetFlag(MODULE_ID, "weaponType");
  });

  const form = html.querySelector("form") ?? html;
  form.appendChild(row);
}

function injectConsumableFields(html, item) {
  if (html.querySelector(".val2-consumable-row")) return;

  const currentHeal    = item.getFlag(MODULE_ID, "healAmount")   ?? "";
  const currentGrenade = item.getFlag(MODULE_ID, "grenadeType")  ?? "";
  const currentSmokeTx = item.getFlag(MODULE_ID, "smokeTexture") ?? "";

  const grenadeOptions = GRENADE_TYPE_OPTIONS
    .map(o => `<option value="${o.value}" ${o.value === currentGrenade ? "selected" : ""}>${o.label}</option>`)
    .join("");

  const smokeTextureRow = `
    <div style="margin-top:8px;" class="val2-smoke-texture-row">
      <label style="color:#888; font-size:10px; letter-spacing:.05em; font-weight:bold;">RAUCH-TEXTUR (Dateipfad)</label>
      <input type="text" class="val2-smoke-texture-input" value="${currentSmokeTx}"
        placeholder="modules/htbah-val2-combat/smoke.png"
        style="width:100%; margin-top:4px; font-size:11px;" />
      <p style="color:#555; font-size:10px; margin:2px 0 0;">Nur für Rauchgranaten. Leer = graue Standardtextur</p>
    </div>
  `;

  const row = document.createElement("div");
  row.className = "form-group val2-consumable-row";
  row.style.cssText = "border-top:1px solid rgba(68,255,178,.2); margin-top:10px; padding-top:10px;";
  row.innerHTML = `
    <div style="display:flex; gap:12px;">
      <div style="flex:1;">
        <label style="color:#7ea6c8; font-size:11px; letter-spacing:.05em; font-weight:bold;">VAL-2 HEILWERT (HP)</label>
        <input type="number" class="val2-healpack-input" value="${currentHeal}"
          min="0" placeholder="20, 40, 60, 80"
          style="width:100%; margin-top:4px; font-size:12px;" />
        <p style="color:#666; font-size:10px; margin:2px 0 0;">Leer = kein Heilpack</p>
      </div>
      <div style="flex:1;">
        <label style="color:#ff8844; font-size:11px; letter-spacing:.05em; font-weight:bold;">VAL-2 GRANATENTYP</label>
        <select class="val2-grenade-select" style="width:100%; margin-top:4px; font-size:12px;">${grenadeOptions}</select>
        <p style="color:#666; font-size:10px; margin:2px 0 0;">Granaten mit Templates</p>
      </div>
    </div>
    ${smokeTextureRow}
  `;

  row.querySelector(".val2-healpack-input").addEventListener("change", async (e) => {
    const val = parseInt(e.target.value);
    if (val > 0) await item.setFlag(MODULE_ID, "healAmount", val);
    else await item.unsetFlag(MODULE_ID, "healAmount");
  });

  row.querySelector(".val2-grenade-select").addEventListener("change", async (e) => {
    const val = e.target.value;
    if (val) await item.setFlag(MODULE_ID, "grenadeType", val);
    else await item.unsetFlag(MODULE_ID, "grenadeType");
  });

  const txInput = row.querySelector(".val2-smoke-texture-input");
  if (txInput) {
    txInput.addEventListener("change", async (e) => {
      const path = e.target.value.trim();
      if (path) await item.setFlag(MODULE_ID, "smokeTexture", path);
      else await item.unsetFlag(MODULE_ID, "smokeTexture");
    });
  }

  const form = html.querySelector("form") ?? html;
  form.appendChild(row);
}

// V13 AppV2: Hook-Signatur ist (app, element, context, options)
// "element" ist das HTMLElement der ganzen App (window), nicht nur das form
// Wir nutzen sheet.element direkt – das ist zuverlässiger
Hooks.on("renderHowToBeAHeroItemSheet", (sheet, _element, _context, _options) => {
  const item = sheet.document;
  if (!item) return;
  const el = sheet.element;
  if (!el) return;

  if (item.type === "weapon")     injectWeaponTypeField(el, item);
  if (item.type === "consumable") injectConsumableFields(el, item);
});
