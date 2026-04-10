import { MODULE_ID } from "./config.js";
import { getSocket } from "./socket.js";

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
export const INCAPACITATED_STATUS_IDS = ["dead", "incapacitated", "unconscious", "stun"];

// HTBAH conditionManager holen (verfügbar nach ready)
export function getCondMgr() {
  return game.howtobeahero?.conditionManager ?? null;
}

// Condition per HTBAH-Manager setzen
export async function htbahAddCondition(actor, conditionKey) {
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
export async function htbahRemoveCondition(actor, conditionKey) {
  const mgr = getCondMgr();
  if (!mgr) return;
  const condData = mgr.getConditionData(conditionKey);
  if (!condData) return;
  await mgr.removeCondition(actor, condData);
}

// Prüft ob Actor eine bestimmte HTBAH-Condition hat
export function htbahHasCondition(actor, conditionKey) {
  const mgr = getCondMgr();
  if (!mgr) return actor.statuses?.has(conditionKey) ?? false;
  const condData = mgr.getConditionData(conditionKey);
  if (!condData) return false;
  return mgr.isConditionActive(actor, condData);
}

// ── GM-Funktionen für Token-Sicht/Bewegung (brauchen GM-Rechte) ──

export async function gmApplyTokenRestrictions({ tokenId, sightEnabled, movementLocked, origSight, origMovement }) {
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

export async function gmRemoveTokenRestrictions({ tokenId }) {
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

// Prüft ob Actor handlungsunfähig ist (für Aktionsblock)
export function isActorIncapacitated(actor) {
  return INCAPACITATED_STATUS_IDS.some(id => actor.statuses?.has(id));
}

// Original Token-Werte sichern bevor wir sperren
export async function saveTokenOriginalValues(tokenDoc) {
  const already = tokenDoc.getFlag(MODULE_ID, "originalSight");
  if (already !== undefined) return;
  await tokenDoc.setFlag(MODULE_ID, "originalSight",    tokenDoc.sight?.enabled ?? true);
  await tokenDoc.setFlag(MODULE_ID, "originalMovement", tokenDoc.movement?.locked ?? false);
}

export async function applyIncapacitatedState(tokenDoc) {
  const origSight    = tokenDoc.getFlag(MODULE_ID, "originalSight");
  const origMovement = tokenDoc.getFlag(MODULE_ID, "originalMovement");
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
    await getSocket().executeAsGM("applyTokenRestrictions", payload);
  }
}

export async function removeIncapacitatedState(tokenDoc) {
  if (game.user.isGM) {
    await gmRemoveTokenRestrictions({ tokenId: tokenDoc.id });
  } else {
    await getSocket().executeAsGM("removeTokenRestrictions", { tokenId: tokenDoc.id });
  }
}

// ── Blendgranate: blinded-Condition setzen ──────────────────────
// Wird aus gmApplyGrenadeEffect via Socket aufgerufen
export async function gmApplyBlindedCondition({ actorId }) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  await htbahAddCondition(actor, "blinded");
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
          await getSocket().executeAsGM("removeTokenRestrictions", { tokenId: token.document.id });
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
