'use strict';

// ==================== [MODULE: particles.js] ====================

/**
 * Particle & Decal System
 * Manages persistent ground blood decals, ejected spent brass casings,
 * muzzle flash sparks, wood splinters, and floating combat text.
 */

class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.casings = [];
    this.bloodDecals = [];
    this.settledGibs = []; // Settled pixel gibs on bunker floor
    this.maxDecals = 350; // Cap to keep 60fps locked
    this.maxCasings = 150;
    this.maxSettledGibs = 180;
  }

  pruneSettledGibs() {
    while (this.settledGibs.length > this.maxSettledGibs) {
      this.settledGibs.shift();
    }
  }

  // --- Visceral Zombie Pixel Gibs Dismemberment ---
  addZombieGibs(x, y, hitAngle, isHeadshot = false, weaponType = null) {
    const isHeavy = weaponType === 'shotgun' || weaponType === 'raygun' || weaponType === 'nuke' || weaponType === 'knife';
    // Balanced pixel chunk count: 12-16 normal, 18-24 for heavy/explosive
    const count = isHeavy ? (18 + Math.floor(Math.random() * 7)) : (12 + Math.floor(Math.random() * 5));

    // Color palettes for pixel pieces
    const fleshColors = ['#424d3a', '#4e5b46', '#31382b', '#56664d']; // Rotting zombie skin/meat
    const goreColors = ['#750a0a', '#960e0e', '#590606', '#b51414', '#3d0303']; // Crimson flesh & organs
    const boneColors = ['#ded9cb', '#ede7da', '#c2bcae', '#8a8475']; // Ivory bone & skull shards
    const uniformColors = ['#3a4034', '#282d24', '#4c5445']; // German Feldgrau uniform scraps

    for (let i = 0; i < count; i++) {
      let category = 'gore';
      const roll = Math.random();
      if (isHeadshot && i < 4) {
        category = 'bone'; // Extra skull fragments on headshot
      } else if (roll < 0.35) {
        category = 'gore';
      } else if (roll < 0.60) {
        category = 'flesh';
      } else if (roll < 0.82) {
        category = 'uniform';
      } else {
        category = 'bone';
      }

      let color;
      let w, h;
      if (category === 'bone') {
        color = boneColors[Math.floor(Math.random() * boneColors.length)];
        w = Math.random() < 0.5 ? 2 : 3;
        h = 3 + Math.floor(Math.random() * 4);
      } else if (category === 'gore') {
        color = goreColors[Math.floor(Math.random() * goreColors.length)];
        w = 3 + Math.floor(Math.random() * 3);
        h = 3 + Math.floor(Math.random() * 3);
      } else if (category === 'flesh') {
        color = fleshColors[Math.floor(Math.random() * fleshColors.length)];
        w = 3 + Math.floor(Math.random() * 4);
        h = 2 + Math.floor(Math.random() * 3);
      } else {
        color = uniformColors[Math.floor(Math.random() * uniformColors.length)];
        w = 3 + Math.floor(Math.random() * 3);
        h = 3 + Math.floor(Math.random() * 3);
      }

      // Initial velocity: radial burst + strong forward momentum bias in bullet/hit direction
      const spreadAngle = (Math.random() - 0.5) * Math.PI * 2;
      const baseSpeed = isHeavy ? (120 + Math.random() * 200) : (70 + Math.random() * 150);
      const forwardBias = (isHeadshot || weaponType === 'shotgun') ? 1.4 : 0.8;

      const vx = Math.cos(spreadAngle) * (baseSpeed * 0.55) + Math.cos(hitAngle) * (baseSpeed * forwardBias);
      const vy = Math.sin(spreadAngle) * (baseSpeed * 0.55) + Math.sin(hitAngle) * (baseSpeed * forwardBias);

      this.particles.push({
        type: 'pixel_gib',
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: vx,
        vy: vy,
        z: 6 + Math.random() * 8, // Initial 3D height above floor
        vz: 75 + Math.random() * 110, // Initial upward velocity
        w: w,
        h: h,
        color: color,
        category: category,
        angle: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 22,
        bounces: 0,
        maxBounces: 1,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 1.3,
        trailTimer: 0
      });
    }

    // Central gore puddle at death location
    this.bloodDecals.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      radius: (isHeavy ? 12 : 8) + Math.random() * 6,
      color: '#420606',
      alpha: 0.88,
      rotation: Math.random() * Math.PI * 2,
      scaleX: 1.1 + Math.random() * 0.4,
      scaleY: 0.9 + Math.random() * 0.3
    });
    this.pruneDecals();
  }

  // Directional blood spurt from exit wound + entry flesh flecks
  addExitWoundSpurt(x, y, angle) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const sprayAngle = angle + (Math.random() - 0.5) * 0.45;
      const speed = 130 + Math.random() * 140;
      this.particles.push({
        type: 'blood_droplet',
        x: x,
        y: y,
        vx: Math.cos(sprayAngle) * speed,
        vy: Math.sin(sprayAngle) * speed,
        targetDist: 20 + Math.random() * 45,
        traveled: 0,
        radius: 1.2 + Math.random() * 1.5,
        color: Math.random() < 0.6 ? '#730d0d' : '#450808',
        alpha: 0.9,
        life: 0.28
      });
    }

    // 2 tiny flesh micro-particles bouncing backwards slightly from entry point
    for (let i = 0; i < 2; i++) {
      const bounceAngle = angle + Math.PI + (Math.random() - 0.5) * 0.8;
      const speed = 35 + Math.random() * 60;
      this.particles.push({
        type: 'blood_droplet',
        x: x,
        y: y,
        vx: Math.cos(bounceAngle) * speed,
        vy: Math.sin(bounceAngle) * speed,
        targetDist: 8 + Math.random() * 15,
        traveled: 0,
        radius: 1.0 + Math.random() * 1.2,
        color: '#5e0b0b',
        alpha: 0.85,
        life: 0.22
      });
    }
  }

  // --- Blood Splatters ---
  addBloodSplatter(x, y, angle, intensity = 1.0) {
    const count = Math.floor((4 + Math.random() * 6) * intensity);
    for (let i = 0; i < count; i++) {
      const spreadAngle = angle + (Math.random() - 0.5) * 1.4;
      const speed = (40 + Math.random() * 120) * intensity;
      const dist = 10 + Math.random() * 45 * intensity;

      this.particles.push({
        type: 'blood_droplet',
        x: x,
        y: y,
        vx: Math.cos(spreadAngle) * speed,
        vy: Math.sin(spreadAngle) * speed,
        targetDist: dist,
        traveled: 0,
        radius: 1.5 + Math.random() * 2.5 * intensity,
        color: this.getRandomBloodColor(),
        alpha: 0.9,
        life: 0.3
      });
    }

    // Also leave an immediate small pool at the impact point
    this.bloodDecals.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      radius: (3 + Math.random() * 6) * intensity,
      color: this.getRandomBloodColor(),
      alpha: 0.85,
      rotation: Math.random() * Math.PI * 2,
      scaleX: 0.7 + Math.random() * 0.6,
      scaleY: 0.7 + Math.random() * 0.6
    });

    this.pruneDecals();
  }

  getRandomBloodColor() {
    const colors = ['#450808', '#5e0b0b', '#730d0d', '#360606', '#2b0404'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  pruneDecals() {
    while (this.bloodDecals.length > this.maxDecals) {
      this.bloodDecals.shift();
    }
  }

  // --- Spent Brass Casings ---
  addEjectedCasing(x, y, gunAngle, weaponType) {
    // Eject to the right side of the weapon relative to facing direction
    const ejectAngle = gunAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    const speed = 70 + Math.random() * 80;

    this.casings.push({
      x: x,
      y: y,
      vx: Math.cos(ejectAngle) * speed,
      vy: Math.sin(ejectAngle) * speed,
      angle: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 20,
      length: weaponType === 'kar98k' || weaponType === 'mg42' ? 5 : 3.5,
      width: weaponType === 'shotgun' ? 3.0 : 1.5,
      color: weaponType === 'shotgun' ? '#9e1a1a' : '#c9a647',
      isShotgun: weaponType === 'shotgun',
      bounces: 0,
      maxBounces: 2,
      settled: false,
      alpha: 0.85
    });

    while (this.casings.length > this.maxCasings) {
      this.casings.shift();
    }
  }

  // --- Wood Splinters (Barricade break / repair) ---
  addWoodSplinters(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      this.particles.push({
        type: 'wood_splinter',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 15,
        length: 4 + Math.random() * 8,
        width: 1.5 + Math.random() * 1.5,
        color: Math.random() > 0.5 ? '#5c4028' : '#7d5836',
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8
      });
    }
  }

  // --- Atmospheric Mist Burst on Room Reveal ---
  addMistBurst(x, y, count = 22) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 75;
      const life = 1.3 + Math.random() * 0.9;
      this.particles.push({
        type: 'smoke',
        x: x + (Math.random() - 0.5) * 35,
        y: y + (Math.random() - 0.5) * 35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 20 + Math.random() * 18,
        maxRadius: 60 + Math.random() * 35,
        color: Math.random() > 0.5 ? '#23332a' : '#2f4438',
        alpha: 0.5,
        life: life,
        maxLife: life
      });
    }
  }

  // --- Concrete Sparks on Wall Hit ---
  addWallSparks(x, y, angle) {
    const normalAngle = angle + Math.PI;
    for (let i = 0; i < 7; i++) {
      const sparkAngle = normalAngle + (Math.random() - 0.5) * 1.2;
      const speed = 80 + Math.random() * 180;
      this.particles.push({
        type: 'spark',
        x: x,
        y: y,
        vx: Math.cos(sparkAngle) * speed,
        vy: Math.sin(sparkAngle) * speed,
        radius: 1.0 + Math.random() * 1.5,
        color: '#ffcc66',
        life: 0.15 + Math.random() * 0.2,
        maxLife: 0.35
      });
    }
  }

  // --- General Pack-a-Punch & Arcane Sparks ---
  addSparks(x, y, count = 6, color = '#ffd700') {
    for (let i = 0; i < count; i++) {
      const sparkAngle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      this.particles.push({
        type: 'spark',
        x: x,
        y: y,
        vx: Math.cos(sparkAngle) * speed,
        vy: Math.sin(sparkAngle) * speed,
        radius: 1.0 + Math.random() * 1.6,
        color: color,
        life: 0.18 + Math.random() * 0.25,
        maxLife: 0.42
      });
    }
  }

  // --- Ray Gun Plasma Explosion ---
  addRayGunExplosion(x, y) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 220;
      this.particles.push({
        type: 'plasma',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3.5,
        color: '#44ff88',
        life: 0.25 + Math.random() * 0.3,
        maxLife: 0.5
      });
    }

    // Shockwave ring
    this.particles.push({
      type: 'shockwave',
      x: x,
      y: y,
      radius: 4,
      maxRadius: 65,
      color: '#33ff77',
      life: 0.25,
      maxLife: 0.25
    });
  }

  // --- Pack-a-Punch Explosive Rounds (Mustang & Sally) ---
  addPackAPunchExplosion(x, y, radius = 60, tier = 1) {
    let sparkColor = '#d855ff';
    let ringColor = '#eb78ff';
    if (tier === 2) {
      sparkColor = '#00e5ff';
      ringColor = '#80f5ff';
    } else if (tier === 3) {
      sparkColor = '#ffd700';
      ringColor = '#ffe766';
    }

    const count = 16 + tier * 6;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * (160 + tier * 50);
      this.particles.push({
        type: 'plasma',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.2 + Math.random() * 3.0,
        color: Math.random() < 0.35 ? '#ffffff' : sparkColor,
        life: 0.22 + Math.random() * 0.25,
        maxLife: 0.45
      });
    }

    // Energized Shockwave ring
    this.particles.push({
      type: 'shockwave',
      x: x,
      y: y,
      radius: 4,
      maxRadius: radius,
      color: ringColor,
      life: 0.22,
      maxLife: 0.22
    });
  }

  // --- Muzzle Smoke / Fire ---
  addMuzzleSmoke(x, y, angle) {
    for (let i = 0; i < 3; i++) {
      const spreadAngle = angle + (Math.random() - 0.5) * 0.3;
      const speed = 25 + Math.random() * 40;
      this.particles.push({
        type: 'smoke',
        x: x,
        y: y,
        vx: Math.cos(spreadAngle) * speed,
        vy: Math.sin(spreadAngle) * speed,
        radius: 3 + Math.random() * 4,
        maxRadius: 10 + Math.random() * 8,
        color: '#2a2f2b',
        alpha: 0.45,
        life: 0.3 + Math.random() * 0.3,
        maxLife: 0.6
      });
    }
  }

  // --- Floating Combat Scores (+10, +60, +130, HEADSHOT) ---
  addFloatingText(text, x, y, color = '#e5ecd8', isCritical = false) {
    this.floatingTexts.push({
      text: text,
      x: x + (Math.random() - 0.5) * 10,
      y: y,
      vy: -45,
      color: color,
      alpha: 1.0,
      life: 0.8,
      isCritical: isCritical
    });
  }

  update(dt) {
    // 1. Update active particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.type === 'blood_droplet') {
        const step = Math.hypot(p.vx, p.vy) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.traveled += step;

        // Friction
        p.vx *= 0.88;
        p.vy *= 0.88;

        if (p.traveled >= p.targetDist || p.life <= 0) {
          // Splat onto floor as persistent decal
          this.bloodDecals.push({
            x: p.x,
            y: p.y,
            radius: p.radius * (0.8 + Math.random() * 0.6),
            color: p.color,
            alpha: 0.8,
            rotation: Math.random() * Math.PI * 2,
            scaleX: 1.0 + Math.random() * 0.8,
            scaleY: 0.7 + Math.random() * 0.4
          });
          this.pruneDecals();
          this.particles.splice(i, 1);
          continue;
        }
      } else if (p.type === 'pixel_gib') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.vRot * dt;

        // 3D Arc Physics (Gravity & Height)
        p.vz -= 360 * dt;
        p.z += p.vz * dt;

        // Air & ground friction
        p.vx *= 0.93;
        p.vy *= 0.93;
        p.vRot *= 0.91;

        // Trail small blood droplets while airborne & moving fast
        p.trailTimer += dt;
        if (p.z > 2 && Math.hypot(p.vx, p.vy) > 30 && p.trailTimer >= 0.045) {
          p.trailTimer = 0;
          this.bloodDecals.push({
            x: p.x,
            y: p.y,
            radius: 1.2 + Math.random() * 1.5,
            color: '#590a0a',
            alpha: 0.75,
            rotation: Math.random() * Math.PI * 2,
            scaleX: 1.0,
            scaleY: 1.0
          });
          this.pruneDecals();
        }

        // Contact with the bunker floor
        if (p.z <= 0) {
          p.z = 0;
          if (p.bounces < p.maxBounces && Math.hypot(p.vx, p.vy) > 35) {
            // Small bounce
            p.bounces++;
            p.vz = Math.abs(p.vz) * 0.32;
            p.vx *= 0.55;
            p.vy *= 0.55;
            p.vRot *= 0.6;
          } else {
            // Settle permanently on the floor
            this.settledGibs.push({
              x: p.x,
              y: p.y,
              w: p.w,
              h: p.h,
              angle: p.angle,
              color: p.color,
              alpha: 0.9
            });

            // Small blood puddle under settled chunk
            this.bloodDecals.push({
              x: p.x,
              y: p.y,
              radius: Math.max(p.w, p.h) * 0.9,
              color: '#3d0505',
              alpha: 0.85,
              rotation: p.angle,
              scaleX: 1.2,
              scaleY: 0.8
            });
            this.pruneDecals();
            this.pruneSettledGibs();

            this.particles.splice(i, 1);
            continue;
          }
        }
      } else if (p.type === 'shockwave') {
        const progress = 1 - (p.life / p.maxLife);
        p.radius = progress * p.maxRadius;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vRot) p.angle += p.vRot * dt;

        // Friction
        p.vx *= 0.94;
        p.vy *= 0.94;
      }

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 2. Update spent casings physics
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      if (!c.settled) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.angle += c.vRot * dt;

        // Rapid ground friction
        c.vx *= 0.88;
        c.vy *= 0.88;
        c.vRot *= 0.88;

        if (Math.hypot(c.vx, c.vy) < 8) {
          c.settled = true;
          c.vx = 0;
          c.vy = 0;
          c.vRot = 0;
        }
      }
    }

    // 3. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.95; // Slow down ascent
      ft.alpha = Math.max(0, ft.life / 0.8);

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  // Draw ground decals: blood stains and settled brass casings
  drawDecals(ctx) {
    // Blood Decals
    for (let i = 0; i < this.bloodDecals.length; i++) {
      const d = this.bloodDecals[i];
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);
      ctx.scale(d.scaleX, d.scaleY);
      ctx.fillStyle = d.color;
      ctx.globalAlpha = d.alpha;
      ctx.beginPath();
      ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Spent Casings
    for (let i = 0; i < this.casings.length; i++) {
      const c = this.casings[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.globalAlpha = c.alpha;

      ctx.fillStyle = c.color;
      ctx.fillRect(-c.length / 2, -c.width / 2, c.length, c.width);

      if (c.isShotgun) {
        // Brass base on red shell
        ctx.fillStyle = '#c9a647';
        ctx.fillRect(-c.length / 2, -c.width / 2, c.length * 0.35, c.width);
      }

      ctx.restore();
    }

    // Settled Zombie Pixel Gibs on Bunker Floor
    for (let i = 0; i < this.settledGibs.length; i++) {
      const g = this.settledGibs[i];
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle);
      ctx.fillStyle = g.color;
      ctx.globalAlpha = g.alpha;
      ctx.fillRect(-g.w / 2, -g.h / 2, g.w, g.h);
      // Crisp pixel border
      ctx.strokeStyle = 'rgba(15, 8, 8, 0.6)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-g.w / 2, -g.h / 2, g.w, g.h);
      ctx.restore();
    }
  }

  // Draw in-flight particles
  drawParticles(ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.save();

      if (p.type === 'pixel_gib') {
        // 1. Drop shadow on floor directly under piece
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        // 2. Elevated airborne pixel chunk
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        // Dark outline for pixel-art clarity
        ctx.strokeStyle = 'rgba(10, 5, 5, 0.75)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.type === 'blood_droplet') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'wood_splinter') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1.0, p.life / 0.2);
        ctx.fillRect(-p.length / 2, -p.width / 2, p.length, p.width);
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1.0, p.life / 0.1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'plasma') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 8;
        ctx.globalAlpha = Math.min(1.0, p.life / 0.15);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'shockwave') {
        ctx.strokeStyle = p.color;
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'smoke') {
        const progress = 1 - (p.life / p.maxLife);
        const curRadius = p.radius + progress * (p.maxRadius - p.radius);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * (p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, curRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Draw floating combat numbers
  drawFloatingTexts(ctx) {
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i];
      ctx.save();
      ctx.font = ft.isCritical ? 'bold 15px "Courier Prime", monospace' : '13px "Courier Prime", monospace';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = ft.alpha;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

