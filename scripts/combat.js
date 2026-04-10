import { MODULE_ID, AMMO_TYPE } from "./config.js";
import {
  getWeaponConfig,
  getHealpackValue,
  getGrenadeConfig,
  getCurrentAmmo,
  getTargetTokens,
  sceneUnitsToPixels,
  getGrenadeFillColor,
  applyArmorToDiceResults,
} from "./helpers.js";
import { isActorIncapacitated } from "./conditions.js";
import { showAttackDialog, showReloadDialog, showHealDialog, showGrenadeDialog } from "./dialogs.js";
import { getSocket } from "./socket.js";

// ═══════════════════════════════════════════════════════════════
// WAFFENWURF
// ═══════════════════════════════════════════════════════════════

export async function handleWeaponRoll(item) {
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
      const result = await getSocket().executeAsGM("reloadFromPool", {
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
      await getSocket().executeAsGM("reloadFromPool", { actorId: actor.id, itemId: item.id });
    }
    return;
  }

  if (!choice.skillId) return;

  let skillName, base;
  if (choice.skillId === "__action_base__") {
    skillName = "Handeln (Basis)";
    base      = Number(actor.system?.attributes?.skillSets?.action?.value ?? 0);
  } else {
    const skillItem = actor.items.get(choice.skillId);
    if (!skillItem) { ui.notifications.error(`${MODULE_ID} | Skill nicht gefunden.`); return; }
    skillName = skillItem.name;
    base      = Number(skillItem.system?.total ?? skillItem.system?.value ?? 0);
  }
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
    await getSocket().executeAsGM("setAmmo", {
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

    const result = await getSocket().executeAsGM("applyDamage", { tokenId: targetToken.id, damage: finalDmg });
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

export async function handleHealpackRoll(item) {
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

  const healResult = await getSocket().executeAsGM("applyHealing", { actorId: actor.id, healing: healAmount });
  await getSocket().executeAsGM("consumeItem", { actorId: actor.id, itemId: item.id });

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

export async function handleGrenadeThrow(item) {
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

  let skillName, skillValue;
  if (choice.skillId === "__action_base__") {
    skillName  = "Handeln (Basis)";
    skillValue = Number(actor.system?.attributes?.skillSets?.action?.value ?? 0);
  } else {
    const skillItem = actor.items.get(choice.skillId);
    if (!skillItem) { ui.notifications.error(`${MODULE_ID} | Skill nicht gefunden.`); return; }
    skillName  = skillItem.name;
    // system.total = value + skillset-mod (z.B. 90 + 9 = 99)
    skillValue = Number(skillItem.system?.total ?? skillItem.system?.value ?? 0);
  }

  // ── Schritt 2: Wurf-Check ──────────────────────────────────────────
  const throwRoll = await new Roll("1d100").evaluate();
  const rolled    = throwRoll.total;
  const isSuccess = rolled <= skillValue;
  const isCrit    = rolled <= 10;

  let scatterDistance = 0;
  let scatterRoll     = null;

  if (!isSuccess) {
    scatterRoll     = await new Roll("1d6").evaluate();
    scatterDistance = scatterRoll.total;
  }

  await throwRoll.toMessage({
    speaker:  ChatMessage.getSpeaker({ actor }),
    flavor:   [`<b>${item.name} werfen</b>`, `${skillName} (${skillValue})`,
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
  ui.notifications.info(`🎯 ${item.name}: Klicke auf die Karte um die Granate zu platzieren. Rechtsklick = Abbrechen.`);

  const clickPos = await new Promise((resolve) => {
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
  const effectResults = await getSocket().executeAsGM("applyGrenadeEffect", {
    templateId,
    effectType:    grenadeCfg.effect,
    damageFormula: grenadeCfg.damage
  });

  if (grenadeCfg.effect === "smoke") {
    const smokeTextureSrc = item.getFlag(MODULE_ID, "smokeTexture") || null;
    await getSocket().executeAsGM("createSmokeTile", { templateId, duration: 3, smokeTextureSrc });
  }

  await getSocket().executeAsGM("consumeItem", { actorId: actor.id, itemId: item.id });

  // Blend + Splitter: Template nach 5 Sekunden löschen
  if (grenadeCfg.effect === "blind" || grenadeCfg.effect === null) {
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

export async function cleanupExpiredSmokeTemplates() {
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
  const lightIds    = expiredTemplates
    .map(t => t.getFlag(MODULE_ID, "smokeLightId"))
    .filter(Boolean);
  const regionIds   = expiredTemplates
    .map(t => t.getFlag(MODULE_ID, "smokeRegionId"))
    .filter(Boolean);

  if (tileIds.length)     await canvas.scene.deleteEmbeddedDocuments("Tile",             tileIds);
  if (lightIds.length)    await canvas.scene.deleteEmbeddedDocuments("AmbientLight",     lightIds);
  if (regionIds.length)   await canvas.scene.deleteEmbeddedDocuments("Region",           regionIds);
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
