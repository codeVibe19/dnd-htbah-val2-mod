import { MODULE_ID, AMMO_TYPE } from "./config.js";
import { getActionSkills } from "./helpers.js";

// ═══════════════════════════════════════════════════════════════
// DIALOGE
// ═══════════════════════════════════════════════════════════════

/**
 * FIX v1.4: Kein <script> im Dialog-Content.
 * Firemode-Listener wird per Hooks.once("renderDialogV2") gesetzt –
 * das ist der einzige stabile Weg in Foundry V13.
 */
export async function showAttackDialog(actor, weaponCfg, weaponName, currentAmmo) {
  const skills = getActionSkills(actor);
  if (!skills.length) {
    ui.notifications.warn(`${MODULE_ID} | Keine Handeln-Skills gefunden.`);
    return null;
  }

  const skillOptions = skills.map(s =>
    `<option value="${s.id}">${s.name} (${s.value})</option>`
  ).join("");

  const ammoInfo = currentAmmo !== null
    ? `<p style="margin:8px 0 0; color:#7ea6c8; font-size:0.9em;">🔹 Magazin: <b>${currentAmmo} / ${weaponCfg.magazine}</b></p>`
    : "";

  const isAuto = weaponCfg.firemode === "auto";

  const autoSection = isAuto ? `
    <div style="margin-top:10px;">
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Feuermodus:</label>
      <select id="val2-firemode" style="width:100%; margin-bottom:8px;">
        <option value="semi">🔫 Semi – 1 Kugel</option>
        <option value="auto">💥 Automatisch</option>
      </select>
      <div id="val2-burst-row" style="display:none;">
        <label style="display:block; margin-bottom:4px; font-weight:bold;">
          Kugeln <span style="font-weight:normal; color:#aaa;">(−10 pro Kugel nach der ersten)</span>
        </label>
        <input id="val2-bullets" type="number" value="3" min="2" max="10" style="width:100%;" />
      </div>
    </div>
  ` : "";

  // Listener VOR dem Dialog-Aufruf registrieren
  if (isAuto) {
    Hooks.once("renderDialogV2", (_app, html) => {
      const fm = html.querySelector("#val2-firemode");
      const br = html.querySelector("#val2-burst-row");
      if (fm && br) {
        fm.addEventListener("change", () => {
          br.style.display = fm.value === "auto" ? "block" : "none";
        });
      }
    });
  }

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${weaponName} – Angriff` },
    content: `
      <div style="display:flex; flex-direction:column; gap:8px; padding:8px;">
        <div>
          <label style="display:block; margin-bottom:4px; font-weight:bold;">Skill (Handeln):</label>
          <select id="val2-skill" style="width:100%;">${skillOptions}</select>
        </div>
        ${autoSection}
        ${ammoInfo}
      </div>
    `,
    buttons: [
      {
        label: "Angreifen", action: "ok", default: true,
        callback: (_e, _b, dialog) => {
          const el       = dialog.element;
          const skillId  = el.querySelector("#val2-skill")?.value;
          const firemode = el.querySelector("#val2-firemode")?.value ?? "semi";
          const bullets  = firemode === "auto"
            ? Math.max(2, Math.min(10, parseInt(el.querySelector("#val2-bullets")?.value) || 3))
            : 1;
          if (!skillId) return null;
          return { skillId, firemode, bullets };
        }
      },
      {
        label: "🔄 Nachladen", action: "reload",
        callback: () => ({ reload: true })
      },
      { label: "Abbrechen", action: "cancel", callback: () => null }
    ],
    rejectClose: false
  });

  return result ?? null;
}

export async function showReloadDialog(actor, weapon, weaponType, currentMag, magazineSize) {
  const ammoName   = AMMO_TYPE.get(weaponType);
  const ammoItem   = ammoName
    ? actor.items.find(i => i.type !== "weapon" && i.name.toLowerCase().trim() === ammoName.toLowerCase())
    : null;
  const poolQty    = ammoItem?.system?.quantity ?? 0;
  const needed     = magazineSize - currentMag;
  const willLoad   = Math.min(needed, poolQty);
  const noAmmo     = poolQty <= 0;

  const poolInfo = ammoName
    ? `<p style="margin:6px 0 0; font-size:0.9em; color:${noAmmo ? '#ff4b73' : '#44ffb2'};">
        Pool (${ammoName}): <b>${poolQty} Schuss</b>
        ${noAmmo ? ' – Keine Munition!' : willLoad < needed ? ` → Nur ${willLoad} verfügbar` : ''}
       </p>`
    : `<p style="color:#aaa; font-size:0.9em;">Keine Munition benötigt.</p>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Nachladen" },
    content: `
      <div style="padding:8px;">
        <p><b>${weapon.name}</b> – Magazin: ${currentMag}/${magazineSize}</p>
        ${poolInfo}
        ${!noAmmo ? `<p style="margin:6px 0 0; color:#cfe7ff;">Lädt <b>${willLoad} Schuss</b> nach.</p>` : ''}
      </div>
    `,
    buttons: [
      {
        label: noAmmo ? "Kein Nachladen möglich" : "Nachladen",
        action: "reload",
        default: true,
        callback: () => !noAmmo
      },
      { label: "Abbrechen", action: "cancel", callback: () => false }
    ],
    rejectClose: false
  });
  return result ?? false;
}

export async function showHealDialog(itemName, healAmount, quantity) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${itemName} benutzen` },
    content: `
      <div style="padding:8px;">
        <p><b>${itemName}</b> benutzen?</p>
        <p>Heilt <b style="color:#44ffb2;">${healAmount} HP</b></p>
        <p style="color:#aaa; font-size:0.9em;">Verbleibend nach Nutzung: ${quantity - 1}</p>
      </div>
    `,
    buttons: [
      { label: "Benutzen",  action: "ok",     default: true, callback: () => true  },
      { label: "Abbrechen", action: "cancel",               callback: () => false }
    ],
    rejectClose: false
  });
  return result ?? false;
}

export async function showGrenadeDialog(actor, grenadeCfg, grenadeName, quantity) {
  const skills = getActionSkills(actor);
  if (!skills.length) {
    ui.notifications.warn(`${MODULE_ID} | Keine Handeln-Skills gefunden.`);
    return null;
  }

  const skillOptions = skills.map(s =>
    `<option value="${s.id}">${s.name} (${s.value})</option>`
  ).join("");

  const effectInfo = grenadeCfg.effect === "stun"  ? "💫 Betäubt Ziele für 2 Runden"
                   : grenadeCfg.effect === "blind" ? "🌟 Blendet Ziele für 1 Runde"
                   : grenadeCfg.effect === "smoke" ? "💨 Rauch für 3 Runden"
                   : grenadeCfg.effect === "burn"  ? "🔥 Brennt"
                   : "";

  const damageInfo = grenadeCfg.damage ? `💥 Schaden: ${grenadeCfg.damage}` : "";

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${grenadeName} werfen` },
    content: `
      <div style="display:flex; flex-direction:column; gap:8px; padding:8px;">
        <div>
          <label style="display:block; margin-bottom:4px; font-weight:bold;">Skill (Handeln):</label>
          <select id="val2-grenade-skill" style="width:100%;">${skillOptions}</select>
        </div>
        <div style="margin-top:8px; padding:8px; background:rgba(69,186,255,0.1); border-radius:4px;">
          <p style="margin:0; font-size:0.9em; color:#7ea6c8;"><b>Wirkung:</b></p>
          <p style="margin:4px 0 0; color:#ddd; font-size:0.9em;">
            🎯 Radius: ${grenadeCfg.size} Fuß<br>
            ${damageInfo}<br>
            ${effectInfo}
          </p>
          <p style="margin:6px 0 0; font-size:0.85em; color:#aaa; font-style:italic;">
            ⚠️ Fehlwurf: Granate streut 1W6 Fuß in zufällige Richtung
          </p>
        </div>
        <p style="color:#aaa; font-size:0.9em; margin:4px 0 0;">Verbleibend nach Wurf: ${quantity - 1}</p>
      </div>
    `,
    buttons: [
      {
        label: "Werfen", action: "ok", default: true,
        callback: (_e, _b, dialog) => {
          const skillId = dialog.element.querySelector("#val2-grenade-skill")?.value;
          if (!skillId) return null;
          return { skillId };
        }
      },
      { label: "Abbrechen", action: "cancel", callback: () => null }
    ],
    rejectClose: false
  });

  return result ?? null;
}
