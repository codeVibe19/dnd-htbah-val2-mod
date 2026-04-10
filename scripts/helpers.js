import { MODULE_ID, WEAPON_CONFIG, HEALPACK_NAMES, GRENADE_CONFIG } from "./config.js";

// ═══════════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

export function getWeaponConfig(item) {
  if (item.type !== "weapon") return null;
  const weaponType = item.getFlag(MODULE_ID, "weaponType");
  if (!weaponType) return null;
  return WEAPON_CONFIG.get(weaponType) ?? null;
}

export function getHealpackValue(item) {
  if (item.type !== "consumable") return null;
  const flagVal = item.getFlag(MODULE_ID, "healAmount");
  if (flagVal !== undefined && flagVal !== null) return Number(flagVal);
  return HEALPACK_NAMES.get(item.name.toLowerCase().trim()) ?? null;
}

export function getGrenadeConfig(item) {
  if (item.type !== "consumable") return null;
  const grenadeType = item.getFlag(MODULE_ID, "grenadeType");
  if (!grenadeType) return null;
  return GRENADE_CONFIG.get(grenadeType) ?? null;
}

export function getCurrentAmmo(item) {
  const stored = item.getFlag(MODULE_ID, "currentAmmo");
  if (stored !== undefined && stored !== null) return Number(stored);
  const cfg = getWeaponConfig(item);
  return cfg?.magazine ?? null;
}

export function getActionSkills(actor) {
  // mod = Math.round(summe aller action-skills / 10) → wird von HTBAH auf system.total addiert
  const actionMod = actor.skillSetData?.action?.mod ?? 0;

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

export function getTargetTokens() {
  return Array.from(game.user.targets ?? []).filter(t => t?.actor);
}

export function sceneUnitsToPixels(units) {
  const gridDistance = Number(canvas?.scene?.grid?.distance ?? canvas?.grid?.distance ?? 5);
  const gridSize = Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size ?? 100);
  if (!gridDistance || !gridSize) return units;
  return (units / gridDistance) * gridSize;
}

export function getArmorThreshold(actor) {
  const armorValue = actor?.system?.attributes?.armor?.value ?? 0;
  return armorValue === 1 ? 2
       : armorValue === 2 ? 4
       : armorValue === 3 ? 6
       : 0;
}

export function getArmorLabel(actor) {
  const armorValue = actor?.system?.attributes?.armor?.value ?? 0;
  return armorValue === 1 ? "Leichte Rüstung"
       : armorValue === 2 ? "Mittlere Rüstung"
       : armorValue === 3 ? "Schwere Rüstung"
       : null;
}

export function extractDiceResults(roll) {
  const term = roll?.terms?.find(t => Array.isArray(t?.results));
  return term?.results?.map(r => Number(r.result) || 0) ?? [Number(roll?.total) || 0];
}

export function applyArmorToDiceResults(diceResults, armorThreshold) {
  const afterArmor = diceResults.map(r => r <= armorThreshold ? 0 : r);
  const blockedDice = diceResults.filter(r => r <= armorThreshold).length;
  const finalDamage = afterArmor.reduce((a, b) => a + b, 0);
  return { afterArmor, blockedDice, finalDamage };
}

export function getGrenadeFillColor(effect) {
  return effect === "smoke" ? "#666666"
       : effect === "stun"  ? "#ffff00"
       : effect === "burn"  ? "#ff4400"
       : "#ff6600";
}
