'use strict';

// ==================== [MODULE: weapons.js] ====================

/**
 * Weapons System & Bullet Simulation
 * Defines all authentic WW2 firearms, stats, raycasting, and projectile management.
 */

const WEAPON_TYPES = {
  M1911: 'm1911',
  KAR98K: 'kar98k',
  MP40: 'mp40',
  SHOTGUN: 'shotgun',
  MG42: 'mg42',
  RAYGUN: 'raygun'
};

const PAP_CONFIGS = {
  [WEAPON_TYPES.M1911]: [
    // Tier 1: Mustang & Sally (Micro-Explosive Rounds)
    {
      tier: 1,
      name: 'Mustang & Sally',
      suffix: 'I',
      damage: 120,
      splashRadius: 50,
      magSize: 16,
      maxReserve: 160,
      fireRate: 0.14,
      reloadTime: 1.05,
      spread: 0.028,
      recoil: 3.2,
      speed: 1650,
      automatic: false,
      barrelLength: 24,
      color: '#d855ff',
      cost: 5000,
      isExplosive: true
    },
    // Tier 2: Mustang & Sally II
    {
      tier: 2,
      name: 'Mustang & Sally II',
      suffix: 'II',
      damage: 260,
      splashRadius: 65,
      magSize: 20,
      maxReserve: 240,
      fireRate: 0.12,
      reloadTime: 0.90,
      spread: 0.022,
      recoil: 2.8,
      speed: 1800,
      automatic: false,
      barrelLength: 24,
      color: '#00e5ff',
      cost: 15000,
      isExplosive: true
    },
    // Tier 3: Mustang & Sally III (Omega Rapid Fire)
    {
      tier: 3,
      name: 'Mustang & Sally III',
      suffix: 'III',
      damage: 540,
      splashRadius: 82,
      magSize: 24,
      maxReserve: 320,
      fireRate: 0.10,
      reloadTime: 0.75,
      spread: 0.018,
      recoil: 2.4,
      speed: 1950,
      automatic: true,
      barrelLength: 25,
      color: '#ffd700',
      cost: 30000,
      isExplosive: true
    }
  ],
  [WEAPON_TYPES.KAR98K]: [
    // Tier 1: Armageddon
    {
      tier: 1,
      name: 'Armageddon',
      suffix: 'I',
      damage: 500,
      magSize: 8,
      maxReserve: 96,
      fireRate: 0.68,
      reloadTime: 1.70,
      spread: 0.008,
      recoil: 6.0,
      speed: 2400,
      pierce: 5,
      automatic: false,
      barrelLength: 34,
      color: '#d855ff',
      cost: 5000
    },
    // Tier 2: Armageddon II
    {
      tier: 2,
      name: 'Armageddon II',
      suffix: 'II',
      damage: 1180,
      magSize: 10,
      maxReserve: 130,
      fireRate: 0.55,
      reloadTime: 1.40,
      spread: 0.006,
      recoil: 5.2,
      speed: 2600,
      pierce: 7,
      automatic: false,
      barrelLength: 34,
      color: '#00e5ff',
      cost: 15000
    },
    // Tier 3: Armageddon III (Extinction Piercer)
    {
      tier: 3,
      name: 'Armageddon III',
      suffix: 'III',
      damage: 2600,
      magSize: 12,
      maxReserve: 168,
      fireRate: 0.44,
      reloadTime: 1.15,
      spread: 0.004,
      recoil: 4.5,
      speed: 2800,
      pierce: 10,
      automatic: false,
      barrelLength: 35,
      color: '#ffd700',
      cost: 30000
    }
  ],
  [WEAPON_TYPES.MP40]: [
    // Tier 1: The Afterburner
    {
      tier: 1,
      name: 'The Afterburner',
      suffix: 'I',
      damage: 115,
      magSize: 64,
      maxReserve: 384,
      fireRate: 0.078,
      reloadTime: 1.45,
      spread: 0.050,
      recoil: 2.6,
      speed: 1800,
      pierce: 2,
      automatic: true,
      barrelLength: 29,
      color: '#d855ff',
      cost: 5000
    },
    // Tier 2: The Afterburner II
    {
      tier: 2,
      name: 'The Afterburner II',
      suffix: 'II',
      damage: 250,
      magSize: 64,
      maxReserve: 512,
      fireRate: 0.068,
      reloadTime: 1.25,
      spread: 0.042,
      recoil: 2.2,
      speed: 2000,
      pierce: 3,
      automatic: true,
      barrelLength: 29,
      color: '#00e5ff',
      cost: 15000
    },
    // Tier 3: The Afterburner III (Overdrive)
    {
      tier: 3,
      name: 'The Afterburner III',
      suffix: 'III',
      damage: 520,
      magSize: 72,
      maxReserve: 648,
      fireRate: 0.058,
      reloadTime: 1.05,
      spread: 0.035,
      recoil: 1.8,
      speed: 2200,
      pierce: 4,
      automatic: true,
      barrelLength: 30,
      color: '#ffd700',
      cost: 30000
    }
  ],
  [WEAPON_TYPES.SHOTGUN]: [
    // Tier 1: Gut Shot
    {
      tier: 1,
      name: 'Gut Shot',
      suffix: 'I',
      damage: 105,
      pellets: 10,
      magSize: 10,
      maxReserve: 90,
      fireRate: 0.58,
      reloadTime: 1.80,
      spread: 0.135,
      recoil: 7.0,
      speed: 1500,
      automatic: false,
      barrelLength: 32,
      color: '#d855ff',
      cost: 5000
    },
    // Tier 2: Gut Shot II
    {
      tier: 2,
      name: 'Gut Shot II',
      suffix: 'II',
      damage: 215,
      pellets: 12,
      magSize: 12,
      maxReserve: 120,
      fireRate: 0.48,
      reloadTime: 1.50,
      spread: 0.115,
      recoil: 6.0,
      speed: 1650,
      automatic: false,
      barrelLength: 32,
      color: '#00e5ff',
      cost: 15000
    },
    // Tier 3: Gut Shot III (Obliterator)
    {
      tier: 3,
      name: 'Gut Shot III',
      suffix: 'III',
      damage: 420,
      pellets: 14,
      magSize: 16,
      maxReserve: 160,
      fireRate: 0.40,
      reloadTime: 1.20,
      spread: 0.098,
      recoil: 5.0,
      speed: 1800,
      automatic: false,
      barrelLength: 33,
      color: '#ffd700',
      cost: 30000
    }
  ],
  [WEAPON_TYPES.MG42]: [
    // Tier 1: Barracuda
    {
      tier: 1,
      name: 'Barracuda',
      suffix: 'I',
      damage: 170,
      magSize: 150,
      maxReserve: 600,
      fireRate: 0.052,
      reloadTime: 2.75,
      spread: 0.050,
      recoil: 3.4,
      speed: 2100,
      pierce: 3,
      automatic: true,
      barrelLength: 37,
      color: '#d855ff',
      cost: 5000
    },
    // Tier 2: Barracuda II
    {
      tier: 2,
      name: 'Barracuda II',
      suffix: 'II',
      damage: 370,
      magSize: 175,
      maxReserve: 750,
      fireRate: 0.045,
      reloadTime: 2.25,
      spread: 0.042,
      recoil: 2.8,
      speed: 2300,
      pierce: 4,
      automatic: true,
      barrelLength: 37,
      color: '#00e5ff',
      cost: 15000
    },
    // Tier 3: Barracuda III (Leviathan)
    {
      tier: 3,
      name: 'Barracuda III',
      suffix: 'III',
      damage: 790,
      magSize: 200,
      maxReserve: 900,
      fireRate: 0.038,
      reloadTime: 1.85,
      spread: 0.035,
      recoil: 2.2,
      speed: 2500,
      pierce: 5,
      automatic: true,
      barrelLength: 38,
      color: '#ffd700',
      cost: 30000
    }
  ],
  [WEAPON_TYPES.RAYGUN]: [
    // Tier 1: Porter's X2 Ray Gun
    {
      tier: 1,
      name: "Porter's X2 Ray Gun",
      suffix: 'I',
      damage: 780,
      splashRadius: 85,
      magSize: 40,
      maxReserve: 320,
      fireRate: 0.18,
      reloadTime: 1.55,
      spread: 0.015,
      recoil: 3.4,
      speed: 1150,
      automatic: true,
      barrelLength: 27,
      color: '#ff2a85',
      isRayGun: true,
      cost: 5000
    },
    // Tier 2: Porter's X2 Ray Gun II
    {
      tier: 2,
      name: "Porter's X2 Ray Gun II",
      suffix: 'II',
      damage: 1750,
      splashRadius: 105,
      magSize: 50,
      maxReserve: 400,
      fireRate: 0.15,
      reloadTime: 1.25,
      spread: 0.012,
      recoil: 2.8,
      speed: 1300,
      automatic: true,
      barrelLength: 27,
      color: '#00e5ff',
      isRayGun: true,
      cost: 15000
    },
    // Tier 3: Porter's X2 Ray Gun III (Supernova)
    {
      tier: 3,
      name: "Porter's X2 Ray Gun III",
      suffix: 'III',
      damage: 3800,
      splashRadius: 130,
      magSize: 60,
      maxReserve: 500,
      fireRate: 0.12,
      reloadTime: 1.00,
      spread: 0.010,
      recoil: 2.2,
      speed: 1450,
      automatic: true,
      barrelLength: 28,
      color: '#ffd700',
      isRayGun: true,
      cost: 30000
    }
  ]
};

const WEAPON_CONFIGS = {
  [WEAPON_TYPES.M1911]: {
    id: WEAPON_TYPES.M1911,
    name: 'Colt M1911',
    magSize: 8,
    maxReserve: 80,
    startReserve: 32,
    damage: 25,
    fireRate: 0.18, // seconds between shots
    reloadTime: 1.3,
    pellets: 1,
    spread: 0.035,
    recoil: 2.5,
    speed: 1500, // bullet speed px/s
    automatic: false,
    cost: 50, // ammo only
    ammoCost: 50,
    wallBuy: false,
    barrelLength: 22,
    color: '#d6c8a0'
  },
  [WEAPON_TYPES.KAR98K]: {
    id: WEAPON_TYPES.KAR98K,
    name: 'Kar98k',
    magSize: 5,
    maxReserve: 60,
    startReserve: 50,
    damage: 180,
    fireRate: 0.95,
    reloadTime: 2.2,
    pellets: 1,
    spread: 0.012,
    recoil: 7.0,
    speed: 2100,
    automatic: false,
    cost: 200,
    ammoCost: 100,
    wallBuy: true,
    barrelLength: 32,
    color: '#a38a6a'
  },
  [WEAPON_TYPES.MP40]: {
    id: WEAPON_TYPES.MP40,
    name: 'MP40',
    magSize: 32,
    maxReserve: 256,
    startReserve: 192,
    damage: 48,
    fireRate: 0.092,
    reloadTime: 1.8,
    pellets: 1,
    spread: 0.065,
    recoil: 3.2,
    speed: 1600,
    automatic: true,
    cost: 1000,
    ammoCost: 500,
    wallBuy: true,
    barrelLength: 28,
    color: '#8b9691'
  },
  [WEAPON_TYPES.SHOTGUN]: {
    id: WEAPON_TYPES.SHOTGUN,
    name: 'Trench Gun',
    magSize: 6,
    maxReserve: 60,
    startReserve: 36,
    damage: 42, // per pellet
    fireRate: 0.75,
    reloadTime: 2.4,
    pellets: 8,
    spread: 0.17,
    recoil: 8.5,
    speed: 1350,
    automatic: false,
    cost: 1200,
    ammoCost: 600,
    wallBuy: true,
    barrelLength: 30,
    color: '#7a5a3a'
  },
  [WEAPON_TYPES.MG42]: {
    id: WEAPON_TYPES.MG42,
    name: 'MG42',
    magSize: 100,
    maxReserve: 400,
    startReserve: 300,
    damage: 75,
    fireRate: 0.062,
    reloadTime: 3.7,
    pellets: 1,
    spread: 0.06,
    recoil: 4.2,
    speed: 1900,
    automatic: true,
    cost: 950,
    boxOnly: true,
    barrelLength: 36,
    color: '#555e56'
  },
  [WEAPON_TYPES.RAYGUN]: {
    id: WEAPON_TYPES.RAYGUN,
    name: 'Ray Gun',
    magSize: 20,
    maxReserve: 200,
    startReserve: 160,
    damage: 320,
    splashRadius: 65,
    fireRate: 0.22,
    reloadTime: 2.0,
    pellets: 1,
    spread: 0.02,
    recoil: 4.0,
    speed: 950,
    automatic: false,
    cost: 950,
    boxOnly: true,
    isRayGun: true,
    barrelLength: 26,
    color: '#33ff77'
  }
};

class WeaponInstance {
  constructor(typeId, papLevel = 0) {
    const config = WEAPON_CONFIGS[typeId];
    this.baseConfig = config;
    this.id = config.id;
    this.papLevel = 0;
    this.lastShotTime = 0;
    this.isReloading = false;
    this.reloadStartTime = 0;
    this.currentReloadTime = 0;

    this.applyPapStats(papLevel);
    this.currentMag = this.config.magSize;
    this.reserveAmmo = this.config.startReserve !== undefined ? this.config.startReserve : this.config.maxReserve;
  }

  applyPapStats(level = this.papLevel) {
    this.papLevel = Math.max(0, Math.min(3, level));
    if (this.papLevel === 0) {
      this.config = Object.assign({}, this.baseConfig, { papLevel: 0 });
      this.name = this.baseConfig.name;
    } else {
      const tierConfig = PAP_CONFIGS[this.id] ? PAP_CONFIGS[this.id][this.papLevel - 1] : null;
      if (tierConfig) {
        this.config = Object.assign({}, this.baseConfig, tierConfig, { papLevel: this.papLevel });
        this.name = tierConfig.name;
      } else {
        this.config = Object.assign({}, this.baseConfig, { papLevel: this.papLevel });
        this.name = `${this.baseConfig.name} [Tier ${this.papLevel}]`;
      }
    }
  }

  upgradePackAPunch(targetLevel = null) {
    const nextLevel = targetLevel !== null ? Math.max(0, Math.min(3, targetLevel)) : Math.min(3, this.papLevel + 1);
    this.applyPapStats(nextLevel);
    // Authentic CoD PaP effect: instant refill of magazine & max reserve capacity!
    this.refillMaxAmmo();
    return this.papLevel;
  }

  resetPackAPunch() {
    this.applyPapStats(0);
    this.currentMag = Math.min(this.currentMag, this.config.magSize);
    this.reserveAmmo = Math.min(this.reserveAmmo, this.config.maxReserve);
    return this.papLevel;
  }

  canFire(nowSec, fireRateMult = 1.0) {
    if (this.isReloading) return false;
    if (this.currentMag <= 0) return false;
    return (nowSec - this.lastShotTime) >= (this.config.fireRate * fireRateMult);
  }

  canReload() {
    if (this.isReloading) return false;
    if (this.currentMag >= this.config.magSize) return false;
    return this.reserveAmmo > 0;
  }

  startReload(nowSec, speedMultiplier = 1.0) {
    if (!this.canReload()) return false;
    this.isReloading = true;
    this.reloadStartTime = nowSec;
    this.currentReloadTime = this.config.reloadTime / Math.max(0.1, speedMultiplier);
    return true;
  }

  updateReload(nowSec) {
    if (!this.isReloading) return false;
    const duration = this.currentReloadTime || this.config.reloadTime;
    if (nowSec - this.reloadStartTime >= duration) {
      const needed = this.config.magSize - this.currentMag;
      const amountToLoad = Math.min(needed, this.reserveAmmo);
      this.currentMag += amountToLoad;
      this.reserveAmmo -= amountToLoad;
      this.isReloading = false;
      return true; // Reload finished
    }
    return false;
  }

  getReloadProgress(nowSec) {
    if (!this.isReloading) return 0;
    const duration = this.currentReloadTime || this.config.reloadTime;
    return Math.min(1.0, (nowSec - this.reloadStartTime) / duration);
  }

  refillMaxAmmo() {
    this.currentMag = this.config.magSize;
    this.reserveAmmo = this.config.maxReserve;
    this.isReloading = false;
  }
}

class Bullet {
  constructor(x, y, angle, config, isInstaKill = false) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.config = config;
    this.papLevel = config.papLevel || 0;
    this.isRayGun = !!config.isRayGun;
    this.damage = isInstaKill ? 99999 : config.damage;
    this.speed = config.speed;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.alive = true;
    this.distanceTraveled = 0;
    this.maxDistance = this.isRayGun ? 1200 : 1600;
    this.piercedZombies = new Set();
    this.pierceCount = config.pierce || (config.id === WEAPON_TYPES.KAR98K ? 3 : (config.id === WEAPON_TYPES.MG42 ? 2 : 1));
  }

  update(dt, map, zombies, onHitCallback) {
    if (!this.alive) return;

    const stepDist = this.speed * dt;
    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;

    // Check bunker wall collision (bullets ignore window openings so they can shoot through barricades)
    if (map.checkWallCollision(nextX, nextY, 3, true)) {
      this.alive = false;
      onHitCallback({
        type: 'wall',
        x: nextX,
        y: nextY,
        angle: this.angle,
        isRayGun: this.isRayGun,
        splashRadius: this.config.splashRadius,
        damage: this.damage,
        papLevel: this.papLevel,
        weaponId: this.config.id
      });
      return;
    }

    // Check zombie collision along path
    for (const zombie of zombies) {
      if (!zombie.alive || this.piercedZombies.has(zombie.id)) continue;

      // Circle-point or circle-segment check
      const dx = zombie.x - nextX;
      const dy = zombie.y - nextY;
      const dist = Math.hypot(dx, dy);

      if (dist <= zombie.radius + 6) {
        this.piercedZombies.add(zombie.id);

        // Determine if headshot
        const headOffsetDist = zombie.radius * 0.45;
        const headX = zombie.x + Math.cos(zombie.angle) * headOffsetDist;
        const headY = zombie.y + Math.sin(zombie.angle) * headOffsetDist;
        const headDist = Math.hypot(headX - nextX, headY - nextY);
        const isHeadshot = headDist <= zombie.radius * 0.55;

        onHitCallback({
          type: 'zombie',
          zombie: zombie,
          x: nextX,
          y: nextY,
          angle: this.angle,
          damage: this.damage,
          isHeadshot: isHeadshot,
          isRayGun: this.isRayGun,
          splashRadius: this.config.splashRadius,
          papLevel: this.papLevel,
          weaponId: this.config.id
        });

        // Ray Gun and explosive rounds (Mustang & Sally) detonate upon impact
        if (this.isRayGun || (this.config.splashRadius && !this.isRayGun) || this.piercedZombies.size >= this.pierceCount) {
          this.alive = false;
          break;
        }
      }
    }

    this.x = nextX;
    this.y = nextY;
    this.distanceTraveled += stepDist;

    if (this.distanceTraveled >= this.maxDistance) {
      this.alive = false;
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    ctx.save();
    if (this.isRayGun) {
      // Glowing plasma ring with Pack-a-Punch tier colors
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      let auraColor = '#00ff66';
      let strokeColor = '#33ff77';
      let ringRadius = 7;

      if (this.papLevel === 1) {
        auraColor = '#ff00aa';
        strokeColor = '#ff33bb';
        ringRadius = 8;
      } else if (this.papLevel === 2) {
        auraColor = '#00e5ff';
        strokeColor = '#33ffff';
        ringRadius = 8.5;
      } else if (this.papLevel === 3) {
        auraColor = '#ffd700';
        strokeColor = '#fff275';
        ringRadius = 9.5;
      }

      ctx.shadowColor = auraColor;
      ctx.shadowBlur = this.papLevel > 0 ? 16 : 12;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = this.papLevel > 0 ? 4.5 : 4;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      if (this.papLevel >= 2) {
        // Inner pulsed ring for Tier 2 and Tier 3
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.papLevel > 0) {
      // Pack-a-Punched Kinetic / Explosive Bullet Tracer
      const tailLength = Math.min(28, this.distanceTraveled);
      const tailX = this.x - Math.cos(this.angle) * tailLength;
      const tailY = this.y - Math.sin(this.angle) * tailLength;

      const grad = ctx.createLinearGradient(tailX, tailY, this.x, this.y);

      if (this.papLevel === 1) {
        // Tier 1: Neon Violet / Plasma
        ctx.shadowColor = '#d855ff';
        ctx.shadowBlur = 10;
        grad.addColorStop(0, 'rgba(216, 85, 255, 0)');
        grad.addColorStop(0.5, 'rgba(235, 120, 255, 0.85)');
        grad.addColorStop(1, 'rgba(255, 240, 255, 1.0)');
      } else if (this.papLevel === 2) {
        // Tier 2: Electric Cyan
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 13;
        grad.addColorStop(0, 'rgba(0, 229, 255, 0)');
        grad.addColorStop(0.5, 'rgba(80, 245, 255, 0.9)');
        grad.addColorStop(1, 'rgba(240, 255, 255, 1.0)');
      } else {
        // Tier 3: Legendary Solar / Gold Core
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 16;
        grad.addColorStop(0, 'rgba(255, 180, 0, 0)');
        grad.addColorStop(0.4, 'rgba(255, 90, 160, 0.85)');
        grad.addColorStop(0.8, 'rgba(255, 230, 80, 0.95)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
      }

      ctx.strokeStyle = grad;
      ctx.lineWidth = this.papLevel === 3 ? 3.4 : (this.papLevel === 2 ? 3.0 : 2.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    } else {
      // Classic glowing yellow-orange bullet tracer
      const tailLength = Math.min(24, this.distanceTraveled);
      const tailX = this.x - Math.cos(this.angle) * tailLength;
      const tailY = this.y - Math.sin(this.angle) * tailLength;

      const grad = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
      grad.addColorStop(0, 'rgba(255, 170, 40, 0)');
      grad.addColorStop(0.6, 'rgba(255, 200, 70, 0.7)');
      grad.addColorStop(1, 'rgba(255, 255, 230, 0.95)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

