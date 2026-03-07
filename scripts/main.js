/**
 * HTBAH VAL-2 Combat v1.8.1
 * Foundry V13 | Requires: lib-wrapper, socketlib
 *
 * Neu in v1.8.1:
 * - libWrapper auf OVERRIDE geändert (Granaten benötigen keine Targets mehr)
 * - Rauch occlusion.mode auf 1 (FADE) korrigiert statt 2 (verhindert Fehler)
 * - Brandgranaten werden jetzt auch nach 5s automatisch entfernt
 * 
 * Neu in v1.8:
 * - Skill-Würfe nutzen system.total (enthält bereits Handeln-Mod)
 * - Rauchgranaten blockieren Sicht (occlusion + roof)
 * - Chat zeigt Skill-Berechnung an (Skill + Handeln-Mod)
 * 
 * Neu in v1.7:
 * - 0 HP → Dead Status automatisch gesetzt
 * - Unter 10 HP → Unconscious Status automatisch gesetzt
 * - Granatenradius korrekt in Scene Units
 * - Streuung korrekt von Fuß → Pixel umgerechnet
 * - Rauch läuft automatisch nach 3 Runden ab
 * - Rüstungslogik in Hilfsfunktionen ausgelagert
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
  ["frag",   { label: "Splittergranate",   type: "circle", size: 2, damage: "4d8", effect: null }],
  ["flash",  { label: "Blendgranate",      type: "circle", size: 2, damage: null,  effect: "blind" }],
  ["smoke",  { label: "Rauchgranate",      type: "circle", size: 4, damage: null,  effect: "smoke" }],
  ["incen",  { label: "Brandgranate",      type: "circle", size: 3, damage: "3d8", effect: "burn" }],
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
const SMOKE_TILE_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAEr0lEQVR4nOWbaU8UQRiE+8d2IofcoHhfqHjft6IiqyIoaPyB9m66dmqLt3t6JiQm9IcKyc7Abj1db/WyO+O8nz8VNBU0HTQbdDpoLmg+aCFoMWgpaDloJWg1aC3oTNTZoPWgc1Hnoy5EXYy61EP4Xfwt/G0813p8fryWtfj6VuLrXYqvfyH6mYv+ZqPfKRfNz/Qwbxln02zkctSVDsLvKBCGYYHoAmHGZVa+zTjMwzivtBq+KrqWkZ5rAeFkAAReUw7EEQiup/mccTUNY9cN3SBZxxUKw8iBKIbgjsG8ZVxNw+RGBykYhmGB6AXBFZjvajxl+ibpVkZ8Xg5GFxBJCO4YzFvG2TSbuy3aJOkxhcIwLBC9IDjftH0X8zrjbJxX2TJ6p0AWGE4Hg9CO6AJh0flmq2szn1r1lHE1fJd0LyM+T4GUgOA0tEFYcr6JPhdeH/OWcTV8n/TAEB9XICkQXSFwMS4730Sf277EvBqHeRhn02zyYYEUCsMACB2NjUIIvDusON9En7c6nnk1n1r1lHGYekR6nBGfx0ByIDQNCoE7gbfIVeftubcKr9S8ZRzmnpCeGuLjDMQC0QUCF+NEHzhvz71l3or9ZoFxNfysQAqkDYQFQccBECb6wHk7+pj7nPnUqrNxNf086kVGOMeCwSCsNOQgaB+MUgAAGn2ee7R9ycqreTX9kvTKEB9XGCUQNAnYHaw+GKXA+cnWz819m3nLOFaVDb8WvTEeYyCcDAXRBiHXB6NRcJnV1+hz4ZWah3E2O9TbjHAOw+BEtEHgYtRROJICl1l9K/qY+67m2fS7qPeGcIxhdIVg9YGOwjgFAFC6+og+z7yat4yz6Q+iLeMxhaEgFAJ3go5CNgXOTzZ/avU1+lx4JeZhfCvqY0Y4h0G0QeBi1FHIpWAMoM/qI/ocezXPKw7jn6I+G8IxgOBEKAQeBx2F4hQ4b+/73Pyp1Uf0eeYt82wcRrejvpDwGMNgEAqBO0FHwUqB7gij9wUMwIp/bvURfS68NvNsescQw2iDwMXIo5BLwZExGALg9uf4W82fWn1EHzOv5mEcRgdBXw0NBMa2AQGdoKNgpUB3BB2DMYCS+Kdmn6PPhWeZh/FvUd9JeIxBKAQuRh6FXBdkx8D5yfm32p/jr82fW33E3jI/NLxrCCAUAsYhlwLdEXQMrN1gDIDn32p/vPHR+Fuzj+hj5tk8jP+I2iPhMYBgCOgEjILVBToG/MbI2g1GPdAGIDX/qfinVh8rD/NDw/tBP0n7BGLXN0nIpSA1BqkeyAJIFSBvfzz/vPVx/HX2B76JvZr/RVIIGIeBt7uAx4B3A+4B3g7NIiwFkNr+eP65/Dj+uvowfxB0SDogCFYKeAx4S0z1gBZhEYCSHaAUAMcfs79HKz80/TvoT/x56Jsk7PnJLuAx6AvA2gmOBUCqAEsADM3/jT+7ALCK8L8BOFEJqL4Dqt4Fqn8fUPU7war/F6j+v8HqPw+o/hOh6j8TrP5T4eq/F6j+m6Hqvxus/tvh6q8PqP4KkeqvEar+KrHqrxOs/krR6q8Vrv5q8ervF6j+jpHq7xmq/q6x6u8brP7O0emeEE7MvcNTvuK7x/8B98AERoxYHPgAAAAASUVORK5CYII=";

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
  // mod = Math.round(summe aller action-skills / 10) → wird von HTBAH auf system.total addiert
  const actionMod = actor.skillSetData?.action?.mod ?? 0;
  const actionTotal = actor.skillSetData?.action?.totalValue ?? 0;

  const skills = actor.items
    .filter(i =>
      i.type === "ability" &&
      i.system?.skillSet === "action" &&
      Number.isFinite(Number(i.system?.value ?? NaN))
    )
    .map(i => {
      const base  = Number(i.system?.value ?? 0);
      const total = Number(i.system?.total ?? (base + actionMod)); // system.total = value + mod
      return {
        id:    i.id,
        name:  i.name,
        value: total,  // Würfelwert = total (99)
        base,
        total
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Blanker Handeln-Eintrag (nur mod, kein Skill-Item)
  if (actionMod > 0) {
    skills.unshift({
      id:    "__action_base__",
      name:  "Handeln (Basis)",
      value: actionMod,
      base:  actionMod,
      total: actionMod
    });
  }

  return skills;
}

function getTargetTokens() {
  return Array.from(game.user.targets ?? []).filter(t => t?.actor);
}

function sceneUnitsToPixels(units) {
  const gridDistance = Number(canvas?.scene?.grid?.distance ?? canvas?.grid?.distance ?? 5);
  const gridSize = Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size ?? 100);
  if (!gridDistance || !gridSize) return units;
  return (units / gridDistance) * gridSize;
}

function getArmorThreshold(actor) {
  const armorValue = actor?.system?.attributes?.armor?.value ?? 0;
  return armorValue === 1 ? 2
       : armorValue === 2 ? 4
       : armorValue === 3 ? 6
       : 0;
}

function getArmorLabel(actor) {
  const armorValue = actor?.system?.attributes?.armor?.value ?? 0;
  return armorValue === 1 ? "Leichte Rüstung"
       : armorValue === 2 ? "Mittlere Rüstung"
       : armorValue === 3 ? "Schwere Rüstung"
       : null;
}

function extractDiceResults(roll) {
  const term = roll?.terms?.find(t => Array.isArray(t?.results));
  return term?.results?.map(r => Number(r.result) || 0) ?? [Number(roll?.total) || 0];
}

function applyArmorToDiceResults(diceResults, armorThreshold) {
  const afterArmor = diceResults.map(r => r <= armorThreshold ? 0 : r);
  const blockedDice = diceResults.filter(r => r <= armorThreshold).length;
  const finalDamage = afterArmor.reduce((a, b) => a + b, 0);
  return { afterArmor, blockedDice, finalDamage };
}

function getGrenadeFillColor(effect) {
  return effect === "smoke" ? "#666666"
       : effect === "stun"  ? "#ffff00"
       : effect === "burn"  ? "#ff4400"
       : "#ff6600";
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

  if (isScatter && scatterDistance > 0) {
    const angle = Math.random() * Math.PI * 2;
    const scatterPx = sceneUnitsToPixels(scatterDistance);
    finalX += Math.cos(angle) * scatterPx;
    finalY += Math.sin(angle) * scatterPx;
  }

  const templateData = {
    t: templateType,
    user: game.user.id,
    x: finalX,
    y: finalY,
    distance: Number(distance),
    fillColor: fillColor || "#ff6600",
    flags: {
      [MODULE_ID]: {
        isGrenadeTemplate: true
      }
    }
  };

  const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
  return created[0]?.id ?? null;
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
  const templateDoc = canvas.scene.templates.get(templateId);
  if (!templateDoc) return { error: "template_not_found" };

  const template = canvas.templates.get(templateId);

  // Radius in Pixeln berechnen
  const gridSize     = canvas.scene.grid.size ?? 100;
  const radiusPx     = templateDoc.distance * gridSize;
  const templateX    = templateDoc.x;
  const templateY    = templateDoc.y;

  const tokensInTemplate = canvas.tokens.placeables.filter(token => {
    if (!token.actor) return false;
    const dx = token.center.x - templateX;
    const dy = token.center.y - templateY;
    return Math.sqrt(dx * dx + dy * dy) <= radiusPx;
  });

  const results = [];

  for (const token of tokensInTemplate) {
    const result = { tokenId: token.id, tokenName: token.name };

    if (damageFormula) {
      const dmgRoll = await new Roll(damageFormula).evaluate();
      const diceResults = extractDiceResults(dmgRoll);
      const armorThreshold = getArmorThreshold(token.actor);
      const { blockedDice, finalDamage } = applyArmorToDiceResults(diceResults, armorThreshold);

      const hp = token.actor.system.attributes.health;
      const newHP = Math.max(0, hp.value - finalDamage);
      await token.actor.update({ "system.attributes.health.value": newHP });

      result.damage = finalDamage;
      result.oldHP = hp.value;
      result.newHP = newHP;
      result.blockedDice = blockedDice;
      result.armorThreshold = armorThreshold;
      result.armorLabel = getArmorLabel(token.actor);
    }

    if (effectType === "stun") {
      const existingStun = token.actor.effects.find(e => e.flags?.[MODULE_ID]?.isStun);
      if (!existingStun) {
        // HTBAH-native stunned Condition (setzt stun + incapacitated)
        await token.actor.createEmbeddedDocuments("ActiveEffect", [{
          name: "Betäubt",
          icon: "systems/how-to-be-a-hero/ui/icons/svg/statuses/stunned.svg",
          flags: { [MODULE_ID]: { isStun: true }, htbah: { isCondition: true, conditionId: "stunned" } },
          statuses: ["stun", "incapacitated"],
          changes: [],
          duration: {
            rounds:     2,
            startRound: game.combat?.round ?? 0,
            combat:     game.combat?.id ?? null
          }
        }]);
        result.effect = "stun";
      }
    }

    if (effectType === "blind") {
      // HTBAH-native blinded Condition
      const existingBlind = token.actor.effects.find(e => e.flags?.htbah?.conditionId === "blinded");
      if (!existingBlind) {
        await token.actor.createEmbeddedDocuments("ActiveEffect", [{
          name: "Geblendet",
          icon: "systems/how-to-be-a-hero/ui/icons/svg/statuses/blinded.svg",
          flags: { htbah: { isCondition: true, conditionId: "blinded" } },
          statuses: ["blind"],
          changes: [],
          duration: {
            rounds:     1,
            startRound: game.combat?.round ?? 0,
            combat:     game.combat?.id ?? null
          }
        }]);
        // Sicht sperren (Bewegung bleibt frei) — via GM-Socket
        const origSight = token.document.getFlag(MODULE_ID, "originalSight");
        await socket.executeAsGM("applyTokenRestrictions", {
          tokenId:      token.document.id,
          sightEnabled: false,
          ...(origSight === undefined ? { origSight: token.document.sight?.enabled ?? true } : {})
        });
        result.effect = "blind";
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Rauchgranaten-Template mit Sichtblockierung erstellen
 */
async function gmCreateSmokeTile({ templateId, duration, smokeTextureSrc }) {
  const templateDoc = canvas.scene.templates.get(templateId);
  if (!templateDoc) return { error: "template_not_found" };

  smokeTextureSrc = smokeTextureSrc || SMOKE_TILE_IMG;

  const currentRound   = Number(game.combat?.round ?? 0);
  const expiresOnRound = currentRound + Number(duration || 3);

  // Radius in Pixeln — templateDoc.distance ist in Feldern (V13)
  const gridSize = canvas.scene.grid.size ?? 100;
  const radiusPx = templateDoc.distance * gridSize;
  const diameter = radiusPx * 2;
  const tileX    = templateDoc.x - radiusPx;
  const tileY    = templateDoc.y - radiusPx;

  // V13 TileData: Rauch mit Sichtblockierung
  const tileData = {
    x:         tileX,
    y:         tileY,
    width:     diameter,
    height:    diameter,
    elevation: 1,                        // > 0 → Overhead-Layer
    sort:      9999,                     // Über allem anderen
    alpha:     0.9,                      // Dichter Rauch (höhere Deckkraft)
    texture:   { src: smokeTextureSrc },
    occlusion: {
      mode:  1,                          // 1 = FADE → Sichtblockierung mit Überblendung
      alpha: 0.95                        // Sehr hohe Blockierung (fast undurchsichtig)
    },
    roof:      true,                     // Als Dach markieren für Sichtblockierung
    restrictions: {
      light: true,                       // blockiert Licht
      weather: true                      // blockiert Wetter
    },
    flags: {
      [MODULE_ID]: {
        isSmokeTile:     true,
        smokeTemplateId: templateId,
        smokeUntilRound: expiresOnRound
      }
    }
  };

  const created = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
  const tileId  = created[0]?.id ?? null;

  await templateDoc.setFlag(MODULE_ID, "isSmokeTemplate", true);
  await templateDoc.setFlag(MODULE_ID, "smokeUntilRound", expiresOnRound);
  await templateDoc.setFlag(MODULE_ID, "smokeTileId",     tileId);

  // Sicht neu berechnen
  canvas.perception.update({ refreshVision: true, refreshLighting: true });

  return { success: true, templateId, tileId, expiresOnRound };
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
  socket.register("applyGrenadeEffect",    gmApplyGrenadeEffect);
  socket.register("createSmokeTile",           gmCreateSmokeTile);
  socket.register("applyBlindedCondition",     gmApplyBlindedCondition);
  socket.register("applyTokenRestrictions",    gmApplyTokenRestrictions);
  socket.register("removeTokenRestrictions",   gmRemoveTokenRestrictions);
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

// ═══════════════════════════════════════════════════════════════
// WAFFENWURF
// ═══════════════════════════════════════════════════════════════

async function handleWeaponRoll(item) {
  const actor = item.actor;
  if (!actor) return;

  if (isActorIncapacitated(actor)) {
    ui.notifications.warn(`❌ ${actor.name} ist handlungsunfähig und kann nicht angreifen.`);
    return;
  }

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

  // Reload direkt aus dem Angriffs-Dialog
  if (choice.reload) {
    const confirmed = await showReloadDialog(actor, item, weaponType, currentAmmo ?? 0, cfg.magazine);
    if (confirmed) {
      await socket.executeAsGM("reloadFromPool", { actorId: actor.id, itemId: item.id });
    }
    return;
  }

  if (!choice.skillId) return;

  // Handeln-Mod auslesen
  const actionMod = actor.skillSetData?.action?.mod ?? 0;

  let skillName, skillBase, skillTotal;
  if (choice.skillId === "__action_base__") {
    skillName = "Handeln (Basis)";
    skillBase = Number(actor.system?.attributes?.skillSets?.action?.value ?? 0);
    skillTotal = skillBase; // Nur Basis-Wert, kein Skill-Item
  } else {
    const skillItem = actor.items.get(choice.skillId);
    if (!skillItem) { ui.notifications.error(`${MODULE_ID} | Skill nicht gefunden.`); return; }
    skillName = skillItem.name;
    skillBase = Number(skillItem.system?.value ?? 0);
    // HTBAH setzt system.total = value + actionMod automatisch
    // Falls nicht vorhanden, berechnen wir es manuell
    skillTotal = Number(skillItem.system?.total ?? (skillBase + actionMod));
  }
  const base = skillTotal;
  // FIX v1.4: Bullets auf verfügbare Munition clampen
  let bullets = choice.bullets;
  if (currentAmmo !== null && choice.firemode === "auto") {
    bullets = Math.min(bullets, currentAmmo);
    if (bullets < 2) {
      ui.notifications.warn(`⚠️ Nur noch ${currentAmmo} Schuss – wechsle auf Semi.`);
      bullets = Math.min(1, currentAmmo);
      choice.firemode = "semi";
    }
  }

  const mod    = (bullets - 1) * 10;
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
    skillTotal !== skillBase && actionMod > 0
      ? `${skillName} (${skillBase} + ${actionMod} = ${skillTotal})`
      : `${skillName} (${skillTotal})`,
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

  if (isActorIncapacitated(actor)) {
    ui.notifications.warn(`❌ ${actor.name} ist handlungsunfähig und kann keinen Heilpack benutzen.`);
    return;
  }

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

  if (isActorIncapacitated(actor)) {
    ui.notifications.warn(`❌ ${actor.name} ist handlungsunfähig und kann keine Granate werfen.`);
    return;
  }

  const grenadeCfg = getGrenadeConfig(item);
  if (!grenadeCfg) return;

  const qty = item.system?.quantity ?? 1;
  if (qty <= 0) {
    ui.notifications.warn(`❌ ${item.name}: Keine Granaten mehr!`);
    return;
  }

  // ── Schritt 1: Skill-Dialog ────────────────────────────────────────
  const choice = await showGrenadeDialog(actor, grenadeCfg, item.name, qty);
  if (!choice || !choice.skillId) return;

  // Handeln-Mod auslesen
  const actionMod = actor.skillSetData?.action?.mod ?? 0;

  let skillName, skillBase, skillTotal;
  if (choice.skillId === "__action_base__") {
    skillName  = "Handeln (Basis)";
    skillBase  = Number(actor.system?.attributes?.skillSets?.action?.value ?? 0);
    skillTotal = skillBase; // Nur Basis-Wert
  } else {
    const skillItem = actor.items.get(choice.skillId);
    if (!skillItem) { ui.notifications.error(`${MODULE_ID} | Skill nicht gefunden.`); return; }
    skillName  = skillItem.name;
    skillBase  = Number(skillItem.system?.value ?? 0);
    // HTBAH setzt system.total = value + actionMod automatisch
    skillTotal = Number(skillItem.system?.total ?? (skillBase + actionMod));
  }

  // ── Schritt 2: Wurf-Check ──────────────────────────────────────────

  const throwRoll = await new Roll("1d100").evaluate();
  const rolled    = throwRoll.total;
  const isSuccess = rolled <= skillTotal;
  const isCrit    = rolled <= 10;

  let scatterDistance = 0;
  let scatterRoll     = null;

  if (!isSuccess) {
    scatterRoll     = await new Roll("1d6").evaluate();
    scatterDistance = scatterRoll.total;
  }

  await throwRoll.toMessage({
    speaker:  ChatMessage.getSpeaker({ actor }),
    flavor:   [`<b>${item.name} werfen</b>`,
               skillTotal !== skillBase && actionMod > 0
                 ? `${skillName} (${skillBase} + ${actionMod} = ${skillTotal})`
                 : `${skillName} (${skillTotal})`,
               isCrit ? `<span style="color:#ffd700;">🎯 PERFEKTER WURF!</span>` : ""].filter(Boolean).join(" | "),
    rollMode: game.settings.get("core", "rollMode")
  });

  if (scatterRoll) {
    await scatterRoll.toMessage({
      speaker:  ChatMessage.getSpeaker({ actor }),
      flavor:   `<b>⚠️ Fehlwurf!</b> Granate streut ${scatterDistance} Fuß`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  // ── Schritt 3: Click-to-Place ──────────────────────────────────────
  // User klickt auf die Karte → Template wird dort erstellt → Bestätigung
  ui.notifications.info(`🎯 ${item.name}: Klicke auf die Karte um die Granate zu platzieren. Rechtsklick = Abbrechen.`);

  const clickPos = await new Promise((resolve) => {
    const layer = canvas.templates;

    const onClick = (event) => {
      if (event.button === 2) { resolve(null); cleanup(); return; }
      const pos = event.data?.getLocalPosition?.(canvas.stage) ?? canvas.mousePosition;
      resolve({ x: pos.x, y: pos.y });
      cleanup();
    };

    const onRightClick = () => { resolve(null); cleanup(); };

    const cleanup = () => {
      canvas.stage.off("pointerdown", onClick);
      canvas.stage.off("rightdown",   onRightClick);
    };

    canvas.stage.on("pointerdown", onClick);
    canvas.stage.on("rightdown",   onRightClick);
  });

  if (!clickPos) {
    ui.notifications.info("Granaten-Wurf abgebrochen.");
    return;
  }

  let placedTemplate = null;
  try {
    const templateData = {
      t:         grenadeCfg.type,
      user:      game.user.id,
      x:         clickPos.x,
      y:         clickPos.y,
      distance:  Number(grenadeCfg.size),
      fillColor: getGrenadeFillColor(grenadeCfg.effect),
      flags: {
        [MODULE_ID]: {
          isGrenadeTemplate: true,
          grenadeType:       item.getFlag(MODULE_ID, "grenadeType"),
          scatterDistance,
          isScatter:         !isSuccess,
          damage:            grenadeCfg.damage,
          effect:            grenadeCfg.effect,
          actorId:           actor.id,
          itemId:            item.id
        }
      }
    };

    const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    placedTemplate = created?.[0];
  } catch(e) {
    console.error(`${MODULE_ID} | Template-Erstellung Fehler:`, e);
    ui.notifications.error("Template-Erstellung fehlgeschlagen!");
    return;
  }

  if (!placedTemplate?.id) {
    ui.notifications.error("Template-Erstellung fehlgeschlagen!");
    return;
  }

  const templateId = placedTemplate.id;

  // ── Schritt 4: Streuung auf platziertes Template anwenden ──────────
  if (scatterDistance > 0) {
    const angle     = Math.random() * Math.PI * 2;
    const scatterPx = sceneUnitsToPixels(scatterDistance);
    await placedTemplate.update({
      x: placedTemplate.x + Math.cos(angle) * scatterPx,
      y: placedTemplate.y + Math.sin(angle) * scatterPx
    });
    ui.notifications.warn(`💥 Granate streut ${scatterDistance} Fuß in zufällige Richtung!`);
  }

  // ── Schritt 5: Bestätigungs-Dialog ────────────────────────────────
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${item.name} — Werfen bestätigen` },
    content: `<p>Template ist platziert${scatterDistance > 0 ? ` (streut ${scatterDistance} Fuß)` : ""}.<br>
              Granate jetzt auswerten?</p>`,
    yes: { label: "💣 Werfen!", icon: "fa-bomb" },
    no:  { label: "Abbrechen", icon: "fa-times" }
  });

  if (!confirmed) {
    await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [templateId]);
    return;
  }

  // ── Schritt 6: Effekte auswerten ───────────────────────────────────
  const effectResults = await socket.executeAsGM("applyGrenadeEffect", {
    templateId,
    effectType:    grenadeCfg.effect,
    damageFormula: grenadeCfg.damage
  });

  if (grenadeCfg.effect === "smoke") {
    const smokeTextureSrc = item.getFlag(MODULE_ID, "smokeTexture") || null;
    await socket.executeAsGM("createSmokeTile", { templateId, duration: 3, smokeTextureSrc });
  }

  await socket.executeAsGM("consumeItem", { actorId: actor.id, itemId: item.id });

  // Blend, Splitter, Brand: Template nach 5 Sekunden löschen
  // Rauch bleibt liegen (wird durch Combat-Hook abgeräumt)
  if (grenadeCfg.effect === "blind" || grenadeCfg.effect === null || grenadeCfg.effect === "burn") {
    setTimeout(async () => {
      await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [templateId]);
    }, 5000);
  }

  let messageContent = `<div style="background:#111; border:1px solid #ff6600; border-radius:6px; padding:10px; color:#ddd;">
    <b style="color:#ff8844;">💣 ${item.name}</b><br>
    ${isSuccess ? "✅ Präziser Wurf!" : `⚠️ Fehlwurf – streut ${scatterDistance} Fuß!`}
    <br><br>`;

  if (Array.isArray(effectResults) && effectResults.length > 0) {
    messageContent += `<b>Betroffene Ziele:</b><br>`;
    for (const result of effectResults) {
      messageContent += `• <b>${result.tokenName}</b>`;
      if (typeof result.damage === "number") {
        messageContent += ` – ${result.damage} Schaden (HP: ${result.oldHP} → ${result.newHP})`;
        if (result.armorLabel) {
          messageContent += ` – 🛡️ ${result.armorLabel}`;
          if (result.blockedDice > 0) messageContent += ` (${result.blockedDice} Würfel negiert)`;
        }
      }
      if (result.effect === "stun") {
        messageContent += ` – 💫 <span style="color:#ffff00;">Betäubt!</span>`;
      }
      if (result.effect === "blind") {
        messageContent += ` – 🌟 <span style="color:#ffffaa;">Geblendet!</span>`;
      }
      messageContent += `<br>`;
    }
  } else {
    messageContent += `<span style="color:#888;">Keine Ziele im Wirkungsbereich.</span><br>`;
  }

  if (grenadeCfg.effect === "smoke") {
    messageContent += `<br>💨 <b style="color:#888;">Rauch bleibt 3 Runden liegen.</b>`;
  }

  messageContent += `</div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent
  });
}

// ═══════════════════════════════════════════════════════════════
// RAUCH-CLEANUP
// ═══════════════════════════════════════════════════════════════

async function cleanupExpiredSmokeTemplates() {
  if (!game.user.isGM || !canvas?.scene || !game.combat) return;

  const currentRound = Number(game.combat.round ?? 0);
  if (!currentRound) return;

  const expiredTemplates = canvas.scene.templates.filter(t => {
    const isSmoke    = t.getFlag(MODULE_ID, "isSmokeTemplate");
    const untilRound = Number(t.getFlag(MODULE_ID, "smokeUntilRound") ?? 0);
    return isSmoke && untilRound > 0 && currentRound >= untilRound;
  });

  if (!expiredTemplates.length) return;

  const templateIds = expiredTemplates.map(t => t.id);
  const tileIds     = expiredTemplates
    .map(t => t.getFlag(MODULE_ID, "smokeTileId"))
    .filter(Boolean);

  if (tileIds.length)     await canvas.scene.deleteEmbeddedDocuments("Tile",             tileIds);
  if (templateIds.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", templateIds);

  await ChatMessage.create({
    content: `<div style="background:#111; border:1px solid #666; border-radius:6px; padding:8px; color:#aaa;">
      💨 Rauch verzieht sich.
    </div>`
  });
}

Hooks.on("updateCombat", async (combat, changed) => {
  if (!game.user.isGM) return;
  if (!("round" in changed)) return;
  await cleanupExpiredSmokeTemplates();
});

// ═══════════════════════════════════════════════════════════════
// HP-STATUS — HTBAH conditionManager Integration
// Nutzt native HTBAH-Conditions statt toggleEffect
//
// HTBAH condition IDs (aus config.mjs):
//   dead          → statuses: ["dead"]
//   incapacitated → statuses: ["incapacitated"]        (Kampfunfähig)
//   unconscious   → statuses: ["unconscious","incapacitated","prone"]
//   stunned       → statuses: ["stun","incapacitated"]
//   blinded       → statuses: ["blind"]                (Blendgranate)
//   prone         → statuses: ["prone"]                (Liegend, optional)
// ═══════════════════════════════════════════════════════════════

// Status-IDs die Handlungsunfähigkeit bedeuten
const INCAPACITATED_STATUS_IDS = ["dead", "incapacitated", "unconscious", "stun"];

// HTBAH conditionManager holen (verfügbar nach ready)
function getCondMgr() {
  return game.howtobeahero?.conditionManager ?? null;
}

// Condition per HTBAH-Manager setzen
async function htbahAddCondition(actor, conditionKey) {
  const mgr = getCondMgr();
  if (!mgr) {
    console.warn(`${MODULE_ID} | conditionManager nicht verfügbar`);
    return;
  }
  const condData = mgr.getConditionData(conditionKey);
  if (!condData) {
    console.warn(`${MODULE_ID} | Condition nicht gefunden: ${conditionKey}`);
    return;
  }
  await mgr.addCondition(actor, condData);
}

// Condition per HTBAH-Manager entfernen
async function htbahRemoveCondition(actor, conditionKey) {
  const mgr = getCondMgr();
  if (!mgr) return;
  const condData = mgr.getConditionData(conditionKey);
  if (!condData) return;
  await mgr.removeCondition(actor, condData);
}

// Prüft ob Actor eine bestimmte HTBAH-Condition hat
function htbahHasCondition(actor, conditionKey) {
  const mgr = getCondMgr();
  if (!mgr) return actor.statuses?.has(conditionKey) ?? false;
  const condData = mgr.getConditionData(conditionKey);
  if (!condData) return false;
  return mgr.isConditionActive(actor, condData);
}

// ── GM-Funktionen für Token-Sicht/Bewegung (brauchen GM-Rechte) ──

async function gmApplyTokenRestrictions({ tokenId, sightEnabled, movementLocked, origSight, origMovement }) {
  const tokenDoc = canvas.tokens?.get(tokenId)?.document
                ?? game.scenes.active?.tokens?.get(tokenId);
  if (!tokenDoc) return;
  const updates = {};
  if (sightEnabled    !== undefined) updates["sight.enabled"]   = sightEnabled;
  if (movementLocked  !== undefined) updates["movement.locked"] = movementLocked;
  if (Object.keys(updates).length) await tokenDoc.update(updates);
  if (origSight    !== undefined) await tokenDoc.setFlag(MODULE_ID, "originalSight",    origSight);
  if (origMovement !== undefined) await tokenDoc.setFlag(MODULE_ID, "originalMovement", origMovement);
  canvas.perception.update({ refreshVision: true });
}

async function gmRemoveTokenRestrictions({ tokenId }) {
  const tokenDoc = canvas.tokens?.get(tokenId)?.document
                ?? game.scenes.active?.tokens?.get(tokenId);
  if (!tokenDoc) return;
  const actor = tokenDoc.actor;
  if (!actor) return;
  const stillIncap = INCAPACITATED_STATUS_IDS.some(id => actor.statuses?.has(id));
  if (stillIncap) return;
  const origSight    = tokenDoc.getFlag(MODULE_ID, "originalSight")    ?? true;
  const origMovement = tokenDoc.getFlag(MODULE_ID, "originalMovement") ?? false;
  await tokenDoc.update({ "sight.enabled": origSight, "movement.locked": origMovement });
  await tokenDoc.unsetFlag(MODULE_ID, "originalSight");
  await tokenDoc.unsetFlag(MODULE_ID, "originalMovement");
  canvas.perception.update({ refreshVision: true });
}

// Original Token-Werte sichern bevor wir sperren
async function saveTokenOriginalValues(tokenDoc) {
  const already = tokenDoc.getFlag(MODULE_ID, "originalSight");
  if (already !== undefined) return;
  // Flags können auch vom Player gesetzt werden
  await tokenDoc.setFlag(MODULE_ID, "originalSight",    tokenDoc.sight?.enabled ?? true);
  await tokenDoc.setFlag(MODULE_ID, "originalMovement", tokenDoc.movement?.locked ?? false);
}

async function applyIncapacitatedState(tokenDoc) {
  const origSight    = tokenDoc.getFlag(MODULE_ID, "originalSight");
  const origMovement = tokenDoc.getFlag(MODULE_ID, "originalMovement");
  // Nur originale Werte übergeben wenn noch nicht gesichert
  const payload = {
    tokenId:        tokenDoc.id,
    sightEnabled:   false,
    movementLocked: true,
    ...(origSight    === undefined ? { origSight:    tokenDoc.sight?.enabled  ?? true  } : {}),
    ...(origMovement === undefined ? { origMovement: tokenDoc.movement?.locked ?? false } : {})
  };
  if (game.user.isGM) {
    await gmApplyTokenRestrictions(payload);
  } else {
    await socket.executeAsGM("applyTokenRestrictions", payload);
  }
}

async function removeIncapacitatedState(tokenDoc) {
  if (game.user.isGM) {
    await gmRemoveTokenRestrictions({ tokenId: tokenDoc.id });
  } else {
    await socket.executeAsGM("removeTokenRestrictions", { tokenId: tokenDoc.id });
  }
}

// Prüft ob Actor handlungsunfähig ist (für Aktionsblock)
function isActorIncapacitated(actor) {
  return INCAPACITATED_STATUS_IDS.some(id => actor.statuses?.has(id));
}

// ── updateActor Hook: HP → Dead / Unconscious ───────────────────

Hooks.on("updateActor", async (actor, changes) => {
  const hp = changes?.system?.attributes?.health?.value;
  if (hp === undefined) return;

  const token = actor.getActiveTokens()[0];
  if (!token) return;

  if (hp <= 0) {
    // Tot: dead + incapacitated setzen, unconscious entfernen
    const isDead = htbahHasCondition(actor, "dead");
    if (!isDead) {
      await htbahAddCondition(actor, "dead");
      await htbahAddCondition(actor, "incapacitated");
      await htbahRemoveCondition(actor, "unconscious");
      await applyIncapacitatedState(token.document);
      await ChatMessage.create({
        content: `<div style="background:#111; border:1px solid #cc2222; border-radius:6px; padding:8px; color:#ddd;">
          💀 <b>${actor.name}</b> ist <b style="color:#e94560;">kampfunfähig / tot</b> (0 HP).
        </div>`
      });
    }
  } else if (hp < 10) {
    // Bewusstlos — nur wenn nicht bereits dead
    const isDead = htbahHasCondition(actor, "dead");
    if (!isDead) {
      const isUncon = htbahHasCondition(actor, "unconscious");
      if (!isUncon) {
        await htbahAddCondition(actor, "unconscious"); // setzt auch incapacitated + prone
        await applyIncapacitatedState(token.document);
        await ChatMessage.create({
          content: `<div style="background:#111; border:1px solid #ff9800; border-radius:6px; padding:8px; color:#ddd;">
            😵 <b>${actor.name}</b> ist <b style="color:#ff9800;">bewusstlos</b> (unter 10 HP).
          </div>`
        });
      }
    }
  } else {
    // HP ≥ 10 → Unconscious aufheben (Dead bleibt manuell)
    const wasUncon = htbahHasCondition(actor, "unconscious");
    if (wasUncon) {
      await htbahRemoveCondition(actor, "unconscious"); // entfernt auch incapacitated + prone
      await removeIncapacitatedState(token.document);
      await ChatMessage.create({
        content: `<div style="background:#111; border:1px solid #44ffb2; border-radius:6px; padding:8px; color:#ddd;">
          💚 <b>${actor.name}</b> ist wieder bei Bewusstsein (HP: ${hp}).
        </div>`
      });
    }
  }
});

// ── deleteActiveEffect Hook: Stunned läuft ab → freigeben ───────

Hooks.on("deleteActiveEffect", async (effect) => {
  const actor = effect.parent;
  if (!actor?.getActiveTokens) return;
  const token = actor.getActiveTokens()[0];

  // Stun abgelaufen
  if (effect.flags?.[MODULE_ID]?.isStun) {
    if (!token) return;
    await htbahRemoveCondition(actor, "stunned");
    await removeIncapacitatedState(token.document);
    await ChatMessage.create({
      content: `<div style="background:#111; border:1px solid #7ea6c8; border-radius:6px; padding:8px; color:#ddd;">
        ✅ <b>${actor.name}</b> ist nicht mehr betäubt.
      </div>`
    });
  }

  // Blinded abgelaufen → Sicht freigeben (Bewegung war nie gesperrt)
  if (effect.flags?.htbah?.conditionId === "blinded") {
    if (token) {
      const stillIncap = INCAPACITATED_STATUS_IDS.some(id => actor.statuses?.has(id));
      if (!stillIncap) {
        const origSight = token.document.getFlag(MODULE_ID, "originalSight") ?? true;
        if (game.user.isGM) {
          await token.document.update({ "sight.enabled": origSight });
          await token.document.unsetFlag(MODULE_ID, "originalSight");
          canvas.perception.update({ refreshVision: true });
        } else {
          await socket.executeAsGM("removeTokenRestrictions", { tokenId: token.document.id });
        }
      }
    }
    await ChatMessage.create({
      content: `<div style="background:#111; border:1px solid #ffffaa; border-radius:6px; padding:8px; color:#ddd;">
        👁️ <b>${actor.name}</b> ist nicht mehr geblendet.
      </div>`
    });
  }
});

// ── createActiveEffect Hook: Stunned wird gesetzt → sperren ─────

Hooks.on("createActiveEffect", async (effect) => {
  if (!effect.flags?.[MODULE_ID]?.isStun) return;
  const actor = effect.parent;
  if (!actor) return;
  const token = actor.getActiveTokens()[0];
  if (!token) return;

  await htbahAddCondition(actor, "stunned"); // setzt stun + incapacitated
  await applyIncapacitatedState(token.document);
});

// ── Blendgranate: blinded-Condition setzen ──────────────────────
// Wird aus gmApplyGrenadeEffect via Socket aufgerufen
async function gmApplyBlindedCondition({ actorId }) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  await htbahAddCondition(actor, "blinded");
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
      // VAL-2 Items: komplett eigene Logik (kein Target benötigt)
      if (getWeaponConfig(this))  { await handleWeaponRoll(this);  return; }
      if (getGrenadeConfig(this)) { await handleGrenadeThrow(this); return; }
      if (getHealpackValue(this)) { await handleHealpackRoll(this); return; }
      // Alle anderen Items: Standard HTBAH-Verhalten
      return wrapped(...args);
    },
    "OVERRIDE"
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
