// ─────────────────────────────────────────────────────────────
//  VAULT OF STARS — game 30 (Zone 5 · Beyond · LEGENDS game)
//  Top-down grid puzzle. Navigate alien moon vaults, collect relics,
//  dodge laser grids and sentry drones, and reach the exit airlock.
//
//  Controls: Arrow keys / WASD — move one tile. Touch: D-pad overlay.
//
//  THE EGG: complete all 15 vaults without losing a single life from
//  vault 1 → flawless run opens vault 16, The Signal Room, where the
//  Golden Beacon Egg waits at the centre.
// ─────────────────────────────────────────────────────────────
import { runGame, clamp } from '../../assets/js/engine.js';
import { Legends, applyTheme } from '../../assets/js/legends.js';
import { Store } from '../../assets/js/storage.js';
import { Sound } from '../../assets/js/audio.js';
import { buildVault, C, FINAL, SECRET, SPEED, VAULT_NAMES, theme, bfs, Grid, walkable } from './vaults.js';

const ID = 'vault-of-stars';
const W = 480, H = 720;
const TILE = 32;         // px per grid tile
const VIEW_W = 11;       // tiles visible horizontally
const VIEW_H = 13;       // tiles visible vertically
const VIEW = { x: 0, y: 60, w: W, h: VIEW_W * TILE };
const PANEL_Y = VIEW.y + VIEW.h;
const DPAD = { cx: 80, cy: PANEL_Y + 110, r: 50 };

// ── Colour palettes per theme ─────────────────────────────────
const PALETTE = {
  outer: { bg: '#0d1117', wall: '#1e3a5f', floor: '#0a1929', accent: '#38bdf8', laser: '#ef4444', drone: '#f59e0b', beacon: '#fde047', exit: '#4ade80', drift: '#818cf8' },
  deep:  { bg: '#080e1a', wall: '#1a2744', floor: '#060c18', accent: '#818cf8', laser: '#ef4444', drone: '#f59e0b', beacon: '#fde047', exit: '#4ade80', drift: '#38bdf8' },
  dark:  { bg: '#030609', wall: '#111827', floor: '#020406', accent: '#c084fc', laser: '#ef4444', drone: '#f59e0b', beacon: '#fde047', exit: '#4ade80', drift: '#6366f1' },
};

// ── Music presets ─────────────────────────────────────────────
const MUSIC_CALM  = { bpm: 76, style: 'ambient', lead: 'sine',     arp: [0, 3, 5, 7, 5, 3, 0, 2], oct: [12, 12, 12, 12, 12, 12, 0, 12], bass: 'half' };
const MUSIC_ALERT = { bpm: 136, style: 'chase',  lead: 'sawtooth', arp: [0, 1, 3, 1, 0, 2, 3, 2], oct: [12, 24, 12, 24, 12, 24, 12, 24], bass: 'drive' };

runGame({
  id: ID,
  width: W, height: H,
  lives: 3,
  detail: true,
  levelName: 'Vault',
  finalLevel: FINAL,
  secretLevel: SECRET,
  bonusLevels: [5, 10],
  bonusTime: 20,
  comboWindow: 1.5,
  comboStep: 3,
  maxMultiplier: 5,
  music: MUSIC_CALM,
  winTitle: 'You escaped the Vault of Stars!',
  wonText: () => 'All 15 vaults cleared',
  titleHint: 'An ancient alien moon hides fifteen sealed vaults. Navigate laser grids, dodge sentry drones — and find the exit airlock before your oxygen runs out.',
  sealedHint: 'Deep within the vaults, something still transmits. A signal that has been waiting… for a perfect explorer.',
  sealedHintCheckpoint: 'The signal comes only to those who begin from vault 1 and never fall…',
  secretTitle: '★ THE SIGNAL ROOM ★',
  legendBadge: 'beacon',
  legendRevealDelay: 7,
  legendLore: 'Something beyond the stars left this here. For the one who could reach it without losing a step.',
  legendLine: (s) => (s.isSecretLevel() ? 'all 16 vaults · flawless' : 'all 15 vaults cleared'),
  checkpoints: (max) => { const out = [1]; for (let v = 2; v <= Math.min(max, FINAL); v++) if (v !== 5 && v !== 10) out.push(v); return out; },
  levelClearPoints: (level, bonus) => (bonus ? 0 : level * 180),
  levelInfo(level, bonus) {
    if (bonus) return '★ Relic cache! No drones — grab everything you can in 20 seconds.';
    const [name, tip] = VAULT_NAMES[level] || ['Unknown Vault', ''];
    if (level === SECRET) return 'No drone has ever seen this room. The Beacon waits at the centre.';
    return `${name}${tip ? ' — ' + tip : ''}`;
  },
  create: (shell) => new VaultOfStars(shell),
});

// ─────────────────────────────────────────────────────────────
class VaultOfStars {
  constructor(shell) {
    this.shell = shell;
    this.vault = null;
    this.player = { x: 0, y: 0, moving: false, moveTimer: 0, trail: [] };
    this.laserPhase = 0;         // 0 = off, 1 = on (toggles every LASER_PERIOD)
    this.laserTimer = 0;
    this.laserPeriod = 1.2;      // seconds per half-cycle
    this.droneStates = [];        // { x, y, dir, stunTimer, patrolPath, pathIdx }
    this.collectedRelics = new Set();
    this.collectedKeys = new Set();
    this.openDoors = new Set();
    this.crackBehind = new Set(); // tiles that have cracked
    this.alertTimer = 0;          // > 0 → chase music playing
    this.keys = { up: false, down: false, left: false, right: false };
    this.moveQueue = null;        // next direction queued while moving
    this.dpad = null;             // touch dpad state
    this.oxygen = 60;             // seconds — displayed as HUD bar
    this.maxOxygen = 60;
    this.oxygenWarning = false;
    this.beaconCollected = false;
    // camera offset (top-left tile index)
    this.camX = 0; this.camY = 0;
  }

  // ── Shell callbacks ───────────────────────────────────────────
  onLevelStart(level, bonus) {
    const vd = buildVault(level);
    this.vault = vd;
    this.player.x = vd.entrance[0];
    this.player.y = vd.entrance[1];
    this.player.trail = [];
    this.laserPhase = 0; this.laserTimer = 0;
    this.droneStates = vd.drones.map(([x, y]) => ({
      x, y, dir: 0,
      stunTimer: 0,
      patrolPath: this._buildDronePatrol(vd, x, y),
      pathIdx: 0,
      moveTimer: 0,
    }));
    this.collectedRelics = new Set();
    this.collectedKeys = new Set();
    this.openDoors = new Set();
    this.crackBehind = new Set();
    this.alertTimer = 0;
    this.beaconCollected = false;
    this.oxygen = bonus ? 20 : Math.min(60 + level * 2, 90);
    this.maxOxygen = this.oxygen;
    this.oxygenWarning = false;
    this._updateCamera();
  }

  _buildDronePatrol(vd, sx, sy) {
    // Simple back-and-forth patrol on 3–5 open tiles in a line
    const g = vd.grid;
    const dirs = [[1,0],[0,1],[-1,0],[0,-1]];
    let best = [], bestLen = 0;
    for (const [dx, dy] of dirs) {
      const path = [[sx, sy]];
      for (let i = 1; i <= 4; i++) {
        const nx = sx + dx * i, ny = sy + dy * i;
        if (!g.in(nx, ny) || !walkable(g.at(nx, ny))) break;
        path.push([nx, ny]);
      }
      if (path.length > bestLen) { bestLen = path.length; best = path; }
    }
    if (best.length < 2) best = [[sx, sy]];
    // bounce: [0,1,2,3,2,1]
    const full = [...best, ...best.slice(1, -1).reverse()];
    return full;
  }

  onInput(key, down) {
    const MAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    const dir = MAP[key];
    if (!dir) return;
    if (down) {
      this.keys[dir] = true;
      if (this.player.moving) this.moveQueue = dir;
      else this._tryMove(dir);
    } else {
      this.keys[dir] = false;
      if (this.moveQueue === dir) this.moveQueue = null;
    }
  }

  onTouch(touches, canvas) {
    // D-pad: detect which quadrant of the dpad circle was touched
    for (const t of touches) {
      const rect = canvas.getBoundingClientRect();
      const tx = (t.clientX - rect.left) * (W / rect.width);
      const ty = (t.clientY - rect.top) * (H / rect.height);
      const dx = tx - DPAD.cx, dy = ty - DPAD.cy;
      if (Math.hypot(dx, dy) < DPAD.r * 1.4) {
        if (Math.abs(dx) > Math.abs(dy)) this._tryMove(dx > 0 ? 'right' : 'left');
        else this._tryMove(dy > 0 ? 'down' : 'up');
      }
    }
  }

  update(dt) {
    const shell = this.shell;
    if (!this.vault) return;

    // Oxygen countdown
    this.oxygen -= dt;
    if (this.oxygen <= 0) { shell.loseLife('Out of oxygen'); this.oxygen = this.maxOxygen; return; }
    if (this.oxygen <= 15 && !this.oxygenWarning) { this.oxygenWarning = true; /* pulse HUD */ }

    // Laser cycle
    this.laserTimer += dt;
    if (this.laserTimer >= this.laserPeriod) { this.laserTimer -= this.laserPeriod; this.laserPhase ^= 1; }

    // Drone movement (every 0.5s)
    const DRONE_SPEED = 0.5;
    for (const d of this.droneStates) {
      if (d.stunTimer > 0) { d.stunTimer -= dt; continue; }
      d.moveTimer = (d.moveTimer || 0) + dt;
      if (d.moveTimer >= DRONE_SPEED) {
        d.moveTimer -= DRONE_SPEED;
        d.pathIdx = (d.pathIdx + 1) % d.patrolPath.length;
        [d.x, d.y] = d.patrolPath[d.pathIdx];
      }
      // Check if drone reached the player
      if (d.x === this.player.x && d.y === this.player.y) {
        shell.loseLife('Caught by a sentry drone');
        return;
      }
    }

    // Check laser under player
    if (this.laserPhase === 1) {
      const cell = this.vault.grid.at(this.player.x, this.player.y);
      if (cell === C.LASER) { shell.loseLife('Hit by a laser grid'); return; }
    }

    // Alert music: any drone within 3 tiles
    const near = this.droneStates.some((d) => Math.abs(d.x - this.player.x) + Math.abs(d.y - this.player.y) <= 3);
    if (near) { this.alertTimer = 3; shell.setMusic?.(MUSIC_ALERT); }
    else if (this.alertTimer > 0) { this.alertTimer -= dt; if (this.alertTimer <= 0) shell.setMusic?.(MUSIC_CALM); }

    // Smooth move timer
    if (this.player.moving) {
      this.player.moveTimer -= dt;
      if (this.player.moveTimer <= 0) {
        this.player.moving = false;
        this._onLanded();
        if (this.moveQueue) { const q = this.moveQueue; this.moveQueue = null; this._tryMove(q); }
        else {
          const held = Object.entries(this.keys).find(([, v]) => v);
          if (held) this._tryMove(held[0]);
        }
      }
    }

    this._updateCamera();
  }

  _tryMove(dir) {
    const DELTA = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
    const [dx, dy] = DELTA[dir];
    const nx = this.player.x + dx, ny = this.player.y + dy;
    const g = this.vault.grid;
    if (!g.in(nx, ny)) return;
    const cell = g.at(nx, ny);
    if (cell === C.WALL) return;
    if (cell === C.DOOR && !this.openDoors.has(`${nx},${ny}`)) return;

    this.player.x = nx; this.player.y = ny;
    this.player.moving = true;
    this.player.moveTimer = 1 / SPEED.walk;
    this.player.trail.push([nx, ny]);
    if (this.player.trail.length > 6) this.player.trail.shift();

    // Drift: slide one extra step
    if (cell === C.DRIFT) {
      const nx2 = nx + dx, ny2 = ny + dy;
      const cell2 = g.in(nx2, ny2) ? g.at(nx2, ny2) : C.WALL;
      if (cell2 !== C.WALL && cell2 !== C.DOOR) {
        this.player.x = nx2; this.player.y = ny2;
      }
    }
  }

  _onLanded() {
    const { x, y } = this.player;
    const g = this.vault.grid;
    const cell = g.at(x, y);
    const key = `${x},${y}`;

    // Crack behind (vaults 12+)
    if (cell === C.CRACK) {
      this.crackBehind.add(key);
      g.set(x, y, C.OPEN); // becomes open — but we track it for rendering cracks
    }

    // Relic pickup
    if (cell === C.RELIC || (cell === C.OPEN && this.vault.relics.some(([rx, ry]) => rx === x && ry === y && !this.collectedRelics.has(`${rx},${ry}`)))) {
      if (!this.collectedRelics.has(key)) {
        this.collectedRelics.add(key);
        this.shell.addScore(this._relicPoints());
        this.shell.playSound?.('collect');
      }
    }

    // Key pickup
    if (cell === C.KEY && !this.collectedKeys.has(key)) {
      this.collectedKeys.add(key);
      g.set(x, y, C.OPEN);
      // Open matching door (first uncollected door)
      const di = this.collectedKeys.size - 1;
      if (this.vault.doors[di]) {
        const [dx, dy] = this.vault.doors[di];
        this.openDoors.add(`${dx},${dy}`);
      }
      this.shell.playSound?.('key');
    }

    // Oxygen canister
    if (cell === C.CANISTER) {
      this.oxygen = Math.min(this.oxygen + 10, this.maxOxygen);
      g.set(x, y, C.OPEN);
      this.oxygenWarning = false;
      this.shell.playSound?.('canister');
    }

    // Beacon (vault 16)
    if (cell === C.BEACON && !this.beaconCollected) {
      this.beaconCollected = true;
      g.set(x, y, C.OPEN);
      this.shell.triggerLegend?.();
    }

    // Laser on landing
    if (this.laserPhase === 1 && cell === C.LASER) {
      this.shell.loseLife('Hit by a laser grid');
      return;
    }

    // Exit
    if (cell === C.EXIT) {
      this.shell.completeLevel();
    }
  }

  _relicPoints() {
    // Increases per vault, slight combo bonus handled by engine
    return 50 + Math.floor(this.shell.currentLevel() / 3) * 10;
  }

  _updateCamera() {
    if (!this.vault) return;
    const g = this.vault.grid;
    this.camX = clamp(this.player.x - Math.floor(VIEW_W / 2), 0, g.w - VIEW_W);
    this.camY = clamp(this.player.y - Math.floor(VIEW_H / 2), 0, g.h - VIEW_H);
  }

  // ── Render ───────────────────────────────────────────────────
  render(ctx, dt) {
    if (!this.vault) return;
    const level = this.shell.currentLevel?.() || 1;
    const pal = PALETTE[theme(level)];
    const g = this.vault.grid;

    // Background
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // Star field in background (panel area)
    this._drawStars(ctx, pal);

    // ── Tile grid ──────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.clip();
    ctx.translate(VIEW.x - this.camX * TILE, VIEW.y - this.camY * TILE);

    for (let ty = this.camY; ty < this.camY + VIEW_H + 1; ty++) {
      for (let tx = this.camX; tx < this.camX + VIEW_W + 1; tx++) {
        if (!g.in(tx, ty)) continue;
        const cell = g.at(tx, ty);
        const px = tx * TILE, py = ty * TILE;
        this._drawTile(ctx, cell, px, py, pal, `${tx},${ty}`);
      }
    }

    // Player trail
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < this.player.trail.length; i++) {
      const [tx, ty] = this.player.trail[i];
      const alpha = (i + 1) / this.player.trail.length;
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8);
    }
    ctx.globalAlpha = 1;

    // Drones
    for (const d of this.droneStates) {
      this._drawDrone(ctx, d, pal);
    }

    // Player
    this._drawPlayer(ctx, pal);

    ctx.restore();

    // ── HUD ───────────────────────────────────────────────────
    this._drawHUD(ctx, pal);

    // ── D-pad (touch) ─────────────────────────────────────────
    this._drawDPad(ctx, pal);
  }

  _drawTile(ctx, cell, px, py, pal, key) {
    if (cell === C.WALL) {
      // Hexagonal grid pattern for walls
      ctx.fillStyle = pal.wall;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = pal.bg;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      // Circuit line decorations
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 4, py + TILE / 2); ctx.lineTo(px + TILE - 4, py + TILE / 2); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // Floor base
    ctx.fillStyle = pal.floor;
    ctx.fillRect(px, py, TILE, TILE);

    // Floor grid lines
    ctx.strokeStyle = pal.wall;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    ctx.globalAlpha = 1;

    if (cell === C.LASER) {
      // Laser grid — red glow, pulses on laserPhase
      const alpha = this.laserPhase === 1 ? 0.9 : 0.15;
      ctx.fillStyle = pal.laser;
      ctx.globalAlpha = alpha;
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      // Cross beams
      ctx.strokeStyle = pal.laser;
      ctx.lineWidth = this.laserPhase === 1 ? 2 : 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py + TILE / 2); ctx.lineTo(px + TILE, py + TILE / 2);
      ctx.moveTo(px + TILE / 2, py); ctx.lineTo(px + TILE / 2, py + TILE);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Glow warning on tick before ON
      if (this.laserPhase === 0 && this.laserTimer > this.laserPeriod - 0.3) {
        ctx.fillStyle = pal.laser; ctx.globalAlpha = 0.4;
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        ctx.globalAlpha = 1;
      }
    } else if (cell === C.DRIFT) {
      // Zero-G drift arrow
      ctx.fillStyle = pal.drift; ctx.globalAlpha = 0.3;
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = pal.drift;
      ctx.font = `${TILE - 10}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('→', px + TILE / 2, py + TILE / 2);
      ctx.globalAlpha = 1;
    } else if (cell === C.DOOR) {
      const open = this.openDoors.has(key);
      ctx.fillStyle = open ? pal.floor : '#7c3aed';
      ctx.globalAlpha = open ? 0.2 : 0.9;
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.globalAlpha = 1;
      if (!open) {
        ctx.fillStyle = '#fff'; ctx.font = `${TILE - 16}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🔒', px + TILE / 2, py + TILE / 2);
      }
    } else if (cell === C.KEY) {
      if (!this.collectedKeys.has(key)) {
        ctx.font = `${TILE - 8}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🔑', px + TILE / 2, py + TILE / 2);
      }
    } else if (cell === C.CANISTER) {
      ctx.font = `${TILE - 8}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚗️', px + TILE / 2, py + TILE / 2);
    } else if (cell === C.EXIT) {
      // Green glowing airlock
      ctx.fillStyle = pal.exit; ctx.globalAlpha = 0.25;
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.globalAlpha = 1;
      ctx.font = `${TILE - 8}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🚪', px + TILE / 2, py + TILE / 2);
    } else if (cell === C.BEACON) {
      // Pulsing golden beacon
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);
      ctx.fillStyle = pal.beacon; ctx.globalAlpha = 0.3 * pulse;
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, TILE * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = `${TILE - 4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⭐', px + TILE / 2, py + TILE / 2);
    } else if (cell === C.CRACK) {
      // Already cracked / behind player
      ctx.fillStyle = '#450a0a'; ctx.globalAlpha = 0.5;
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.globalAlpha = 1;
    }

    // Relics (on OPEN tiles with matching relic pos)
    const isRelic = this.vault.relics.some(([rx, ry]) => rx * TILE === px && ry * TILE === py);
    if (isRelic && !this.collectedRelics.has(key) && cell === C.OPEN) {
      const icons = ['🔵', '🛸', '⭐'];
      ctx.font = `${TILE - 10}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icons[Math.floor((px + py) / TILE) % icons.length], px + TILE / 2, py + TILE / 2);
    }
  }

  _drawDrone(ctx, d, pal) {
    const px = d.x * TILE - this.camX * TILE + VIEW.x;
    const py = d.y * TILE - this.camY * TILE + VIEW.y;
    if (px < VIEW.x - TILE || px > VIEW.x + VIEW.w || py < VIEW.y - TILE || py > VIEW.y + VIEW.h) return;
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2);
    if (d.stunTimer > 0) ctx.globalAlpha = 0.4;
    // Drone body
    ctx.fillStyle = pal.drone;
    ctx.beginPath(); ctx.arc(0, 0, TILE / 3, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();
    // Glow
    ctx.fillStyle = pal.drone; ctx.globalAlpha = 0.2;
    ctx.beginPath(); ctx.arc(0, 0, TILE / 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawPlayer(ctx, pal) {
    const px = this.player.x * TILE - this.camX * TILE + VIEW.x;
    const py = this.player.y * TILE - this.camY * TILE + VIEW.y;
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2);
    // Glow
    ctx.fillStyle = pal.accent; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(0, 0, TILE / 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Helmet visor
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath(); ctx.arc(0, 0, TILE / 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.accent; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, TILE / 3 - 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawStars(ctx, pal) {
    // Static starfield in the panel area — drawn once (could cache to offscreen)
    ctx.fillStyle = '#ffffff';
    // Use a seeded pattern based on the palette to keep it static
    const starSeed = pal.bg.charCodeAt(1);
    let sr = starSeed;
    const prng = () => { sr = (sr * 1664525 + 1013904223) & 0xffffffff; return (sr >>> 0) / 0xffffffff; };
    for (let i = 0; i < 30; i++) {
      const sx = prng() * W, sy = PANEL_Y + prng() * (H - PANEL_Y);
      const ss = 0.5 + prng() * 1.5;
      ctx.globalAlpha = 0.3 + prng() * 0.5;
      ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawHUD(ctx, pal) {
    const level = this.shell.currentLevel?.() || 1;
    // Vault name
    const [name] = VAULT_NAMES[level] || ['Vault', ''];
    ctx.fillStyle = pal.accent;
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Vault ${level} — ${name}`, 10, 20);

    // Oxygen bar
    const BAR_X = 10, BAR_Y = 35, BAR_W = 200, BAR_H = 10;
    const pct = clamp(this.oxygen / this.maxOxygen, 0, 1);
    const barCol = this.oxygen <= 15 ? '#ef4444' : this.oxygen <= 30 ? '#f59e0b' : '#4ade80';
    ctx.fillStyle = pal.wall; ctx.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
    ctx.fillStyle = barCol;
    if (this.oxygen <= 15) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 150); // pulse
    ctx.fillRect(BAR_X, BAR_Y, BAR_W * pct, BAR_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`O₂ ${Math.ceil(this.oxygen)}s`, BAR_X + BAR_W + 6, BAR_Y + 9);

    // Relic count
    const total = this.vault?.relics.length || 0;
    const got = this.collectedRelics.size;
    ctx.fillStyle = pal.accent; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`Relics ${got}/${total}`, W - 10, 20);

    // Keys
    if (this.vault?.keys.length) {
      ctx.fillText(`🔑 ${this.collectedKeys.size}/${this.vault.keys.length}`, W - 10, 38);
    }
  }

  _drawDPad(ctx, pal) {
    const { cx, cy, r } = DPAD;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = pal.accent;
    // Up
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r * 0.5, cy - r * 0.5); ctx.lineTo(cx + r * 0.5, cy - r * 0.5); ctx.closePath(); ctx.fill();
    // Down
    ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.lineTo(cx - r * 0.5, cy + r * 0.5); ctx.lineTo(cx + r * 0.5, cy + r * 0.5); ctx.closePath(); ctx.fill();
    // Left
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.5, cy - r * 0.5); ctx.lineTo(cx - r * 0.5, cy + r * 0.5); ctx.closePath(); ctx.fill();
    // Right
    ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r * 0.5, cy - r * 0.5); ctx.lineTo(cx + r * 0.5, cy + r * 0.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
