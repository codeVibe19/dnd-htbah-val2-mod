export const MODULE_ID = "htbah-val2-combat";

// ═══════════════════════════════════════════════════════════════
// WAFFEN-KONFIGURATION
// ═══════════════════════════════════════════════════════════════
export const WEAPON_CONFIG = new Map([
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

export const WEAPON_TYPE_OPTIONS = [
  { value: "", label: "— Kein VAL-2 Typ —" },
  ...Array.from(WEAPON_CONFIG.entries())
    .map(([key, cfg]) => ({ value: key, label: cfg.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"))
];

// ═══════════════════════════════════════════════════════════════
// GRANATEN-KONFIGURATION
// ═══════════════════════════════════════════════════════════════
export const GRENADE_CONFIG = new Map([
  ["frag",   { label: "Splittergranate",   type: "circle", size: 2, damage: "4d8", effect: null }],
  ["flash",  { label: "Blendgranate",      type: "circle", size: 2, damage: null,  effect: "blind" }],
  ["smoke",  { label: "Rauchgranate",      type: "circle", size: 4, damage: null,  effect: "smoke" }],
  ["incen",  { label: "Brandgranate",      type: "circle", size: 3, damage: "3d8", effect: "burn" }],
]);

export const GRENADE_TYPE_OPTIONS = [
  { value: "", label: "— Keine Granate —" },
  ...Array.from(GRENADE_CONFIG.entries())
    .map(([key, cfg]) => ({ value: key, label: cfg.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"))
];

export const HEALPACK_NAMES = new Map([
  ["zivil", 20], ["notfall", 40], ["trauma", 60],
  ["militär", 80], ["militaer", 80],
  ["heal pack", 20], ["medpack", 20], ["heilpack", 20]
]);

// Munitionstyp pro Waffe → Item-Name im Inventar des Spielers
export const SMOKE_TILE_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAEr0lEQVR4nOWbaU8UQRiE+8d2IofcoHhfqHjft6IiqyIoaPyB9m66dmqLt3t6JiQm9IcKyc7Abj1db/WyO+O8nz8VNBU0HTQbdDpoLmg+aCFoMWgpaDloJWg1aC3oTNTZoPWgc1Hnoy5EXYy61EP4Xfwt/G0813p8fryWtfj6VuLrXYqvfyH6mYv+ZqPfKRfNz/Qwbxln02zkctSVDsLvKBCGYYHoAmHGZVa+zTjMwzivtBq+KrqWkZ5rAeFkAAReUw7EEQiup/mccTUNY9cN3SBZxxUKw8iBKIbgjsG8ZVxNw+RGBykYhmGB6AXBFZjvajxl+ibpVkZ8Xg5GFxBJCO4YzFvG2TSbuy3aJOkxhcIwLBC9IDjftH0X8zrjbJxX2TJ6p0AWGE4Hg9CO6AJh0flmq2szn1r1lHE1fJd0LyM+T4GUgOA0tEFYcr6JPhdeH/OWcTV8n/TAEB9XICkQXSFwMS4730Sf277EvBqHeRhn02zyYYEUCsMACB2NjUIIvDusON9En7c6nnk1n1r1lHGYekR6nBGfx0ByIDQNCoE7gbfIVeftubcKr9S8ZRzmnpCeGuLjDMQC0QUCF+NEHzhvz71l3or9ZoFxNfysQAqkDYQFQccBECb6wHk7+pj7nPnUqrNxNf086kVGOMeCwSCsNOQgaB+MUgAAGn2ee7R9ycqreTX9kvTKEB9XGCUQNAnYHaw+GKXA+cnWz819m3nLOFaVDb8WvTEeYyCcDAXRBiHXB6NRcJnV1+hz4ZWah3E2O9TbjHAOw+BEtEHgYtRROJICl1l9K/qY+67m2fS7qPeGcIxhdIVg9YGOwjgFAFC6+og+z7yat4yz6Q+iLeMxhaEgFAJ3go5CNgXOTzZ/avU1+lx4JeZhfCvqY0Y4h0G0QeBi1FHIpWAMoM/qI/ocezXPKw7jn6I+G8IxgOBEKAQeBx2F4hQ4b+/73Pyp1Uf0eeYt82wcRrejvpDwGMNgEAqBO0FHwUqB7gij9wUMwIp/bvURfS68NvNsescQw2iDwMXIo5BLwZExGALg9uf4W82fWn1EHzOv5mEcRgdBXw0NBMa2AQGdoKNgpUB3BB2DMYCS+Kdmn6PPhWeZh/FvUd9JeIxBKAQuRh6FXBdkx8D5yfm32p/jr82fW33E3jI/NLxrCCAUAsYhlwLdEXQMrN1gDIDn32p/vPHR+Fuzj+hj5tk8jP+I2iPhMYBgCOgEjILVBToG/MbI2g1GPdAGIDX/qfinVh8rD/NDw/tBP0n7BGLXN0nIpSA1BqkeyAJIFSBvfzz/vPVx/HX2B76JvZr/RVIIGIeBt7uAx4B3A+4B3g7NIiwFkNr+eP65/Dj+uvowfxB0SDogCFYKeAx4S0z1gBZhEYCSHaAUAMcfs79HKz80/TvoT/x56Jsk7PnJLuAx6AvA2gmOBUCqAEsADM3/jT+7ALCK8L8BOFEJqL4Dqt4Fqn8fUPU7war/F6j+v8HqPw+o/hOh6j8TrP5T4eq/F6j+m6Hqvxus/tvh6q8PqP4KkeqvEar+KrHqrxOs/krR6q8Vrv5q8ervF6j+jpHq7xmq/q6x6u8brP7O0emeEE7MvcNTvuK7x/8B98AERoxYHPgAAAAASUVORK5CYII=";

export const AMMO_TYPE = new Map([
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
