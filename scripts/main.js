/**
 * HTBAH VAL-2 Combat v1.6
 * Foundry V13 | Requires: lib-wrapper, socketlib
 *
 * Neu in v1.6:
 * - Granaten-System mit Templates
 * - Streuung bei Fehlwürfen (1W6 Fuß in zufällige Richtung)
 * - Blendgranaten lösen Betäubung aus (2 Runden)
 * - Rauchgranaten blockieren Sicht (3 Runden)
 * - Splitter- und Brandgranaten mit Flächenschaden
 *
 * Fixes v1.4:
 * - DialogV2 <script> entfernt → Firemode-Listener per Hooks.once("renderDialogV2")
 * - Bullets auf currentAmmo geclampt vor Damage-Berechnung
 * - Item-Sheet Injection via Hooks.on("renderHowToBeAHeroItemSheet") statt libWrapper
 * - module.json Version auf 1.2 angepasst
 */

const MODULE_ID = "htbah-val2-combat";

// ═══════════════════════════════════════════════════════════════
// WAFFEN-KONFIGURATION
// ═══════════════════════════════════════════════════════════════
const WEAPON_CONFIG = new Map([
  ["pistole",             { label: "Pistole",                dice: "1d8", magazine: 8,   firemode: "semi" }],
  ["smg",                 { label: "Maschinenpistole",       dice: "2d8", magazine: 20,  firemode: "auto" }],
  ["ar",                  { label: "Sturmgewehr",            dice: "3d8", magazine: 30,  firemode: "auto" }],
  ["sr",                  { label: "Repetiergewehr",         dice: "4d8", magazine: 1,   firemode: "semi" }],
  ["sg",                  { label: "Schrotflinte",           dice: "5d8", magazine: 5,   firemode: "semi" }],
  ["kompositbogen",       { label: "Kompositbogen",          dice: "3d8", magazine: 12,  firemode: "semi" }],
  ["pistole-laser",       { label: "Pistole Laser",          dice: "2d8", magazine: 8,   firemode: "semi" }],
  ["smg-laser",           { label: "Maschinenpistole Laser", dice: "3d8", magazine: 20,  firemode: "auto" }],
  ["ar-laser",            { label: "Sturmgewehr Laser",      dice: "4d8", magazine: 30,  firemode: "auto" }],
  ["sr-laser",            { label: "Repetiergewehr Laser",   dice: "5d8", magazine: 1,   firemode: "semi" }],
  ["sg-laser",            { label: "Schrotflinte Laser",     dice: "6d8", magazine: 5,   firemode: "semi" }],
  ["messer",              { label: "Messer",                 dice: "1d8", magazine: null, firemode: "semi" }],
  ["schwert",             { label: "Schwert",                dice: "2d8", magazine: null, firemode: "semi" }],
  ["zweihaender",         { label: "Zweihänder",             dice: "3d8", magazine: null, firemode: "semi" }],
  ["mono-messer",         { label: "Mono-Messer",            dice: "2d8", magazine: null, firemode: "semi" }],
  ["mono-schwert",        { label: "Mono-Schwert",           dice: "3d8", magazine: null, firemode: "semi" }],
  ["mono-zweihaender",    { label: "Mono-Zweihänder",        dice: "4d8", magazine: null, firemode: "semi" }],
  ["energie-messer",      { label: "Energie-Messer",         dice: "4d8", magazine: 20,  firemode: "semi" }],
  ["energie-schwert",     { label: "Energie-Schwert",        dice: "5d8", magazine: 20,  firemode: "semi" }],
  ["energie-zweihaender", { label: "Energie-Zweihänder",     dice: "6d8", magazine: 20,  firemode: "semi" }],
]);

const WEAPON_TYPE_OPTIONS = [
  { value: "", label: "— Kein VAL-2 Typ —" },
  ...Array.from(WEAPON_CONFIG.entries())
    .map(([key, cfg]) => ({ value: key, label: cfg.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"))
];

// ═══════════════════════════════════════════════════════════════
// GRANATEN-KONFIGURATION
// ═══════════════════════════════════════════════════════════════
const GRENADE_CONFIG = new Map([
  ["frag",   { label: "Splittergranate",   type: "circle", size: 10, damage: "4d8", effect: null }],
  ["flash",  { label: "Blendgranate",      type: "circle", size: 15, damage: null,  effect: "stun" }],
  ["smoke",  { label: "Rauchgranate",      type: "circle", size: 20, damage: null,  effect: "smoke" }],
  ["incen",  { label: "Brandgranate",      type: "circle", size: 10, damage: "3d8", effect: "burn" }],
]);

const GRENADE_TYPE_OPTIONS = [
  { value: "", label: "— Keine Granate —" },
  ...Array.from(GRENADE_CONFIG.entries())
    .map(([key, cfg]) => ({ value: key, label: cfg.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"))
];

const HEALPACK_NAMES = new Map([
  ["zivil", 20], ["notfall", 40], ["trauma", 60],
  ["militär", 80], ["militaer", 80],
  ["heal pack", 20], ["medpack", 20], ["heilpack", 20]
]);

// Munitionstyp pro Waffe → Item-Name im Inventar des Spielers
const AMMO_TYPE = new Map([
  ["pistole",             "Leichte Munition"],
  ["smg",                 "Leichte Munition"],
  ["ar",                  "Mittlere Munition"],
  ["sr",                  "Schwere Munition"],
  ["sg",                  "Schwere Munition"],
  ["kompositbogen",       "Pfeile"],
  ["pistole-laser",       "Energiezellen"],
  ["smg-laser",           "Energiezellen"],
  ["ar-laser",            "Energiezellen"],
  ["sr-laser",            "Energiezellen"],
  ["sg-laser",            "Energiezellen"],
  ["energie-messer",      "Energiezellen"],
  ["energie-schwert",     "Energiezellen"],
  ["energie-zweihaender", "Energiezellen"],
]);

// ═══════════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

function getWeaponConfig(item) {
  if (item.type !== "weapon") return null;
  const weaponType = item.getFlag(MODULE_ID, "weaponType");
  if (!weaponType) return null;
  return WEAPON_CONFIG.get(weaponType) ?? null;
}

function getHealpackValue(item) {
  if (item.type !== "consumable") return null;
  const flagVal = item.getFlag(MODULE_ID, "healAmount");
  if (flagVal !== undefined && flagVal !== null) return Number(flagVal);
  return HEALPACK_NAMES.get(item.name.toLowerCase().trim()) ?? null;
}

function getGrenadeConfig(item) {
  if (item.type !== "consumable") return null;
  const grenadeType = item.getFlag(MODULE_ID, "grenadeType");
  if (!grenadeType) return null;
  return GRENADE_CONFIG.get(grenadeType) ?? null;
}

function getCurrentAmmo(item) {
  const stored = item.getFlag(MODULE_ID, "currentAmmo");
  if (stored !== undefined && stored !== null) return Number(stored);
  const cfg = getWeaponConfig(item);
  return cfg?.magazine ?? null;
}

function getActionSkills(actor) {
  return actor.items
    .filter(i =>
      i.type === "ability" &&
      i.system?.skillSet === "action" &&
      Number.isFinite(Number(i.system?.value ?? i.system?.wert ?? NaN))
    )
    .map(i => ({
      id:    i.id,
      name:  i.name,
      value: Number(i.system?.value ?? i.system?.wert ?? 0)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function getTargetTokens() {
  return Array.from(game.user.targets ?? []).filter(t => t?.actor);
}

// ═══════════════════════════════════════════════════════════════
// SOCKETLIB – GM-HANDLER
// ═══════════════════════════════════════════════════════════════

async function gmApplyDamage({ tokenId, damage }) {
  const token = canvas.tokens.get(tokenId);
  if (!token?.actor) return { error: "token_not_found" };
  const hp    = token.actor.system.attributes.health;
  const newHP = Math.max(0, hp.value - damage);
  await token.actor.update({ "system.attributes.health.value": newHP });
  return { actorName: token.name, oldHP: hp.value, newHP };
}

async function gmApplyHealing({ actorId, healing }) {
  const actor = game.actors.get(actorId);
  if (!actor) return { error: "actor_not_found" };
  const hp    = actor.system.attributes.health;
  const newHP = Math.min(hp.max, hp.value + healing);
  await actor.update({ "system.attributes.health.value": newHP });
  return { actorName: actor.name, oldHP: hp.value, newHP };
}

async function gmSetAmmo({ actorId, itemId, newAmmo }) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  const item = actor.items.get(itemId);
  if (!item) return;
  await item.setFlag(MODULE_ID, "currentAmmo", newAmmo);
}

async function gmConsumeItem({ actorId, itemId }) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  const item  = actor.items.get(itemId);
  if (!item) return;
  // quantity ist flach: system.quantity (verifiziert in physical.mjs)
  const qty = item.system?.quantity ?? 1;
  if (qty <= 1) await item.delete();
  else await item.update({ "system.quantity": qty - 1 });
}

/**
 * Nachladen aus Munitions-Pool.
 * Zieht benötigte Schuss vom Munitions-Item ab, füllt Magazin.
 * Wenn Pool nicht reicht: lädt so viel wie möglich.
 * @returns {{ loaded: number, poolLeft: number, poolEmpty: boolean }}
 */
async function gmReloadFromPool({ actorId, itemId, weaponType }) {
  const actor = game.actors.get(actorId);
  if (!actor) return { error: "actor_not_found" };

  const weapon = actor.items.get(itemId);
  if (!weapon) return { error: "item_not_found" };

  const cfg      = WEAPON_CONFIG.get(weaponType);
  if (!cfg)      return { error: "weapon_config_not_found" };

  const ammoName = AMMO_TYPE.get(weaponType);
  if (!ammoName) return { error: "no_ammo_type" };

  const currentMag = Number(weapon.getFlag("htbah-val2-combat", "currentAmmo") ?? cfg.magazine);
  const needed     = cfg.magazine - currentMag;

  if (needed <= 0) return { loaded: 0, poolLeft: 0, poolEmpty: false };

  // Munitions-Item im Inventar suchen (case-insensitive)
  const ammoItem = actor.items.find(i =>
    i.type !== "weapon" &&
    i.name.toLowerCase().trim() === ammoName.toLowerCase()
  );

  if (!ammoItem || (ammoItem.system?.quantity ?? 0) <= 0) {
    return { loaded: 0, poolLeft: 0, poolEmpty: true };
  }

  const poolQty   = ammoItem.system?.quantity ?? 0;
  const toLoad    = Math.min(needed, poolQty);
  const newMag    = currentMag + toLoad;
  const newPool   = poolQty - toLoad;

  // Magazin auffüllen
  await weapon.setFlag("htbah-val2-combat", "currentAmmo", newMag);

  // Pool abziehen oder löschen
  if (newPool <= 0) await ammoItem.delete();
  else await ammoItem.update({ "system.quantity": newPool });

  return { loaded: toLoad, poolLeft: newPool, poolEmpty: newPool <= 0 };
}

/**
 * Granaten-Template platzieren mit Streuung bei Fehlwurf
 * @param {object} params 
 * @param {number} params.x - Ziel X-Koordinate
 * @param {number} params.y - Ziel Y-Koordinate
 * @param {string} params.templateType - "circle", "cone", "ray"
 * @param {number} params.distance - Größe des Templates in Fuß
 * @param {string} params.fillColor - Füllfarbe (hex)
 * @param {boolean} params.isScatter - Ob die Granate streut (bei Fehlwurf)
 * @param {number} params.scatterDistance - Streuung in Fuß
 * @returns {Promise<string>} Template ID
 */
async function gmCreateGrenadeTemplate({ x, y, templateType, distance, fillColor, isScatter, scatterDistance }) {
  let finalX = x;
  let finalY = y;
  
  // Bei Streuung: zufällige Richtung und Distanz
  if (isScatter && scatterDistance > 0) {
    const angle = Math.random() * Math.PI * 2;
    const scatter = scatterDistance * canvas.grid.size;
    finalX += Math.cos(angle) * scatter;
    finalY += Math.sin(angle) * scatter;
  }

  const templateData = {
    t: templateType,
    user: game.user.id,
    x: finalX,
    y: finalY,
    distance: distance,
    fillColor: fillColor || "#ff6600",
    flags: {
      [MODULE_ID]: {
        isGrenadeTemplate: true
      }
    }
  };

  const template = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
  return template[0]?.id;
}

/**
 * Granaten-Effekt auf Tokens in Template anwenden
 * @param {object} params
 * @param {string} params.templateId - ID des Templates
 * @param {string} params.effectType - "stun", "smoke", "burn", null
 * @param {string} params.damageFormula - z.B. "4d8" oder null
 * @returns {Promise<object[]>} Array von Ergebnissen pro Token
 */
async function gmApplyGrenadeEffect({ templateId, effectType, damageFormula }) {
  const template = canvas.templates.get(templateId);
  if (!template) return { error: "template_not_found" };

  // Tokens im Template finden
  const tokensInTemplate = canvas.tokens.placeables.filter(token => {
    if (!token.actor) return false;
    const point = { x: token.center.x, y: token.center.y };
    return template.object.shape.contains(point.x - template.x, point.y - template.y);
  });

  const results = [];

  for (const token of tokensInTemplate) {
    const result = { tokenId: token.id, tokenName: token.name };

    // Schaden anwenden
    if (damageFormula) {
      const dmgRoll = await new Roll(damageFormula).evaluate();
      const damage = dmgRoll.total;
      
      // Rüstung berücksichtigen
      const armorValue = token.actor?.system?.attributes?.armor?.value ?? 0;
      const armorThreshold = armorValue === 1 ? 2 : armorValue === 2 ? 4 : armorValue === 3 ? 6 : 0;
      
      const diceResults = dmgRoll.terms[0]?.results?.map(r => r.result) ?? [damage];
      const afterArmor = diceResults.map(r => r <= armorThreshold ? 0 : r);
      const finalDmg = afterArmor.reduce((a, b) => a + b, 0);
      
      const hp = token.actor.system.attributes.health;
      const newHP = Math.max(0, hp.value - finalDmg);
      await token.actor.update({ "system.attributes.health.value": newHP });
      
      result.damage = finalDmg;
      result.oldHP = hp.value;
      result.newHP = newHP;
    }

    // Statuseffekt anwenden (stun)
    if (effectType === "stun") {
      const stunEffect = {
        name: "Betäubt",
        icon: "icons/svg/daze.svg",
        flags: {
          [MODULE_ID]: { isStun: true }
        },
        changes: [],
        duration: { rounds: 2 }
      };
      
      // Prüfen ob HTBAH-System Stun-Status hat, sonst als Active Effect
      const existingStun = token.actor.effects.find(e => e.flags?.[MODULE_ID]?.isStun);
      if (!existingStun) {
        await token.actor.createEmbeddedDocuments("ActiveEffect", [stunEffect]);
        result.effect = "stun";
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Rauchgranaten-Template mit Sichtblockierung erstellen
 */
async function gmCreateSmokeWall({ templateId, duration }) {
  const template = canvas.templates.get(templateId);
  if (!template) return { error: "template_not_found" };

  // Template mit Wand-Flagge markieren für Sichtblockierung
  await template.document.setFlag(MODULE_ID, "blockVision", true);
  await template.document.setFlag(MODULE_ID, "smokeUntilRound", game.combat?.round + (duration || 3));
  
  return { success: true, templateId };
}

// ═══════════════════════════════════════════════════════════════
// SOCKETLIB REGISTRIERUNG
// ═══════════════════════════════════════════════════════════════

let socket = null;

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE_ID);
  socket.register("applyDamage",    gmApplyDamage);
  socket.register("applyHealing",   gmApplyHealing);
  socket.register("setAmmo",        gmSetAmmo);
  socket.register("consumeItem",    gmConsumeItem);
  socket.register("reloadFromPool", gmReloadFromPool);
  socket.register("createGrenadeTemplate", gmCreateGrenadeTemplate);
  socket.register("applyGrenadeEffect", gmApplyGrenadeEffect);
  socket.register("createSmokeWall", gmCreateSmokeWall);
  console.log(`${MODULE_ID} | socketlib bereit.`);
});

// ═══════════════════════════════════════════════════════════════
// DIALOGE
// ═══════════════════════════════════════════════════════════════

/**
 * FIX v1.4: Kein <script> im Dialog-Content.
 * Firemode-Listener wird per Hooks.once("renderDialogV2") gesetzt –
 * das ist der einzige stabile Weg in Foundry V13.
 */
async function showAttackDialog(actor, weaponCfg, weaponName, currentAmmo) {
  const skills = getActionSkills(actor);
  if (!skills.length) {
    ui.notifications.warn(`${MODULE_ID} | Keine Handeln-Skills gefunden.`);
    return null;
  }

  const skillOptions = skills
    .map(s => `<option value="${s.id}">${s.name} (${s.value})</option>`)
    .join("");

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
      { label: "Abbrechen", action: "cancel", callback: () => null }
    ],
    rejectClose: false
  });

  return result ?? null;
}

async function showReloadDialog(actor, weapon, weaponType, currentMag, magazineSize) {
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

async function showHealDialog(itemName, healAmount, quantity) {
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

async function showGrenadeDialog(actor, grenadeCfg, grenadeName, quantity) {
  const skills = getActionSkills(actor);
  if (!skills.length) {
    ui.notifications.warn(`${MODULE_ID} | Keine Handeln-Skills gefunden.`);
    return null;
  }

  const skillOptions = skills
    .map(s => `<option value="${s.id}">${s.name} (${s.value})</option>`)
    .join("");

  const effectInfo = grenadeCfg.effect === "stun" ? "💫 Betäubt Ziele für 2 Runden"
                   : grenadeCfg.effect === "smoke" ? "💨 Blockiert Sicht für 3 Runden"
                   : grenadeCfg.effect === "burn" ? "🔥 Verursacht Brandschaden"
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

// ═══════════════════════════════════════════════════════════════
// WAFFENWURF
// ═══════════════════════════════════════════════════════════════

async function handleWeaponRoll(item) {
  const actor = item.actor;
  if (!actor) return;

  const cfg = getWeaponConfig(item);
  if (!cfg) return;

  const currentAmmo = cfg.magazine !== null ? getCurrentAmmo(item) : null;

  if (currentAmmo !== null && currentAmmo <= 0) {
    const doReload = await showReloadDialog(actor, item, item.getFlag(MODULE_ID, "weaponType"), currentAmmo, cfg.magazine);
    if (doReload) {
      const result = await socket.executeAsGM("reloadFromPool", {
        actorId: actor.id, itemId: item.id,
        weaponType: item.getFlag(MODULE_ID, "weaponType")
      });
      if (result?.error === "no_ammo_type" || result?.poolEmpty) {
        ui.notifications.warn(`❌ Keine ${AMMO_TYPE.get(item.getFlag(MODULE_ID, "weaponType")) ?? "Munition"} im Inventar!`);
      } else if (result?.loaded > 0) {
        ui.notifications.info(`🔄 ${item.name}: +${result.loaded} Schuss geladen. Pool: ${result.poolLeft} übrig.`);
      }
    }
    return;
  }

  const choice = await showAttackDialog(actor, cfg, item.name, currentAmmo);
  if (!choice) return;

  const skillItem = actor.items.get(choice.skillId);
  if (!skillItem) { ui.notifications.error(`${MODULE_ID} | Skill nicht gefunden.`); return; }

  // FIX v1.4: Bullets auf verfügbare Munition clampen
  let bullets = choice.bullets;
  if (currentAmmo !== null && choice.firemode === "auto") {
    bullets = Math.min(bullets, currentAmmo);
    if (bullets < 2) {
      // Zu wenig Munition für Auto – auf Semi reduzieren
      ui.notifications.warn(`⚠️ Nur noch ${currentAmmo} Schuss – wechsle auf Semi.`);
      bullets = Math.min(1, currentAmmo);
      choice.firemode = "semi";
    }
  }

  const skillName = skillItem.name;
  const base      = Number(skillItem.system?.value ?? skillItem.system?.wert ?? 0);
  const mod       = (bullets - 1) * 10;
  const target    = Math.max(0, base - mod);
  const modText   = mod > 0 ? `−${mod}` : "±0";

  // Munition abziehen (geclampt)
  if (currentAmmo !== null) {
    const spend = choice.firemode === "auto" ? bullets : 1;
    await socket.executeAsGM("setAmmo", {
      actorId: actor.id, itemId: item.id,
      newAmmo: Math.max(0, currentAmmo - spend)
    });
  }

  // Trefferwurf
  const hitRoll = await new Roll("1d100").evaluate();
  const rolled  = hitRoll.total;
  const isCrit  = rolled <= 10;
  const isHit   = rolled <= target;

  const flavorParts = [
    `<b>${item.name}</b>`,
    `${skillName} (${base})`,
    bullets > 1 ? `${bullets} Kugeln | Mod: ${modText}` : "",
    `Zielwert: <b>${target}</b>`,
    isCrit ? `<span style="color:#ffd700; font-weight:bold;">🎯 KRITISCH!</span>` : ""
  ].filter(Boolean).join(" | ");

  await hitRoll.toMessage({
    speaker:  ChatMessage.getSpeaker({ actor }),
    flavor:   flavorParts,
    rollMode: game.settings.get("core", "rollMode")
  });

  if (!isHit) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div style="background:#111; border:1px solid #cc2222; border-radius:6px; padding:10px; color:#ddd;">
        <b style="color:#e94560;">🔫 ${item.name} – FEHLSCHLAG</b><br>
        Wurf <b>${rolled}</b> vs. Zielwert <b>${target}</b> — keine Kugel trifft.
      </div>`
    });
    return;
  }

  // Schadensroll
  const [diceNum, diceSize] = cfg.dice.split("d").map(Number);
  const totalDice  = diceNum * (choice.firemode === "auto" ? bullets : 1);
  const dmgFormula = `${totalDice}d${diceSize}`;
  const dmgRoll    = await new Roll(dmgFormula).evaluate();

  // Einzelne Würfelergebnisse auslesen
  const diceResults = dmgRoll.terms[0]?.results?.map(r => r.result) ?? [dmgRoll.total];

  // Schritt 1: Krit → jeden Würfel × 2
  const afterCrit = isCrit ? diceResults.map(r => r * 2) : diceResults;
  const baseDmg   = afterCrit.reduce((a, b) => a + b, 0);

  // Schaden anwenden – Rüstung wird pro Ziel berechnet (jedes Ziel hat eigene Rüstung)
  await dmgRoll.toMessage({
    speaker:  ChatMessage.getSpeaker({ actor }),
    flavor:   `<b>${item.name}</b> – ${isCrit ? "💥 KRITISCHER TREFFER" : "TREFFER"}<br>
      ${choice.firemode === "auto" ? `${bullets} × ${cfg.dice} = ${dmgFormula}` : cfg.dice}
      ${isCrit ? ` → <b style="color:#ffd700;">Würfel × 2 = ${baseDmg} vor Rüstung</b>` : ""}`,
    rollMode: game.settings.get("core", "rollMode")
  });

  // Schaden anwenden
  const targets = getTargetTokens();
  if (targets.length === 0) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div style="background:#111; border:1px solid #555; border-radius:6px; padding:8px; color:#888;">
        <b>Schaden: ${baseDmg}</b> – Kein Ziel markiert. Token anklicken + <b>T</b> drücken.
      </div>`
    });
    return;
  }

  for (const targetToken of targets) {
    // Schritt 2: Rüstung des Ziels lesen (system.attributes.armor.value)
    // 0 = keine, 1 = leicht (≤2), 2 = mittel (≤4), 3 = schwer (≤6)
    const armorValue = targetToken.actor?.system?.attributes?.armor?.value ?? 0;
    const armorThreshold = armorValue === 1 ? 2
                         : armorValue === 2 ? 4
                         : armorValue === 3 ? 6
                         : 0;

    // Schritt 3: Würfel unter Schwellwert → 0
    const afterArmor    = afterCrit.map(r => r <= armorThreshold ? 0 : r);
    const finalDmg      = afterArmor.reduce((a, b) => a + b, 0);
    const blockedDice   = afterCrit.filter(r => r <= armorThreshold).length;

    const result = await socket.executeAsGM("applyDamage", { tokenId: targetToken.id, damage: finalDmg });
    if (result?.error) { ui.notifications.warn(`Schaden auf ${targetToken.name} fehlgeschlagen.`); continue; }

    // Chat-Nachricht mit Rüstungsinfo
    const armorLabel = armorValue === 1 ? "Leichte Rüstung"
                     : armorValue === 2 ? "Mittlere Rüstung"
                     : armorValue === 3 ? "Schwere Rüstung"
                     : null;

    const armorInfo = armorLabel && blockedDice > 0
      ? `<br><span style="color:#7ea6c8;">🛡️ ${armorLabel}: ${blockedDice} Würfel negiert (≤${armorThreshold})</span>`
      : armorLabel
      ? `<br><span style="color:#555;">🛡️ ${armorLabel}: kein Würfel negiert</span>`
      : "";

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div style="background:#111; border:1px solid #e94560; border-radius:6px; padding:8px; color:#ddd;">
        <b style="color:#e94560;">💥 ${finalDmg} Schaden</b> auf <b>${targetToken.name}</b>
        ${armorInfo}
        ${result ? `<br>HP: ${result.oldHP} → <b>${result.newHP}</b>` : ""}
      </div>`
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// HEILPACK
// ═══════════════════════════════════════════════════════════════

async function handleHealpackRoll(item) {
  const actor = item.actor;
  if (!actor) return;

  const healAmount = getHealpackValue(item);
  if (!healAmount) return;

  const qty = item.system?.quantity ?? 1;
  if (qty <= 0) { ui.notifications.warn(`❌ ${item.name}: Keine Packs mehr!`); return; }

  const confirmed = await showHealDialog(item.name, healAmount, qty);
  if (!confirmed) return;

  const healResult = await socket.executeAsGM("applyHealing", { actorId: actor.id, healing: healAmount });
  await socket.executeAsGM("consumeItem", { actorId: actor.id, itemId: item.id });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div style="background:#111; border:1px solid #44ffb2; border-radius:6px; padding:10px; color:#ddd;">
      <b style="color:#44ffb2;">💊 ${item.name}</b><br>
      <b>${actor.name}</b> heilt <b>${healAmount} HP</b>.
      ${healResult ? `<br>HP: ${healResult.oldHP} → <b>${healResult.newHP}</b>` : ""}
      ${qty - 1 === 0 ? `<br><span style="color:#ff9800;">⚠️ Letzter Pack verbraucht!</span>` : ""}
    </div>`
  });
}

// ═══════════════════════════════════════════════════════════════
// GRANATENWURF
// ═══════════════════════════════════════════════════════════════

async function handleGrenadeThrow(item) {
  const actor = item.actor;
  if (!actor) return;

  const grenadeCfg = getGrenadeConfig(item);
  if (!grenadeCfg) return;

  const qty = item.system?.quantity ?? 1;
  if (qty <= 0) {
    ui.notifications.warn(`❌ ${item.name}: Keine Granaten mehr!`);
    return;
  }

  const choice = await showGrenadeDialog(actor, grenadeCfg, item.name, qty);
  if (!choice) return;

  const skillItem = actor.items.get(choice.skillId);
  if (!skillItem) {
    ui.notifications.error(`${MODULE_ID} | Skill nicht gefunden.`);
    return;
  }

  const skillName = skillItem.name;
  const skillValue = Number(skillItem.system?.value ?? skillItem.system?.wert ?? 0);

  // Wurf durchführen
  const throwRoll = await new Roll("1d100").evaluate();
  const rolled = throwRoll.total;
  const isSuccess = rolled <= skillValue;
  const isCrit = rolled <= 10;

  // Streuung bei Fehlwurf
  let scatterDistance = 0;
  let scatterRoll = null;
  if (!isSuccess) {
    scatterRoll = await new Roll("1d6").evaluate();
    scatterDistance = scatterRoll.total;
  }

  const flavorParts = [
    `<b>${item.name} werfen</b>`,
    `${skillName} (${skillValue})`,
    isCrit ? `<span style="color:#ffd700; font-weight:bold;">🎯 PERFEKTER WURF!</span>` : ""
  ].filter(Boolean).join(" | ");

  await throwRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: flavorParts,
    rollMode: game.settings.get("core", "rollMode")
  });

  if (scatterRoll) {
    await scatterRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<b>⚠️ Fehlwurf!</b> Granate streut ${scatterDistance} Fuß`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  // Template-Platzierung initiieren
  ui.notifications.info(`🎯 Klicke auf die Karte, um die ${item.name} zu platzieren. (Rechtsklick = Abbrechen)`);

  // Interaktive Template-Vorschau erstellen
  const templateData = {
    t: grenadeCfg.type,
    user: game.user.id,
    distance: grenadeCfg.size,
    fillColor: grenadeCfg.effect === "smoke" ? "#666666"
                : grenadeCfg.effect === "stun" ? "#ffff00"
                : grenadeCfg.effect === "burn" ? "#ff4400"
                : "#ff6600",
    flags: {
      [MODULE_ID]: {
        isGrenadeTemplate: true,
        grenadeType: item.getFlag(MODULE_ID, "grenadeType"),
        scatterDistance: scatterDistance,
        isScatter: !isSuccess,
        damage: grenadeCfg.damage,
        effect: grenadeCfg.effect,
        actorId: actor.id,
        itemId: item.id
      }
    }
  };

  // Template-Preview erstellen (interaktiv)
  const templateDoc = new MeasuredTemplateDocument(templateData, { parent: canvas.scene });
  const template = new game.measuredTemplates.documentClass.implementation(templateDoc);
  
  // drawPreview() gibt die finale Position zurück (oder null bei Abbruch)
  const finalTemplate = await template.drawPreview();
  
  if (!finalTemplate) {
    ui.notifications.warn("Granaten-Wurf abgebrochen.");
    return;
  }

  const templateId = finalTemplate.id;

  // Bei Streuung: Template nach Platzierung verschieben
  if (scatterDistance > 0) {
    const placedTemplate = canvas.templates.get(templateId);
    if (placedTemplate) {
      const angle = Math.random() * Math.PI * 2;
      const scatter = scatterDistance * canvas.grid.size;
      const newX = placedTemplate.document.x + Math.cos(angle) * scatter;
      const newY = placedTemplate.document.y + Math.sin(angle) * scatter;
      await placedTemplate.document.update({ x: newX, y: newY });
      
      ui.notifications.warn(`💥 Granate streut ${scatterDistance} Fuß in zufällige Richtung!`);
    }
  }

  // Effekte anwenden
  const effectResults = await socket.executeAsGM("applyGrenadeEffect", {
    templateId: templateId,
    effectType: grenadeCfg.effect,
    damageFormula: grenadeCfg.damage
  });

  // Bei Rauchgranate: Sichtblockierung aktivieren
  if (grenadeCfg.effect === "smoke") {
    await socket.executeAsGM("createSmokeWall", {
      templateId: templateId,
      duration: 3
    });
  }

  // Granate verbrauchen
  await socket.executeAsGM("consumeItem", {
    actorId: actor.id,
    itemId: item.id
  });

  // Chat-Nachricht mit Ergebnissen
  let messageContent = `<div style="background:#111; border:1px solid #ff6600; border-radius:6px; padding:10px; color:#ddd;">
    <b style="color:#ff8844;">💣 ${item.name}</b><br>
    ${isSuccess ? "✅ Präziser Wurf!" : `⚠️ Fehlwurf – streut ${scatterDistance} Fuß!`}
    <br><br>`;

  if (effectResults?.length > 0) {
    messageContent += `<b>Betroffene Ziele:</b><br>`;
    for (const result of effectResults) {
      messageContent += `• <b>${result.tokenName}</b>`;
      if (result.damage) {
        messageContent += ` – ${result.damage} Schaden (HP: ${result.oldHP} → ${result.newHP})`;
      }
      if (result.effect === "stun") {
        messageContent += ` – 💫 <span style="color:#ffff00;">Betäubt!</span>`;
      }
      messageContent += `<br>`;
    }
  } else {
    messageContent += `<span style="color:#888;">Keine Ziele im Wirkungsbereich.</span><br>`;
  }

  if (grenadeCfg.effect === "smoke") {
    messageContent += `<br>💨 <b style="color:#888;">Rauch blockiert Sicht für 3 Runden!</b>`;
  }

  messageContent += `</div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent
  });
}

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
  
  const currentHeal = item.getFlag(MODULE_ID, "healAmount") ?? "";
  const currentGrenade = item.getFlag(MODULE_ID, "grenadeType") ?? "";
  
  const grenadeOptions = GRENADE_TYPE_OPTIONS
    .map(o => `<option value="${o.value}" ${o.value === currentGrenade ? "selected" : ""}>${o.label}</option>`)
    .join("");

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

// ═══════════════════════════════════════════════════════════════
// LIBWRAPPER – nur noch item.roll()
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

  libWrapper.register(
    MODULE_ID,
    "game.howtobeahero.HowToBeAHeroItem.prototype.roll",
    async function(wrapped, ...args) {
      if (getWeaponConfig(this))  { await handleWeaponRoll(this);  return; }
      if (getGrenadeConfig(this)) { await handleGrenadeThrow(this); return; }
      if (getHealpackValue(this)) { await handleHealpackRoll(this); return; }
      return wrapped(...args);
    },
    "MIXED"
  );

  console.log(`${MODULE_ID} | libWrapper registriert.`);
});

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

Hooks.once("ready", () => {
  if (!socket && game.user.isGM)
    ui.notifications.warn("htbah-val2-combat: socketlib nicht geladen.");
  console.log(`${MODULE_ID} | Bereit.`);
});
