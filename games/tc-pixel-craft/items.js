// ─────────────────────────────────────────────────────────────
//  TC PIXEL CRAFT — blocks, items, tools, recipes and advancements.
//  Ids below 64 are blocks (they can sit in the world); 64+ are items.
// ─────────────────────────────────────────────────────────────

// ── Blocks ──────────────────────────────────────────────────
export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, SANDSTONE: 6, LOG: 7, LEAVES: 8, PLANKS: 9,
  TABLE: 10, FURNACE: 11, COAL_ORE: 12, IRON_ORE: 13, GOLD_ORE: 14, CRYSTAL_ORE: 15, BEDROCK: 16,
  WATER: 17, LAVA: 18, TORCH: 19, SNOW: 20, BED: 21, ALTAR: 22, GRAVEL: 23, CACTUS: 24, BRICKS: 25,
};
export const NBLOCKS = 26;

// ── Items ───────────────────────────────────────────────────
export const I = {
  STICK: 64, COAL: 65, RAW_IRON: 66, IRON: 67, RAW_GOLD: 68, GOLD: 69, CRYSTAL: 70, WOOL: 71, MEAT: 72, COOKED: 73,
  GEL: 74, THORN: 75, SPORE: 76, FLINT: 77,
  W_PICK: 80, S_PICK: 81, I_PICK: 82, C_PICK: 83,
  W_AXE: 84, S_AXE: 85, I_AXE: 86, C_AXE: 87,
  W_SHOVEL: 88, S_SHOVEL: 89, I_SHOVEL: 90, C_SHOVEL: 91,
  W_SWORD: 92, S_SWORD: 93, I_SWORD: 94, C_SWORD: 95,
  I_HELM: 100, I_CHEST: 101, I_LEGS: 102, I_BOOTS: 103,
  C_HELM: 104, C_CHEST: 105, C_LEGS: 106, C_BOOTS: 107,
};

const TIER_NAME = ['', 'Wooden', 'Stone', 'Iron', 'Crystal'];
const TIER_COL = ['', '#a0743f', '#8e8e8e', '#e5e7eb', '#e879f9'];

/** Everything there is to know about one block or item id. */
export const INFO = {};
const def = (id, o) => { INFO[id] = { id, stack: 64, ...o }; };

// Blocks: hard = hardness (hand time ≈ hard × 1.5 s), tool = which tool is fastest,
// tier = pickaxe tier needed to get a drop, drop = what you get (default: itself)
def(B.GRASS, { name: 'Grass Block', hard: 0.6, tool: 'shovel', drop: B.DIRT });
def(B.DIRT, { name: 'Dirt', hard: 0.5, tool: 'shovel' });
def(B.STONE, { name: 'Stone', hard: 1.5, tool: 'pick', tier: 1, drop: B.COBBLE });
def(B.COBBLE, { name: 'Cobblestone', hard: 2, tool: 'pick', tier: 1 });
def(B.SAND, { name: 'Sand', hard: 0.5, tool: 'shovel' });
def(B.SANDSTONE, { name: 'Sandstone', hard: 0.8, tool: 'pick', tier: 1 });
def(B.LOG, { name: 'Log', hard: 2, tool: 'axe' });
def(B.LEAVES, { name: 'Leaves', hard: 0.2, tool: 'axe', drop: 0, dropChance: [[I.STICK, 0.12]] });
def(B.PLANKS, { name: 'Planks', hard: 2, tool: 'axe' });
def(B.TABLE, { name: 'Crafting Table', hard: 2.5, tool: 'axe' });
def(B.FURNACE, { name: 'Furnace', hard: 3.5, tool: 'pick', tier: 1 });
def(B.COAL_ORE, { name: 'Coal Ore', hard: 3, tool: 'pick', tier: 1, drop: I.COAL, ore: 5 });
def(B.IRON_ORE, { name: 'Iron Ore', hard: 3, tool: 'pick', tier: 2, drop: I.RAW_IRON, ore: 15 });
def(B.GOLD_ORE, { name: 'Gold Ore', hard: 3, tool: 'pick', tier: 3, drop: I.RAW_GOLD, ore: 25 });
def(B.CRYSTAL_ORE, { name: 'Crystal Ore', hard: 3, tool: 'pick', tier: 3, drop: I.CRYSTAL, ore: 60 });
def(B.BEDROCK, { name: 'Bedrock', hard: Infinity });
def(B.WATER, { name: 'Water', hard: Infinity });
def(B.LAVA, { name: 'Lava', hard: Infinity });
def(B.TORCH, { name: 'Torch', hard: 0 });
def(B.SNOW, { name: 'Snowy Grass', hard: 0.6, tool: 'shovel', drop: B.DIRT });
def(B.BED, { name: 'Bed', hard: 0.3, stack: 1 });
def(B.ALTAR, { name: 'Summoning Altar', hard: 5, tool: 'pick', tier: 3, stack: 1 });
def(B.GRAVEL, { name: 'Gravel', hard: 0.6, tool: 'shovel', dropChance: [[I.FLINT, 0.15]] });
def(B.CACTUS, { name: 'Cactus', hard: 0.4 });
def(B.BRICKS, { name: 'Stone Bricks', hard: 2, tool: 'pick', tier: 1 });

def(I.STICK, { name: 'Stick' });
def(I.COAL, { name: 'Coal' });
def(I.RAW_IRON, { name: 'Raw Iron' });
def(I.IRON, { name: 'Iron Ingot' });
def(I.RAW_GOLD, { name: 'Raw Gold' });
def(I.GOLD, { name: 'Gold Ingot' });
def(I.CRYSTAL, { name: 'Crystal' });
def(I.WOOL, { name: 'Wool' });
def(I.MEAT, { name: 'Raw Meat', food: 2 });
def(I.COOKED, { name: 'Roast Meat', food: 8 });
def(I.GEL, { name: 'Gloom Gel' });
def(I.THORN, { name: 'Thorn' });
def(I.SPORE, { name: 'Spore Dust' });
def(I.FLINT, { name: 'Flint' });

// Tools: kind, tier (1 wood … 4 crystal)
const TOOL_STATS = { 1: { speed: 2, dur: 60 }, 2: { speed: 4, dur: 132 }, 3: { speed: 6, dur: 250 }, 4: { speed: 9, dur: 1200 } };
const DMG = { sword: [0, 4, 5, 6, 8], axe: [0, 3, 4, 5, 6], pick: [0, 2, 3, 4, 5], shovel: [0, 2, 2, 3, 4] };
const KIND_NAME = { pick: 'Pickaxe', axe: 'Axe', shovel: 'Shovel', sword: 'Sword' };
for (const [kind, base] of [['pick', I.W_PICK], ['axe', I.W_AXE], ['shovel', I.W_SHOVEL], ['sword', I.W_SWORD]]) {
  for (let t = 1; t <= 4; t++) def(base + t - 1, { name: `${TIER_NAME[t]} ${KIND_NAME[kind]}`, stack: 1, tool: kind, tier: t, speed: TOOL_STATS[t].speed, dur: TOOL_STATS[t].dur, dmg: DMG[kind][t], col: TIER_COL[t] });
}
// Armour: slot 0 head, 1 body, 2 legs, 3 feet; protect = share of damage blocked
const ARMOUR = [['Helmet', 0, 5], ['Chestplate', 1, 8], ['Leggings', 2, 7], ['Boots', 3, 4]];
for (const [mat, base, prot, col, dur] of [['Iron', I.I_HELM, [0.12, 0.2, 0.16, 0.08], '#e5e7eb', 160], ['Crystal', I.C_HELM, [0.15, 0.26, 0.21, 0.12], '#e879f9', 500]]) {
  ARMOUR.forEach(([n, slot], k) => def(base + k, { name: `${mat} ${n}`, stack: 1, armour: slot, protect: prot[slot], dur, col }));
}

// ── Recipes ─────────────────────────────────────────────────
// at: null = in your hands (2×2), 'table' = next to a crafting table, 'furnace' = next to a furnace (needs fuel)
export const RECIPES = [];
const r = (out, n, needs, at = null) => RECIPES.push({ out, n, needs, at });
r(B.PLANKS, 4, { [B.LOG]: 1 });
r(I.STICK, 4, { [B.PLANKS]: 2 });
r(B.TABLE, 1, { [B.PLANKS]: 4 });
r(B.TORCH, 4, { [I.STICK]: 1, [I.COAL]: 1 });
const MATS = [[1, B.PLANKS], [2, B.COBBLE], [3, I.IRON], [4, I.CRYSTAL]];
for (const [t, m] of MATS) {
  r(I.W_PICK + t - 1, 1, { [m]: 3, [I.STICK]: 2 }, 'table');
  r(I.W_AXE + t - 1, 1, { [m]: 3, [I.STICK]: 2 }, 'table');
  r(I.W_SHOVEL + t - 1, 1, { [m]: 1, [I.STICK]: 2 }, 'table');
  r(I.W_SWORD + t - 1, 1, { [m]: 2, [I.STICK]: 1 }, 'table');
}
r(B.FURNACE, 1, { [B.COBBLE]: 8 }, 'table');
r(B.BRICKS, 4, { [B.STONE]: 4 }, 'table');
for (const [mat, base] of [[I.IRON, I.I_HELM], [I.CRYSTAL, I.C_HELM]]) ARMOUR.forEach(([, , cost], k) => r(base + k, 1, { [mat]: cost }, 'table'));
r(B.BED, 1, { [I.WOOL]: 3, [B.PLANKS]: 3 }, 'table');
r(B.ALTAR, 1, { [I.CRYSTAL]: 3, [I.GOLD]: 3, [I.GEL]: 6, [B.BRICKS]: 4 }, 'table');
// smelting
r(I.IRON, 1, { [I.RAW_IRON]: 1 }, 'furnace');
r(I.GOLD, 1, { [I.RAW_GOLD]: 1 }, 'furnace');
r(I.COOKED, 1, { [I.MEAT]: 1 }, 'furnace');
r(B.STONE, 1, { [B.COBBLE]: 1 }, 'furnace');
r(I.COAL, 1, { [B.LOG]: 1 }, 'furnace');
/** Fuel for one smelt, in the order it's used up. */
export const FUELS = [[I.COAL, 1], [B.LOG, 1], [B.PLANKS, 2], [I.STICK, 4]];

// ── Advancements ────────────────────────────────────────────
// Shown on the Advancements screen; earning one scores `pts`.
// `badge` = also unlock that site badge (assets/js/games.js).
export const ADV = [
  { id: 'wood',     icon: '🪵', name: 'Timber!',            desc: 'Get a log from a tree', pts: 100 },
  { id: 'table',    icon: '🧰', name: 'Workbench Ready',    desc: 'Craft a crafting table', pts: 150 },
  { id: 'pick',     icon: '⛏️', name: 'Pick It Up',         desc: 'Craft a pickaxe', pts: 200 },
  { id: 'stone',    icon: '🪨', name: 'Stone Age',          desc: 'Craft a stone tool', pts: 300 },
  { id: 'furnace',  icon: '🔥', name: 'Hot Stuff',          desc: 'Build a furnace', pts: 300 },
  { id: 'torch',    icon: '🕯️', name: 'Let There Be Light', desc: 'Place a torch', pts: 200 },
  { id: 'kill',     icon: '⚔️', name: 'Monster Hunter',     desc: 'Defeat a hostile creature', pts: 400, badge: 'firstkill' },
  { id: 'night',    icon: '🌅', name: 'Survivor',           desc: 'Live through your first night', pts: 500 },
  { id: 'iron',     icon: '🔩', name: 'Iron Will',          desc: 'Smelt an iron ingot', pts: 500 },
  { id: 'ironpick', icon: '🛠️', name: 'Isn\'t It Iron Pick', desc: 'Craft an iron pickaxe', pts: 600 },
  { id: 'deep',     icon: '🕳️', name: 'Into the Depths',    desc: 'Go down near the bottom of the world', pts: 400 },
  { id: 'food',     icon: '🍖', name: 'Well Fed',           desc: 'Eat roast meat', pts: 300 },
  { id: 'bed',      icon: '🛏️', name: 'Sweet Dreams',       desc: 'Sleep through a night in a bed', pts: 500 },
  { id: 'armour',   icon: '🛡️', name: 'Suit Up',            desc: 'Wear a full set of iron armour', pts: 1500, badge: 'ironsuit' },
  { id: 'gold',     icon: '🪙', name: 'Gold Rush',          desc: 'Smelt a gold ingot', pts: 600 },
  { id: 'crystal',  icon: '💎', name: 'Shiny!',             desc: 'Mine a crystal', pts: 1000, badge: 'crystal' },
  { id: 'ctool',    icon: '✨', name: 'Crystal Clear',      desc: 'Craft a crystal tool', pts: 1500 },
  { id: 'hunter',   icon: '🏹', name: 'Night Stalker',      desc: 'Defeat 10 hostile creatures', pts: 1000 },
  { id: 'altar',    icon: '🔮', name: 'Summoner',           desc: 'Place a Summoning Altar at night', pts: 2000 },
  { id: 'boss',     icon: '👑', name: 'Kingslayer',         desc: 'Defeat the Shadow King', pts: 10000, badge: 'boss' },
];
export const ADV_BY_ID = Object.fromEntries(ADV.map((a) => [a.id, a]));

export const isBlock = (id) => id > 0 && id < 64;
export const nameOf = (id) => INFO[id]?.name || '?';
export const stackOf = (id) => INFO[id]?.stack || 64;
/** Blocks you walk through */
export const PASSABLE = new Set([B.AIR, B.WATER, B.LAVA, B.TORCH]);
/** Blocks rays see through (drawn specially) */
export const PLACEABLE = (id) => isBlock(id) && ![B.WATER, B.LAVA, B.BEDROCK].includes(id);
