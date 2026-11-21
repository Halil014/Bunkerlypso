'use strict';

// ==================== [MODULE: zombie.js] ====================

/**
 * Zombie AI, State Machine & Behaviors
 * Implements window breaching, wall-avoidance navigation, round scaling,
 * visceral hit-reactions, and the relentless undead swarm.
 */

let nextZombieId = 1;

const ZOMBIE_STATES = {
  SPAWNED_OUTSIDE: 'SPAWNED_OUTSIDE',
  APPROACHING_WINDOW: 'APPROACHING_WINDOW',
  TEARING_WINDOW: 'TEARING_WINDOW',
  VAULTING_WINDOW: 'VAULTING_WINDOW',
  CHASING_PLAYER: 'CHASING_PLAYER',
  ATTACKING_PLAYER: 'ATTACKING_PLAYER',
  DEAD: 'DEAD'
};

class Zombie {
  constructor(windowBarricade, roundNumber, difficulty = 'NORMAL') {
    this.id = nextZombieId++;
    this.targetWindow = windowBarricade;
    this.state = ZOMBIE_STATES.SPAWNED_OUTSIDE;

    // Exterior spawn positioning
    this.x = windowBarricade.spawnX + (Math.random() - 0.5) * 40;
    this.y = windowBarricade.spawnY + (Math.random() - 0.5) * 40;
    this.radius = 15;
    this.angle = 0;

    // Scale attributes based on round number & difficulty
    this.initAttributes(roundNumber, difficulty);

    // Hit-reaction and stagger
    this.staggerTimer = 0;
    this.knockbackVx = 0;
    this.knockbackVy = 0;
    this.flashTimer = 0;

    // Combat & Attack Cooldowns
    this.attackRange = 32;
    this.attackCooldown = 1.2;
    this.lastAttackTime = 0;
    this.attackDamage = 50; // Zombi hasarı hiçbir zaman değişmez (sabit 50 HP)

    // Window tearing
    this.tearTimer = 0;
    this.tearInterval = difficulty === 'NIGHTMARE' ? 1.1 : (difficulty === 'HARD' ? 1.3 : 1.5);

    // Animation timers
    this.walkCycle = Math.random() * Math.PI * 2;
    this.alive = true;
    this.isDecapitated = false;

    // Intelligent Navigation & Anti-Stuck Watchdog
    this.stuckTimer = 0;
    this.stuckNudgeTimer = 0;
    this.stuckNudge = 0;
    this.lastStuckX = this.x;
    this.lastStuckY = this.y;
  }

  initAttributes(round, difficulty = 'NORMAL') {
    // Health formula: Round 1-10 lineer (+100 HP/round), Round 11+ mevcut canın %10'u kadar artar (bileşik)
    const healthMultiplier = difficulty === 'NIGHTMARE' ? 1.2 : (difficulty === 'HARD' ? 1.1 : 1.0);
    let baseHp;
    if (round <= 10) {
      baseHp = 150 + (round - 1) * 100;
    } else {
      const r10Hp = 150 + 9 * 100; // Round 10 canı: 1050
      baseHp = r10Hp * Math.pow(1.1, round - 10);
    }
    this.maxHealth = Math.round(baseHp * healthMultiplier);
    this.health = this.maxHealth;

    const speedMult = difficulty === 'NIGHTMARE' ? 1.12 : (difficulty === 'HARD' ? 1.06 : 1.0);

    // Speed formula: Genel olarak azaltılmış hızlar, sadece belli başlı zombiler hızlı (SPRINTER)
    const rand = Math.random();
    if (round <= 2) {
      // Round 1-2: %95 sakin yürüyen (WALKER), %5 tek tük hızlı (SPRINTER)
      if (rand < 0.05) {
        this.speedType = 'SPRINTER';
        this.baseSpeed = (105 + Math.random() * 15) * speedMult;
      } else {
        this.speedType = 'WALKER';
        this.baseSpeed = (36 + Math.random() * 14) * speedMult;
      }
    } else if (round <= 5) {
      // Round 3-5: %75 yavaş (WALKER), %15 orta (JOGGER), %10 hızlı (SPRINTER)
      if (rand < 0.10) {
        this.speedType = 'SPRINTER';
        this.baseSpeed = (110 + Math.random() * 16) * speedMult;
      } else if (rand < 0.25) {
        this.speedType = 'JOGGER';
        this.baseSpeed = (62 + Math.random() * 14) * speedMult;
      } else {
        this.speedType = 'WALKER';
        this.baseSpeed = (42 + Math.random() * 14) * speedMult;
      }
    } else if (round <= 9) {
      // Round 6-9: %60 yavaş (WALKER), %25 orta (JOGGER), %15 hızlı (SPRINTER)
      if (rand < 0.15) {
        this.speedType = 'SPRINTER';
        this.baseSpeed = (116 + Math.random() * 16) * speedMult;
      } else if (rand < 0.40) {
        this.speedType = 'JOGGER';
        this.baseSpeed = (66 + Math.random() * 14) * speedMult;
      } else {
        this.speedType = 'WALKER';
        this.baseSpeed = (46 + Math.random() * 14) * speedMult;
      }
    } else {
      // Round 10+: Zombilerin çoğu (%80) yine sakin/orta tempolu, belli başlı zombiler (%20) hızlı
      if (rand < 0.20) {
        this.speedType = 'SPRINTER';
        this.baseSpeed = (120 + Math.random() * 16) * speedMult;
      } else if (rand < 0.50) {
        this.speedType = 'JOGGER';
        this.baseSpeed = (70 + Math.random() * 14) * speedMult;
      } else {
        this.speedType = 'WALKER';
        this.baseSpeed = (48 + Math.random() * 14) * speedMult;
      }
    }

    this.currentSpeed = this.baseSpeed;
  }

  takeDamage(damage, hitAngle, isHeadshot, audio, particles, hud = null, weaponType = null) {
    if (!this.alive) return { killed: false, score: 0 };

    this.health -= damage;
    const isFatal = this.health <= 0;

    // Visual BO2 hitmarker on HUD
    if (hud) {
      hud.showHitmarker(isHeadshot, isFatal);
    }

    // Audio hitmarker & flesh bullet perforation sound
    if (audio) {
      audio.playHitmarker(isHeadshot);
      audio.playFleshImpact(isHeadshot);
    }

    // Immediate tactile hit flash (bright white / red silhouette)
    this.flashTimer = 0.085;

    // Dynamic weapon-scaled knockback & stagger impulse
    let knockbackForce = 85;
    let stagger = 0.15;
    if (weaponType === 'shotgun') {
      knockbackForce = 240;
      stagger = 0.22;
    } else if (weaponType === 'raygun') {
      knockbackForce = 210;
      stagger = 0.20;
    } else if (weaponType === 'kar98k') {
      knockbackForce = 150;
      stagger = 0.18;
    } else if (weaponType === 'mg42') {
      knockbackForce = 105;
      stagger = 0.14;
    } else if (weaponType === 'knife') {
      knockbackForce = 180;
      stagger = 0.24;
    } else if (isHeadshot) {
      knockbackForce = 110;
      stagger = 0.16;
    }

    this.staggerTimer = stagger;
    this.knockbackVx = Math.cos(hitAngle) * knockbackForce;
    this.knockbackVy = Math.sin(hitAngle) * knockbackForce;

    // Groan sound occasionally on hit
    if (Math.random() < 0.25 && audio) {
      audio.playZombieGroan(false);
    }

    if (isFatal) {
      this.alive = false;
      this.state = ZOMBIE_STATES.DEAD;
      this.isDecapitated = isHeadshot;

      // Visceral flesh tearing / gib dismemberment sound
      if (audio) {
        audio.playFleshRip(isHeadshot, weaponType === 'shotgun');
      }

      // Death blood burst
      particles.addBloodSplatter(this.x, this.y, hitAngle, 2.5);

      // Zombie Pixel Gibs Dismemberment
      particles.addZombieGibs(this.x, this.y, hitAngle, isHeadshot, weaponType);

      return {
        killed: true,
        isHeadshot: isHeadshot
      };
    }

    // Non-fatal hit: exit wound blood spurt & splatters
    particles.addExitWoundSpurt(this.x, this.y, hitAngle);
    particles.addBloodSplatter(this.x, this.y, hitAngle, isHeadshot ? 1.6 : 1.0);

    return {
      killed: false,
      isHeadshot: isHeadshot
    };
  }

  update(dt, player, map, allZombies, audio, particles, nowSec = performance.now() / 1000) {
    if (!this.alive) return;

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
    }

    // 1. Process knockback & stagger
    if (this.staggerTimer > 0) {
      this.staggerTimer -= dt;
      this.x += this.knockbackVx * dt;
      this.y += this.knockbackVy * dt;
      if (this.state === ZOMBIE_STATES.CHASING_PLAYER || this.state === ZOMBIE_STATES.ATTACKING_PLAYER) {
        map.resolveCollision(this, this.radius);
      }
      this.knockbackVx *= 0.85;
      this.knockbackVy *= 0.85;
      return;
    }

    // 2. State Machine Update
    switch (this.state) {
      case ZOMBIE_STATES.SPAWNED_OUTSIDE:
      case ZOMBIE_STATES.APPROACHING_WINDOW: {
        this.updateApproachingWindow(dt, audio, particles);
        break;
      }
      case ZOMBIE_STATES.TEARING_WINDOW: {
        this.updateTearingWindow(dt, audio, particles);
        break;
      }
      case ZOMBIE_STATES.VAULTING_WINDOW: {
        this.updateVaultingWindow(dt);
        break;
      }
      case ZOMBIE_STATES.CHASING_PLAYER: {
        this.updateChasingPlayer(dt, player, map, allZombies, audio);
        break;
      }
      case ZOMBIE_STATES.ATTACKING_PLAYER: {
        this.updateAttackingPlayer(dt, player, nowSec, audio, particles, allZombies);
        break;
      }
    }

    // Walk cycle animation
    this.walkCycle += dt * (this.currentSpeed * 0.08);
  }

  updateApproachingWindow(dt, audio, particles) {
    const win = this.targetWindow;
    const targetX = win.x + win.width / 2;
    const targetY = win.y + win.height / 2;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);

    if (dist <= 26) {
      if (win.planks > 0) {
        this.state = ZOMBIE_STATES.TEARING_WINDOW;
        this.tearTimer = 0;
      } else {
        this.state = ZOMBIE_STATES.VAULTING_WINDOW;
      }
    } else {
      this.x += Math.cos(this.angle) * this.currentSpeed * dt;
      this.y += Math.sin(this.angle) * this.currentSpeed * dt;
    }
  }

  updateTearingWindow(dt, audio, particles) {
    const win = this.targetWindow;
    this.tearTimer += dt;

    // Face the window
    const targetX = win.x + win.width / 2;
    const targetY = win.y + win.height / 2;
    this.angle = Math.atan2(targetY - this.y, targetX - this.x);

    if (this.tearTimer >= this.tearInterval) {
      this.tearTimer = 0;
      if (win.damageOne()) {
        audio.playWoodBreak();
        particles.addWoodSplinters(targetX, targetY, 10);
      }

      if (win.planks <= 0) {
        this.state = ZOMBIE_STATES.VAULTING_WINDOW;
      }
    }
  }

  updateVaultingWindow(dt) {
    const win = this.targetWindow;

    // Move across the window threshold into the bunker. The interior direction is
    // derived from the window's exterior spawn point, so this works for every wall
    // orientation (the old coordinate heuristic broke window 8 on the west wall).
    const vaultDistance = 46;
    const targetX = win.x + win.width / 2 + win.interiorX * vaultDistance;
    const targetY = win.y + win.height / 2 + win.interiorY * vaultDistance;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);

    if (dist <= 12) {
      // Successfully entered bunker interior!
      this.state = ZOMBIE_STATES.CHASING_PLAYER;
    } else {
      this.x += Math.cos(this.angle) * (this.currentSpeed * 0.75) * dt;
      this.y += Math.sin(this.angle) * (this.currentSpeed * 0.75) * dt;
    }
  }

  updateChasingPlayer(dt, player, map, allZombies, audio) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distToPlayer = Math.hypot(dx, dy);

    // If close enough, initiate attack
    if (distToPlayer <= this.attackRange) {
      this.state = ZOMBIE_STATES.ATTACKING_PLAYER;
      return;
    }

    // 1. Anti-Stuck Watchdog: detect if caught on wall or doorframe
    this.stuckTimer += dt;
    if (this.stuckTimer >= 0.35) {
      const movedDist = Math.hypot(this.x - this.lastStuckX, this.y - this.lastStuckY);
      if (movedDist < 6) {
        // Zombie barely moved in 0.35s despite chasing: apply lateral escape nudge
        this.stuckNudge = (Math.random() < 0.5 ? 1 : -1) * (1.3 + Math.random() * 0.5);
        this.stuckNudgeTimer = 0.45;
      }
      this.lastStuckX = this.x;
      this.lastStuckY = this.y;
      this.stuckTimer = 0;
    }

    if (this.stuckNudgeTimer > 0) {
      this.stuckNudgeTimer -= dt;
    }

    // 2. Determine target direction: Line-of-Sight vs Navigation Vector Field
    let desiredAngle;
    const hasLOS = map.hasLineOfSight ? map.hasLineOfSight(this.x, this.y, player.x, player.y, this.radius - 2) : false;

    if (hasLOS) {
      // Direct open line of sight to player (same room or clear doorway)
      desiredAngle = Math.atan2(dy, dx);
    } else {
      // Obstructed by walls/rooms: follow Dijkstra flowfield through open corridors & doors
      const flow = map.navGrid ? map.navGrid.getFlow(this.x, this.y) : null;
      if (flow && (flow.x !== 0 || flow.y !== 0)) {
        desiredAngle = Math.atan2(flow.y, flow.x);
      } else {
        desiredAngle = Math.atan2(dy, dx);
      }
    }

    // Apply anti-stuck nudge if active
    if (this.stuckNudgeTimer > 0) {
      desiredAngle += this.stuckNudge;
    }

    // 3. Multi-angle obstacle probing to slide smoothly around corners & pillars
    const probeDist = this.radius + 14;
    const probeAngles = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.2, -2.2];
    let bestAngle = desiredAngle;

    for (const offset of probeAngles) {
      const testAngle = desiredAngle + offset;
      const testX = this.x + Math.cos(testAngle) * probeDist;
      const testY = this.y + Math.sin(testAngle) * probeDist;

      if (!map.checkWallCollision(testX, testY, this.radius - 2)) {
        bestAngle = testAngle;
        break;
      }
    }

    // 4. Separation from other zombies (flocking behavior)
    let sepX = 0;
    let sepY = 0;
    for (const other of allZombies) {
      if (other === this || !other.alive) continue;
      const odx = this.x - other.x;
      const ody = this.y - other.y;
      const oDist = Math.hypot(odx, ody);
      if (oDist > 0 && oDist < this.radius * 2.2) {
        sepX += (odx / oDist) * (this.radius * 2.2 - oDist);
        sepY += (ody / oDist) * (this.radius * 2.2 - oDist);
      }
    }

    // 5. Combine desired navigation vector with separation
    const moveX = Math.cos(bestAngle) * this.currentSpeed + sepX * 1.6;
    const moveY = Math.sin(bestAngle) * this.currentSpeed + sepY * 1.6;
    const moveLen = Math.hypot(moveX, moveY);

    if (moveLen > 0) {
      this.angle = Math.atan2(moveY, moveX);
      const dirX = moveX / moveLen;
      const dirY = moveY / moveLen;

      // Independent per-axis movement and resolution for smooth sliding along walls
      this.x += dirX * this.currentSpeed * dt;
      map.resolveCollision(this, this.radius);

      this.y += dirY * this.currentSpeed * dt;
      map.resolveCollision(this, this.radius);
    }

    // Occasional moan while stalking
    if (Math.random() < 0.003 && audio) {
      audio.playZombieGroan(false);
    }
  }

  updateAttackingPlayer(dt, player, nowSec, audio, particles, allZombies = null) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distToPlayer = Math.hypot(dx, dy);

    this.angle = Math.atan2(dy, dx);

    if (distToPlayer > this.attackRange + 12) {
      this.state = ZOMBIE_STATES.CHASING_PLAYER;
      return;
    }

    if (nowSec - this.lastAttackTime >= this.attackCooldown) {
      this.lastAttackTime = nowSec;
      audio.playZombieAttack();
      player.takeDamage(this.attackDamage, nowSec, audio, this, particles, allZombies);
      particles.addBloodSplatter(player.x, player.y, this.angle, 1.2);
    }
  }

  // Draw zombie top-down representation
  draw(ctx) {
    if (!this.alive) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Shuffling arm / shoulder sway offset
    const sway = Math.sin(this.walkCycle) * 3;

    // --- VISCERAL HIT FLASH SILHOUETTE ---
    if (this.flashTimer > 0) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 9;

      // Torso in solid white
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head in solid white
      if (!this.isDecapitated) {
        ctx.beginPath();
        ctx.arc(4, 0, 7.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Clawing arms in solid white
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(16, -9 + sway);
      ctx.moveTo(0, 9);
      ctx.lineTo(16, 9 - sway);
      ctx.stroke();

      ctx.restore();
      ctx.restore();
      return;
    }

    // 1. Tattered Uniform / Rotting Flesh Body
    ctx.fillStyle = '#3f453a'; // Decaying German feldgrau uniform
    ctx.strokeStyle = '#1b1f1a';
    ctx.lineWidth = 1.8;

    // Torso / Shoulders
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Blood stains on chest
    ctx.fillStyle = '#590a0a';
    ctx.beginPath();
    ctx.arc(2, 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Head (if not decapitated)
    if (!this.isDecapitated) {
      // Rotting sickly skin
      ctx.fillStyle = this.speedType === 'SPRINTER' ? '#374232' : '#485243';
      ctx.beginPath();
      ctx.arc(4, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#252b21';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Belli başlı hızlı zombilerde parlayan kehribar CoD zombi gözleri
      if (this.speedType === 'SPRINTER') {
        ctx.save();
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(8, -2.5, 1.3, 0, Math.PI * 2);
        ctx.arc(8, 2.5, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Severed bloody neck stump
      ctx.fillStyle = '#7a0c0c';
      ctx.beginPath();
      ctx.arc(2, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Outstretched Clawing Arms (classic CoD zombie reach)
    ctx.fillStyle = '#485243';
    ctx.strokeStyle = '#252b21';
    ctx.lineWidth = 1.5;

    // Left clawing hand
    const leftArmY = -9 + sway;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(16, leftArmY);
    ctx.arc(16, leftArmY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right clawing hand
    const rightArmY = 9 - sway;
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(16, rightArmY);
    ctx.arc(16, rightArmY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

