'use strict';

// ==================== [MODULE: lighting.js] ====================

/**
 * Real-time 2D Dynamic Lighting & Shadow Engine
 * Implements realistic flashlight cone, muzzle flashes, bunker hanging lamps,
 * and the iconic Call of Duty glowing yellow zombie eyes that pierce through pitch darkness.
 */

class LightingEngine {
  constructor(width, height) {
    this.width = width;
    this.height = height;

    // Offscreen canvas for lighting mask
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = width;
    this.lightCanvas.height = height;
    this.lightCtx = this.lightCanvas.getContext('2d');

    this.muzzleFlashes = [];
    this.explosions = [];

    // Flashlight enabled / Safe Mode (full brightness)
    this.flashlightEnabled = true;

    // Bunker ambient lamps
    this.lamps = [
      { x: 420, y: 380, baseRadius: 180, flicker: 1.0, zone: 'room1' }, // Room 1 central hanging bulb
      { x: 920, y: 390, baseRadius: 160, flicker: 1.0, zone: 'hallway' }, // L-Hallway horizontal bulb
      { x: 1080, y: 650, baseRadius: 160, flicker: 1.0, zone: 'hallway' }, // L-Hallway vertical bulb
      { x: 1150, y: 1140, baseRadius: 220, flicker: 1.0, zone: 'armory' }, // Room 2 (Armory) central hanging bulb
      { x: 410, y: 950, baseRadius: 200, flicker: 1.0, zone: 'subbunker' }, // Room 3 (Sub-Bunker Generator Lab bulb)
      { x: 1380, y: 1400, baseRadius: 150, flicker: 1.0, zone: 'stairs' }, // Armory Stairs hanging bulb
      { x: 1150, y: 1700, baseRadius: 240, flicker: 1.0, zone: 'basement' }, // Underground Armory central bulb
      { x: 1070, y: 1475, baseRadius: 175, flicker: 1.0, zone: 'basement', isPap: true } // Underground Pack-a-Punch mystical aura
    ];
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.lightCanvas.width = width;
    this.lightCanvas.height = height;
  }

  addMuzzleFlash(x, y, intensity = 1.0) {
    this.muzzleFlashes.push({
      x: x,
      y: y,
      radius: 280 * intensity,
      life: 0.07,
      maxLife: 0.07,
      intensity: intensity
    });
  }

  addExplosionFlash(x, y, radius = 350) {
    this.explosions.push({
      x: x,
      y: y,
      radius: radius,
      life: 0.22,
      maxLife: 0.22
    });
  }

  update(dt) {
    // Update muzzle flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i];
      mf.life -= dt;
      if (mf.life <= 0) {
        this.muzzleFlashes.splice(i, 1);
      }
    }

    // Update explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.life -= dt;
      if (exp.life <= 0) {
        this.explosions.splice(i, 1);
      }
    }

    // Subtle flickering of dirty bunker bulbs
    for (const lamp of this.lamps) {
      if (Math.random() < 0.08) {
        lamp.flicker = 0.75 + Math.random() * 0.35;
      } else {
        lamp.flicker += (1.0 - lamp.flicker) * 0.1;
      }
    }
  }

  // Render the darkness mask and composite flashlight & lights
  renderLighting(mainCtx, player, camera, zombies, map) {
    // If flashlight / darkness is disabled (Safe Mode: full illumination)
    if (!this.flashlightEnabled) {
      // In safe bright mode, still optionally draw the glowing zombie eyes for aesthetic
      this.drawGlowingZombieEyes(mainCtx, zombies, camera);
      return;
    }

    const lCtx = this.lightCtx;
    lCtx.save();

    // 1. Fill entire mask with oppressive, cold bunker darkness (96% opacity)
    lCtx.globalCompositeOperation = 'source-over';
    lCtx.fillStyle = 'rgba(5, 7, 6, 0.965)';
    lCtx.fillRect(0, 0, this.width, this.height);

    // Camera offset translation
    lCtx.save();
    lCtx.translate(-camera.x, -camera.y);

    // 2. Cut out light shapes using destination-out
    lCtx.globalCompositeOperation = 'destination-out';

    // A. Bunker Hanging Bulbs (Subtle dim yellowish pool)
    for (const lamp of this.lamps) {
      // If Hallway lamp and debris door is not opened, don't show
      if (lamp.zone === 'hallway' && !map.debrisDoor.opened) continue;
      // If Armory lamp and armory is not opened, don't show
      if (lamp.zone === 'armory' && (!map.debrisDoor.opened || (map.armoryDebris && !map.armoryDebris.opened))) continue;
      // If Room 3 (Sub-bunker) lamp and south gate is not opened, don't show
      if (lamp.zone === 'subbunker' && map.southDoor && !map.southDoor.opened) continue;
      // If Stairs lamp and armory is not opened, don't show
      if (lamp.zone === 'stairs' && (!map.debrisDoor.opened || (map.armoryDebris && !map.armoryDebris.opened))) continue;
      // If Basement lamp and stairs debris is not opened, don't show
      if (lamp.zone === 'basement' && (!map.stairsDebris || !map.stairsDebris.opened)) continue;

      let revealFactor = 1.0;
      if (lamp.zone === 'hallway') {
        revealFactor = 1.0 - (map.hallwayFog ? map.hallwayFog.fogOpacity : (map.eastWingFog ? map.eastWingFog.fogOpacity : 0));
      } else if (lamp.zone === 'armory') {
        revealFactor = 1.0 - (map.armoryFog ? map.armoryFog.fogOpacity : (map.eastWingFog ? map.eastWingFog.fogOpacity : 0));
      } else if (lamp.zone === 'subbunker') {
        revealFactor = 1.0 - (map.subBunkerFog ? map.subBunkerFog.fogOpacity : 0);
      } else if (lamp.zone === 'stairs' || lamp.zone === 'basement') {
        revealFactor = 1.0 - (map.basementFog ? map.basementFog.fogOpacity : 0);
      }
      if (revealFactor <= 0.05) continue;

      const r = lamp.baseRadius * lamp.flicker * (0.6 + 0.4 * revealFactor);
      const grad = lCtx.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, r);
      grad.addColorStop(0, `rgba(0, 0, 0, ${0.65 * revealFactor})`);
      grad.addColorStop(0.5, `rgba(0, 0, 0, ${0.3 * revealFactor})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lCtx.fillStyle = grad;
      lCtx.beginPath();
      lCtx.arc(lamp.x, lamp.y, r, 0, Math.PI * 2);
      lCtx.fill();
    }

    // B. Player Personal Ambient Aura (360 degrees, immediate footing)
    const auraRadius = 75;
    const auraGrad = lCtx.createRadialGradient(player.x, player.y, 10, player.x, player.y, auraRadius);
    auraGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    auraGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)');
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    lCtx.fillStyle = auraGrad;
    lCtx.beginPath();
    lCtx.arc(player.x, player.y, auraRadius, 0, Math.PI * 2);
    lCtx.fill();

    // C. Player Flashlight Cone (Points towards aim angle)
    const beamDist = 480;
    const halfFov = Math.PI * 0.22; // ~80 degree wide beam
    const startAngle = player.angle - halfFov;
    const endAngle = player.angle + halfFov;

    const coneGrad = lCtx.createRadialGradient(player.x, player.y, 25, player.x, player.y, beamDist);
    coneGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
    coneGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.95)');
    coneGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.7)');
    coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    lCtx.fillStyle = coneGrad;
    lCtx.beginPath();
    lCtx.moveTo(player.x, player.y);
    lCtx.arc(player.x, player.y, beamDist, startAngle, endAngle);
    lCtx.closePath();
    lCtx.fill();

    // D. Gun Muzzle Flashes (Instant dramatic illumination)
    for (const mf of this.muzzleFlashes) {
      const p = mf.life / mf.maxLife;
      const r = mf.radius * (0.8 + 0.2 * (1 - p));
      const mfGrad = lCtx.createRadialGradient(mf.x, mf.y, 5, mf.x, mf.y, r);
      mfGrad.addColorStop(0, `rgba(0, 0, 0, ${0.98 * p})`);
      mfGrad.addColorStop(0.5, `rgba(0, 0, 0, ${0.7 * p})`);
      mfGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lCtx.fillStyle = mfGrad;
      lCtx.beginPath();
      lCtx.arc(mf.x, mf.y, r, 0, Math.PI * 2);
      lCtx.fill();
    }

    // E. Explosions (Ray Gun / Nuke)
    for (const exp of this.explosions) {
      const p = exp.life / exp.maxLife;
      const r = exp.radius;
      const expGrad = lCtx.createRadialGradient(exp.x, exp.y, 10, exp.x, exp.y, r);
      expGrad.addColorStop(0, `rgba(0, 0, 0, ${0.95 * p})`);
      expGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lCtx.fillStyle = expGrad;
      lCtx.beginPath();
      lCtx.arc(exp.x, exp.y, r, 0, Math.PI * 2);
      lCtx.fill();
    }

    lCtx.restore();
    lCtx.restore();

    // 3. Draw the darkness mask onto the main game canvas
    mainCtx.drawImage(this.lightCanvas, 0, 0);

    // 4. Draw glowing zombie eyes piercing through the darkness
    this.drawGlowingZombieEyes(mainCtx, zombies, camera);
  }

  // Draw the iconic Call of Duty Zombies yellow/amber glowing eyes
  drawGlowingZombieEyes(ctx, zombies, camera) {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    for (const z of zombies) {
      if (!z.alive || z.isDecapitated) continue;

      // Zombie head / eye coordinates based on angle
      const headDist = z.radius * 0.45;
      const headX = z.x + Math.cos(z.angle) * headDist;
      const headY = z.y + Math.sin(z.angle) * headDist;

      // Left and right eye offsets perpendicular to facing direction
      const perpAngle = z.angle + Math.PI / 2;
      const eyeSpacing = 4.5;
      const forwardOffset = 2.0;

      const eye1X = headX + Math.cos(perpAngle) * eyeSpacing + Math.cos(z.angle) * forwardOffset;
      const eye1Y = headY + Math.sin(perpAngle) * eyeSpacing + Math.sin(z.angle) * forwardOffset;

      const eye2X = headX - Math.cos(perpAngle) * eyeSpacing + Math.cos(z.angle) * forwardOffset;
      const eye2Y = headY - Math.sin(perpAngle) * eyeSpacing + Math.sin(z.angle) * forwardOffset;

      // Draw piercing yellow radial eye aura
      const drawEye = (ex, ey) => {
        // Soft outer amber glow
        const glowGrad = ctx.createRadialGradient(ex, ey, 1, ex, ey, 7);
        glowGrad.addColorStop(0, '#fff480');
        glowGrad.addColorStop(0.35, '#ffaa00');
        glowGrad.addColorStop(0.8, 'rgba(255, 140, 0, 0.35)');
        glowGrad.addColorStop(1, 'rgba(255, 120, 0, 0)');

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(ex, ey, 7, 0, Math.PI * 2);
        ctx.fill();

        // Intense central pupil dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, 1.2, 0, Math.PI * 2);
        ctx.fill();
      };

      drawEye(eye1X, eye1Y);
      drawEye(eye2X, eye2Y);
    }

    ctx.restore();
  }
}

