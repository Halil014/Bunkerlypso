'use strict';

// ==================== [MODULE: progression.js] ====================

/**
 * Bunker Zombie RPG Progression & Armory System
 * Handles persistent Bullet Coins (BC), 4-tier Perk upgrades,
 * career statistics, and military rank advancement via localStorage.
 */

const PERK_TIERS = {
  nugi: [
    {
      tier: 1,
      name: 'Field Standard',
      color: '#2ecc71',
      className: 'tier-color-1',
      cost: 0,
      activeDesc: 'Max Health: 175 HP (3 hits to down).',
      nextDesc: 'Tier 2: 225 HP with faster regen delay.'
    },
    {
      tier: 2,
      name: 'Tactical Reinforcement',
      color: '#3498db',
      className: 'tier-color-2',
      cost: 400,
      activeDesc: 'Max Health: 225 HP. Faster regen delay (3.2s).',
      nextDesc: 'Tier 3: 275 HP with attacker hit stun.'
    },
    {
      tier: 3,
      name: 'Elite Operator',
      color: '#9b59b6',
      className: 'tier-color-3',
      cost: 1500,
      activeDesc: 'Max Health: 275 HP. Stuns attacking zombies.',
      nextDesc: 'Tier 4: 350 HP & Emergency Shockwave.'
    },
    {
      tier: 4,
      name: 'Doomsday Prototype',
      color: '#f1c40f',
      className: 'tier-color-4',
      cost: 3500,
      activeDesc: 'Max Health: 350 HP. Rapid regen & Emergency Shockwave.',
      nextDesc: 'MAX TIER - Peak Juggernaut defense.'
    }
  ],
  spodi: [
    {
      tier: 1,
      name: 'Field Standard',
      color: '#2ecc71',
      className: 'tier-color-1',
      cost: 0,
      activeDesc: 'Reload speed +35%.',
      nextDesc: 'Tier 2: +55% reload & faster weapon switch.'
    },
    {
      tier: 2,
      name: 'Tactical Reinforcement',
      color: '#3498db',
      className: 'tier-color-2',
      cost: 400,
      activeDesc: 'Reload speed +55% & faster weapon switch.',
      nextDesc: 'Tier 3: +75% reload & faster melee.'
    },
    {
      tier: 3,
      name: 'Elite Operator',
      color: '#9b59b6',
      className: 'tier-color-3',
      cost: 1500,
      activeDesc: 'Reload speed +75% & reduced melee cooldown.',
      nextDesc: 'Tier 4: 2.0x reload, +15% speed, rapid fire.'
    },
    {
      tier: 4,
      name: 'Doomsday Prototype',
      color: '#f1c40f',
      className: 'tier-color-4',
      cost: 3500,
      activeDesc: 'Instant Reload (2.0x) + 15% speed + 3s rapid fire after reload.',
      nextDesc: 'MAX TIER - Peak tactical agility.'
    }
  ]
};

const MILITARY_RANKS = [
  { level: 1, title: 'PRIVATE', badge: '🎖️', minXp: 0 },
  { level: 2, title: 'CORPORAL', badge: '🎗️', minXp: 200 },
  { level: 3, title: 'SERGEANT', badge: '🥉', minXp: 600 },
  { level: 4, title: 'MASTER SERGEANT', badge: '🥈', minXp: 1200 },
  { level: 5, title: '2ND LIEUTENANT', badge: '🥇', minXp: 2200 },
  { level: 6, title: '1ST LIEUTENANT', badge: '⭐', minXp: 3800 },
  { level: 7, title: 'CAPTAIN', badge: '⭐⭐', minXp: 6000 },
  { level: 8, title: 'MAJOR', badge: '⭐⭐⭐', minXp: 9500 },
  { level: 9, title: 'LT. COLONEL', badge: '🦅', minXp: 14000 },
  { level: 10, title: 'COLONEL', badge: '🛡️', minXp: 20000 },
  { level: 11, title: 'BRIGADIER GENERAL', badge: '⚔️', minXp: 28000 },
  { level: 12, title: 'LIEUTENANT GENERAL', badge: '👑', minXp: 40000 },
  { level: 13, title: 'GENERAL OF THE ARMY', badge: '☠️', minXp: 60000 }
];

class ProgressionManager {
  constructor() {
    this.storageKey = 'bunkerzombies_rpg_save_v1';
    this.bc = 0;
    this.totalBcEarned = 0;
    this.stats = {
      gamesPlayed: 0,
      highestRound: 0,
      totalKills: 0,
      totalHeadshots: 0,
      totalScore: 0,
      totalRepairs: 0,
      totalTimeSurvivedSec: 0
    };
    this.perkUpgrades = {
      nugi: 1,
      spodi: 1
    };
    this.selectedDifficulty = 'NORMAL'; // 'NORMAL', 'HARD', 'NIGHTMARE'

    this.load();
  }

  load() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (typeof parsed.bc === 'number') this.bc = parsed.bc;
        if (typeof parsed.totalBcEarned === 'number') this.totalBcEarned = parsed.totalBcEarned;
        if (parsed.stats) {
          this.stats = Object.assign(this.stats, parsed.stats);
        }
        if (parsed.perkUpgrades) {
          if (parsed.perkUpgrades.nugi) this.perkUpgrades.nugi = Math.min(4, Math.max(1, parsed.perkUpgrades.nugi));
          if (parsed.perkUpgrades.spodi) this.perkUpgrades.spodi = Math.min(4, Math.max(1, parsed.perkUpgrades.spodi));
        }
        if (parsed.selectedDifficulty) {
          this.selectedDifficulty = parsed.selectedDifficulty;
        }
      }
    } catch (e) {
      console.warn('Could not load RPG progression data from localStorage:', e);
    }
  }

  save() {
    try {
      const data = {
        bc: this.bc,
        totalBcEarned: this.totalBcEarned,
        stats: this.stats,
        perkUpgrades: this.perkUpgrades,
        selectedDifficulty: this.selectedDifficulty
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save RPG progression data:', e);
    }
  }

  setDifficulty(diffKey) {
    this.selectedDifficulty = diffKey;
    this.save();
    return true;
  }

  getBc() {
    return this.bc;
  }

  addBc(amount) {
    if (amount > 0) {
      this.bc += amount;
      this.totalBcEarned += amount;
      this.save();
    }
  }

  spendBc(amount) {
    if (this.bc >= amount) {
      this.bc -= amount;
      this.save();
      return true;
    }
    return false;
  }

  getPerkTier(perkId) {
    return this.perkUpgrades[perkId] || 1;
  }

  getPerkData(perkId, tier = null) {
    const t = tier !== null ? tier : this.getPerkTier(perkId);
    return PERK_TIERS[perkId][t - 1] || PERK_TIERS[perkId][0];
  }

  getNextPerkData(perkId) {
    const currentTier = this.getPerkTier(perkId);
    if (currentTier >= 4) return null;
    return PERK_TIERS[perkId][currentTier];
  }

  upgradePerk(perkId) {
    const currentTier = this.getPerkTier(perkId);
    if (currentTier >= 4) return false;
    const nextData = this.getNextPerkData(perkId);
    if (!nextData) return false;

    if (this.spendBc(nextData.cost)) {
      this.perkUpgrades[perkId] = currentTier + 1;
      this.save();
      return true;
    }
    return false;
  }

  recordGame(matchData) {
    this.stats.gamesPlayed++;
    this.stats.highestRound = Math.max(this.stats.highestRound, matchData.rounds || 0);
    this.stats.totalKills += (matchData.kills || 0);
    this.stats.totalHeadshots += (matchData.headshots || 0);
    this.stats.totalScore += (matchData.score || 0);
    this.stats.totalRepairs += (matchData.repairs || 0);
    this.stats.totalTimeSurvivedSec += (matchData.durationSec || 0);

    if (matchData.earnedBc > 0) {
      this.addBc(matchData.earnedBc);
    } else {
      this.save();
    }
  }

  getXp() {
    return (this.stats.totalKills * 10) +
           (this.stats.totalHeadshots * 5) +
           (this.stats.highestRound * 120) +
           (this.stats.gamesPlayed * 30) +
           (this.stats.totalRepairs * 2);
  }

  getMilitaryRank() {
    const totalXp = this.getXp();
    let currentRank = MILITARY_RANKS[0];
    let nextRank = MILITARY_RANKS[1];

    for (let i = 0; i < MILITARY_RANKS.length; i++) {
      if (totalXp >= MILITARY_RANKS[i].minXp) {
        currentRank = MILITARY_RANKS[i];
        nextRank = MILITARY_RANKS[i + 1] || null;
      } else {
        break;
      }
    }

    let progressPct = 100;
    let xpInCurrent = totalXp - currentRank.minXp;
    let xpNeeded = 0;

    if (nextRank) {
      xpNeeded = nextRank.minXp - currentRank.minXp;
      progressPct = Math.min(100, Math.max(0, (xpInCurrent / xpNeeded) * 100));
    }

    return {
      currentRank,
      nextRank,
      totalXp,
      xpInCurrent,
      xpNeeded,
      progressPct
    };
  }

  resetStats() {
    this.bc = 0;
    this.totalBcEarned = 0;
    this.stats = {
      gamesPlayed: 0,
      highestRound: 0,
      totalKills: 0,
      totalHeadshots: 0,
      totalScore: 0,
      totalRepairs: 0,
      totalTimeSurvivedSec: 0
    };
    this.perkUpgrades = {
      nugi: 1,
      spodi: 1
    };
    this.save();
  }
}

