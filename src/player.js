'use strict';

// ==================== [MODULE: player.js] ====================

/**
 * Player Entity & Controller
 * Implements top-down survivor physics, aiming, inventory management,
 * weapon handling, melee combat, damage/health regeneration, and world interactions.
 */

class Player {
  constructor(x, y, perkLevels = { nugi: 1, spodi: 1 }) {
    this.x = x;
    this.y = y;
    this.radius = 16;
    this.angle = 0;

    // Progression / Perk Tiers (1 to 4)
    this.perkLevels = perkLevels;
    this.shieldCooldown = 0;
    this.rapidFireTimer = 0;
    this.matchStartTime = performance.now() / 1000;

    // Movement
    this.baseSpeed = 195;
    this.vx = 0;
    this.vy = 0;

    // Health & Perks
    this.maxHealth = 100;
    this.health = 100;
    this.hasNugi = false; // Previously Juggernog (increased health)
    this.hasSpodi = false; // Speed Cola (faster reload perk)
    this.lastDamageTime = 0;
    this.regenDelay = 4.2; // Seconds of calm before regen starts
    this.regenRate = 65; // HP per sec
    this.isDead = false;

    // Cheats / Debug Flags
    this.isGodMode = false;
    this.isInfiniteAmmo = false;

    // Weapons & Inventory (CoD 2-weapon limit)
    this.weapons = [new WeaponInstance(WEAPON_TYPES.M1911)];
    this.currentWeaponIndex = 0;

    // Melee Knife
    this.knifeCooldown = 0.65;
    this.lastKnifeTime = -10;
    this.isKnifing = false;
    this.knifeProgress = 0; // 0 to 1
    this.knifeHasHit = false; // One damage window per swing

    // Economy & Stats
    this.score = 500; // Classic starting score
    this.kills = 0;
    this.headshots = 0;
    this.totalScoreEarned = 500;
    this.windowsRepaired = 0;

    // Active power-up timers
    this.powerups = {
      INSTA_KILL: 0,
      DOUBLE_POINTS: 0
    };

    // Interaction state
    this.currentInteraction = null;
    this.repairAccumulator = 0;

    // Screen Shake accumulator
    this.screenShake = 0;
  }

  getCurrentWeapon() {
    return this.weapons[this.currentWeaponIndex];
  }

  switchWeapon(index) {
    if (index >= 0 && index < this.weapons.length && index !== this.currentWeaponIndex) {
      this.currentWeaponIndex = index;
      this.getCurrentWeapon().isReloading = false;
      if (window.game && window.game.updateDevCheatsPapUI) {
        window.game.updateDevCheatsPapUI();
      }
      if (window.game && window.game.mobileControls) {
        window.game.mobileControls.updateWeaponButtonLabel();
      }
    }
  }

  nextWeapon() {
    if (this.weapons.length > 1) {
      this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
      this.getCurrentWeapon().isReloading = false;
      if (window.game && window.game.updateDevCheatsPapUI) {
        window.game.updateDevCheatsPapUI();
      }
      if (window.game && window.game.mobileControls) {
        window.game.mobileControls.updateWeaponButtonLabel();
      }
    }
  }

  giveWeapon(weaponType) {
    // Check if player already has this weapon -> refill ammo
    for (const w of this.weapons) {
      if (w.id === weaponType) {
        w.refillMaxAmmo();
        return;
      }
    }

    const newWep = new WeaponInstance(weaponType);
    if (this.weapons.length < 2) {
      this.weapons.push(newWep);
      this.currentWeaponIndex = this.weapons.length - 1;
    } else {
      // Replace currently held weapon
      this.weapons[this.currentWeaponIndex] = newWep;
    }
  }

  addScore(amount) {
    const multiplier = this.powerups.DOUBLE_POINTS > 0 ? 2 : 1;
    const finalAmount = amount * multiplier;
    this.score += finalAmount;
    this.totalScoreEarned += finalAmount;
    return finalAmount;
  }

  takeDamage(amount, nowSec, audio, zombie = null, particles = null, allZombies = null) {
    if (this.isDead || this.isGodMode) return;

    this.health -= amount;
    this.lastDamageTime = nowSec;
    this.screenShake = Math.max(this.screenShake, 10);

    if (audio) audio.playPlayerHurt();

    // Tier 3+ Nugi: Stagger / Push attacker
    if (this.hasNugi && this.perkLevels && (this.perkLevels.nugi >= 3) && zombie) {
      zombie.x -= Math.cos(zombie.angle) * 35;
      zombie.y -= Math.sin(zombie.angle) * 35;
      zombie.lastAttackTime = nowSec + 0.35;
    }

    // Tier 4 Nugi: Apocalypse Shield Blast at low health (<= 35% HP)
    if (this.hasNugi && this.perkLevels && (this.perkLevels.nugi >= 4) &&
        (this.health / this.maxHealth <= 0.35) && this.shieldCooldown <= 0) {
      this.shieldCooldown = 30.0;
      this.screenShake = 24;
      if (audio) audio.playNuke();
      if (particles) {
        particles.addFloatingText('⚡ SHIELD BLAST! ⚡', this.x, this.y - 30, '#ffd700', true);
        for (let i = 0; i < 28; i++) {
          const pAng = (i / 28) * Math.PI * 2;
          particles.addSpark(this.x, this.y, Math.cos(pAng) * 240, Math.sin(pAng) * 240, '#ffe680');
        }
      }
      if (allZombies) {
        for (const z of allZombies) {
          if (!z.alive) continue;
          const dist = Math.hypot(z.x - this.x, z.y - this.y);
          if (dist <= 170) {
            const pushAng = Math.atan2(z.y - this.y, z.x - this.x);
            z.x += Math.cos(pushAng) * 130;
            z.y += Math.sin(pushAng) * 130;
            z.health -= 120;
            if (z.health <= 0) {
              z.alive = false;
              this.kills++; // Shield blast kills count towards match stats/BC
              if (particles) particles.addBloodSplatter(z.x, z.y, pushAng, 1.8);
            }
          }
        }
      }
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
    }
  }

  applyNugi() {
    this.hasNugi = true;
    const tier = this.perkLevels ? (this.perkLevels.nugi || 1) : 1;
    if (tier === 1) {
      this.maxHealth = 175;
      this.health = 175;
      this.regenDelay = 4.2;
      this.regenRate = 65;
    } else if (tier === 2) {
      this.maxHealth = 225;
      this.health = 225;
      this.regenDelay = 3.2;
      this.regenRate = 75;
    } else if (tier === 3) {
      this.maxHealth = 275;
      this.health = 275;
      this.regenDelay = 3.0;
      this.regenRate = 100;
    } else if (tier === 4) {
      this.maxHealth = 350;
      this.health = 350;
      this.regenDelay = 2.0;
      this.regenRate = 130;
    }
  }

  applySpodi() {
    this.hasSpodi = true;
    const tier = this.perkLevels ? (this.perkLevels.spodi || 1) : 1;
    if (tier >= 3) {
      this.knifeCooldown = 0.39; // Hızlı bıçak darbesi
    }
    if (tier >= 4) {
      this.baseSpeed = 195 * 1.15; // Kalıcı %15 koşu hızı artışı
    }
  }

  // Handle player input and physics
  update(dt, inputState, map, camera, audio, particles, lighting, onShootBullet, nowSec = performance.now() / 1000) {
    if (this.isDead) return;

    // Cooldown timers for Tier 4 perks
    if (this.shieldCooldown > 0) {
      this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
    }
    if (this.rapidFireTimer > 0) {
      this.rapidFireTimer = Math.max(0, this.rapidFireTimer - dt);
    }

    // 1. Health Regeneration
    if (this.health < this.maxHealth && (nowSec - this.lastDamageTime) >= this.regenDelay) {
      this.health = Math.min(this.maxHealth, this.health + this.regenRate * dt);
    }

    // 2. Power-up Timers
    for (const key of Object.keys(this.powerups)) {
      if (this.powerups[key] > 0) {
        this.powerups[key] -= dt;
        if (this.powerups[key] <= 0) this.powerups[key] = 0;
      }
    }

    // 3. Movement
    let mx = 0;
    let my = 0;
    if (inputState.keys['KeyW'] || inputState.keys['ArrowUp']) my -= 1;
    if (inputState.keys['KeyS'] || inputState.keys['ArrowDown']) my += 1;
    if (inputState.keys['KeyA'] || inputState.keys['ArrowLeft']) mx -= 1;
    if (inputState.keys['KeyD'] || inputState.keys['ArrowRight']) mx += 1;

    // Mobile analog joystick support
    if (inputState.moveVector && (Math.abs(inputState.moveVector.x) > 0.05 || Math.abs(inputState.moveVector.y) > 0.05)) {
      mx = inputState.moveVector.x;
      my = inputState.moveVector.y;
      const len = Math.hypot(mx, my);
      if (len > 1.0) {
        mx /= len;
        my /= len;
      }
    } else if (mx !== 0 && my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    }

    this.vx = mx * this.baseSpeed;
    this.vy = my * this.baseSpeed;

    // Sub-stepped movement with independent per-axis collision resolution for smooth wall sliding
    const steps = dt > 0.025 ? 2 : 1;
    const stepDt = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.x += this.vx * stepDt;
      map.resolveCollision(this, this.radius);

      this.y += this.vy * stepDt;
      map.resolveCollision(this, this.radius);
    }

    // 4. Aim Rotation
    if (inputState.aimAngle !== null && inputState.aimAngle !== undefined) {
      this.angle = inputState.aimAngle;
    } else {
      const worldMouseX = inputState.mouseX + camera.x;
      const worldMouseY = inputState.mouseY + camera.y;
      this.angle = Math.atan2(worldMouseY - this.y, worldMouseX - this.x);
    }

    // 5. Weapon Update & Reload
    const currentWeapon = this.getCurrentWeapon();
    const wasReloading = currentWeapon.isReloading;
    if (currentWeapon.isReloading) {
      currentWeapon.updateReload(nowSec);
      // Tier 4 Spodi: Trigger Rapid Fire for 3s upon reload completion
      if (wasReloading && !currentWeapon.isReloading) {
        if (this.hasSpodi && this.perkLevels && this.perkLevels.spodi >= 4) {
          this.rapidFireTimer = 3.0;
          if (particles) {
            particles.addFloatingText('⚡ RAPID FIRE! (3s)', this.x, this.y - 25, '#ffd700', false);
          }
        }
      }
    }

    // 6. Shooting Logic
    // Tabanca (M1911), Pompalı (Shotgun) ve Ray Gun için tuşa basılı tutarak atış desteği (auto-fire on hold)
    const supportsHoldToFire = currentWeapon.config.automatic ||
      currentWeapon.id === WEAPON_TYPES.M1911 ||
      currentWeapon.id === WEAPON_TYPES.SHOTGUN ||
      currentWeapon.id === WEAPON_TYPES.RAYGUN;

    const wantsToShoot = supportsHoldToFire ? inputState.mouseDown : inputState.mouseJustPressed;

    // Calculate reload speed based on Spodi Perk Tier
    let reloadSpeedMult = 1.0;
    if (this.hasSpodi) {
      const spodiTier = this.perkLevels ? (this.perkLevels.spodi || 1) : 1;
      if (spodiTier === 1) reloadSpeedMult = 1.35;
      else if (spodiTier === 2) reloadSpeedMult = 1.55;
      else if (spodiTier === 3) reloadSpeedMult = 1.75;
      else if (spodiTier === 4) reloadSpeedMult = 2.0;
    }

    if (wantsToShoot && !this.isKnifing) {
      const isRapidFiring = this.rapidFireTimer > 0;
      const fireRateMult = isRapidFiring ? 0.75 : 1.0;

      if (currentWeapon.canFire(nowSec, fireRateMult)) {
        this.fireWeapon(nowSec, audio, particles, lighting, onShootBullet);
      } else if (currentWeapon.currentMag <= 0 && inputState.mouseJustPressed) {
        // Try reload or dry fire
        if (!currentWeapon.startReload(nowSec, reloadSpeedMult)) {
          audio.playDryFire();
        } else {
          audio.playReload();
        }
      }
    }

    // 7. Manual Reload Key
    if (inputState.keys['KeyR'] && !currentWeapon.isReloading && currentWeapon.canReload()) {
      currentWeapon.startReload(nowSec, reloadSpeedMult);
      audio.playReload();
    }

    // 8. Melee Knife Attack (V key or MMB)
    if ((inputState.keys['KeyV'] || inputState.mouseMiddlePressed) && (nowSec - this.lastKnifeTime) >= this.knifeCooldown) {
      this.performKnifeAttack(nowSec, audio);
    }

    if (this.isKnifing) {
      const elapsed = nowSec - this.lastKnifeTime;
      this.knifeProgress = Math.min(1.0, elapsed / 0.35);
      if (elapsed >= 0.35) {
        this.isKnifing = false;
      }
    }

    // 9. Interaction Query & Action
    this.updateInteractions(dt, inputState, map, audio, particles);

    // 10. Screen Shake Decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - 25 * dt);
    }
  }

  fireWeapon(nowSec, audio, particles, lighting, onShootBullet) {
    const wep = this.getCurrentWeapon();
    if (!this.isInfiniteAmmo) {
      wep.currentMag--;
    } else {
      wep.reserveAmmo = wep.config.maxReserve;
    }
    wep.lastShotTime = nowSec;

    // Recoil screen shake
    this.screenShake = Math.min(14, this.screenShake + wep.config.recoil);

    // Audio
    audio.playGunshot(wep.id);
    if (wep.papLevel > 0 && audio.playPackAPunchShot) {
      audio.playPackAPunchShot(wep.papLevel);
    }

    // Gun barrel tip coordinate
    const barrelDist = wep.config.barrelLength + 8;
    const barrelX = this.x + Math.cos(this.angle) * barrelDist;
    const barrelY = this.y + Math.sin(this.angle) * barrelDist;

    // Muzzle flash light
    lighting.addMuzzleFlash(barrelX, barrelY, wep.id === WEAPON_TYPES.SHOTGUN ? 1.4 : 1.0);

    // Muzzle smoke
    particles.addMuzzleSmoke(barrelX, barrelY, this.angle);

    // Brass ejection
    particles.addEjectedCasing(
      this.x + Math.cos(this.angle) * 10,
      this.y + Math.sin(this.angle) * 10,
      this.angle,
      wep.id
    );

    // Spawn Bullets / Pellets
    const isInstaKill = this.powerups.INSTA_KILL > 0;
    const pellets = wep.config.pellets;

    for (let i = 0; i < pellets; i++) {
      const spreadAngle = this.angle + (Math.random() - 0.5) * wep.config.spread * 2;
      const bullet = new Bullet(barrelX, barrelY, spreadAngle, wep.config, isInstaKill);
      onShootBullet(bullet);
    }
  }

  performKnifeAttack(nowSec, audio) {
    this.isKnifing = true;
    this.lastKnifeTime = nowSec;
    this.knifeProgress = 0;
    this.knifeHasHit = false;
    audio.playKnife(false);
  }

  // Detect and resolve interactions with windows, wall buys, mystery box, and perks
  updateInteractions(dt, inputState, map, audio, particles) {
    this.currentInteraction = null;
    const fPressed = inputState.keys['KeyF'];

    // 9. Check nearby damaged Windows
    let nearWindow = false;
    for (const win of map.windows) {
      const centerX = win.x + win.width / 2;
      const centerY = win.y + win.height / 2;
      const dist = Math.hypot(this.x - centerX, this.y - centerY);

      if (dist <= 65) {
        if (win.canRepair()) {
          nearWindow = true;
          this.currentInteraction = {
            type: 'WINDOW',
            window: win,
            text: 'Hold to Rebuild (+10 pts)'
          };

          if (fPressed) {
            this.repairAccumulator += dt * win.repairSpeed;
            if (this.repairAccumulator >= 1.0) {
              this.repairAccumulator = 0;
              if (win.repairOne()) {
                audio.playWoodRepair();
                particles.addWoodSplinters(centerX, centerY, 6);
                this.windowsRepaired++;

                // Give points up to the round cap
                if (map.roundRepairPointsEarned < map.maxRepairPointsPerRound) {
                  const pts = this.addScore(10);
                  map.roundRepairPointsEarned += 10;
                  particles.addFloatingText(`+${pts}`, centerX, centerY - 15, '#bbf08b');
                }
              }
            }
          } else {
            this.repairAccumulator = 0;
          }
          return;
        }
      }
    }
    if (!nearWindow) {
      this.repairAccumulator = 0;
    }

    // 2. Check Debris Door (East Door to Hallway)
    if (!map.debrisDoor.opened) {
      const door = map.debrisDoor;
      const cx = door.x + door.w / 2;
      const cy = door.y + door.h / 2;
      const dist = Math.hypot(this.x - cx, this.y - cy);

      if (dist <= 75) {
        this.currentInteraction = {
          type: 'DEBRIS',
          text: `Clear Debris [Cost: ${door.cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= door.cost) {
            this.score -= door.cost;
            door.opened = true;
            audio.playDebrisClear();
            particles.addWoodSplinters(cx, cy, 25);
            particles.addFloatingText(`-${door.cost}`, cx, cy, '#ff6666');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 2B. Check Armory Debris (Transit Corridor to Armory)
    if (map.armoryDebris && !map.armoryDebris.opened) {
      const aDoor = map.armoryDebris;
      const cx = aDoor.x + aDoor.w / 2;
      const cy = aDoor.y + aDoor.h / 2;
      const dist = Math.hypot(this.x - cx, this.y - cy);

      if (dist <= 75) {
        this.currentInteraction = {
          type: 'ARMORY_DEBRIS',
          text: `Clear Debris [Cost: ${aDoor.cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= aDoor.cost) {
            this.score -= aDoor.cost;
            aDoor.opened = true;
            audio.playDebrisClear();
            particles.addWoodSplinters(cx, cy, 25);
            particles.addFloatingText(`-${aDoor.cost}`, cx, cy, '#ff6666');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 2C. Check South Gate (Door to Sub-Bunker Generator Lab)
    if (map.southDoor && !map.southDoor.opened) {
      const sDoor = map.southDoor;
      const cx = sDoor.x + sDoor.w / 2;
      const cy = sDoor.y + sDoor.h / 2;
      const dist = Math.hypot(this.x - cx, this.y - cy);

      if (dist <= 75) {
        this.currentInteraction = {
          type: 'SOUTH_DOOR',
          text: `Unlock Gate [Cost: ${sDoor.cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= sDoor.cost) {
            this.score -= sDoor.cost;
            sDoor.opened = true;
            audio.playDebrisClear();
            particles.addWoodSplinters(cx, cy, 25);
            particles.addFloatingText(`-${sDoor.cost}`, cx, cy, '#ff8844');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 2D. Check Stairs Debris (Armory to Sub-Level B2 Alt Kat)
    if (map.stairsDebris && !map.stairsDebris.opened) {
      const stDoor = map.stairsDebris;
      const cx = stDoor.x + stDoor.w / 2;
      const cy = stDoor.y + stDoor.h / 2;
      const dist = Math.hypot(this.x - cx, this.y - cy);

      if (dist <= 75) {
        this.currentInteraction = {
          type: 'STAIRS_DEBRIS',
          text: `Clear Stairs [Cost: ${stDoor.cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= stDoor.cost) {
            this.score -= stDoor.cost;
            stDoor.opened = true;
            audio.playDebrisClear();
            particles.addWoodSplinters(cx, cy, 30);
            particles.addFloatingText(`-${stDoor.cost}`, cx, cy, '#ff6666');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 3. Check Chalk Wall Buys
    for (const chalk of map.chalkBuys) {
      if (chalk.requiresHallway && !map.debrisDoor.opened) continue;
      if (chalk.requiresArmory && (!map.debrisDoor.opened || (map.armoryDebris && !map.armoryDebris.opened))) continue;
      if (chalk.requiresRoom2 && !map.debrisDoor.opened) continue;
      if (chalk.requiresBasement && (!map.stairsDebris || !map.stairsDebris.opened)) continue;

      const dist = Math.hypot(this.x - chalk.x, this.y - chalk.y);
      if (dist <= 65) {
        // Check if player already owns this weapon
        const alreadyHasWeapon = this.weapons.some(w => w.id === chalk.weaponType);
        const cost = alreadyHasWeapon ? chalk.ammoCost : chalk.cost;
        const actionLabel = alreadyHasWeapon ? 'Buy Ammo' : `Buy ${chalk.name}`;

        this.currentInteraction = {
          type: 'CHALK',
          text: `${actionLabel} [Cost: ${cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= cost) {
            this.score -= cost;
            audio.playPurchase();
            this.giveWeapon(chalk.weaponType);
            particles.addFloatingText(`-${cost}`, chalk.x, chalk.y, '#e5ecd8');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 4. Check Mystery Box
    const armoryUnlocked = map.debrisDoor.opened && (!map.armoryDebris || map.armoryDebris.opened);
    if (armoryUnlocked) {
      const box = map.mysteryBox;
      const dist = Math.hypot(this.x - box.x, this.y - box.y);

      if (dist <= 75) {
        if (box.state === 'IDLE') {
          this.currentInteraction = {
            type: 'MYSTERY_BOX',
            text: `Open Mystery Box [Cost: ${box.cost}]`
          };

          if (inputState.fJustPressed) {
            if (this.score >= box.cost) {
              this.score -= box.cost;
              box.state = 'SPINNING';
              box.timer = 0;
              box.cycleTimer = 0;
              audio.playMysteryBoxSpin();
              particles.addFloatingText(`-${box.cost}`, box.x, box.y, '#ffd700');
            } else {
              audio.playDryFire();
            }
          }
          return;
        } else if (box.state === 'READY' && box.selectedWeapon) {
          const cfg = WEAPON_CONFIGS[box.selectedWeapon];
          this.currentInteraction = {
            type: 'MYSTERY_BOX_TAKE',
            text: `Take ${cfg.name}`
          };

          if (inputState.fJustPressed) {
            this.giveWeapon(box.selectedWeapon);
            box.state = 'IDLE';
            box.selectedWeapon = null;
            box.timer = 0;
            audio.playPurchase();
          }
          return;
        }
      }
    }

    // 5. Check Nugi Machine (formerly Juggernog)
    if (armoryUnlocked) {
      const nugi = map.nugi || map.juggernog;
      const dist = Math.hypot(this.x - nugi.x, this.y - nugi.y);

      if (dist <= 65 && !this.hasNugi) {
        const tier = this.perkLevels ? (this.perkLevels.nugi || 1) : 1;
        this.currentInteraction = {
          type: 'NUGI',
          text: `Buy Nugi (Tier ${tier}) [Cost: ${nugi.cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= nugi.cost) {
            this.score -= nugi.cost;
            this.applyNugi();
            audio.playNugi();
            particles.addFloatingText(`-${nugi.cost}`, nugi.x, nugi.y, '#ff4444');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 6. Check Spodi Perk Machine (Fast Reload Perk in Sub-Level)
    if (map.southDoor && map.southDoor.opened && map.spodi) {
      const spodi = map.spodi;
      const dist = Math.hypot(this.x - spodi.x, this.y - spodi.y);

      if (dist <= 65 && !this.hasSpodi) {
        const tier = this.perkLevels ? (this.perkLevels.spodi || 1) : 1;
        this.currentInteraction = {
          type: 'SPODI',
          text: `Buy Spodi (Tier ${tier}) [Cost: ${spodi.cost}]`
        };

        if (inputState.fJustPressed) {
          if (this.score >= spodi.cost) {
            this.score -= spodi.cost;
            this.applySpodi();
            audio.playSpodi();
            particles.addFloatingText(`-${spodi.cost}`, spodi.x, spodi.y, '#33ffaa');
          } else {
            audio.playDryFire();
          }
        }
        return;
      }
    }

    // 7. Check Pack-a-Punch Machine in Room 4 (Underground Armory / Sub-Vault)
    if (map.packAPunch && (!map.stairsDebris || map.stairsDebris.opened)) {
      const pap = map.packAPunch;
      const dist = Math.hypot(this.x - pap.x, this.y - pap.y);

      if (dist <= 75) {
        const wep = this.getCurrentWeapon();
        if (wep) {
          const currentTier = wep.papLevel || 0;
          if (currentTier >= 3) {
            this.currentInteraction = {
              type: 'PAP',
              text: `${wep.name} [MAX TIER III]`
            };
            if (inputState.fJustPressed) {
              audio.playDryFire();
            }
          } else {
            const nextTier = currentTier + 1;
            // CoD Cold War standard Pack-a-Punch costs: Tier 1: 5k, Tier 2: 15k, Tier 3: 30k
            const costs = [5000, 15000, 30000];
            const cost = (typeof PAP_CONFIGS !== 'undefined' && PAP_CONFIGS[wep.id] && PAP_CONFIGS[wep.id][nextTier - 1] && PAP_CONFIGS[wep.id][nextTier - 1].cost)
              ? PAP_CONFIGS[wep.id][nextTier - 1].cost
              : (costs[nextTier - 1] || 5000);
            const romanTiers = ['', 'I', 'II', 'III'];
            const nextRoman = romanTiers[nextTier] || String(nextTier);

            this.currentInteraction = {
              type: 'PAP',
              text: `Pack-a-Punch [Tier ${nextRoman}] [Cost: ${cost.toLocaleString()}]`
            };

            if (inputState.fJustPressed) {
              if (this.score >= cost) {
                this.score -= cost;
                const upgradedTier = wep.upgradePackAPunch();
                if (audio && audio.playPackAPunch) {
                  audio.playPackAPunch(upgradedTier);
                }
                if (map.packAPunch) {
                  map.packAPunch.activeTimer = 1.3;
                }
                const romanResult = romanTiers[upgradedTier] || 'I';
                const tierColor = upgradedTier === 3 ? '#ffd700' : (upgradedTier === 2 ? '#00e5ff' : '#d855ff');

                particles.addFloatingText(`-${cost.toLocaleString()}`, pap.x, pap.y - 12, '#ffd700');
                particles.addFloatingText(`★ ${wep.name.toUpperCase()} [PAP ${romanResult}] ★`, this.x, this.y - 30, tierColor, true);

                if (particles.addMistBurst) {
                  particles.addMistBurst(pap.x, pap.y, 25);
                }
                if (particles.addSparks) {
                  particles.addSparks(pap.x, pap.y, 16, tierColor);
                }
                this.screenShake = Math.max(this.screenShake, 5.0);

                if (window.game && window.game.updateDevCheatsPapUI) {
                  window.game.updateDevCheatsPapUI();
                }
              } else {
                audio.playDryFire();
                particles.addFloatingText(`NOT ENOUGH POINTS [${cost.toLocaleString()} Needed]`, this.x, this.y - 20, '#ff4444');
              }
            }
          }
          return;
        }
      }
    }
  }

  // Draw top-down soldier avatar
  draw(ctx) {
    if (this.isDead) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const wep = this.getCurrentWeapon();

    // 1. Soldier Body / Uniform (Feldgrau / Khaki Military Tunic)
    ctx.fillStyle = '#4c5443';
    ctx.strokeStyle = '#232820';
    ctx.lineWidth = 2;

    // Torso / Shoulders
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Military Helmet (Stahlhelm / M1 Olive Drab)
    ctx.fillStyle = '#394032';
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Helmet rim
    ctx.strokeStyle = '#22271e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. Arms & Weapon
    ctx.fillStyle = '#4c5443';
    ctx.strokeStyle = '#232820';

    // Left arm holding gun grip/handguard
    ctx.beginPath();
    ctx.arc(10, -7, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right arm on trigger
    ctx.beginPath();
    ctx.arc(10, 7, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Gun Model
    ctx.save();
    ctx.fillStyle = wep.config.color || '#333';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    const bLen = wep.config.barrelLength;
    ctx.fillRect(8, -2.5, bLen, 5);
    ctx.strokeRect(8, -2.5, bLen, 5);

    if (wep.config.isRayGun) {
      // Ray Gun futuristic glowing rings
      let ringColor = '#00ff66';
      if (wep.papLevel === 1) ringColor = '#ff00aa';
      else if (wep.papLevel === 2) ringColor = '#00e5ff';
      else if (wep.papLevel === 3) ringColor = '#ffd700';

      ctx.fillStyle = ringColor;
      ctx.fillRect(14, -4, 4, 8);
      ctx.fillRect(22, -4, 4, 8);
    } else if (wep.papLevel > 0) {
      // Pack-a-Punch energized camo engraving
      let camoColor = '#d855ff';
      if (wep.papLevel === 2) camoColor = '#00e5ff';
      else if (wep.papLevel === 3) camoColor = '#ffd700';

      ctx.fillStyle = camoColor;
      ctx.fillRect(10, -1.5, Math.max(8, bLen - 6), 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, -1, 3, 2);
      if (bLen > 24) ctx.fillRect(22, -1, 3, 2);
    }
    ctx.restore();

    // 3. Melee Knife Animation
    if (this.isKnifing) {
      ctx.save();
      const swingAngle = (this.knifeProgress - 0.5) * 1.8;
      ctx.rotate(swingAngle);
      ctx.fillStyle = '#cccccc';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;

      // Knife blade extending forward
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(34, -2);
      ctx.lineTo(36, 0);
      ctx.lineTo(34, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

