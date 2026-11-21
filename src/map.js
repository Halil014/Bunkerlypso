'use strict';

// ==================== [MODULE: map.js] ====================

/**
 * Bunker Navigation Grid & Global Pathfinding Engine
 * Computes vector flowfields and Dijkstra distances across all bunker corridors,
 * doorways, and rooms so zombies navigate intelligently around walls without getting stuck.
 */
class NavGrid {
  constructor(map) {
    this.map = map;
    this.tileSize = 25;
    this.originX = 50;
    this.originY = 50;
    this.cols = 64;
    this.rows = 92;
    this.gridSize = this.cols * this.rows;

    this.walkable = new Uint8Array(this.gridSize);
    this.dist = new Int32Array(this.gridSize);
    this.flowX = new Float32Array(this.gridSize);
    this.flowY = new Float32Array(this.gridSize);
    this.queue = new Int32Array(this.gridSize);

    this.lastPlayerCol = -1;
    this.lastPlayerRow = -1;
    this.lastDoorKey = '';

    this.rebuildGrid();
  }

  getDoorKey() {
    const d1 = this.map.debrisDoor && this.map.debrisDoor.opened ? 1 : 0;
    const d2 = this.map.armoryDebris && this.map.armoryDebris.opened ? 1 : 0;
    const d3 = this.map.southDoor && this.map.southDoor.opened ? 1 : 0;
    const d4 = this.map.stairsDebris && this.map.stairsDebris.opened ? 1 : 0;
    return `${d1}_${d2}_${d3}_${d4}`;
  }

  rebuildGrid() {
    this.lastDoorKey = this.getDoorKey();
    const halfTile = this.tileSize / 2;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const wx = this.originX + c * this.tileSize + halfTile;
        const wy = this.originY + r * this.tileSize + halfTile;
        const idx = r * this.cols + c;

        // Check if inside bunker bounds and free of walls
        const blocked = this.map.checkWallCollision(wx, wy, 12, false);
        this.walkable[idx] = blocked ? 0 : 1;
      }
    }

    this.lastPlayerCol = -1;
    this.lastPlayerRow = -1;
  }

  toCol(worldX) {
    return Math.floor((worldX - this.originX) / this.tileSize);
  }

  toRow(worldY) {
    return Math.floor((worldY - this.originY) / this.tileSize);
  }

  findNearestWalkable(startCol, startRow) {
    const c0 = Math.max(0, Math.min(this.cols - 1, startCol));
    const r0 = Math.max(0, Math.min(this.rows - 1, startRow));
    const idx0 = r0 * this.cols + c0;
    if (this.walkable[idx0]) return { col: c0, row: r0 };

    for (let radius = 1; radius <= 5; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
            const idx = r * this.cols + c;
            if (this.walkable[idx]) {
              return { col: c, row: r };
            }
          }
        }
      }
    }
    return { col: c0, row: r0 };
  }

  update(playerX, playerY, force = false) {
    const currentDoorKey = this.getDoorKey();
    if (currentDoorKey !== this.lastDoorKey) {
      this.rebuildGrid();
      force = true;
    }

    const rawCol = this.toCol(playerX);
    const rawRow = this.toRow(playerY);

    const nearest = this.findNearestWalkable(rawCol, rawRow);
    const targetCol = nearest.col;
    const targetRow = nearest.row;

    if (!force && targetCol === this.lastPlayerCol && targetRow === this.lastPlayerRow) {
      return;
    }

    this.lastPlayerCol = targetCol;
    this.lastPlayerRow = targetRow;

    this.dist.fill(-1);
    this.flowX.fill(0);
    this.flowY.fill(0);

    let head = 0;
    let tail = 0;

    // Growable queue: a cell can be re-enqueued whenever its distance improves,
    // so the number of pushes can exceed the number of cells. A fixed-size
    // Int32Array silently drops the overflow and corrupts the flow field.
    const pushQueue = (idx) => {
      if (tail >= this.queue.length) {
        const grown = new Int32Array(this.queue.length * 2);
        grown.set(this.queue);
        this.queue = grown;
      }
      this.queue[tail++] = idx;
    };

    const targetIdx = targetRow * this.cols + targetCol;
    this.dist[targetIdx] = 0;
    pushQueue(targetIdx);

    const dirs = [
      { dc: 0, dr: -1, cost: 10 },
      { dc: 0, dr: 1, cost: 10 },
      { dc: -1, dr: 0, cost: 10 },
      { dc: 1, dr: 0, cost: 10 },
      { dc: -1, dr: -1, cost: 14 },
      { dc: 1, dr: -1, cost: 14 },
      { dc: -1, dr: 1, cost: 14 },
      { dc: 1, dr: 1, cost: 14 }
    ];

    while (head < tail) {
      const currIdx = this.queue[head++];
      const currDist = this.dist[currIdx];
      const currCol = currIdx % this.cols;
      const currRow = Math.floor(currIdx / this.cols);

      for (let i = 0; i < 8; i++) {
        const d = dirs[i];
        const nCol = currCol + d.dc;
        const nRow = currRow + d.dr;

        if (nCol < 0 || nCol >= this.cols || nRow < 0 || nRow >= this.rows) continue;

        const nIdx = nRow * this.cols + nCol;
        if (!this.walkable[nIdx]) continue;

        // Diagonal corner-cutting check
        if (d.dc !== 0 && d.dr !== 0) {
          const ortho1 = currRow * this.cols + nCol;
          const ortho2 = nRow * this.cols + currCol;
          if (!this.walkable[ortho1] || !this.walkable[ortho2]) {
            continue;
          }
        }

        const newDist = currDist + d.cost;
        if (this.dist[nIdx] === -1 || newDist < this.dist[nIdx]) {
          this.dist[nIdx] = newDist;
          pushQueue(nIdx);
        }
      }
    }

    // Compute Vector Flowfield
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (!this.walkable[idx] || this.dist[idx] <= 0) continue;

        let bestDist = this.dist[idx];
        let bestDc = 0;
        let bestDr = 0;

        for (let i = 0; i < 8; i++) {
          const d = dirs[i];
          const nCol = c + d.dc;
          const nRow = r + d.dr;

          if (nCol < 0 || nCol >= this.cols || nRow < 0 || nRow >= this.rows) continue;
          const nIdx = nRow * this.cols + nCol;

          if (this.dist[nIdx] >= 0 && this.dist[nIdx] < bestDist) {
            if (d.dc !== 0 && d.dr !== 0) {
              const o1 = r * this.cols + nCol;
              const o2 = nRow * this.cols + c;
              if (!this.walkable[o1] || !this.walkable[o2]) continue;
            }
            bestDist = this.dist[nIdx];
            bestDc = d.dc;
            bestDr = d.dr;
          }
        }

        if (bestDc !== 0 || bestDr !== 0) {
          const len = Math.hypot(bestDc, bestDr);
          this.flowX[idx] = bestDc / len;
          this.flowY[idx] = bestDr / len;
        }
      }
    }
  }

  getFlow(worldX, worldY) {
    const rawCol = this.toCol(worldX);
    const rawRow = this.toRow(worldY);

    if (rawCol < 0 || rawCol >= this.cols || rawRow < 0 || rawRow >= this.rows) {
      return null;
    }

    let idx = rawRow * this.cols + rawCol;
    if (!this.walkable[idx] || (this.flowX[idx] === 0 && this.flowY[idx] === 0)) {
      const nearest = this.findNearestWalkable(rawCol, rawRow);
      idx = nearest.row * this.cols + nearest.col;
    }

    return {
      x: this.flowX[idx],
      y: this.flowY[idx],
      dist: this.dist[idx]
    };
  }
}

/**
 * Bunker Map, Barricades, Interactive Elements & Geometry
 * Recreates the cold, brutalist concrete bunker atmosphere of Nacht der Untoten.
 */

class WindowBarricade {
  constructor(id, x, y, width, height, orientation, spawnX, spawnY) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.orientation = orientation; // 'horizontal' or 'vertical'
    this.spawnX = spawnX; // Exterior spawn point
    this.spawnY = spawnY;

    // Interior direction: from the exterior spawn point toward the window center.
    // Zombies vault along this vector so they always land inside the bunker,
    // regardless of whether the window sits on the north, south, east or west wall.
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const dirX = centerX - spawnX;
    const dirY = centerY - spawnY;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    this.interiorX = dirX / dirLen;
    this.interiorY = dirY / dirLen;

    this.maxPlanks = 5;
    this.planks = 5;
    this.repairSpeed = 1.8; // Boards per second when holding F
  }

  canRepair() {
    return this.planks < this.maxPlanks;
  }

  repairOne() {
    if (this.planks < this.maxPlanks) {
      this.planks++;
      return true;
    }
    return false;
  }

  damageOne() {
    if (this.planks > 0) {
      this.planks--;
      return true;
    }
    return false;
  }

  draw(ctx) {
    ctx.save();

    // Window opening background (exterior darkness/dirt)
    ctx.fillStyle = '#0a0d0b';
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Concrete window sill edges
    ctx.strokeStyle = '#222623';
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // Draw remaining wooden planks
    const isHoriz = this.orientation === 'horizontal';
    const totalSlots = this.maxPlanks;

    for (let i = 0; i < this.planks; i++) {
      ctx.save();
      ctx.fillStyle = (i % 2 === 0) ? '#4a331e' : '#593d25';
      ctx.strokeStyle = '#261b11';
      ctx.lineWidth = 1.5;

      if (isHoriz) {
        // Planks placed vertically across horizontal window
        const slotWidth = this.width / (totalSlots + 1);
        const px = this.x + (i + 0.6) * slotWidth;
        const py = this.y - 3;
        const pw = slotWidth * 0.9;
        const ph = this.height + 6;

        // Slight board angle for rustic look
        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate((i % 2 === 0 ? 1 : -1) * 0.04);
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);

        // Nails
        ctx.fillStyle = '#111';
        ctx.fillRect(-pw / 4, -ph / 2 + 3, 2, 2);
        ctx.fillRect(-pw / 4, ph / 2 - 5, 2, 2);
      } else {
        // Planks placed horizontally across vertical window
        const slotHeight = this.height / (totalSlots + 1);
        const px = this.x - 3;
        const py = this.y + (i + 0.6) * slotHeight;
        const pw = this.width + 6;
        const ph = slotHeight * 0.9;

        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate((i % 2 === 0 ? 1 : -1) * 0.04);
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);

        // Nails
        ctx.fillStyle = '#111';
        ctx.fillRect(-pw / 2 + 3, -ph / 4, 2, 2);
        ctx.fillRect(pw / 2 - 5, -ph / 4, 2, 2);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

class BunkerMap {
  constructor() {
    this.walls = [];
    this.windows = [];
    this.chalkBuys = [];
    this.debrisDoor = null;
    this.armoryDebris = null;
    this.southDoor = null;
    this.stairsDebris = null;
    this.mysteryBox = null;
    this.juggernog = null;
    this.packAPunch = null;
    this.powerups = [];

    this.roundRepairPointsEarned = 0;
    this.maxRepairPointsPerRound = 500;

    this.initMapLayout();
    this.initRoomFog();
    this.navGrid = new NavGrid(this);
  }

  initMapLayout() {
    // Bunker Rooms Geometry:
    // Room 1 (Starting Spawn Room / Command Center): X: 100 -> 720, Y: 100 -> 680
    // L-Shaped Hallway:
    //   - Horizontal Segment: X: 720 -> 1140, Y: 330 -> 450
    //   - Vertical Segment:   X: 1020 -> 1140, Y: 450 -> 850
    // Room 2 (Armory / Mystery Vault): X: 800 -> 1500, Y: 850 -> 1420
    // Room 3 (Sub-Bunker Generator & Laboratory): X: 100 -> 720, Y: 700 -> 1220

    // --- Room 1 Exterior & Perimeter Walls ---
    // North Wall: (100, 100) to (720, 100) with 2 windows
    this.walls.push({ x: 100, y: 80, w: 180, h: 40 }); // left of win 1
    // Win 1: (280, 100, w: 80, h: 20)
    this.walls.push({ x: 360, y: 80, w: 160, h: 40 }); // between win 1 and 2
    // Win 2: (520, 100, w: 80, h: 20)
    this.walls.push({ x: 600, y: 80, w: 120, h: 40 }); // right of win 2

    // West Wall: (100, 100) to (100, 680) with 1 window
    this.walls.push({ x: 80, y: 100, w: 40, h: 200 }); // top of win 3
    // Win 3: (100, 300, w: 20, h: 80)
    this.walls.push({ x: 80, y: 380, w: 40, h: 300 }); // bottom of win 3

    // South Dividing Wall between Room 1 & Room 3 (Sub-Bunker Generator Lab)
    // Wall runs from X:100 to X:720 at Y:660 with South Door doorway at X:340->460
    this.walls.push({ x: 100, y: 660, w: 240, h: 40 }); // left of south door
    // South Doorway: X: 340 -> 460 (w: 120, h: 40)
    this.walls.push({ x: 460, y: 660, w: 260, h: 40 }); // right of south door

    // Dividing Wall between Room 1 & Hallway (X: 700) with Debris Door (y: 330 to 450)
    this.walls.push({ x: 700, y: 100, w: 40, h: 230 }); // top divider
    this.walls.push({ x: 700, y: 450, w: 40, h: 250 }); // bottom divider (seals into South Wall)

    // --- L-Shaped Transit Hallway (Command Center -> Armory) ---
    // 1. Horizontal Section North Wall (Trench Gun wall buy mounted here)
    this.walls.push({ x: 720, y: 290, w: 460, h: 40 }); // X: 720 -> 1180, Y: 290 -> 330
    // 2. Horizontal Section South Wall (Inner corner)
    this.walls.push({ x: 720, y: 450, w: 300, h: 40 }); // X: 720 -> 1020, Y: 450 -> 490
    // 3. Vertical Section Outer East Wall (Runs from north corner down to Armory entrance)
    this.walls.push({ x: 1140, y: 290, w: 40, h: 580 }); // X: 1140 -> 1180, Y: 290 -> 870
    // 4. Vertical Section Inner West Wall (Runs from inner corner down to Armory entrance)
    this.walls.push({ x: 980, y: 450, w: 40, h: 420 });  // X: 980 -> 1020, Y: 450 -> 870

    // Interior Support Pillars in Room 1 (tactical kiting obstacles)
    this.walls.push({ x: 300, y: 340, w: 40, h: 40 });
    this.walls.push({ x: 520, y: 340, w: 40, h: 40 });
    this.walls.push({ x: 410, y: 480, w: 35, h: 35 });

    // --- Room 3 (Sub-Bunker Generator & Laboratory): X: 100 -> 720, Y: 700 -> 1220 ---
    // West Wall: (100, 700) to (100, 1220) with 1 window
    this.walls.push({ x: 80, y: 700, w: 40, h: 180 });
    // Win 4 moved to Sub-Bunker West Window: (88, 880, w: 24, h: 80)
    this.walls.push({ x: 80, y: 960, w: 40, h: 280 });

    // East Wall of Room 3: X: 700, Y: 700 -> 1240
    this.walls.push({ x: 700, y: 700, w: 40, h: 540 });

    // South Perimeter Wall of Room 3: Y: 1220 with 1 window
    this.walls.push({ x: 100, y: 1220, w: 240, h: 40 }); // left of win 7
    // Win 7 (Sub-Bunker South Window): (340, 1226, w: 80, h: 24)
    this.walls.push({ x: 420, y: 1220, w: 300, h: 40 }); // right of win 7

    // Room 3 Generator support pillars / consoles
    this.walls.push({ x: 280, y: 940, w: 50, h: 50 });
    this.walls.push({ x: 500, y: 940, w: 50, h: 50 });

    // --- Room 2 (Armory / Mystery Vault) Perimeter Walls: X: 800 -> 1500, Y: 850 -> 1420 ---
    // North Wall with Hallway Entrance doorway at X: 1020 -> 1140
    this.walls.push({ x: 800, y: 830, w: 220, h: 40 });  // Left of entrance (seals to hallway west wall)
    this.walls.push({ x: 1140, y: 830, w: 360, h: 40 }); // Right of entrance (seals to hallway east wall)

    // West Wall: X: 800, Y: 850 -> 1420
    this.walls.push({ x: 780, y: 830, w: 40, h: 590 });

    // East Wall: X: 1500, Y: 850 -> 1420 with Win 4
    this.walls.push({ x: 1480, y: 830, w: 40, h: 270 }); // Top of Win 4 (Y: 830 -> 1100)
    // Win 4: (1488, 1100, w: 24, h: 80)
    this.walls.push({ x: 1480, y: 1180, w: 40, h: 240 }); // Bottom of Win 4 (Y: 1180 -> 1420)

    // Armory & Underground Sub-Vault Dividing Wall with Stairs Opening
    // Y: 1400 -> 1440, X: 800 -> 1500
    this.walls.push({ x: 800, y: 1400, w: 520, h: 40 });  // Left of Stairs (X: 800 -> 1320)
    // STAIRS OPENING TO UNDERGROUND: X: 1320 -> 1440 (W: 120)
    this.walls.push({ x: 1440, y: 1400, w: 60, h: 40 });  // Right of Stairs (X: 1440 -> 1500)

    // --- Room 4 (Underground Armory / Sub-Vault - Exactly below Armory): X: 800 -> 1500, Y: 1420 -> 1980 ---
    // West Wall of Underground Armory: X: 780, Y: 1400 -> 1980 with Win 8
    this.walls.push({ x: 780, y: 1400, w: 40, h: 260 }); // Top of Win 8 (Y: 1400 -> 1660)
    // Win 8: (788, 1660, w: 24, h: 80)
    this.walls.push({ x: 780, y: 1740, w: 40, h: 240 }); // Bottom of Win 8 (Y: 1740 -> 1980)

    // East Wall of Underground Armory: X: 1480, Y: 1400 -> 1980 with Win 9
    this.walls.push({ x: 1480, y: 1400, w: 40, h: 260 }); // Top of Win 9 (Y: 1400 -> 1660)
    // Win 9: (1488, 1660, w: 24, h: 80)
    this.walls.push({ x: 1480, y: 1740, w: 40, h: 240 }); // Bottom of Win 9 (Y: 1740 -> 1980)

    // South Perimeter Wall of Underground Armory: Y: 1960, X: 800 -> 1500 with Win 5
    this.walls.push({ x: 800, y: 1960, w: 300, h: 40 });  // Left of Win 5 (X: 800 -> 1100)
    // Win 5: (1100, 1966, w: 80, h: 24)
    this.walls.push({ x: 1180, y: 1960, w: 320, h: 40 }); // Right of Win 5 (X: 1180 -> 1500)

    // Interior Pillars in Underground Armory (tactical kiting obstacles)
    this.walls.push({ x: 980, y: 1680, w: 45, h: 45 });
    this.walls.push({ x: 1300, y: 1680, w: 45, h: 45 });

    // Interior Pillars in Room 2 (tactical obstacles)
    this.walls.push({ x: 980, y: 1060, w: 45, h: 45 });
    this.walls.push({ x: 1300, y: 1200, w: 45, h: 45 });

    // --- Windows ---
    // Room 1 (Command Center) Windows
    this.windows.push(new WindowBarricade(1, 280, 90, 80, 24, 'horizontal', 320, 30));
    this.windows.push(new WindowBarricade(2, 520, 90, 80, 24, 'horizontal', 560, 30));
    this.windows.push(new WindowBarricade(3, 88, 300, 24, 80, 'vertical', 30, 340));

    // Room 2 (Armory) Windows
    this.windows.push(new WindowBarricade(4, 1488, 1100, 24, 80, 'vertical', 1550, 1140));

    // Room 3 (Sub-Bunker Generator Lab) Windows
    this.windows.push(new WindowBarricade(6, 88, 880, 24, 80, 'vertical', 30, 920));
    this.windows.push(new WindowBarricade(7, 340, 1226, 80, 24, 'horizontal', 380, 1290));

    // Underground Armory (Alt Kat) Windows
    this.windows.push(new WindowBarricade(5, 1100, 1966, 80, 24, 'horizontal', 1140, 2040));
    this.windows.push(new WindowBarricade(8, 788, 1660, 24, 80, 'vertical', 720, 1700));
    this.windows.push(new WindowBarricade(9, 1488, 1660, 24, 80, 'vertical', 1560, 1700));

    // --- Debris Door (Connects Room 1 & Hallway) ---
    this.debrisDoor = {
      x: 700,
      y: 330,
      w: 40,
      h: 120,
      cost: 1000,
      opened: false,
      text: 'Clear Debris'
    };

    // --- Armory Debris (Connects Transit Corridor & Armory) ---
    this.armoryDebris = {
      x: 1020,
      y: 830,
      w: 120,
      h: 40,
      cost: 1250,
      opened: false,
      text: 'Clear Armory Debris'
    };

    // --- South Door (Connects Command Center to Sub-Bunker Generator Lab) ---
    this.southDoor = {
      x: 340,
      y: 660,
      w: 120,
      h: 40,
      cost: 750,
      opened: false,
      text: 'Unlock Sub-Bunker Gate'
    };

    // --- Stairs Debris (Connects Armory to Sub-Level B2 Alt Kat) ---
    this.stairsDebris = {
      x: 1320,
      y: 1400,
      w: 120,
      h: 40,
      cost: 1250,
      opened: false,
      text: 'Clear Stairway Debris'
    };

    // --- Chalk Wall Buys ---
    this.chalkBuys = [
      {
        id: 'kar98k_chalk',
        weaponType: WEAPON_TYPES.KAR98K,
        x: 220,
        y: 125,
        wallNormalAngle: Math.PI / 2, // Facing down into room
        cost: 200,
        ammoCost: 100,
        name: 'Kar98k'
      },
      {
        id: 'm1911_ammo_chalk',
        weaponType: WEAPON_TYPES.M1911,
        x: 125,
        y: 520,
        wallNormalAngle: 0, // Facing right into room
        cost: 50,
        ammoCost: 50,
        name: 'M1911 Ammo'
      },
      {
        id: 'mp40_chalk',
        weaponType: WEAPON_TYPES.MP40,
        x: 1460,
        y: 980,
        wallNormalAngle: Math.PI, // Facing left into Room 2
        cost: 1000,
        ammoCost: 500,
        name: 'MP40',
        requiresArmory: true
      },
      {
        id: 'shotgun_chalk',
        weaponType: WEAPON_TYPES.SHOTGUN,
        x: 920,
        y: 345,
        wallNormalAngle: Math.PI / 2, // Facing down into hallway corridor
        cost: 1200,
        ammoCost: 600,
        name: 'Trench Gun',
        requiresHallway: true
      },
      {
        id: 'mg42_chalk',
        weaponType: WEAPON_TYPES.MG42,
        x: 1350,
        y: 1945,
        wallNormalAngle: -Math.PI / 2, // Facing up into Underground Armory
        cost: 2500,
        ammoCost: 1250,
        name: 'MG42',
        requiresBasement: true
      }
    ];

    // --- Mystery Box in Room 2 ---
    this.mysteryBox = {
      x: 1360,
      y: 890,
      w: 64,
      h: 36,
      cost: 950,
      state: 'IDLE', // IDLE, SPINNING, READY
      timer: 0,
      duration: 3.6,
      readyDuration: 10.0,
      weaponsPool: [
        WEAPON_TYPES.RAYGUN,
        WEAPON_TYPES.MG42,
        WEAPON_TYPES.SHOTGUN,
        WEAPON_TYPES.MP40,
        WEAPON_TYPES.KAR98K
      ],
      selectedWeapon: null,
      cycleIndex: 0,
      cycleTimer: 0
    };

    // --- Nugi (formerly Juggernog) Perk Machine in Room 2 (Armory) ---
    this.nugi = {
      x: 900,
      y: 890,
      w: 42,
      h: 36,
      cost: 2500,
      bought: false,
      name: 'Nugi'
    };
    // Backwards compatibility alias
    this.juggernog = this.nugi;

    // --- Spodi (Speed Cola / Fast Reload) Perk Machine in Room 3 (Sub-Bunker Generator Lab) ---
    this.spodi = {
      x: 170,
      y: 745,
      w: 42,
      h: 36,
      cost: 3000,
      bought: false,
      name: 'Spodi'
    };

    // --- Pack-a-Punch Machine in Room 4 (Underground Armory / Sub-Vault) ---
    // Mounted along the North Wall (X: 1070, Y: 1464) facing the vault floor
    this.packAPunch = {
      x: 1070,
      y: 1464,
      w: 56,
      h: 42,
      costs: [5000, 15000, 30000],
      name: 'Pack-a-Punch',
      activeTimer: 0,
      pulse: 0
    };
  }

  resetRoundRepairCap() {
    this.roundRepairPointsEarned = 0;
  }

  // Get all active solid obstacle colliders
  getColliders(ignoreWindows = false) {
    const colliders = [...this.walls];

    if (!this.debrisDoor.opened) {
      colliders.push({
        x: this.debrisDoor.x,
        y: this.debrisDoor.y,
        w: this.debrisDoor.w,
        h: this.debrisDoor.h
      });
    }

    if (this.armoryDebris && !this.armoryDebris.opened) {
      colliders.push({
        x: this.armoryDebris.x,
        y: this.armoryDebris.y,
        w: this.armoryDebris.w,
        h: this.armoryDebris.h
      });
    }

    if (this.southDoor && !this.southDoor.opened) {
      colliders.push({
        x: this.southDoor.x,
        y: this.southDoor.y,
        w: this.southDoor.w,
        h: this.southDoor.h
      });
    }

    if (this.stairsDebris && !this.stairsDebris.opened) {
      colliders.push({
        x: this.stairsDebris.x,
        y: this.stairsDebris.y,
        w: this.stairsDebris.w,
        h: this.stairsDebris.h
      });
    }

    if (!ignoreWindows) {
      for (const win of this.windows) {
        colliders.push({
          x: win.x,
          y: win.y,
          w: win.width,
          h: win.height
        });
      }
    }

    // Nugi / Juggernog machine
    colliders.push({
      x: this.nugi.x - this.nugi.w / 2,
      y: this.nugi.y - this.nugi.h / 2,
      w: this.nugi.w,
      h: this.nugi.h
    });

    // Spodi machine
    if (this.spodi) {
      colliders.push({
        x: this.spodi.x - this.spodi.w / 2,
        y: this.spodi.y - this.spodi.h / 2,
        w: this.spodi.w,
        h: this.spodi.h
      });
    }

    // Mystery box
    colliders.push({
      x: this.mysteryBox.x - this.mysteryBox.w / 2,
      y: this.mysteryBox.y - this.mysteryBox.h / 2,
      w: this.mysteryBox.w,
      h: this.mysteryBox.h
    });

    // Pack-a-Punch Machine (Underground)
    if (this.packAPunch) {
      colliders.push({
        x: this.packAPunch.x - this.packAPunch.w / 2,
        y: this.packAPunch.y - this.packAPunch.h / 2,
        w: this.packAPunch.w,
        h: this.packAPunch.h
      });
    }

    return colliders;
  }

  // Check collision of an entity circle with bunker walls and obstacles
  checkWallCollision(x, y, radius, ignoreWindows = false) {
    const colliders = this.getColliders(ignoreWindows);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (this.circleRectCollision(x, y, radius, c.x, c.y, c.w, c.h)) {
        return true;
      }
    }
    return false;
  }

  circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (radius * radius);
  }

  // Robust circle-rect penetration resolution
  resolveCircleRect(entity, radius, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(entity.x, rx + rw));
    const closestY = Math.max(ry, Math.min(entity.y, ry + rh));
    const dx = entity.x - closestX;
    const dy = entity.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= radius * radius) {
      return false;
    }

    if (distSq > 0.000001) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      entity.x += (dx / dist) * overlap;
      entity.y += (dy / dist) * overlap;
      return true;
    } else {
      // Circle center inside rectangle: push out along minimal penetration axis
      const leftPen = entity.x - rx;
      const rightPen = (rx + rw) - entity.x;
      const topPen = entity.y - ry;
      const bottomPen = (ry + rh) - entity.y;
      const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);

      if (minPen === leftPen) {
        entity.x = rx - radius;
      } else if (minPen === rightPen) {
        entity.x = rx + rw + radius;
      } else if (minPen === topPen) {
        entity.y = ry - radius;
      } else {
        entity.y = ry + rh + radius;
      }
      return true;
    }
  }

  // Multi-pass collision resolution pushing entity out of all intersecting walls
  resolveCollision(entity, radius, ignoreWindows = false) {
    const colliders = this.getColliders(ignoreWindows);
    for (let pass = 0; pass < 3; pass++) {
      let resolved = false;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (this.resolveCircleRect(entity, radius, c.x, c.y, c.w, c.h)) {
          resolved = true;
        }
      }
      if (!resolved) break;
    }
  }

  // Update pathfinding navigation grid with current player position
  updateNav(playerX, playerY) {
    if (this.navGrid) {
      this.navGrid.update(playerX, playerY);
    }
  }

  // Fast Line-of-Sight check using Liang-Barsky line clipping against all bunker colliders
  hasLineOfSight(x1, y1, x2, y2, padding = 10, ignoreWindows = false) {
    const colliders = this.getColliders(ignoreWindows);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const rx = c.x - padding;
      const ry = c.y - padding;
      const rw = c.w + padding * 2;
      const rh = c.h + padding * 2;

      if (this.lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh)) {
        return false;
      }
    }
    return true;
  }

  lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    const dx = x2 - x1;
    const dy = y2 - y1;

    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rx, (rx + rw) - x1, y1 - ry, (ry + rh) - y1];

    let u1 = 0;
    let u2 = 1;

    for (let i = 0; i < 4; i++) {
      const pi = p[i];
      const qi = q[i];

      if (pi === 0) {
        if (qi < 0) return false;
      } else {
        const t = qi / pi;
        if (pi < 0) {
          if (t > u2) return false;
          if (t > u1) u1 = t;
        } else {
          if (t < u1) return false;
          if (t < u2) u2 = t;
        }
      }
    }

    return u1 <= u2;
  }

  // Update mystery box animation & timers
  updateMysteryBox(dt, audio) {
    const box = this.mysteryBox;
    if (box.state === 'SPINNING') {
      box.timer += dt;
      box.cycleTimer += dt;

      if (box.cycleTimer >= 0.09) {
        box.cycleTimer = 0;
        box.cycleIndex = (box.cycleIndex + 1) % box.weaponsPool.length;
      }

      if (box.timer >= box.duration) {
        box.state = 'READY';
        box.timer = 0;

        // Weighted weapon selection: Raygun & MG42 are rare, other weapons common
        const rand = Math.random();
        if (rand < 0.18) {
          box.selectedWeapon = WEAPON_TYPES.RAYGUN;
        } else if (rand < 0.38) {
          box.selectedWeapon = WEAPON_TYPES.MG42;
        } else if (rand < 0.60) {
          box.selectedWeapon = WEAPON_TYPES.SHOTGUN;
        } else if (rand < 0.82) {
          box.selectedWeapon = WEAPON_TYPES.MP40;
        } else {
          box.selectedWeapon = WEAPON_TYPES.KAR98K;
        }

        if (audio) audio.playMysteryBoxDone();
      }
    } else if (box.state === 'READY') {
      box.timer += dt;
      if (box.timer >= box.readyDuration) {
        // Timed out, box closes
        box.state = 'IDLE';
        box.selectedWeapon = null;
        box.timer = 0;
      }
    }
  }

  // Update Pack-a-Punch machine animation & pulse
  updatePackAPunch(dt, audio, particles) {
    if (!this.packAPunch) return;
    this.packAPunch.pulse = (this.packAPunch.pulse || 0) + dt * 3.0;
    if (this.packAPunch.activeTimer > 0) {
      this.packAPunch.activeTimer = Math.max(0, this.packAPunch.activeTimer - dt);
      if (particles && typeof particles.addSparks === 'function' && Math.random() < 0.45) {
        const sx = this.packAPunch.x + (Math.random() - 0.5) * 36;
        const sy = this.packAPunch.y + (Math.random() - 0.5) * 20;
        particles.addSparks(sx, sy, 3, '#ffd700');
      }
    }
  }

  // Update active powerups
  updatePowerups(dt, player, onCollectPowerup) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.duration -= dt;
      p.pulse += dt * 4;

      // Check player pickup
      const dist = Math.hypot(player.x - p.x, player.y - p.y);
      if (dist <= player.radius + 18) {
        onCollectPowerup(p.type);
        this.powerups.splice(i, 1);
        continue;
      }

      if (p.duration <= 0) {
        this.powerups.splice(i, 1);
      }
    }
  }

  spawnPowerup(x, y) {
    const types = ['MAX_AMMO', 'INSTA_KILL', 'NUKE', 'DOUBLE_POINTS'];
    const selected = types[Math.floor(Math.random() * types.length)];
    this.powerups.push({
      type: selected,
      x: x,
      y: y,
      duration: 25.0, // Disappears after 25s
      pulse: 0
    });
  }

  // --- Atmospheric Room Fog of War System ---
  initRoomFog() {
    this.fogTime = 0;

    // Sector 1A: Hallway Fog (Transit Corridor)
    this.hallwayFog = {
      id: 'hallway',
      unlocked: false,
      clearing: false,
      cleared: false,
      fogOpacity: 1.0,
      revealSpeed: 0.55,
      regions: [
        { x: 720, y: 310, w: 450, h: 170 }, // Horizontal Hallway
        { x: 990, y: 440, w: 180, h: 420 }  // Vertical Hallway down to Armory debris
      ],
      mistNodes: [
        { baseX: 790, baseY: 395, radius: 150, driftDist: 25, speedX: 0.6, speedY: 0.4, phase: 0.2 },
        { baseX: 950, baseY: 395, radius: 160, driftDist: 30, speedX: -0.5, speedY: 0.7, phase: 1.5 },
        { baseX: 1100, baseY: 420, radius: 160, driftDist: 25, speedX: 0.7, speedY: -0.4, phase: 2.8 },
        { baseX: 1080, baseY: 560, radius: 150, driftDist: 25, speedX: -0.4, speedY: 0.6, phase: 3.4 },
        { baseX: 1080, baseY: 720, radius: 160, driftDist: 30, speedX: 0.5, speedY: -0.5, phase: 4.2 }
      ]
    };

    // Sector 1B: Armory Fog (Room 2 Armory & Mystery Vault)
    this.armoryFog = {
      id: 'armory',
      unlocked: false,
      clearing: false,
      cleared: false,
      fogOpacity: 1.0,
      revealSpeed: 0.55,
      regions: [
        { x: 790, y: 840, w: 720, h: 590 }  // Room 2 (Armory & Vault)
      ],
      mistNodes: [
        { baseX: 920, baseY: 960, radius: 190, driftDist: 35, speedX: -0.6, speedY: 0.5, phase: 0.8 },
        { baseX: 1150, baseY: 980, radius: 210, driftDist: 40, speedX: 0.4, speedY: -0.6, phase: 2.1 },
        { baseX: 1380, baseY: 960, radius: 200, driftDist: 35, speedX: -0.5, speedY: 0.4, phase: 3.9 },
        { baseX: 950, baseY: 1180, radius: 210, driftDist: 40, speedX: 0.6, speedY: 0.5, phase: 5.1 },
        { baseX: 1180, baseY: 1200, radius: 230, driftDist: 45, speedX: -0.4, speedY: -0.5, phase: 1.2 },
        { baseX: 1400, baseY: 1220, radius: 210, driftDist: 35, speedX: 0.5, speedY: 0.6, phase: 4.7 }
      ]
    };

    // Sector 2: Sub-Bunker (Room 3 Generator & Laboratory)
    this.subBunkerFog = {
      id: 'sub_bunker',
      unlocked: false,
      clearing: false,
      cleared: false,
      fogOpacity: 1.0,
      revealSpeed: 0.55,
      regions: [
        { x: 90, y: 670, w: 640, h: 580 } // Room 3 Floor
      ],
      mistNodes: [
        { baseX: 220, baseY: 780, radius: 190, driftDist: 35, speedX: 0.5, speedY: -0.4, phase: 0.5 },
        { baseX: 410, baseY: 780, radius: 200, driftDist: 30, speedX: -0.6, speedY: 0.5, phase: 1.8 },
        { baseX: 600, baseY: 780, radius: 190, driftDist: 35, speedX: 0.4, speedY: 0.6, phase: 3.1 },
        { baseX: 250, baseY: 960, radius: 210, driftDist: 40, speedX: -0.5, speedY: -0.5, phase: 4.4 },
        { baseX: 450, baseY: 970, radius: 220, driftDist: 45, speedX: 0.6, speedY: 0.4, phase: 5.7 },
        { baseX: 620, baseY: 960, radius: 200, driftDist: 35, speedX: -0.4, speedY: 0.7, phase: 2.3 },
        { baseX: 240, baseY: 1140, radius: 200, driftDist: 35, speedX: 0.5, speedY: -0.6, phase: 3.7 },
        { baseX: 440, baseY: 1140, radius: 210, driftDist: 40, speedX: -0.6, speedY: 0.4, phase: 0.9 },
        { baseX: 620, baseY: 1140, radius: 190, driftDist: 35, speedX: 0.4, speedY: 0.5, phase: 4.9 }
      ]
    };

    // Sector 3: Underground Armory Sub-Vault (Tam Armory'nin Altı)
    this.basementFog = {
      id: 'basement',
      unlocked: false,
      clearing: false,
      cleared: false,
      fogOpacity: 1.0,
      revealSpeed: 0.55,
      regions: [
        { x: 790, y: 1420, w: 720, h: 560 } // Underground Armory Sub-Vault Floor
      ],
      mistNodes: [
        { baseX: 920, baseY: 1540, radius: 190, driftDist: 35, speedX: -0.6, speedY: 0.5, phase: 0.8 },
        { baseX: 1150, baseY: 1560, radius: 210, driftDist: 40, speedX: 0.4, speedY: -0.6, phase: 2.1 },
        { baseX: 1380, baseY: 1540, radius: 200, driftDist: 35, speedX: -0.5, speedY: 0.4, phase: 3.9 },
        { baseX: 950, baseY: 1780, radius: 210, driftDist: 40, speedX: 0.6, speedY: 0.5, phase: 5.1 },
        { baseX: 1180, baseY: 1800, radius: 230, driftDist: 45, speedX: -0.4, speedY: -0.5, phase: 1.2 },
        { baseX: 1400, baseY: 1820, radius: 210, driftDist: 35, speedX: 0.5, speedY: 0.6, phase: 4.7 }
      ]
    };
  }

  updateFog(dt, particles = null) {
    this.fogTime += dt;

    // Hallway Fog check (East Debris Door from Room 1)
    if (this.debrisDoor.opened && !this.hallwayFog.cleared) {
      if (!this.hallwayFog.clearing) {
        this.hallwayFog.clearing = true;
        if (particles && particles.addMistBurst) {
          particles.addMistBurst(720, 390, 24);
        }
      }
      if (this.hallwayFog.clearing) {
        this.hallwayFog.fogOpacity = Math.max(0, this.hallwayFog.fogOpacity - dt * this.hallwayFog.revealSpeed);
        if (this.hallwayFog.fogOpacity <= 0) {
          this.hallwayFog.fogOpacity = 0;
          this.hallwayFog.cleared = true;
          this.hallwayFog.unlocked = true;
        }
      }
    }

    // Armory Fog check (Armory Debris Door from Hallway)
    if (this.armoryDebris && this.armoryDebris.opened && !this.armoryFog.cleared) {
      if (!this.armoryFog.clearing) {
        this.armoryFog.clearing = true;
        if (particles && particles.addMistBurst) {
          particles.addMistBurst(1080, 850, 24);
        }
      }
      if (this.armoryFog.clearing) {
        this.armoryFog.fogOpacity = Math.max(0, this.armoryFog.fogOpacity - dt * this.armoryFog.revealSpeed);
        if (this.armoryFog.fogOpacity <= 0) {
          this.armoryFog.fogOpacity = 0;
          this.armoryFog.cleared = true;
          this.armoryFog.unlocked = true;
        }
      }
    }

    // Sub-Bunker Fog check
    if (this.southDoor && this.southDoor.opened && !this.subBunkerFog.cleared) {
      if (!this.subBunkerFog.clearing) {
        this.subBunkerFog.clearing = true;
        if (particles && particles.addMistBurst) {
          particles.addMistBurst(400, 680, 24);
        }
      }
      if (this.subBunkerFog.clearing) {
        this.subBunkerFog.fogOpacity = Math.max(0, this.subBunkerFog.fogOpacity - dt * this.subBunkerFog.revealSpeed);
        if (this.subBunkerFog.fogOpacity <= 0) {
          this.subBunkerFog.fogOpacity = 0;
          this.subBunkerFog.cleared = true;
          this.subBunkerFog.unlocked = true;
        }
      }
    }

    // Sub-Level B2 (Alt Kat) Fog check
    if (this.stairsDebris && this.stairsDebris.opened && !this.basementFog.cleared) {
      if (!this.basementFog.clearing) {
        this.basementFog.clearing = true;
        if (particles && particles.addMistBurst) {
          particles.addMistBurst(1380, 1420, 24);
        }
      }
      if (this.basementFog.clearing) {
        this.basementFog.fogOpacity = Math.max(0, this.basementFog.fogOpacity - dt * this.basementFog.revealSpeed);
        if (this.basementFog.fogOpacity <= 0) {
          this.basementFog.fogOpacity = 0;
          this.basementFog.cleared = true;
          this.basementFog.unlocked = true;
        }
      }
    }
  }

  drawRoomFog(ctx) {
    const sectors = [this.hallwayFog, this.armoryFog, this.subBunkerFog, this.basementFog];
    for (let s = 0; s < sectors.length; s++) {
      const sector = sectors[s];
      if (!sector || sector.cleared || sector.fogOpacity <= 0.001) continue;

      const opacity = sector.fogOpacity;
      ctx.save();

      // 1. Clip exactly to the room interior regions
      ctx.beginPath();
      for (let i = 0; i < sector.regions.length; i++) {
        const reg = sector.regions[i];
        ctx.rect(reg.x, reg.y, reg.w, reg.h);
      }
      ctx.clip();

      // 2. Base dark, murky bunker atmosphere (conceals floors, chalk, machines)
      ctx.fillStyle = `rgba(11, 15, 13, ${0.94 * opacity})`;
      for (let i = 0; i < sector.regions.length; i++) {
        const reg = sector.regions[i];
        ctx.fillRect(reg.x, reg.y, reg.w, reg.h);
      }

      // 3. Volumetric undulating mist clouds
      for (let i = 0; i < sector.mistNodes.length; i++) {
        const node = sector.mistNodes[i];
        const driftMult = 1.0 + (1.0 - opacity) * 1.8;
        const cx = node.baseX + Math.sin(this.fogTime * node.speedX + node.phase) * (node.driftDist * driftMult);
        const cy = node.baseY + Math.cos(this.fogTime * node.speedY + node.phase) * (node.driftDist * driftMult);
        const cr = node.radius * (1.0 + Math.sin(this.fogTime * 0.75 + node.phase) * 0.14) * (1.0 + (1.0 - opacity) * 0.4);

        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cr);
        grad.addColorStop(0, `rgba(38, 55, 45, ${0.60 * opacity})`);
        grad.addColorStop(0.45, `rgba(24, 36, 30, ${0.40 * opacity})`);
        grad.addColorStop(0.8, `rgba(16, 22, 19, ${0.20 * opacity})`);
        grad.addColorStop(1, 'rgba(11, 15, 13, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Subtle drifting atmospheric noise bands
      ctx.fillStyle = `rgba(45, 65, 52, ${0.08 * opacity})`;
      for (let w = 0; w < sector.regions.length; w++) {
        const r = sector.regions[w];
        for (let ny = r.y; ny < r.y + r.h; ny += 90) {
          const wave = Math.sin(this.fogTime * 1.2 + ny * 0.02) * 15;
          ctx.fillRect(r.x, ny + wave, r.w, 40);
        }
      }

      ctx.restore();

      // 5. Doorway Mist Seepage: subtle tendrils billowing at closed doors
      if (opacity > 0.35) {
        if (sector.id === 'hallway' && !this.debrisDoor.opened) {
          this.drawDoorSeepage(ctx, 700, 390, 'east', opacity);
        } else if (sector.id === 'armory' && this.armoryDebris && !this.armoryDebris.opened) {
          this.drawDoorSeepage(ctx, 1080, 830, 'south', opacity);
        } else if (sector.id === 'sub_bunker' && this.southDoor && !this.southDoor.opened) {
          this.drawDoorSeepage(ctx, 400, 660, 'south', opacity);
        } else if (sector.id === 'basement' && this.stairsDebris && !this.stairsDebris.opened) {
          this.drawDoorSeepage(ctx, 1380, 1400, 'south', opacity);
        }
      }
    }
  }

  drawDoorSeepage(ctx, x, y, direction, opacity) {
    ctx.save();
    const time = this.fogTime;
    const seepAlpha = 0.28 * opacity;
    const cx = x + (direction === 'east' ? 8 : 0) + Math.sin(time * 1.4) * 6;
    const cy = y + (direction === 'south' ? 8 : 0) + Math.cos(time * 1.2) * 6;
    const r = 48 + Math.sin(time * 0.9) * 8;

    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, r);
    grad.addColorStop(0, `rgba(40, 58, 48, ${seepAlpha})`);
    grad.addColorStop(0.6, `rgba(22, 32, 26, ${seepAlpha * 0.5})`);
    grad.addColorStop(1, 'rgba(10, 15, 12, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Map Rendering ---
  draw(ctx) {
    this.drawBunkerFloor(ctx);
    this.drawChalkBuys(ctx);
    this.drawJuggernog(ctx);
    this.drawPackAPunch(ctx);
    this.drawMysteryBox(ctx);
    this.drawWindows(ctx);
    this.drawPowerups(ctx);
    this.drawRoomFog(ctx);
    this.drawWalls(ctx);
    this.drawDebrisDoor(ctx);
  }

  drawBunkerFloor(ctx) {
    ctx.save();
    // Cold, reinforced tactical concrete floors with distinct room atmospheres
    // Room 1 Floor (Command Center - Slate Military Concrete)
    ctx.fillStyle = '#232825';
    ctx.fillRect(100, 100, 620, 580);

    // L-Shaped Transit Hallway Floor (Connecting Corridor)
    ctx.fillStyle = '#1b201d';
    // Horizontal corridor segment
    ctx.fillRect(720, 320, 440, 150);
    // Vertical corridor segment
    ctx.fillRect(1000, 440, 160, 420);

    // Room 2 Floor (Armory & Mystery Vault - Darker Reinforced Steel-Plate Concrete)
    ctx.fillStyle = '#1e2320';
    ctx.fillRect(800, 850, 700, 570);

    // Room 3 Floor (Sub-Bunker Generator & Laboratory - Industrial Damp Concrete)
    ctx.fillStyle = '#191e1c';
    ctx.fillRect(100, 680, 620, 560);

    // Room 4 Floor (Underground Armory / Sub-Vault - Exactly below Armory)
    ctx.fillStyle = '#131a17';
    ctx.fillRect(800, 1420, 700, 560);

    // Tactical slab tiles & grooves
    ctx.lineWidth = 1.2;
    for (let x = 100; x <= 1520; x += 80) {
      ctx.strokeStyle = '#141816';
      ctx.beginPath();
      ctx.moveTo(x, 100);
      ctx.lineTo(x, 1980);
      ctx.stroke();

      // Subtle light seam
      ctx.strokeStyle = 'rgba(70, 85, 75, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x + 1, 100);
      ctx.lineTo(x + 1, 1980);
      ctx.stroke();
    }
    for (let y = 100; y <= 1980; y += 80) {
      ctx.strokeStyle = '#141816';
      ctx.beginPath();
      ctx.moveTo(100, y);
      ctx.lineTo(1500, y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(70, 85, 75, 0.12)';
      ctx.beginPath();
      ctx.moveTo(100, y + 1);
      ctx.lineTo(1500, y + 1);
      ctx.stroke();
    }

    // Tile intersection anchor rivets / bolts
    ctx.fillStyle = 'rgba(10, 14, 12, 0.6)';
    for (let rx = 180; rx < 1500; rx += 80) {
      for (let ry = 180; ry < 1960; ry += 80) {
        ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
    }

    // Draw Concrete / Steel Stairs between Armory and Underground Sub-Vault
    this.drawStairs(ctx);

    // Room 1: Tactical Floor Stencil (Military Command Circle)
    ctx.strokeStyle = 'rgba(180, 205, 185, 0.06)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(410, 390, 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(410, 390, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(410, 250); ctx.lineTo(410, 530);
    ctx.moveTo(270, 390); ctx.lineTo(550, 390);
    ctx.stroke();

    // Hallway: Floor Stencil Arrow pointing around L corner to Armory
    ctx.save();
    ctx.fillStyle = 'rgba(190, 170, 80, 0.08)';
    ctx.font = 'bold 11px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('--> TRANSIT', 920, 420);
    ctx.fillText('| v ARMORY', 1080, 640);

    // Underground Armory Sub-Vault Floor Stencils
    ctx.fillStyle = 'rgba(110, 210, 160, 0.08)';
    ctx.font = 'bold 13px "Courier Prime", monospace';
    ctx.fillText('UNDERGROUND // LEVEL B1', 1150, 1530);
    ctx.fillText('ARMORY SUB-VAULT // CRYO LABS', 1150, 1555);
    ctx.font = 'bold 10px "Courier Prime", monospace';
    ctx.fillText('<-- FUTURE SECTOR ACCESS', 910, 1710);
    ctx.fillText('HEAVY WEAPON DEPOT // MG-42', 1350, 1910);
    ctx.fillStyle = 'rgba(216, 85, 255, 0.16)';
    ctx.fillText('⚡ PACK-A-PUNCH UPGRADE // COLD WAR SPEC ⚡', 1070, 1512);
    ctx.restore();

    // Caution Hazard Stripes in front of doors (Black & Yellow tactical stripes)
    const drawHazardStripe = (x, y, w, h) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#b89418';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#1e1c14';
      const stripeW = 12;
      for (let sx = -h; sx < w + h; sx += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(x + sx, y);
        ctx.lineTo(x + sx + stripeW, y);
        ctx.lineTo(x + sx + stripeW - h, y + h);
        ctx.lineTo(x + sx - h, y + h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    // Command Center -> Hallway doorway threshold hazard stripe
    drawHazardStripe(712, 335, 12, 90);
    // Hallway -> Armory doorway threshold hazard stripe
    drawHazardStripe(1035, 845, 90, 12);
    // Generator room doorway threshold hazard stripe
    drawHazardStripe(365, 672, 90, 12);
    // Armory -> Underground Stairs threshold hazard stripe
    drawHazardStripe(1335, 1395, 90, 10);
    // Underground Pack-a-Punch machine platform threshold hazard stripe
    if (this.packAPunch) {
      drawHazardStripe(this.packAPunch.x - this.packAPunch.w / 2 - 2, this.packAPunch.y + this.packAPunch.h / 2 + 1, this.packAPunch.w + 4, 8);
    }

    // Dark damp grime and rust patches
    ctx.fillStyle = 'rgba(8, 10, 9, 0.40)';
    ctx.beginPath();
    ctx.ellipse(350, 250, 130, 75, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(1150, 1150, 160, 95, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(40, 25, 15, 0.25)';
    ctx.beginPath();
    ctx.ellipse(420, 920, 140, 80, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Underground coolant damp puddle
    ctx.fillStyle = 'rgba(15, 45, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(1140, 1720, 160, 80, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw Realistic Tactical Concrete & Metal Staircase
  drawStairs(ctx) {
    ctx.save();
    const sx = 1320;
    const sy = 1370;
    const sw = 120;
    const sh = 80;
    const stepCount = 6;
    const stepH = sh / stepCount;

    // 1. Stairwell foundation cavity shadow
    ctx.fillStyle = '#0a0e0c';
    ctx.fillRect(sx, sy, sw, sh);

    // 2. Individual Steps descending from Armory to Underground
    for (let i = 0; i < stepCount; i++) {
      const stepY = sy + i * stepH;
      const depthRatio = 1.0 - (i / stepCount) * 0.30;

      // Tread top surface
      ctx.fillStyle = `rgb(${Math.round(48 * depthRatio)}, ${Math.round(58 * depthRatio)}, ${Math.round(52 * depthRatio)})`;
      ctx.fillRect(sx + 4, stepY + 2, sw - 8, stepH - 4);

      // Tread front lip shadow
      ctx.fillStyle = '#0f1412';
      ctx.fillRect(sx + 4, stepY + stepH - 3, sw - 8, 3);

      // Metallic top highlight
      ctx.fillStyle = `rgba(180, 205, 190, ${0.15 * depthRatio})`;
      ctx.fillRect(sx + 4, stepY + 2, sw - 8, 2);

      // Safety yellow edge strip
      ctx.fillStyle = `rgba(215, 180, 30, ${0.40 * depthRatio})`;
      ctx.fillRect(sx + 6, stepY + stepH - 4, sw - 12, 1.5);

      // Downward direction arrows on alternating steps
      if (i % 2 === 1) {
        ctx.fillStyle = `rgba(220, 200, 70, ${0.28 * depthRatio})`;
        ctx.font = 'bold 9px "Courier Prime", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('v   v   v', sx + sw / 2, stepY + 9);
      }
    }

    // 3. Heavy industrial steel side handrails
    ctx.strokeStyle = '#4e5a53';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + 5, sy);
    ctx.lineTo(sx + 5, sy + sh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + sw - 5, sy);
    ctx.lineTo(sx + sw - 5, sy + sh);
    ctx.stroke();

    // 4. Stencil Signs at Top and Bottom of Staircase
    ctx.save();
    ctx.font = 'bold 9px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(235, 205, 80, 0.85)';
    ctx.fillText('▼ UNDERGROUND [ALT KAT] ▼', sx + sw / 2, sy - 6);
    ctx.fillStyle = 'rgba(180, 215, 190, 0.70)';
    ctx.fillText('▲ ARMORY ▲', sx + sw / 2, sy + sh + 12);
    ctx.restore();

    ctx.restore();
  }

  drawWalls(ctx) {
    ctx.save();
    for (const w of this.walls) {
      // Base shadow / depth
      ctx.fillStyle = '#121513';
      ctx.fillRect(w.x + 2, w.y + 2, w.w, w.h);

      // Solid concrete core
      ctx.fillStyle = '#343b37';
      ctx.fillRect(w.x, w.y, w.w, w.h);

      // Upper reinforced concrete cap bevel
      ctx.fillStyle = '#424c46';
      ctx.fillRect(w.x + 3, w.y + 3, Math.max(0, w.w - 6), Math.max(0, w.h - 6));

      // Light top-edge highlight & dark bottom edge
      ctx.strokeStyle = '#5a665f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y + w.h);
      ctx.lineTo(w.x, w.y);
      ctx.lineTo(w.x + w.w, w.y);
      ctx.stroke();

      ctx.strokeStyle = '#181d1a';
      ctx.beginPath();
      ctx.moveTo(w.x + w.w, w.y);
      ctx.lineTo(w.x + w.w, w.y + w.h);
      ctx.lineTo(w.x, w.y + w.h);
      ctx.stroke();

      // Steel reinforcement corner brackets on larger wall segments
      if (w.w >= 60 && w.h >= 60) {
        ctx.fillStyle = '#1f2421';
        ctx.fillRect(w.x + 5, w.y + 5, 8, 8);
        ctx.fillRect(w.x + w.w - 13, w.y + 5, 8, 8);
        ctx.fillRect(w.x + 5, w.y + w.h - 13, 8, 8);
        ctx.fillRect(w.x + w.w - 13, w.y + w.h - 13, 8, 8);
      }
    }
    ctx.restore();
  }

  drawWindows(ctx) {
    for (const win of this.windows) {
      win.draw(ctx);
    }
  }

  drawDebrisDoor(ctx) {
    // 1. East Door to Armory / Hallway
    const door = this.debrisDoor;
    if (!door.opened) {
      ctx.save();
      ctx.fillStyle = '#3a2b1c';
      ctx.fillRect(door.x, door.y, door.w, door.h);

      ctx.strokeStyle = '#1d150e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(door.x, door.y);
      ctx.lineTo(door.x + door.w, door.y + door.h);
      ctx.moveTo(door.x + door.w, door.y);
      ctx.lineTo(door.x, door.y + door.h);
      ctx.stroke();

      ctx.font = 'bold 12px "Courier Prime", monospace';
      ctx.fillStyle = '#aa2222';
      ctx.textAlign = 'center';
      ctx.fillText('BLOCKED [1000]', door.x + door.w / 2, door.y + door.h / 2);
      ctx.restore();
    }

    // 2. Hallway to Armory Debris
    const aDoor = this.armoryDebris;
    if (aDoor && !aDoor.opened) {
      ctx.save();
      ctx.fillStyle = '#3a2b1c';
      ctx.fillRect(aDoor.x, aDoor.y, aDoor.w, aDoor.h);

      ctx.strokeStyle = '#1d150e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(aDoor.x, aDoor.y);
      ctx.lineTo(aDoor.x + aDoor.w, aDoor.y + aDoor.h);
      ctx.moveTo(aDoor.x + aDoor.w, aDoor.y);
      ctx.lineTo(aDoor.x, aDoor.y + aDoor.h);
      ctx.stroke();

      ctx.font = 'bold 12px "Courier Prime", monospace';
      ctx.fillStyle = '#aa2222';
      ctx.textAlign = 'center';
      ctx.fillText('BLOCKED [1250]', aDoor.x + aDoor.w / 2, aDoor.y + aDoor.h / 2 + 4);
      ctx.restore();
    }

    // 3. South Gate to Sub-Bunker Generator Lab
    const sDoor = this.southDoor;
    if (sDoor && !sDoor.opened) {
      ctx.save();
      ctx.fillStyle = '#2b2318';
      ctx.fillRect(sDoor.x, sDoor.y, sDoor.w, sDoor.h);

      ctx.strokeStyle = '#1a1309';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sDoor.x, sDoor.y);
      ctx.lineTo(sDoor.x + sDoor.w, sDoor.y + sDoor.h);
      ctx.moveTo(sDoor.x + sDoor.w, sDoor.y);
      ctx.lineTo(sDoor.x, sDoor.y + sDoor.h);
      ctx.stroke();

      ctx.font = 'bold 12px "Courier Prime", monospace';
      ctx.fillStyle = '#aa4422';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED GATE [750]', sDoor.x + sDoor.w / 2, sDoor.y + sDoor.h / 2 + 4);
      ctx.restore();
    }

    // 4. Armory Stairwell to Sub-Level B2 (Alt Kat) Debris
    const stDoor = this.stairsDebris;
    if (stDoor && !stDoor.opened) {
      ctx.save();
      ctx.fillStyle = '#2d2218';
      ctx.fillRect(stDoor.x, stDoor.y, stDoor.w, stDoor.h);

      ctx.strokeStyle = '#18120b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(stDoor.x, stDoor.y);
      ctx.lineTo(stDoor.x + stDoor.w, stDoor.y + stDoor.h);
      ctx.moveTo(stDoor.x + stDoor.w, stDoor.y);
      ctx.lineTo(stDoor.x, stDoor.y + stDoor.h);
      ctx.stroke();

      ctx.font = 'bold 12px "Courier Prime", monospace';
      ctx.fillStyle = '#dd3322';
      ctx.textAlign = 'center';
      ctx.fillText('STAIRS DEBRIS [1250]', stDoor.x + stDoor.w / 2, stDoor.y + stDoor.h / 2 + 4);
      ctx.restore();
    }
  }

  drawChalkBuys(ctx) {
    ctx.save();
    ctx.font = 'bold 11px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const chalk of this.chalkBuys) {
      ctx.save();
      ctx.translate(chalk.x, chalk.y);

      // Chalk silhouette outline
      ctx.strokeStyle = 'rgba(235, 240, 230, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);

      // Draw stylized chalk gun silhouette
      if (chalk.weaponType === WEAPON_TYPES.KAR98K) {
        ctx.strokeRect(-26, -6, 52, 12);
        ctx.fillStyle = 'rgba(235, 240, 230, 0.85)';
        ctx.fillText(`KAR98K [${chalk.cost}]`, 0, -14);
      } else if (chalk.weaponType === WEAPON_TYPES.MP40) {
        ctx.strokeRect(-22, -8, 44, 16);
        ctx.fillStyle = 'rgba(235, 240, 230, 0.85)';
        ctx.fillText(`MP40 [${chalk.cost}]`, 0, -16);
      } else if (chalk.weaponType === WEAPON_TYPES.SHOTGUN) {
        ctx.strokeRect(-24, -7, 48, 14);
        ctx.fillStyle = 'rgba(235, 240, 230, 0.85)';
        ctx.fillText(`TRENCH GUN [${chalk.cost}]`, 0, -15);
      } else if (chalk.weaponType === WEAPON_TYPES.MG42) {
        ctx.strokeRect(-28, -9, 56, 18);
        ctx.fillStyle = 'rgba(235, 240, 230, 0.85)';
        ctx.fillText(`MG42 [${chalk.cost}]`, 0, -17);
      } else {
        ctx.strokeRect(-16, -6, 32, 12);
        ctx.fillStyle = 'rgba(235, 240, 230, 0.85)';
        ctx.fillText(`AMMO [${chalk.ammoCost}]`, 0, -14);
      }

      ctx.restore();
    }
    ctx.restore();
  }

  drawJuggernog(ctx) {
    // 1. Draw NUGI Machine (Red / Health)
    const nugi = this.nugi || this.juggernog;
    ctx.save();
    ctx.translate(nugi.x, nugi.y);

    // Crimson machine body
    ctx.fillStyle = '#8f1212';
    ctx.fillRect(-nugi.w / 2, -nugi.h / 2, nugi.w, nugi.h);
    ctx.strokeStyle = '#3d0707';
    ctx.lineWidth = 2;
    ctx.strokeRect(-nugi.w / 2, -nugi.h / 2, nugi.w, nugi.h);

    // Glowing top sign
    ctx.fillStyle = '#ff3333';
    ctx.shadowColor = '#ff2222';
    ctx.shadowBlur = 10;
    ctx.fillRect(-nugi.w / 2 + 4, -nugi.h / 2 + 3, nugi.w - 8, 8);

    ctx.font = 'bold 10px "Cinzel", serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('NUGI [2500]', 0, -nugi.h / 2 - 6);

    ctx.restore();

    // 2. Draw SPODI Machine (Emerald Green / Fast Reload)
    if (this.spodi) {
      const spodi = this.spodi;
      ctx.save();
      ctx.translate(spodi.x, spodi.y);

      // Emerald green machine body
      ctx.fillStyle = '#106638';
      ctx.fillRect(-spodi.w / 2, -spodi.h / 2, spodi.w, spodi.h);
      ctx.strokeStyle = '#08331c';
      ctx.lineWidth = 2;
      ctx.strokeRect(-spodi.w / 2, -spodi.h / 2, spodi.w, spodi.h);

      // Glowing bright emerald top sign
      ctx.fillStyle = '#22ff88';
      ctx.shadowColor = '#22ff88';
      ctx.shadowBlur = 10;
      ctx.fillRect(-spodi.w / 2 + 4, -spodi.h / 2 + 3, spodi.w - 8, 8);

      ctx.font = 'bold 10px "Cinzel", serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('SPODI [3000]', 0, -spodi.h / 2 - 6);

      ctx.restore();
    }
  }

  drawPackAPunch(ctx) {
    if (!this.packAPunch) return;
    const pap = this.packAPunch;
    ctx.save();
    ctx.translate(pap.x, pap.y);

    const w = pap.w;
    const h = pap.h;
    const isActive = pap.activeTimer > 0;
    const pulse = pap.pulse || 0;

    // 1. Heavy dark industrial iron/brass base plate
    ctx.fillStyle = '#1b1713';
    ctx.fillRect(-w / 2 - 4, -h / 2 - 2, w + 8, h + 6);
    ctx.strokeStyle = '#3d2e1c';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 - 4, -h / 2 - 2, w + 8, h + 6);

    // Corner brass bolts on base
    ctx.fillStyle = '#a88132';
    const boltCoords = [
      [-w / 2 - 1, -h / 2 + 1],
      [w / 2 + 1, -h / 2 + 1],
      [-w / 2 - 1, h / 2 + 2],
      [w / 2 + 1, h / 2 + 2]
    ];
    for (const [bx, by] of boltCoords) {
      ctx.beginPath();
      ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Machine Main Chassis (Victorian dark brass, mahogany patina & wrought iron)
    ctx.fillStyle = '#382515';
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Metal banding / decorative borders
    ctx.strokeStyle = '#5a3d1d';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Decorative brass corner brackets
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1.8;
    const cornerSize = 7;
    // Top-left
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + cornerSize); ctx.lineTo(-w / 2, -h / 2); ctx.lineTo(-w / 2 + cornerSize, -h / 2); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(w / 2 - cornerSize, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2 + cornerSize); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(-w / 2, h / 2 - cornerSize); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(-w / 2 + cornerSize, h / 2); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(w / 2 - cornerSize, h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(w / 2, h / 2 - cornerSize); ctx.stroke();

    // 3. Brass Clockwork Gears (Animated rotating cogs on left & right)
    const drawGear = (gx, gy, gr, rot) => {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      ctx.strokeStyle = '#d4af37';
      ctx.fillStyle = '#8a6a24';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, gr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cog teeth
      ctx.fillStyle = '#d4af37';
      const teeth = 6;
      for (let i = 0; i < teeth; i++) {
        const ang = (i * Math.PI * 2) / teeth;
        const tx = Math.cos(ang) * (gr + 2.0);
        const ty = Math.sin(ang) * (gr + 2.0);
        ctx.fillRect(tx - 1.2, ty - 1.2, 2.4, 2.4);
      }
      ctx.restore();
    };

    drawGear(-w / 2 + 10, -h / 2 + 11, 5, pulse * 1.5);
    drawGear(w / 2 - 10, -h / 2 + 11, 5, -pulse * 1.5);

    // 4. Glowing Vacuum Tubes with Element 115 plasma filaments
    const tubeGlow = isActive ? '#00e5ff' : '#d855ff';

    // Left vacuum tube
    ctx.save();
    ctx.fillStyle = 'rgba(20, 25, 30, 0.85)';
    ctx.fillRect(-w / 2 + 4, h / 2 - 18, 8, 14);
    ctx.strokeStyle = '#4a3d2e';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 4, h / 2 - 18, 8, 14);

    ctx.fillStyle = tubeGlow;
    ctx.shadowColor = tubeGlow;
    ctx.shadowBlur = isActive ? 14 : 7;
    ctx.fillRect(-w / 2 + 6, h / 2 - 15, 4, 8);
    ctx.restore();

    // Right vacuum tube
    ctx.save();
    ctx.fillStyle = 'rgba(20, 25, 30, 0.85)';
    ctx.fillRect(w / 2 - 12, h / 2 - 18, 8, 14);
    ctx.strokeStyle = '#4a3d2e';
    ctx.lineWidth = 1;
    ctx.strokeRect(w / 2 - 12, h / 2 - 18, 8, 14);

    ctx.fillStyle = tubeGlow;
    ctx.shadowColor = tubeGlow;
    ctx.shadowBlur = isActive ? 14 : 7;
    ctx.fillRect(w / 2 - 10, h / 2 - 15, 4, 8);
    ctx.restore();

    // 5. Central Upgrade Chamber / Receptacle
    const chamberW = 24;
    const chamberH = 16;
    ctx.save();
    ctx.fillStyle = '#0f0c08';
    ctx.fillRect(-chamberW / 2, -chamberH / 2 + 3, chamberW, chamberH);
    ctx.strokeStyle = '#6a4a25';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-chamberW / 2, -chamberH / 2 + 3, chamberW, chamberH);

    // Chamber energetic plasma glow / energy core
    const coreColor = isActive ? '#ffd700' : (Math.sin(pulse * 2) > 0 ? '#d855ff' : '#9b30ff');
    const coreGrad = ctx.createRadialGradient(0, 3, 2, 0, 3, chamberW / 2);
    coreGrad.addColorStop(0, coreColor);
    coreGrad.addColorStop(0.5, isActive ? 'rgba(255, 215, 0, 0.6)' : 'rgba(180, 50, 255, 0.45)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGrad;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = isActive ? 22 : 10;
    ctx.beginPath();
    ctx.arc(0, 3, chamberW / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Dynamic electrical crackle / cross-feed sparks inside chamber
    if (isActive) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-chamberW / 2 + 3, 3 + (Math.random() - 0.5) * 6);
      ctx.lineTo(0, 3 + (Math.random() - 0.5) * 8);
      ctx.lineTo(chamberW / 2 - 3, 3 + (Math.random() - 0.5) * 6);
      ctx.stroke();
    }
    ctx.restore();

    // 6. Iconic Overhead Marquee Sign: "PACK-A-PUNCH"
    ctx.save();
    // Metal sign banner
    ctx.fillStyle = '#1e140d';
    ctx.fillRect(-w / 2 + 2, -h / 2 - 14, w - 4, 11);
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2 + 2, -h / 2 - 14, w - 4, 11);

    // Neon typography
    ctx.font = 'bold 9px "Cinzel", "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = isActive ? '#ffd700' : '#d855ff';
    ctx.shadowBlur = isActive ? 16 : 9;
    ctx.fillText('PACK-A-PUNCH', 0, -h / 2 - 8.5);
    ctx.restore();

    // 7. Small indicator text below machine
    ctx.save();
    ctx.font = 'bold 7.5px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.75)';
    ctx.fillText('[UPGRADE // 3 TIERS]', 0, h / 2 + 9);
    ctx.restore();

    ctx.restore();
  }

  drawMysteryBox(ctx) {
    const box = this.mysteryBox;
    ctx.save();
    ctx.translate(box.x, box.y);

    // Dark wood chest
    ctx.fillStyle = '#3a2312';
    ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);

    // Iron bands
    ctx.fillStyle = '#222';
    ctx.fillRect(-box.w / 2, -box.h / 2, 6, box.h);
    ctx.fillRect(box.w / 2 - 6, -box.h / 2, 6, box.h);
    ctx.fillRect(-4, -box.h / 2, 8, box.h);

    // Question marks on lid
    ctx.font = 'bold 16px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 8;
    ctx.fillText('?  ?', 0, 0);

    // If spinning or ready, show floating weapon preview
    if (box.state === 'SPINNING') {
      const currentGunId = box.weaponsPool[box.cycleIndex];
      const cfg = WEAPON_CONFIGS[currentGunId];
      ctx.font = 'bold 13px "Courier Prime", monospace';
      ctx.fillStyle = cfg.isRayGun ? '#00ff66' : '#ffffff';
      ctx.shadowColor = cfg.isRayGun ? '#00ff66' : '#ffaa00';
      ctx.shadowBlur = 12;
      ctx.fillText(cfg.name.toUpperCase(), 0, -32);
    } else if (box.state === 'READY') {
      const cfg = WEAPON_CONFIGS[box.selectedWeapon];
      ctx.font = 'bold 15px "Courier Prime", monospace';
      ctx.fillStyle = cfg.isRayGun ? '#00ff66' : '#ffd700';
      ctx.shadowColor = cfg.isRayGun ? '#00ff66' : '#ffaa00';
      ctx.shadowBlur = 15;
      ctx.fillText(cfg.name.toUpperCase(), 0, -32);
    }

    ctx.restore();
  }

  drawPowerups(ctx) {
    for (const p of this.powerups) {
      ctx.save();
      ctx.translate(p.x, p.y);

      const scale = 1.0 + Math.sin(p.pulse) * 0.12;
      ctx.scale(scale, scale);

      // Glowing circular badge
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(15, 30, 20, 0.9)';
      ctx.strokeStyle = '#55ff99';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Power-up glyph
      ctx.font = 'bold 10px "Courier Prime", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';

      let label = 'AMMO';
      if (p.type === 'INSTA_KILL') label = 'SKULL';
      else if (p.type === 'NUKE') label = 'NUKE';
      else if (p.type === 'DOUBLE_POINTS') label = '2X';

      ctx.fillText(label, 0, 0);

      ctx.restore();
    }
  }

  // Get current zone / room name based on player coordinates
  getZoneName(x, y) {
    // Room 1 (Command Center): X: 100 -> 720, Y: 100 -> 680
    // L-Shaped Transit Hallway: X: 710 -> 1180, Y: 290 -> 850
    // Room 2 (Armory / Mystery Vault): X: 780 -> 1520, Y: 830 -> 1420
    // Room 4 (Underground Armory / Sub-Vault - Exactly below Armory): X: 780 -> 1520, Y: 1420 -> 2000
    // Room 3 (Sub-Bunker Generator & Laboratory): X: 100 -> 780, Y >= 680
    if (x >= 780 && x <= 1520 && y >= 1420) {
      return 'UNDERGROUND // ARMORY SUB-VAULT';
    } else if (x >= 780 && y >= 830) {
      return 'ARMORY // MYSTERY VAULT';
    } else if ((x >= 710 && y <= 500) || (x >= 970 && y >= 450 && y <= 850)) {
      return 'TRANSIT CORRIDOR // L-HALL';
    } else if (y >= 680 && x <= 780) {
      return 'SUB-BUNKER // GENERATOR LAB';
    } else {
      return 'COMMAND CENTER // BUNKER 01';
    }
  }
}

