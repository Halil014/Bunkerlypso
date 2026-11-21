'use strict';

// ==================== [MODULE: hud.js] ====================

/**
 * Heads-Up Display (HUD) Controller
 * Manages the authentic Call of Duty: World at War Zombies interface,
 * blood-red Roman numeral rounds, dynamic crosshair, damage vignette, and interaction prompts.
 */

class HUD {
  constructor() {
    // DOM Elements
    this.roundNumberEl = document.getElementById('round-number');
    this.scoreValEl = document.getElementById('score-val');
    this.weaponNameEl = document.getElementById('weapon-name');
    this.ammoClipEl = document.getElementById('ammo-clip');
    this.ammoReserveEl = document.getElementById('ammo-reserve');
    this.interactionPromptEl = document.getElementById('interaction-prompt');
    this.promptTextEl = document.getElementById('prompt-text');
    this.actionProgressContainerEl = document.getElementById('action-progress-container');
    this.actionLabelEl = document.getElementById('action-label');
    this.actionProgressFillEl = document.getElementById('action-progress-fill');
    this.damageOverlayEl = document.getElementById('damage-overlay');
    this.crosshairEl = document.getElementById('crosshair');
    this.hitMarkerEl = document.getElementById('hit-marker');
    this.perksListEl = document.getElementById('perks-list');
    this.powerupsContainerEl = document.getElementById('powerups-container');
    this.zoneDisplayEl = document.getElementById('zone-display');
    this.zoneNameEl = document.getElementById('zone-name');

    // Game Over Elements
    this.gameOverScreenEl = document.getElementById('game-over-screen');
    this.gameOverRoundsEl = document.getElementById('game-over-rounds');
    this.statKillsEl = document.getElementById('stat-kills');
    this.statHeadshotsEl = document.getElementById('stat-headshots');
    this.statScoreEl = document.getElementById('stat-score');
    this.statRepairsEl = document.getElementById('stat-repairs');

    // Difficulty Elements
    this.hudDifficultyEl = document.getElementById('hud-difficulty');
    this.hudDiffIconEl = document.getElementById('hud-diff-icon');
    this.hudDiffTextEl = document.getElementById('hud-diff-text');

    this.hitmarkerTimeout = null;
    this.currentZoneName = '';
  }

  // Convert integer to classic Roman Numerals (I, II, III, IV, V, etc.)
  toRoman(num) {
    if (num <= 0) return '0';
    const romanMap = [
      { val: 1000, str: 'M' },
      { val: 900, str: 'CM' },
      { val: 500, str: 'D' },
      { val: 400, str: 'CD' },
      { val: 100, str: 'C' },
      { val: 90, str: 'XC' },
      { val: 50, str: 'L' },
      { val: 40, str: 'XL' },
      { val: 10, str: 'X' },
      { val: 9, str: 'IX' },
      { val: 5, str: 'V' },
      { val: 4, str: 'IV' },
      { val: 1, str: 'I' }
    ];
    let result = '';
    for (const r of romanMap) {
      while (num >= r.val) {
        result += r.str;
        num -= r.val;
      }
    }
    return result;
  }

  triggerRoundChange(newRound) {
    this.roundNumberEl.textContent = this.toRoman(newRound);
    this.roundNumberEl.classList.remove('round-change');
    // Force reflow
    void this.roundNumberEl.offsetWidth;
    this.roundNumberEl.classList.add('round-change');
  }

  // Show authentic Black Ops 2 4-tick hitmarker with headshot/kill color support
  showHitmarker(isHeadshot = false, isFatal = false) {
    if (!this.hitMarkerEl) return;
    this.hitMarkerEl.classList.remove('hidden');

    if (isHeadshot || isFatal) {
      this.hitMarkerEl.classList.add('headshot');
    } else {
      this.hitMarkerEl.classList.remove('headshot');
    }

    this.hitMarkerEl.classList.remove('visible');
    void this.hitMarkerEl.offsetWidth; // Force CSS animation restart
    this.hitMarkerEl.classList.add('visible');

    if (this.hitmarkerTimeout) clearTimeout(this.hitmarkerTimeout);
    this.hitmarkerTimeout = setTimeout(() => {
      this.hitMarkerEl.classList.remove('visible');
      this.hitMarkerEl.classList.add('hidden');
    }, 120);
  }

  // Update in-game HUD difficulty badge
  updateDifficultyBadge(diffKey) {
    if (!this.hudDifficultyEl) return;
    this.hudDifficultyEl.className = '';
    if (diffKey === 'NIGHTMARE') {
      this.hudDifficultyEl.className = 'diff-nightmare';
      if (this.hudDiffIconEl) this.hudDiffIconEl.textContent = '🔴';
      if (this.hudDiffTextEl) this.hudDiffTextEl.textContent = 'NIGHTMARE 🔦';
    } else if (diffKey === 'HARD') {
      this.hudDifficultyEl.className = 'diff-hard';
      if (this.hudDiffIconEl) this.hudDiffIconEl.textContent = '🟡';
      if (this.hudDiffTextEl) this.hudDiffTextEl.textContent = 'HARD';
    } else {
      this.hudDifficultyEl.className = 'diff-normal';
      if (this.hudDiffIconEl) this.hudDiffIconEl.textContent = '🟢';
      if (this.hudDiffTextEl) this.hudDiffTextEl.textContent = 'NORMAL';
    }
  }

  update(player, mouseX, mouseY, roundNumber, isRoundTransition, zoneName = 'COMMAND BUNKER', nowSec = performance.now() / 1000) {
    // 0. Update Zone / Room Name
    if (this.zoneNameEl && zoneName !== this.currentZoneName) {
      this.currentZoneName = zoneName;
      this.zoneNameEl.textContent = zoneName;
      if (this.zoneDisplayEl) {
        this.zoneDisplayEl.classList.remove('zone-transition');
        void this.zoneDisplayEl.offsetWidth;
        this.zoneDisplayEl.classList.add('zone-transition');
      }
    }

    // 1. Crosshair Position & Dynamic Spread
    if (this.crosshairEl) {
      this.crosshairEl.style.left = `${mouseX}px`;
      this.crosshairEl.style.top = `${mouseY}px`;

      const isMoving = Math.hypot(player.vx, player.vy) > 10;
      const spreadSize = isMoving ? 34 : 22;
      this.crosshairEl.style.width = `${spreadSize}px`;
      this.crosshairEl.style.height = `${spreadSize}px`;
    }

    // 2. Score Counter
    this.scoreValEl.textContent = player.score;

    // 3. Current Weapon & Ammo
    const wep = player.getCurrentWeapon();
    const papLevel = wep.papLevel || 0;
    if (papLevel > 0) {
      const romanTiers = ['', 'I', 'II', 'III'];
      this.weaponNameEl.innerHTML = `${wep.name} <span class="pap-hud-badge tier-${papLevel}">PAP ${romanTiers[papLevel]}</span>`;
      this.weaponNameEl.className = `weapon-pap-active pap-tier-${papLevel}`;
    } else {
      this.weaponNameEl.textContent = wep.name;
      this.weaponNameEl.className = '';
    }
    this.ammoClipEl.textContent = wep.currentMag;
    this.ammoReserveEl.textContent = wep.reserveAmmo;

    // 4. Action Progress Bar (Reloading or Repairing)
    if (wep.isReloading) {
      this.actionProgressContainerEl.classList.remove('hidden');
      this.actionLabelEl.textContent = 'RELOADING...';
      const progress = wep.getReloadProgress(nowSec) * 100;
      this.actionProgressFillEl.style.width = `${progress}%`;
    } else if (player.currentInteraction && player.currentInteraction.type === 'WINDOW' && player.repairAccumulator > 0) {
      this.actionProgressContainerEl.classList.remove('hidden');
      this.actionLabelEl.textContent = 'REPAIRING...';
      this.actionProgressFillEl.style.width = `${player.repairAccumulator * 100}%`;
    } else {
      this.actionProgressContainerEl.classList.add('hidden');
    }

    // 5. Interaction Prompt
    if (player.currentInteraction) {
      this.interactionPromptEl.classList.remove('hidden');
      this.promptTextEl.textContent = player.currentInteraction.text;
    } else {
      this.interactionPromptEl.classList.add('hidden');
    }

    // 6. Damage Screen Vignette & Heartbeat
    const healthRatio = player.health / player.maxHealth;
    if (healthRatio < 1.0) {
      const damageIntensity = (1.0 - healthRatio);
      this.damageOverlayEl.style.opacity = Math.min(1.0, damageIntensity * 1.2);
      if (healthRatio <= 0.45) {
        this.damageOverlayEl.classList.add('pulsing');
      } else {
        this.damageOverlayEl.classList.remove('pulsing');
      }
    } else {
      this.damageOverlayEl.style.opacity = 0;
      this.damageOverlayEl.classList.remove('pulsing');
    }

    // 7. Active Perks Display with Custom Authentic Icons
    this.renderPerks(player);

    // 8. Power-ups Display
    this.powerupsContainerEl.innerHTML = '';
    if (player.powerups.INSTA_KILL > 0) {
      const pill = document.createElement('div');
      pill.className = 'powerup-pill';
      pill.textContent = `INSTA-KILL (${Math.ceil(player.powerups.INSTA_KILL)}s)`;
      this.powerupsContainerEl.appendChild(pill);
    }
    if (player.powerups.DOUBLE_POINTS > 0) {
      const pill = document.createElement('div');
      pill.className = 'powerup-pill';
      pill.textContent = `DOUBLE POINTS (${Math.ceil(player.powerups.DOUBLE_POINTS)}s)`;
      this.powerupsContainerEl.appendChild(pill);
    }
  }

  renderPerks(player) {
    if (!this.perksListEl) return;

    // Check if perks changed
    const hasNugi = !!player.hasNugi;
    const hasSpodi = !!player.hasSpodi;

    const currentNugiEl = this.perksListEl.querySelector('.perk-nugi');
    const currentSpodiEl = this.perksListEl.querySelector('.perk-spodi');

    const nugiTier = (player.perkLevels && player.perkLevels.nugi) ? player.perkLevels.nugi : 1;
    const spodiTier = (player.perkLevels && player.perkLevels.spodi) ? player.perkLevels.spodi : 1;

    // NUGI Perk Icon (Tiered Badge with custom stars and glowing frame)
    if (hasNugi && !currentNugiEl) {
      const perkNugi = document.createElement('div');
      perkNugi.className = `perk-icon perk-nugi perk-tier-${nugiTier}`;
      const stars = '★'.repeat(nugiTier);
      const tierName = PERK_TIERS.nugi[nugiTier - 1].name;
      perkNugi.title = `NUGI [Tier ${nugiTier} // ${tierName}]`;
      perkNugi.innerHTML = `
        <div class="perk-glyph">✚</div>
        <div class="perk-name-tag">NUGI</div>
        <div class="perk-tier-stars">${stars}</div>
      `;
      this.perksListEl.appendChild(perkNugi);
    }

    // SPODI Perk Icon (Tiered Badge with custom stars and glowing frame)
    if (hasSpodi && !currentSpodiEl) {
      const perkSpodi = document.createElement('div');
      perkSpodi.className = `perk-icon perk-spodi perk-tier-${spodiTier}`;
      const stars = '★'.repeat(spodiTier);
      const tierName = PERK_TIERS.spodi[spodiTier - 1].name;
      perkSpodi.title = `SPODI [Tier ${spodiTier} // ${tierName}]`;
      perkSpodi.innerHTML = `
        <div class="perk-glyph">⚡</div>
        <div class="perk-name-tag">SPODI</div>
        <div class="perk-tier-stars">${stars}</div>
      `;
      this.perksListEl.appendChild(perkSpodi);
    }
  }

  showGameOver(player, roundsSurvived, matchLoot = null, currentWalletBc = 0) {
    this.gameOverScreenEl.classList.remove('hidden');
    this.gameOverRoundsEl.textContent = `${roundsSurvived} ${roundsSurvived === 1 ? 'ROUND' : 'ROUNDS'}`;
    this.statKillsEl.textContent = player.kills;
    this.statHeadshotsEl.textContent = player.headshots;
    this.statScoreEl.textContent = player.totalScoreEarned;
    this.statRepairsEl.textContent = player.windowsRepaired;

    if (matchLoot) {
      const lootKillsEl = document.getElementById('loot-kills-bc');
      const lootHeadshotsEl = document.getElementById('loot-headshots-bc');
      const lootRoundsEl = document.getElementById('loot-rounds-bc');
      const lootRepairsEl = document.getElementById('loot-repairs-bc');
      const lootTotalEl = document.getElementById('loot-total-bc');
      const walletEl = document.getElementById('game-over-wallet-bc');

      if (lootKillsEl) lootKillsEl.textContent = `+${matchLoot.killsBc} BC (${player.kills} Kills)`;
      if (lootHeadshotsEl) lootHeadshotsEl.textContent = `+${matchLoot.headshotsBc} BC (${player.headshots} Headshots)`;
      if (lootRoundsEl) lootRoundsEl.textContent = `+${matchLoot.roundsBc} BC (${roundsSurvived} ${roundsSurvived === 1 ? 'Round' : 'Rounds'})`;
      if (lootRepairsEl) lootRepairsEl.textContent = `+${matchLoot.repairsBc} BC (${player.windowsRepaired} Repairs)`;
      if (lootTotalEl) lootTotalEl.textContent = `+${matchLoot.totalBc} BC`;
      if (walletEl) walletEl.textContent = `${currentWalletBc} BC`;
    }
  }

  hideGameOver() {
    this.gameOverScreenEl.classList.add('hidden');
    this.perksListEl.innerHTML = '';
  }
}

