import { MODULE_ID, WEAPON_CONFIG, AMMO_TYPE, SMOKE_TILE_IMG } from "./config.js";
import {
  sceneUnitsToPixels,
  getArmorThreshold,
  getArmorLabel,
  extractDiceResults,
  applyArmorToDiceResults,
} from "./helpers.js";
import { getSocket } from "./socket.js";

// ═══════════════════════════════════════════════════════════════
// SOCKETLIB – GM-HANDLER
// ═══════════════════════════════════════════════════════════════

export async function gmApplyDamage({ tokenId, damage }) {
  const token = canvas.tokens.get(tokenId);
  if (!token?.actor) return { error: "token_not_found" };
  const hp    = token.actor.system.attributes.health;
  const newHP = Math.max(0, hp.value - damage);
  await token.actor.update({ "system.attributes.health.value": newHP });
  return { actorName: token.name, oldHP: hp.value, newHP };
}

export async function gmApplyHealing({ actorId, healing }) {
  const actor = game.actors.get(actorId);
  if (!actor) return { error: "actor_not_found" };
  const hp    = actor.system.attributes.health;
  const newHP = Math.min(hp.max, hp.value + healing);
  await actor.update({ "system.attributes.health.value": newHP });
  return { actorName: actor.name, oldHP: hp.value, newHP };
}

export async function gmSetAmmo({ actorId, itemId, newAmmo }) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  const item = actor.items.get(itemId);
  if (!item) return;
  await item.setFlag(MODULE_ID, "currentAmmo", newAmmo);
}

export async function gmConsumeItem({ actorId, itemId }) {
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
export async function gmReloadFromPool({ actorId, itemId, weaponType }) {
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
export async function gmCreateGrenadeTemplate({ x, y, templateType, distance, fillColor, isScatter, scatterDistance }) {
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
    hidden: true,
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
export async function gmApplyGrenadeEffect({ templateId, effectType, damageFormula }) {
  const templateDoc = canvas.scene.templates.get(templateId);
  if (!templateDoc) return { error: "template_not_found" };

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
        await getSocket().executeAsGM("applyTokenRestrictions", {
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
export async function gmCreateSmokeTile({ templateId, duration, smokeTextureSrc }) {
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

  // V13 TileData: kein overhead/roof — elevation > 0 = Overhead, restrictions für Sichtblock
  const tileData = {
    x:         tileX,
    y:         tileY,
    width:     diameter,
    height:    diameter,
    elevation: 1,                        // > 0 → Overhead-Layer
    sort:      9999,                     // Über allem anderen
    alpha:     0.85,
    texture:   { src: smokeTextureSrc },
    occlusion: {
      mode:  0,                          // 0 = NONE → kein Fade, immer sichtbar
      alpha: 1
    },
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

  // Dunkelheitsquelle + Region via Limits — lokale Dunkelheit im Rauchbereich
  const limitsAvailable = game.modules.get("limits")?.active ?? false;
  let regionId = null;
  let lightId  = null;

  // AmbientLight-Dunkelheitsquelle — immer erstellen (Limits begrenzt sie lokal)
  const lightData = {
    x: templateDoc.x,
    y: templateDoc.y,
    config: {
      negative:   true,
      luminosity: -1,
      bright:     templateDoc.distance,
      dim:        0,
      priority:   0,
      color:      "#000000",
      alpha:      0
    },
    flags: { [MODULE_ID]: { isSmokeLight: true, smokeTemplateId: templateId } }
  };
  const lightCreated = await canvas.scene.createEmbeddedDocuments("AmbientLight", [lightData]);
  lightId = lightCreated[0]?.id ?? null;

  if (limitsAvailable) {
    // Region als Limits-Boundary — beschränkt die Dunkelheitsquelle auf den Kreisbereich
    const gridPx      = canvas.scene.grid.size ?? 100;
    const gridDist    = canvas.scene.grid.distance ?? 5;
    const radiusPxReg = (templateDoc.distance / gridDist) * gridPx;

    const regionData = {
      name:       "Rauch",
      color:      "#888888",
      visibility: 0,
      shapes: [{
        type:   "circle",
        x:      templateDoc.x,
        y:      templateDoc.y,
        radius: radiusPxReg
      }],
      behaviors: [{
        type:     "limits.limitRange",
        disabled: false,
        system: {
          darkness: true,
          sight:    {},
          light:    false,
          sound:    false
        }
      }],
      flags: {
        [MODULE_ID]: {
          isSmokeRegion:   true,
          smokeTemplateId: templateId,
          smokeUntilRound: expiresOnRound
        }
      }
    };

    const regionCreated = await canvas.scene.createEmbeddedDocuments("Region", [regionData]);
    regionId = regionCreated[0]?.id ?? null;
  }

  await templateDoc.setFlag(MODULE_ID, "isSmokeTemplate", true);
  await templateDoc.setFlag(MODULE_ID, "smokeUntilRound", expiresOnRound);
  await templateDoc.setFlag(MODULE_ID, "smokeTileId",     tileId);
  await templateDoc.setFlag(MODULE_ID, "smokeLightId",    lightId);
  await templateDoc.setFlag(MODULE_ID, "smokeRegionId",   regionId);

  canvas.perception.update({ refreshVision: true, refreshLighting: true });

  return { success: true, templateId, tileId, lightId, regionId, expiresOnRound };
}
