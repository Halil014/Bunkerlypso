'use strict';

// ==================== [MODULE: main.js] ====================

/**
 * Call of Duty: World at War - Zombies (2D Nacht der Untoten)
 * Main Game Loop, Wave Management & Render Pipeline
 */

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Engine Subsystems
    this.audio = new SoundManager();
    this.map = new BunkerMap();
    this.particles = new ParticleSystem();
    this.hud = new HUD();
    this.lighting = null; // Initialized in resize

    // World & Camera
    this.camera = { x: 0, y: 0 };
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.hitStopTimer = 0;

    // Entities
    this.player = null;
    this.zombies = [];
    this.bullets = [];

    // Wave Management
    this.round = 1;
    this.zombiesToSpawn = 0;
    this.zombiesSpawned = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 2.0;
    this.roundState = 'STARTING'; // 'STARTING', 'ACTIVE', 'INTERMISSION'
    this.intermissionTimer = 0;
    this.intermissionDuration = 7.0;

    // Input State
    this.inputState = {
      keys: {},
      mouseX: this.viewportWidth / 2,
      mouseY: this.viewportHeight / 2,
      mouseDown: false,
      mouseJustPressed: false,
      mouseMiddlePressed: false,
      fJustPressed: false,
      moveVector: { x: 0, y: 0 },
      aimAngle: null
    };

    // Game Lifecycle
    this.gameState = 'MENU'; // 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
    this.previousStateBeforeSettings = 'MENU';
    this.previousStateBeforeCheats = 'MENU';
    this.cheats = {
      godMode: false,
      infiniteAmmo: false
    };
    this.lastTime = 0;
    // Monotonic in-game clock (seconds). Advances only while PLAYING, so pausing
    // or tabbing away cannot fast-forward reloads, regen or the match timer.
    this.gameTime = 0;

    // Persistent RPG Progression & Armory
    this.progression = new ProgressionManager();

    // Mobile & Touch Controls Subsystem
    this.mobileControls = (typeof MobileControls !== 'undefined') ? new MobileControls(this) : null;

    this.initEvents();
    this.initUI();
    this.updateMainMenuProfile();
    this.resize();
    this.initMenuAudio();
  }

  resize() {
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.canvas.width = this.viewportWidth;
    this.canvas.height = this.viewportHeight;

    if (!this.lighting) {
      this.lighting = new LightingEngine(this.viewportWidth, this.viewportHeight);
    } else {
      this.lighting.resize(this.viewportWidth, this.viewportHeight);
    }
  }

  initEvents() {
    window.addEventListener('resize', () => this.resize());

    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.inputState.keys[e.code] = true;

      // Ignore OS key-repeat: hold-to-act keys (F wall-buy/repair, cheat toggle)
      // must only fire once per physical press.
      if (e.repeat) return;

      // Cheat Console Toggle with Backquote (~) or F1 key
      if (e.code === 'Backquote' || e.code === 'F1') {
        e.preventDefault();
        const cheatScreen = document.getElementById('cheats-screen');
        if (!cheatScreen.classList.contains('hidden')) {
          this.closeCheats();
        } else {
          this.openCheats(this.gameState === 'PLAYING' ? 'PLAYING' : (this.gameState === 'PAUSED' ? 'PAUSED' : 'MENU'));
        }
        return;
      }

      // Pause toggle with Escape or P key, or close any open submenu
      if (e.code === 'Escape' || e.code === 'KeyP') {
        const cheatScreen = document.getElementById('cheats-screen');
        if (cheatScreen && !cheatScreen.classList.contains('hidden')) {
          this.closeCheats();
          return;
        }

        const settingsScreen = document.getElementById('settings-screen');
        if (settingsScreen && !settingsScreen.classList.contains('hidden')) {
          this.closeSettings();
          return;
        }

        const diffScreen = document.getElementById('difficulty-screen');
        if (diffScreen && !diffScreen.classList.contains('hidden')) {
          this.closeDifficultyScreen();
          return;
        }

        const statsScreen = document.getElementById('stats-screen');
        if (statsScreen && !statsScreen.classList.contains('hidden')) {
          this.closeStatsScreen();
          return;
        }

        const upgradesScreen = document.getElementById('upgrades-screen');
        if (upgradesScreen && !upgradesScreen.classList.contains('hidden')) {
          this.closeUpgradesScreen();
          return;
        }

        if (this.gameState === 'PLAYING') {
          this.pauseGame();
          return;
        } else if (this.gameState === 'PAUSED') {
          this.resumeGame();
          return;
        }
      }

      if (this.gameState === 'MENU' && (e.code === 'Enter' || e.code === 'Space')) {
        // Never start a run while a menu overlay is open: the game would begin
        // underneath the modal and the player could not see anything.
        const blockingScreens = ['settings-screen', 'upgrades-screen', 'stats-screen', 'cheats-screen', 'difficulty-screen'];
        const anyOverlayOpen = blockingScreens.some((id) => {
          const el = document.getElementById(id);
          return el && !el.classList.contains('hidden');
        });

        if (!anyOverlayOpen) {
          this.audio.init();
          this.startNewGame();
          return;
        }
      }

      if (e.code === 'KeyF') {
        this.inputState.fJustPressed = true;
      }

      if (this.player && !this.player.isDead) {
        if (e.code === 'Digit1') this.player.switchWeapon(0);
        if (e.code === 'Digit2') this.player.switchWeapon(1);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.inputState.keys[e.code] = false;
      if (e.code === 'KeyF') {
        this.inputState.fJustPressed = false;
      }
    });

    // Mouse Tracking
    window.addEventListener('mousemove', (e) => {
      this.inputState.mouseX = e.clientX;
      this.inputState.mouseY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.inputState.mouseDown = true;
        this.inputState.mouseJustPressed = true;
      } else if (e.button === 1) {
        this.inputState.mouseMiddlePressed = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.inputState.mouseDown = false;
        this.inputState.mouseJustPressed = false;
      } else if (e.button === 1) {
        this.inputState.mouseMiddlePressed = false;
      }
    });

    window.addEventListener('wheel', (e) => {
      if (this.player && !this.player.isDead) {
        this.player.nextWeapon();
      }
    });

    // UI Buttons
    document.getElementById('btn-start').addEventListener('click', () => {
      this.audio.init();
      document.getElementById('start-screen').classList.add('hidden');
      this.startNewGame();
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      this.hud.hideGameOver();
      this.startNewGame();
    });

    const btnGameoverMenu = document.getElementById('btn-gameover-menu');
    if (btnGameoverMenu) {
      btnGameoverMenu.addEventListener('click', () => {
        this.returnToMainMenu();
      });
    }
  }

  initMenuAudio() {
    const startAudio = () => {
      if (this.audio) {
        this.audio.init();
        if (this.gameState === 'MENU') {
          this.audio.playMenuMusic(1.0);
        }
      }
    };

    // Attempt instant autoplay if browser permits
    if (this.audio) {
      this.audio.playMenuMusic(1.0);
    }

    // Modern browsers require a user interaction gesture first
    const onFirstGesture = () => {
      startAudio();
      window.removeEventListener('click', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('pointerdown', onFirstGesture);
    };

    window.addEventListener('click', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    window.addEventListener('pointerdown', onFirstGesture);
  }

  initUI() {
    // Menu Difficulty Button & Modal Close
    const btnMenuDiff = document.getElementById('btn-menu-difficulty');
    if (btnMenuDiff) {
      btnMenuDiff.addEventListener('click', () => {
        this.openDifficultyScreen();
      });
    }

    const btnCloseDiff = document.getElementById('btn-close-difficulty');
    if (btnCloseDiff) {
      btnCloseDiff.addEventListener('click', () => {
        this.closeDifficultyScreen();
      });
    }

    // Menu Upgrades / Armory Button
    const btnMenuUpgrades = document.getElementById('btn-menu-upgrades');
    if (btnMenuUpgrades) {
      btnMenuUpgrades.addEventListener('click', () => {
        this.openUpgradesScreen();
      });
    }

    const btnCloseUpgrades = document.getElementById('btn-close-upgrades');
    if (btnCloseUpgrades) {
      btnCloseUpgrades.addEventListener('click', () => {
        this.closeUpgradesScreen();
      });
    }

    // Perk Upgrade Purchase Buttons in Armory
    const btnUpNugi = document.getElementById('btn-upgrade-nugi');
    if (btnUpNugi) {
      btnUpNugi.addEventListener('click', () => {
        this.buyNugiUpgrade();
      });
    }

    const btnUpSpodi = document.getElementById('btn-upgrade-spodi');
    if (btnUpSpodi) {
      btnUpSpodi.addEventListener('click', () => {
        this.buySpodiUpgrade();
      });
    }

    // Menu Career Stats Button
    const btnMenuStats = document.getElementById('btn-menu-stats');
    if (btnMenuStats) {
      btnMenuStats.addEventListener('click', () => {
        this.openStatsScreen();
      });
    }

    const btnCloseStats = document.getElementById('btn-close-stats');
    if (btnCloseStats) {
      btnCloseStats.addEventListener('click', () => {
        this.closeStatsScreen();
      });
    }

    const btnResetStats = document.getElementById('btn-reset-stats');
    if (btnResetStats) {
      btnResetStats.addEventListener('click', () => {
        this.resetCareerStats();
      });
    }

    // Menu Settings Button
    const btnMenuSettings = document.getElementById('btn-menu-settings');
    if (btnMenuSettings) {
      btnMenuSettings.addEventListener('click', () => {
        this.openSettings('MENU');
      });
    }

    // Pause Screen Buttons
    const btnResume = document.getElementById('btn-resume');
    if (btnResume) {
      btnResume.addEventListener('click', () => {
        this.resumeGame();
      });
    }

    const btnPauseSettings = document.getElementById('btn-pause-settings');
    if (btnPauseSettings) {
      btnPauseSettings.addEventListener('click', () => {
        this.openSettings('PAUSED');
      });
    }

    const btnQuitMain = document.getElementById('btn-quit-main');
    if (btnQuitMain) {
      btnQuitMain.addEventListener('click', () => {
        this.returnToMainMenu();
      });
    }

    // Settings Modal Back Button
    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => {
        this.closeSettings();
      });
    }

    // Volume Sliders
    const sMaster = document.getElementById('slider-master-volume');
    const lblMaster = document.getElementById('label-master-volume');
    if (sMaster) {
      sMaster.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        lblMaster.textContent = `${val}%`;
        this.audio.setMasterVolume(val / 100);
      });
    }

    const sMusic = document.getElementById('slider-music-volume');
    const lblMusic = document.getElementById('label-music-volume');
    if (sMusic) {
      sMusic.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        lblMusic.textContent = `${val}%`;
        this.audio.setMusicVolume(val / 100);
      });
    }

    const sSfx = document.getElementById('slider-sfx-volume');
    const lblSfx = document.getElementById('label-sfx-volume');
    if (sSfx) {
      sSfx.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        lblSfx.textContent = `${val}%`;
        this.audio.setSfxVolume(val / 100);
      });
    }

    const sAmb = document.getElementById('slider-ambience-volume');
    const lblAmb = document.getElementById('label-ambience-volume');
    if (sAmb) {
      sAmb.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        lblAmb.textContent = `${val}%`;
        this.audio.setAmbienceVolume(val / 100);
      });
    }

    // Menu Cheats Button
    const btnMenuCheats = document.getElementById('btn-menu-cheats');
    if (btnMenuCheats) {
      btnMenuCheats.addEventListener('click', () => {
        this.openCheats('MENU');
      });
    }

    const btnPauseCheats = document.getElementById('btn-pause-cheats');
    if (btnPauseCheats) {
      btnPauseCheats.addEventListener('click', () => {
        this.openCheats('PAUSED');
      });
    }

    const btnCloseCheats = document.getElementById('btn-close-cheats');
    if (btnCloseCheats) {
      btnCloseCheats.addEventListener('click', () => {
        this.closeCheats();
      });
    }

    // Cheats: God Mode Toggle
    const toggleGodMode = document.getElementById('cheat-toggle-godmode');
    if (toggleGodMode) {
      toggleGodMode.addEventListener('change', (e) => {
        this.cheats.godMode = e.target.checked;
        if (this.player) {
          this.player.isGodMode = this.cheats.godMode;
          if (this.cheats.godMode) {
            this.player.health = this.player.maxHealth;
            this.particles.addFloatingText('GOD MODE: ON', this.player.x, this.player.y - 25, '#ffd700', true);
          }
        }
      });
    }

    // Cheats: Infinite Ammo Toggle
    const toggleInfAmmo = document.getElementById('cheat-toggle-infammo');
    if (toggleInfAmmo) {
      toggleInfAmmo.addEventListener('change', (e) => {
        this.cheats.infiniteAmmo = e.target.checked;
        if (this.player) {
          this.player.isInfiniteAmmo = this.cheats.infiniteAmmo;
          if (this.cheats.infiniteAmmo) {
            for (const w of this.player.weapons) {
              w.refillMaxAmmo();
            }
            this.particles.addFloatingText('INFINITE AMMO: ON', this.player.x, this.player.y - 25, '#7cff7c', true);
          }
        }
      });
    }

    // Cheats: Add Points Buttons
    const btnAdd1k = document.getElementById('cheat-btn-add-points-1k');
    if (btnAdd1k) {
      btnAdd1k.addEventListener('click', () => {
        if (this.player) {
          this.player.addScore(1000);
          this.particles.addFloatingText('+1000 $', this.player.x, this.player.y - 20, '#ffd700');
          this.audio.playPurchase();
        }
      });
    }

    const btnAdd10k = document.getElementById('cheat-btn-add-points-10k');
    if (btnAdd10k) {
      btnAdd10k.addEventListener('click', () => {
        if (this.player) {
          this.player.addScore(10000);
          this.particles.addFloatingText('+10000 $', this.player.x, this.player.y - 20, '#ffd700');
          this.audio.playPurchase();
        }
      });
    }

    const btnAdd100k = document.getElementById('cheat-btn-add-points-100k');
    if (btnAdd100k) {
      btnAdd100k.addEventListener('click', () => {
        if (this.player) {
          this.player.addScore(100000);
          this.particles.addFloatingText('+100000 $', this.player.x, this.player.y - 20, '#ffd700');
          this.audio.playPurchase();
        }
      });
    }

    const btnAddBc500 = document.getElementById('cheat-btn-add-bc-500');
    if (btnAddBc500) {
      btnAddBc500.addEventListener('click', () => {
        this.progression.addBc(500);
        this.updateMainMenuProfile();
        this.audio.playPurchase();
        if (this.player) {
          this.particles.addFloatingText('+500 BC', this.player.x, this.player.y - 20, '#f5c518');
        }
      });
    }

    const btnAddBc2500 = document.getElementById('cheat-btn-add-bc-2500');
    if (btnAddBc2500) {
      btnAddBc2500.addEventListener('click', () => {
        this.progression.addBc(2500);
        this.updateMainMenuProfile();
        this.audio.playPurchase();
        if (this.player) {
          this.particles.addFloatingText('+2500 BC', this.player.x, this.player.y - 20, '#f5c518');
        }
      });
    }

    // Cheats: Weapon Spawner Buttons
    document.querySelectorAll('.cheat-weapon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const weaponId = e.currentTarget.getAttribute('data-weapon');
        if (this.player && weaponId) {
          this.player.giveWeapon(weaponId);
          this.audio.playPurchase();
          this.particles.addFloatingText(`EQUIPPED: ${weaponId.toUpperCase()}`, this.player.x, this.player.y - 25, '#55ffaa');
          this.updateDevCheatsPapUI();
        }
      });
    });

    // Cheats: Pack-a-Punch Controls
    const btnPapUpgrade = document.getElementById('cheat-btn-pap-upgrade');
    if (btnPapUpgrade) {
      btnPapUpgrade.addEventListener('click', () => {
        if (!this.player) return;
        const wep = this.player.getCurrentWeapon();
        const newTier = wep.upgradePackAPunch();
        if (this.audio) this.audio.playPackAPunch(newTier);
        const roman = ['', 'I', 'II', 'III'][newTier];
        const color = newTier === 3 ? '#ffd700' : (newTier === 2 ? '#00e5ff' : '#d855ff');
        this.particles.addFloatingText(`★ ${wep.name.toUpperCase()} [PAP ${roman}] ★`, this.player.x, this.player.y - 28, color, true);
        this.updateDevCheatsPapUI();
      });
    }

    const btnPapReset = document.getElementById('cheat-btn-pap-reset');
    if (btnPapReset) {
      btnPapReset.addEventListener('click', () => {
        if (!this.player) return;
        const wep = this.player.getCurrentWeapon();
        wep.resetPackAPunch();
        if (this.audio) this.audio.playMetallicClick(0.5, 1200, 0.05);
        this.particles.addFloatingText(`${wep.name} (RESET TO STANDARD)`, this.player.x, this.player.y - 20, '#aaaaaa');
        this.updateDevCheatsPapUI();
      });
    }

    document.querySelectorAll('.cheat-pap-tier-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!this.player) return;
        const targetTier = parseInt(e.currentTarget.getAttribute('data-tier'), 10);
        const wep = this.player.getCurrentWeapon();
        wep.upgradePackAPunch(targetTier);
        if (this.audio) this.audio.playPackAPunch(targetTier);
        const roman = ['', 'I', 'II', 'III'][targetTier];
        const color = targetTier === 3 ? '#ffd700' : (targetTier === 2 ? '#00e5ff' : '#d855ff');
        this.particles.addFloatingText(`★ ${wep.name.toUpperCase()} [PAP ${roman}] ★`, this.player.x, this.player.y - 28, color, true);
        this.updateDevCheatsPapUI();
      });
    });

    const btnPapAllMax = document.getElementById('cheat-btn-pap-all-max');
    if (btnPapAllMax) {
      btnPapAllMax.addEventListener('click', () => {
        if (!this.player) return;
        for (const w of this.player.weapons) {
          w.upgradePackAPunch(3);
        }
        if (this.audio) this.audio.playPackAPunch(3);
        this.particles.addFloatingText(`★ ALL WEAPONS UPGRADED TO TIER 3 (MAX)! ★`, this.player.x, this.player.y - 28, '#ffd700', true);
        this.updateDevCheatsPapUI();
      });
    }

    // Cheats: Give Perks
    const btnGiveNugi = document.getElementById('cheat-btn-give-nugi');
    if (btnGiveNugi) {
      btnGiveNugi.addEventListener('click', () => {
        if (this.player) {
          this.player.applyNugi();
          this.audio.playNugi();
          this.particles.addFloatingText('NUGI PERK ADDED', this.player.x, this.player.y - 20, '#ff4444');
        }
      });
    }

    const btnGiveSpodi = document.getElementById('cheat-btn-give-spodi');
    if (btnGiveSpodi) {
      btnGiveSpodi.addEventListener('click', () => {
        if (this.player) {
          this.player.applySpodi();
          this.audio.playSpodi();
          this.particles.addFloatingText('SPODI PERK ADDED', this.player.x, this.player.y - 20, '#33ffaa');
        }
      });
    }

    // Cheats: World & Teleport
    const btnTeleportUnderground = document.getElementById('cheat-btn-teleport-underground');
    if (btnTeleportUnderground) {
      btnTeleportUnderground.addEventListener('click', () => {
        if (!this.player || this.player.isDead) return;
        if (this.map.debrisDoor) this.map.debrisDoor.opened = true;
        if (this.map.armoryDebris) this.map.armoryDebris.opened = true;
        if (this.map.stairsDebris) this.map.stairsDebris.opened = true;
        this.player.x = 1070;
        this.player.y = 1530;
        this.camera.x = this.player.x - this.viewportWidth / 2;
        this.camera.y = this.player.y - this.viewportHeight / 2;
        this.particles.addFloatingText('★ TELEPORTED TO PACK-A-PUNCH LAB ★', this.player.x, this.player.y - 28, '#d855ff', true);
        if (this.audio) this.audio.playMetallicClick(0.5, 1600);
      });
    }

    const btnOpenAllDoors = document.getElementById('cheat-btn-open-all-doors');
    if (btnOpenAllDoors) {
      btnOpenAllDoors.addEventListener('click', () => {
        if (this.map.debrisDoor) this.map.debrisDoor.opened = true;
        if (this.map.armoryDebris) this.map.armoryDebris.opened = true;
        if (this.map.southDoor) this.map.southDoor.opened = true;
        if (this.map.stairsDebris) this.map.stairsDebris.opened = true;
        if (this.player) {
          this.particles.addFloatingText('ALL BARRICADES & DOORS OPENED', this.player.x, this.player.y - 24, '#ffd700');
        }
        if (this.audio) this.audio.playDebrisClear();
      });
    }

    // Flashlight & Safe Mode Toggle in Settings
    const toggleFlashlight = document.getElementById('toggle-flashlight');
    if (toggleFlashlight) {
      toggleFlashlight.addEventListener('change', (e) => {
        if (this.lighting) {
          this.lighting.flashlightEnabled = e.target.checked;
        }
      });
    }

    // Mobile & Touch Controls Settings
    const selectTouchMode = document.getElementById('select-touch-mode');
    if (selectTouchMode && this.mobileControls) {
      selectTouchMode.value = this.mobileControls.mode || 'auto';
      selectTouchMode.addEventListener('change', (e) => {
        if (this.mobileControls) {
          this.mobileControls.setMode(e.target.value);
        }
      });
    }

    const toggleAimAssist = document.getElementById('toggle-aim-assist');
    if (toggleAimAssist && this.mobileControls) {
      toggleAimAssist.checked = this.mobileControls.aimAssistEnabled;
      toggleAimAssist.addEventListener('change', (e) => {
        if (this.mobileControls) {
          this.mobileControls.setAimAssist(e.target.checked);
        }
      });
    }

    // Initialize Difficulty Selector Buttons
    this.initDifficultyUI();
  }

  initDifficultyUI() {
    const diffButtons = document.querySelectorAll('.diff-btn');
    diffButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = btn.getAttribute('data-diff');
        this.progression.setDifficulty(diff);
        this.updateDifficultyUI();
        this.audio.playMetallicClick(0.35, 1800, 0.05);
      });
    });
    this.updateDifficultyUI();
  }

  updateDifficultyUI() {
    const diff = this.progression.selectedDifficulty || 'NORMAL';

    const btnNormal = document.getElementById('diff-btn-normal');
    const btnHard = document.getElementById('diff-btn-hard');
    const btnNightmare = document.getElementById('diff-btn-nightmare');
    const iconHard = document.getElementById('diff-icon-hard');
    const iconNightmare = document.getElementById('diff-icon-nightmare');
    const hintEl = document.getElementById('diff-unlock-hint');

    if (btnNormal) {
      btnNormal.className = `diff-btn ${diff === 'NORMAL' ? 'active' : ''}`;
    }

    if (btnHard) {
      btnHard.className = `diff-btn ${diff === 'HARD' ? 'active diff-hard' : ''}`;
      if (iconHard) iconHard.textContent = '🟡';
    }

    if (btnNightmare) {
      btnNightmare.className = `diff-btn ${diff === 'NIGHTMARE' ? 'active diff-nightmare' : ''}`;
      if (iconNightmare) iconNightmare.textContent = '🔴';
    }

    if (hintEl) {
      if (diff === 'NIGHTMARE') {
        hintEl.innerHTML = '<b style="color:#ff5555">NIGHTMARE:</b> Sprinters, dense hordes, flashlight only.';
      } else if (diff === 'HARD') {
        hintEl.innerHTML = '<b style="color:#ffcc00">HARD:</b> Fast zombies, denser hordes, fully lit.';
      } else {
        hintEl.innerHTML = '<b style="color:#55ff77">NORMAL:</b> Standard waves, balanced speed, fully lit.';
      }
    }

    // Update in-game HUD badge
    this.hud.updateDifficultyBadge(diff);

    // Update main menu indicator
    const curDiffEl = document.getElementById('menu-current-diff');
    if (curDiffEl) {
      curDiffEl.textContent = `[${diff === 'NIGHTMARE' ? 'NIGHTMARE' : (diff === 'HARD' ? 'HARD' : 'NORMAL')}]`;
    }
  }

  openDifficultyScreen() {
    const diffScreen = document.getElementById('difficulty-screen');
    if (diffScreen) diffScreen.classList.remove('hidden');
    this.updateDifficultyUI();
    if (this.audio) this.audio.playMetallicClick(0.3, 1400);
  }

  closeDifficultyScreen() {
    const diffScreen = document.getElementById('difficulty-screen');
    if (diffScreen) diffScreen.classList.add('hidden');
    this.updateDifficultyUI();
    if (this.audio) this.audio.playMetallicClick(0.3, 1200);
  }

  pauseGame() {
    if (this.gameState !== 'PLAYING') return;
    this.gameState = 'PAUSED';
    document.getElementById('pause-screen').classList.remove('hidden');
    if (this.mobileControls) this.mobileControls.onGamePause();
  }

  resumeGame() {
    if (this.gameState !== 'PAUSED') return;
    this.gameState = 'PLAYING';
    document.getElementById('pause-screen').classList.add('hidden');
    this.lastTime = performance.now();
    if (this.mobileControls) this.mobileControls.onGameResume();
  }

  openSettings(fromState = 'MENU') {
    this.previousStateBeforeSettings = fromState;
    if (fromState === 'PAUSED') {
      document.getElementById('pause-screen').classList.add('hidden');
    }
    document.getElementById('settings-screen').classList.remove('hidden');
    if (this.audio) this.audio.playMetallicClick(0.3, 1400);
  }

  closeSettings() {
    document.getElementById('settings-screen').classList.add('hidden');
    if (this.previousStateBeforeSettings === 'MENU') {
      document.getElementById('start-screen').classList.remove('hidden');
    } else if (this.previousStateBeforeSettings === 'PAUSED') {
      document.getElementById('pause-screen').classList.remove('hidden');
    }
    if (this.audio) this.audio.playMetallicClick(0.3, 1200);
  }

  openCheats(fromState = 'MENU') {
    this.previousStateBeforeCheats = fromState;
    if (fromState === 'PAUSED') {
      document.getElementById('pause-screen').classList.add('hidden');
    } else if (fromState === 'PLAYING') {
      this.gameState = 'PAUSED';
    }
    // Update checkboxes state
    const toggleGodMode = document.getElementById('cheat-toggle-godmode');
    if (toggleGodMode) toggleGodMode.checked = this.cheats.godMode;
    const toggleInfAmmo = document.getElementById('cheat-toggle-infammo');
    if (toggleInfAmmo) toggleInfAmmo.checked = this.cheats.infiniteAmmo;

    document.getElementById('cheats-screen').classList.remove('hidden');
    this.updateDevCheatsPapUI();
    if (this.audio) this.audio.playMetallicClick(0.3, 1400);
  }

  updateDevCheatsPapUI() {
    const activeWepNameEl = document.getElementById('pap-active-weapon-name');
    const activeTierBadgeEl = document.getElementById('pap-active-tier-badge');
    const detailsEl = document.getElementById('pap-status-details');
    const btnUpgrade = document.getElementById('cheat-btn-pap-upgrade');
    const btnReset = document.getElementById('cheat-btn-pap-reset');
    const tierButtons = document.querySelectorAll('.cheat-pap-tier-btn');
    const btnAllMax = document.getElementById('cheat-btn-pap-all-max');

    if (!this.player) {
      if (activeWepNameEl) activeWepNameEl.textContent = 'GAME NOT STARTED';
      if (activeTierBadgeEl) {
        activeTierBadgeEl.className = 'pap-badge tier-0';
        activeTierBadgeEl.textContent = 'AWAITING SPAWN';
      }
      if (detailsEl) detailsEl.textContent = 'Start game or equip a weapon to inspect.';
      if (btnUpgrade) btnUpgrade.disabled = true;
      if (btnReset) btnReset.disabled = true;
      if (btnAllMax) btnAllMax.disabled = true;
      tierButtons.forEach(b => b.disabled = true);
      return;
    }

    if (btnReset) btnReset.disabled = false;
    if (btnAllMax) btnAllMax.disabled = false;
    tierButtons.forEach(b => b.disabled = false);

    const wep = this.player.getCurrentWeapon();
    const tier = wep.papLevel || 0;

    if (activeWepNameEl) activeWepNameEl.textContent = wep.name;
    if (activeTierBadgeEl) {
      activeTierBadgeEl.className = `pap-badge tier-${tier}`;
      if (tier === 0) activeTierBadgeEl.textContent = 'STANDARD (TIER 0)';
      else if (tier === 1) activeTierBadgeEl.textContent = 'PACK-A-PUNCH I';
      else if (tier === 2) activeTierBadgeEl.textContent = 'PACK-A-PUNCH II';
      else if (tier === 3) activeTierBadgeEl.textContent = 'PACK-A-PUNCH III (MAX)';
    }

    if (detailsEl) {
      let dmgText = `Damage: ${wep.config.damage}`;
      if (wep.config.pellets > 1) {
        dmgText += ` x ${wep.config.pellets} (Total ${wep.config.damage * wep.config.pellets})`;
      }
      let extras = [];
      if (wep.config.splashRadius) extras.push(`Explosion: ${wep.config.splashRadius}px`);
      if (wep.config.pierce) extras.push(`Pierce: ${wep.config.pierce} Zombies`);
      if (wep.config.automatic) extras.push(`Full Auto`);

      detailsEl.textContent = `${dmgText} | Mag: ${wep.config.magSize} | Reserve: ${wep.config.maxReserve} | Fire Rate: ${(1 / wep.config.fireRate).toFixed(1)} rps${extras.length > 0 ? ' | ' + extras.join(' | ') : ''}`;
    }

    if (btnUpgrade) {
      if (tier >= 3) {
        btnUpgrade.textContent = '★ MAX TIER (TIER 3) ★';
        btnUpgrade.disabled = true;
      } else {
        btnUpgrade.textContent = `⚡ UPGRADE (TIER ${tier + 1})`;
        btnUpgrade.disabled = false;
      }
    }
  }

  closeCheats() {
    document.getElementById('cheats-screen').classList.add('hidden');
    if (this.previousStateBeforeCheats === 'MENU') {
      document.getElementById('start-screen').classList.remove('hidden');
    } else if (this.previousStateBeforeCheats === 'PAUSED') {
      document.getElementById('pause-screen').classList.remove('hidden');
    } else if (this.previousStateBeforeCheats === 'PLAYING') {
      this.gameState = 'PLAYING';
      this.lastTime = performance.now();
    }
    if (this.audio) this.audio.playMetallicClick(0.3, 1200);
  }

  updateMainMenuProfile() {
    const bcEl = document.getElementById('menu-bc-amount');
    if (bcEl) bcEl.textContent = this.progression.getBc().toLocaleString();

    const rank = this.progression.getMilitaryRank();
    const rankTitleEl = document.getElementById('menu-rank-title');
    const rankBadgeEl = document.getElementById('menu-rank-badge');
    const rankProgEl = document.getElementById('menu-rank-progress');

    if (rankTitleEl) rankTitleEl.textContent = `${rank.currentRank.title} (RANK ${rank.currentRank.level})`;
    if (rankBadgeEl) rankBadgeEl.textContent = rank.currentRank.badge;
    if (rankProgEl) rankProgEl.style.width = `${rank.progressPct}%`;

    const upWalletEl = document.getElementById('upgrade-wallet-bc');
    if (upWalletEl) upWalletEl.textContent = this.progression.getBc().toLocaleString();
  }

  openUpgradesScreen() {
    document.getElementById('upgrades-screen').classList.remove('hidden');
    this.renderUpgradesUI();
    if (this.audio) this.audio.playMetallicClick(0.3, 1400);
  }

  closeUpgradesScreen() {
    document.getElementById('upgrades-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    this.updateMainMenuProfile();
    if (this.audio) this.audio.playMetallicClick(0.3, 1200);
  }

  renderUpgradesUI() {
    const bc = this.progression.getBc();
    const upWalletEl = document.getElementById('upgrade-wallet-bc');
    if (upWalletEl) upWalletEl.textContent = bc.toLocaleString();

    // 1. Render NUGI Card
    const nugiTier = this.progression.getPerkTier('nugi');
    const nugiData = this.progression.getPerkData('nugi', nugiTier);
    const nugiNext = this.progression.getNextPerkData('nugi');

    const nugiCard = document.getElementById('card-upgrade-nugi');
    const nugiPill = document.getElementById('nugi-tier-pill');
    if (nugiPill) {
      nugiPill.textContent = `TIER ${nugiTier} // ${nugiData.name.toUpperCase()}`;
      nugiPill.className = `current-tier-pill ${nugiData.className}`;
    }

    // Step indicators
    for (let t = 1; t <= 4; t++) {
      const stepEl = nugiCard.querySelector(`.tier-step.tier-${t}`);
      if (stepEl) {
        if (t <= nugiTier) stepEl.classList.add('active');
        else stepEl.classList.remove('active');
      }
    }
    // Connectors
    const nugiC1 = document.getElementById('nugi-conn-1');
    const nugiC2 = document.getElementById('nugi-conn-2');
    const nugiC3 = document.getElementById('nugi-conn-3');
    if (nugiC1) nugiC1.className = `tier-connector ${nugiTier >= 2 ? 'filled-1' : ''}`;
    if (nugiC2) nugiC2.className = `tier-connector ${nugiTier >= 3 ? 'filled-2' : ''}`;
    if (nugiC3) nugiC3.className = `tier-connector ${nugiTier >= 4 ? 'filled-3' : ''}`;

    // Description box
    const nugiDescBox = document.getElementById('nugi-desc-box');
    if (nugiDescBox) {
      nugiDescBox.innerHTML = `
        <div class="desc-active-section" style="border-color: ${nugiData.color};">
          <div class="desc-label" style="color: ${nugiData.color};">CURRENT EFFECT (TIER ${nugiTier}):</div>
          <div class="desc-text">${nugiData.activeDesc}</div>
        </div>
        <div class="desc-next-section">
          <div class="desc-next-title">${nugiNext ? `NEXT TIER (TIER ${nugiNext.tier} - ${nugiNext.name}):` : 'MAX TIER REACHED'}</div>
          <div class="desc-next-text">${nugiNext ? nugiNext.activeDesc : nugiData.nextDesc}</div>
        </div>
      `;
    }

    // Upgrade Button
    const btnUpNugi = document.getElementById('btn-upgrade-nugi');
    const btnUpNugiTxt = document.getElementById('nugi-upgrade-btn-text');
    if (btnUpNugi && btnUpNugiTxt) {
      if (nugiNext) {
        btnUpNugiTxt.textContent = `UPGRADE (${nugiNext.cost.toLocaleString()} BC)`;
        btnUpNugi.disabled = (bc < nugiNext.cost);
      } else {
        btnUpNugiTxt.textContent = 'MAX TIER (FULLY UPGRADED)';
        btnUpNugi.disabled = true;
      }
    }

    // 2. Render SPODI Card
    const spodiTier = this.progression.getPerkTier('spodi');
    const spodiData = this.progression.getPerkData('spodi', spodiTier);
    const spodiNext = this.progression.getNextPerkData('spodi');

    const spodiCard = document.getElementById('card-upgrade-spodi');
    const spodiPill = document.getElementById('spodi-tier-pill');
    if (spodiPill) {
      spodiPill.textContent = `TIER ${spodiTier} // ${spodiData.name.toUpperCase()}`;
      spodiPill.className = `current-tier-pill ${spodiData.className}`;
    }

    // Step indicators
    for (let t = 1; t <= 4; t++) {
      const stepEl = spodiCard.querySelector(`.tier-step.tier-${t}`);
      if (stepEl) {
        if (t <= spodiTier) stepEl.classList.add('active');
        else stepEl.classList.remove('active');
      }
    }
    // Connectors
    const spodiC1 = document.getElementById('spodi-conn-1');
    const spodiC2 = document.getElementById('spodi-conn-2');
    const spodiC3 = document.getElementById('spodi-conn-3');
    if (spodiC1) spodiC1.className = `tier-connector ${spodiTier >= 2 ? 'filled-1' : ''}`;
    if (spodiC2) spodiC2.className = `tier-connector ${spodiTier >= 3 ? 'filled-2' : ''}`;
    if (spodiC3) spodiC3.className = `tier-connector ${spodiTier >= 4 ? 'filled-3' : ''}`;

    // Description box
    const spodiDescBox = document.getElementById('spodi-desc-box');
    if (spodiDescBox) {
      spodiDescBox.innerHTML = `
        <div class="desc-active-section" style="border-color: ${spodiData.color};">
          <div class="desc-label" style="color: ${spodiData.color};">CURRENT EFFECT (TIER ${spodiTier}):</div>
          <div class="desc-text">${spodiData.activeDesc}</div>
        </div>
        <div class="desc-next-section">
          <div class="desc-next-title">${spodiNext ? `NEXT TIER (TIER ${spodiNext.tier} - ${spodiNext.name}):` : 'MAX TIER REACHED'}</div>
          <div class="desc-next-text">${spodiNext ? spodiNext.activeDesc : spodiData.nextDesc}</div>
        </div>
      `;
    }

    // Upgrade Button
    const btnUpSpodi = document.getElementById('btn-upgrade-spodi');
    const btnUpSpodiTxt = document.getElementById('spodi-upgrade-btn-text');
    if (btnUpSpodi && btnUpSpodiTxt) {
      if (spodiNext) {
        btnUpSpodiTxt.textContent = `UPGRADE (${spodiNext.cost.toLocaleString()} BC)`;
        btnUpSpodi.disabled = (bc < spodiNext.cost);
      } else {
        btnUpSpodiTxt.textContent = 'MAX TIER (FULLY UPGRADED)';
        btnUpSpodi.disabled = true;
      }
    }
  }

  buyNugiUpgrade() {
    if (this.progression.upgradePerk('nugi')) {
      this.audio.playPurchase();
      this.renderUpgradesUI();
      this.updateMainMenuProfile();
    } else {
      this.audio.playDryFire();
    }
  }

  buySpodiUpgrade() {
    if (this.progression.upgradePerk('spodi')) {
      this.audio.playPurchase();
      this.renderUpgradesUI();
      this.updateMainMenuProfile();
    } else {
      this.audio.playDryFire();
    }
  }

  openStatsScreen() {
    document.getElementById('stats-screen').classList.remove('hidden');
    this.renderStatsUI();
    if (this.audio) this.audio.playMetallicClick(0.3, 1400);
  }

  closeStatsScreen() {
    document.getElementById('stats-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    this.updateMainMenuProfile();
    if (this.audio) this.audio.playMetallicClick(0.3, 1200);
  }

  renderStatsUI() {
    const stats = this.progression.stats;
    const rank = this.progression.getMilitaryRank();

    // Banner
    const iconEl = document.getElementById('stats-rank-icon');
    const titleEl = document.getElementById('stats-rank-title');
    const barEl = document.getElementById('stats-rank-bar');
    const xpEl = document.getElementById('stats-rank-xp');

    if (iconEl) iconEl.textContent = rank.currentRank.badge;
    if (titleEl) titleEl.textContent = `${rank.currentRank.title} (RANK ${rank.currentRank.level})`;
    if (barEl) barEl.style.width = `${rank.progressPct}%`;
    if (xpEl) {
      if (rank.nextRank) {
        xpEl.textContent = `${rank.xpInCurrent.toLocaleString()} / ${rank.xpNeeded.toLocaleString()} XP (Next: ${rank.nextRank.title})`;
      } else {
        xpEl.textContent = `MAX RANK (${rank.totalXp.toLocaleString()} Total XP)`;
      }
    }

    // Grid cards
    const totalGamesEl = document.getElementById('stat-total-games');
    const bestRoundEl = document.getElementById('stat-best-round');
    const totalKillsEl = document.getElementById('stat-total-kills');
    const totalHeadshotsEl = document.getElementById('stat-total-headshots');
    const headshotPctEl = document.getElementById('stat-headshot-pct');
    const totalScoreEl = document.getElementById('stat-total-score');
    const totalRepairsEl = document.getElementById('stat-total-repairs');
    const totalBcEl = document.getElementById('stat-total-bc-earned');
    const timeSurvivedEl = document.getElementById('stat-time-survived');

    if (totalGamesEl) totalGamesEl.textContent = stats.gamesPlayed.toLocaleString();
    if (bestRoundEl) bestRoundEl.textContent = stats.highestRound.toLocaleString();
    if (totalKillsEl) totalKillsEl.textContent = stats.totalKills.toLocaleString();
    if (totalHeadshotsEl) totalHeadshotsEl.textContent = stats.totalHeadshots.toLocaleString();

    const pct = stats.totalKills > 0 ? Math.round((stats.totalHeadshots / stats.totalKills) * 100) : 0;
    if (headshotPctEl) headshotPctEl.textContent = `${pct}%`;

    if (totalScoreEl) totalScoreEl.textContent = `$${stats.totalScore.toLocaleString()}`;
    if (totalRepairsEl) totalRepairsEl.textContent = stats.totalRepairs.toLocaleString();
    if (totalBcEl) totalBcEl.textContent = `${this.progression.totalBcEarned.toLocaleString()} BC`;

    const mins = Math.floor(stats.totalTimeSurvivedSec / 60);
    const secs = stats.totalTimeSurvivedSec % 60;
    if (timeSurvivedEl) timeSurvivedEl.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }

  resetCareerStats() {
    if (confirm('Reset all career stats and Bullet Coins (BC)? This action cannot be undone.')) {
      this.progression.resetStats();
      this.renderStatsUI();
      this.updateMainMenuProfile();
    }
  }

  returnToMainMenu() {
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('cheats-screen').classList.add('hidden');
    document.getElementById('upgrades-screen').classList.add('hidden');
    document.getElementById('stats-screen').classList.add('hidden');
    const diffScreen = document.getElementById('difficulty-screen');
    if (diffScreen) diffScreen.classList.add('hidden');
    this.hud.hideGameOver();
    document.getElementById('start-screen').classList.remove('hidden');
    this.gameState = 'MENU';
    this.player = null;
    this.zombies = [];
    this.bullets = [];
    this.updateMainMenuProfile();
    if (this.mobileControls) this.mobileControls.onReturnToMenu();
    if (this.audio) {
      this.audio.stopBunkerAmbience();
      this.audio.playMenuMusic(1.0);
    }
  }

  startNewGame() {
    // Close every menu overlay so a run never starts underneath a modal.
    ['start-screen', 'settings-screen', 'upgrades-screen', 'stats-screen', 'cheats-screen', 'pause-screen', 'difficulty-screen'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    this.hud.hideGameOver();
    if (this.audio) {
      this.audio.stopMenuMusic(0.8);
      this.audio.startBunkerAmbience();
    }

    this.map = new BunkerMap();
    this.particles = new ParticleSystem();
    // Spawn player in center of Room 1 with saved perk upgrade tiers
    const perkLevels = {
      nugi: this.progression.getPerkTier('nugi'),
      spodi: this.progression.getPerkTier('spodi')
    };
    this.player = new Player(410, 420, perkLevels);
    this.player.isGodMode = this.cheats.godMode;
    this.player.isInfiniteAmmo = this.cheats.infiniteAmmo;
    this.player.matchStartTime = 0; // Uses the in-game clock, not wall time
    this.gameTime = 0;
    this.map.resolveCollision(this.player, this.player.radius);
    this.zombies = [];
    this.bullets = [];

    // Difficulty Mode Setup
    this.currentDifficulty = this.progression.selectedDifficulty || 'NORMAL';

    // Flashlight & Pitch Darkness Rule:
    // ONLY NIGHTMARE mode activates flashlight cone and pitch-dark bunker rooms!
    if (this.lighting) {
      if (this.currentDifficulty === 'NIGHTMARE') {
        this.lighting.flashlightEnabled = true;
      } else {
        this.lighting.flashlightEnabled = false; // Safe bright illumination
      }
    }

    this.round = 1;
    this.setupRound(1);
    this.gameState = 'PLAYING';
    this.lastTime = performance.now();

    if (this.mobileControls) this.mobileControls.onGameStart();

    this.hud.triggerRoundChange(1);
    this.hud.updateDifficultyBadge(this.currentDifficulty);
    this.audio.playRoundChange();
  }

  setupRound(roundNum) {
    this.round = roundNum;

    // Difficulty multipliers for wave density (fixed for the duration of the match)
    const countMult = this.currentDifficulty === 'NIGHTMARE' ? 1.45 : (this.currentDifficulty === 'HARD' ? 1.25 : 1.0);
    const intervalMult = this.currentDifficulty === 'NIGHTMARE' ? 0.75 : (this.currentDifficulty === 'HARD' ? 0.85 : 1.0);

    // WaW Zombie wave formula
    this.zombiesToSpawn = Math.round((5 + roundNum * 3) * countMult);
    this.zombiesSpawned = 0;
    this.spawnTimer = 0;
    this.spawnInterval = Math.max(0.65, (2.5 - roundNum * 0.15) * intervalMult);
    this.roundState = 'ACTIVE';
    this.map.resetRoundRepairCap();
  }

  spawnZombie() {
    // Pick available windows depending on opened doors. Look windows up by their
    // stable id instead of array index: the array order is not the same as the
    // room order, and using indices spawned zombies in sealed rooms (soft-lock).
    const getWindow = (id) => this.map.windows.find((w) => w.id === id);
    const availableWindows = [1, 2, 3].map(getWindow).filter(Boolean);

    // If Armory is opened: add its east window (4)
    if (this.map.debrisDoor.opened && (!this.map.armoryDebris || this.map.armoryDebris.opened)) {
      const w = getWindow(4);
      if (w) availableWindows.push(w);
    }

    // If Sub-Bunker Generator Lab is opened: add its west (6) and south (7) windows
    if (this.map.southDoor && this.map.southDoor.opened) {
      [6, 7].forEach((id) => { const w = getWindow(id); if (w) availableWindows.push(w); });
    }

    // If Sub-Level B2 (Alt Kat) is opened: add windows 5, 8 and 9
    if (this.map.stairsDebris && this.map.stairsDebris.opened) {
      [5, 8, 9].forEach((id) => { const w = getWindow(id); if (w) availableWindows.push(w); });
    }

    const randomWin = availableWindows[Math.floor(Math.random() * availableWindows.length)];
    const zombie = new Zombie(randomWin, this.round, this.currentDifficulty);
    this.zombies.push(zombie);
    this.zombiesSpawned++;
  }

  handlePowerup(type) {
    this.audio.playPowerup();
    if (type === 'MAX_AMMO') {
      for (const w of this.player.weapons) {
        w.refillMaxAmmo();
      }
      this.particles.addFloatingText('MAX AMMO!', this.player.x, this.player.y - 25, '#7cff7c', true);
    } else if (type === 'INSTA_KILL') {
      this.player.powerups.INSTA_KILL = 30.0;
      this.particles.addFloatingText('INSTA-KILL!', this.player.x, this.player.y - 25, '#ff4444', true);
    } else if (type === 'DOUBLE_POINTS') {
      this.player.powerups.DOUBLE_POINTS = 30.0;
      this.particles.addFloatingText('DOUBLE POINTS!', this.player.x, this.player.y - 25, '#ffd700', true);
    } else if (type === 'NUKE') {
      this.audio.playNuke();
      this.lighting.addExplosionFlash(this.player.x, this.player.y, 600);
      let nukeKills = 0;
      for (const z of this.zombies) {
        if (z.alive) {
          z.alive = false;
          nukeKills++;
          this.particles.addBloodSplatter(z.x, z.y, Math.random() * Math.PI * 2, 2.0);
          this.particles.addZombieGibs(z.x, z.y, Math.random() * Math.PI * 2, false, 'nuke');
        }
      }
      // Nuke kills must count towards the match stats and BC payout.
      this.player.kills += nukeKills;
      this.audio.playFleshRip(false, true);
      this.player.screenShake = Math.max(this.player.screenShake, 14.0);
      this.player.addScore(400);
      this.particles.addFloatingText('NUKE! +400', this.player.x, this.player.y - 25, '#ffffff', true);
    }
  }

  // Combat collision & bullet callbacks
  handleBulletHit(hitInfo) {
    if (hitInfo.type === 'wall') {
      this.audio.playMetallicClick(0.3, 1400, 0.04);
      this.particles.addWallSparks(hitInfo.x, hitInfo.y, hitInfo.angle);

      // If explosive round or Ray Gun, detonate splash damage
      if (hitInfo.splashRadius && hitInfo.splashRadius > 0) {
        this.detonateExplosiveSplash(
          hitInfo.x,
          hitInfo.y,
          hitInfo.splashRadius,
          hitInfo.damage,
          hitInfo.isRayGun,
          hitInfo.papLevel || 0,
          hitInfo.weaponId || 'm1911'
        );
      }
    } else if (hitInfo.type === 'zombie') {
      const z = hitInfo.zombie;

      if (hitInfo.splashRadius && hitInfo.splashRadius > 0) {
        this.detonateExplosiveSplash(
          hitInfo.x,
          hitInfo.y,
          hitInfo.splashRadius,
          hitInfo.damage,
          hitInfo.isRayGun,
          hitInfo.papLevel || 0,
          hitInfo.weaponId || 'm1911',
          z,
          hitInfo.isHeadshot
        );
      } else {
        const result = z.takeDamage(hitInfo.damage, hitInfo.angle, hitInfo.isHeadshot, this.audio, this.particles, this.hud, hitInfo.weaponId);

        if (result.killed) {
          this.player.kills++;

          // Visceral hit feel on kill: camera punch & micro-hitstop
          const isShotgun = hitInfo.weaponId === 'shotgun';
          this.player.screenShake = Math.max(this.player.screenShake, result.isHeadshot ? 7.5 : (isShotgun ? 9.5 : 4.5));
          this.hitStopTimer = result.isHeadshot ? 0.038 : (isShotgun ? 0.035 : 0.024);

          let earnedScore = 60;
          let label = '+60';
          if (result.isHeadshot) {
            this.player.headshots++;
            earnedScore = 100;
            label = '+100 HEADSHOT!';
          }

          const finalPts = this.player.addScore(earnedScore);
          const textColor = (hitInfo.papLevel === 3) ? '#ffd700' : ((hitInfo.papLevel === 2) ? '#00e5ff' : ((hitInfo.papLevel === 1) ? '#d855ff' : (result.isHeadshot ? '#ffdd55' : '#e5ecd8')));
          this.particles.addFloatingText(label, z.x, z.y - 10, textColor, result.isHeadshot);

          // 3.5% chance to spawn iconic power-up
          if (Math.random() < 0.035) {
            this.map.spawnPowerup(z.x, z.y);
          }
        } else {
          // Standard hit score (+10) and responsive screen punch
          this.player.screenShake = Math.max(this.player.screenShake, 1.4);
          const finalPts = this.player.addScore(10);
          this.particles.addFloatingText(`+${finalPts}`, z.x, z.y - 10, '#bbf08b');
        }
      }
    }
  }

  detonateExplosiveSplash(x, y, radius, damage, isRayGun = false, papLevel = 0, weaponId = 'raygun', directZombie = null, isHeadshot = false) {
    if (isRayGun) {
      this.particles.addRayGunExplosion(x, y);
    } else {
      this.particles.addPackAPunchExplosion(x, y, radius, papLevel);
      if (this.audio) this.audio.playMiniExplosion();
    }
    this.lighting.addExplosionFlash(x, y, radius * 2.1);

    for (const z of this.zombies) {
      if (!z.alive) continue;
      const dist = Math.hypot(z.x - x, z.y - y);
      if (dist <= radius) {
        const isDirect = (z === directZombie);
        const falloff = 1 - (dist / radius);
        let actualDamage = isDirect ? damage : (damage * Math.max(0.35, falloff));
        if (isDirect && isHeadshot) {
          actualDamage *= 1.5;
        }

        const angle = Math.atan2(z.y - y, z.x - x);
        const res = z.takeDamage(actualDamage, angle, isDirect && isHeadshot, this.audio, this.particles, this.hud, weaponId);

        if (res.killed) {
          this.player.kills++;
          if (res.isHeadshot) this.player.headshots++;
          this.player.screenShake = Math.max(this.player.screenShake, isDirect ? 8.5 : 5.0);
          this.hitStopTimer = 0.030;

          const finalPts = this.player.addScore(res.isHeadshot ? 100 : 60);
          const textColor = papLevel === 3 ? '#ffd700' : (papLevel === 2 ? '#00e5ff' : (papLevel === 1 ? '#d855ff' : '#33ff77'));
          this.particles.addFloatingText(`+${finalPts}${res.isHeadshot ? ' HEADSHOT!' : ''}`, z.x, z.y - 10, textColor, res.isHeadshot);

          if (Math.random() < 0.035) {
            this.map.spawnPowerup(z.x, z.y);
          }
        } else {
          this.player.screenShake = Math.max(this.player.screenShake, 1.5);
          this.player.addScore(10);
        }
      }
    }
  }

  detonateRayGunSplash(x, y, radius, damage) {
    this.detonateExplosiveSplash(x, y, radius, damage, true, 0, 'raygun');
  }

  // Melee Knife Hit Check
  checkKnifeHits() {
    // Only one damage window per swing: without the knifeHasHit guard this ran
    // every frame during the first 40% of the animation (~8x damage + sound spam).
    if (!this.player.isKnifing || this.player.knifeHasHit) return;
    if (this.player.knifeProgress < 0.15) return;

    this.player.knifeHasHit = true;

    for (const z of this.zombies) {
      if (!z.alive) continue;

      const dx = z.x - this.player.x;
      const dy = z.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= 52) {
        const angleToZombie = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToZombie - this.player.angle);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        angleDiff = Math.abs(angleDiff);

        if (angleDiff <= Math.PI * 0.35) {
          // Hit zombie with knife!
          this.audio.playKnife(true);
          const isInsta = this.player.powerups.INSTA_KILL > 0;
          const res = z.takeDamage(isInsta ? 99999 : 150, this.player.angle, false, this.audio, this.particles, this.hud, 'knife');

          if (res.killed) {
            this.player.kills++;
            this.player.screenShake = Math.max(this.player.screenShake, 8.5);
            this.hitStopTimer = 0.035;
            // Knife kill awards +130 points!
            const pts = this.player.addScore(130);
            this.particles.addFloatingText(`+${pts} KNIFE!`, z.x, z.y - 15, '#ff4444', true);

            if (Math.random() < 0.04) {
              this.map.spawnPowerup(z.x, z.y);
            }
          } else {
            this.player.screenShake = Math.max(this.player.screenShake, 2.0);
            this.player.addScore(10);
          }
        }
      }
    }
  }

  update(dt) {
    if (this.gameState !== 'PLAYING') return;

    if (this.mobileControls) {
      this.mobileControls.update();
    }

    this.gameTime += dt;
    const nowSec = this.gameTime;

    // 1. Update Player
    this.player.update(
      dt,
      this.inputState,
      this.map,
      this.camera,
      this.audio,
      this.particles,
      this.lighting,
      (newBullet) => this.bullets.push(newBullet),
      nowSec
    );

    // Melee attack hit registration
    this.checkKnifeHits();

    // Reset single-frame inputs
    this.inputState.mouseJustPressed = false;
    this.inputState.mouseMiddlePressed = false;
    this.inputState.fJustPressed = false;

    // Check Player Death
    if (this.player.isDead) {
      this.gameState = 'GAMEOVER';
      if (this.mobileControls) {
        this.mobileControls.onGameOver();
      }

      const matchDuration = Math.max(1, Math.round(this.gameTime - (this.player.matchStartTime || 0)));

      // Calculate BC Loot
      const killsBc = this.player.kills * 1;
      const headshotsBc = this.player.headshots * 1;
      let roundsBc = 0;
      for (let r = 1; r <= this.round; r++) {
        roundsBc += (10 + r * 2);
      }
      const repairsBc = Math.floor(this.player.windowsRepaired / 5);
      const totalMatchBc = killsBc + headshotsBc + roundsBc + repairsBc;

      // Save to persistent RPG progression
      this.progression.recordGame({
        rounds: this.round,
        kills: this.player.kills,
        headshots: this.player.headshots,
        score: this.player.totalScoreEarned,
        repairs: this.player.windowsRepaired,
        durationSec: matchDuration,
        earnedBc: totalMatchBc
      });

      const matchLoot = {
        killsBc,
        headshotsBc,
        roundsBc,
        repairsBc,
        totalBc: totalMatchBc
      };

      this.hud.showGameOver(this.player, this.round, matchLoot, this.progression.getBc());
      this.updateMainMenuProfile();
      return;
    }

    // 2. Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(dt, this.map, this.zombies, (hitInfo) => this.handleBulletHit(hitInfo));
      if (!b.alive) {
        this.bullets.splice(i, 1);
      }
    }

    // 3. Update Zombies & Pathfinding Grid
    this.map.updateNav(this.player.x, this.player.y);
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      // Prune dead zombies so late rounds don't keep iterating hundreds of corpses.
      if (!z.alive) {
        this.zombies.splice(i, 1);
        continue;
      }
      z.update(dt, this.player, this.map, this.zombies, this.audio, this.particles, nowSec);
    }

    // 4. Wave Management
    if (this.roundState === 'ACTIVE') {
      if (this.zombiesSpawned < this.zombiesToSpawn) {
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
          this.spawnTimer = 0;
          this.spawnZombie();
        }
      } else {
        // All zombies spawned, check if all dead (the array only holds living ones)
        if (this.zombies.length === 0) {
          this.roundState = 'INTERMISSION';
          this.intermissionTimer = 0;
        }
      }
    } else if (this.roundState === 'INTERMISSION') {
      this.intermissionTimer += dt;
      if (this.intermissionTimer >= this.intermissionDuration) {
        this.setupRound(this.round + 1);
        this.hud.triggerRoundChange(this.round);
        this.audio.playRoundChange();
      }
    }

    // 5. Update Map Objects & Powerups
    this.map.updateMysteryBox(dt, this.audio);
    this.map.updatePackAPunch(dt, this.audio, this.particles);
    this.map.updatePowerups(dt, this.player, (type) => this.handlePowerup(type));
    this.map.updateFog(dt, this.particles);

    // 6. Update Particles & Lighting
    this.particles.update(dt);
    this.lighting.update(dt);

    // 7. Camera follow with look-ahead & screen shake
    const targetCamX = this.player.x - this.viewportWidth / 2 + (this.inputState.mouseX - this.viewportWidth / 2) * 0.15;
    const targetCamY = this.player.y - this.viewportHeight / 2 + (this.inputState.mouseY - this.viewportHeight / 2) * 0.15;

    // Smooth camera interpolation
    this.camera.x += (targetCamX - this.camera.x) * 0.12;
    this.camera.y += (targetCamY - this.camera.y) * 0.12;

    // Apply screen shake
    if (this.player.screenShake > 0) {
      this.camera.x += (Math.random() - 0.5) * this.player.screenShake * 1.8;
      this.camera.y += (Math.random() - 0.5) * this.player.screenShake * 1.8;
    }

    // 8. Update HUD
    const currentZone = this.map.getZoneName(this.player.x, this.player.y);
    this.hud.update(
      this.player,
      this.inputState.mouseX,
      this.inputState.mouseY,
      this.round,
      this.roundState === 'INTERMISSION',
      currentZone,
      nowSec
    );
  }

  render() {
    this.ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

    if (this.gameState !== 'PLAYING' && this.gameState !== 'PAUSED' && this.gameState !== 'GAMEOVER') return;

    this.ctx.save();
    // Apply camera view transform
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw bunker floors, walls, and persistent decals
    this.map.drawBunkerFloor(this.ctx);
    this.particles.drawDecals(this.ctx);
    this.map.drawChalkBuys(this.ctx);
    this.map.drawJuggernog(this.ctx);
    this.map.drawPackAPunch(this.ctx);
    this.map.drawMysteryBox(this.ctx);
    this.map.drawWindows(this.ctx);
    this.map.drawPowerups(this.ctx);
    this.map.drawRoomFog(this.ctx);
    this.map.drawWalls(this.ctx);
    this.map.drawDebrisDoor(this.ctx);

    // 2. Draw Zombies
    for (const z of this.zombies) {
      z.draw(this.ctx);
    }

    // 3. Draw Player
    if (this.player) {
      this.player.draw(this.ctx);
    }

    // 4. Draw Bullets & Tracers
    for (const b of this.bullets) {
      b.draw(this.ctx);
    }

    // 5. Draw Particles (Splinters, Sparks, Smoke)
    this.particles.drawParticles(this.ctx);

    // 6. Draw Floating Combat Text
    this.particles.drawFloatingTexts(this.ctx);

    this.ctx.restore();

    // 7. Dynamic Lighting & Darkness Mask Pass
    if (this.lighting && this.player) {
      this.lighting.renderLighting(this.ctx, this.player, this.camera, this.zombies, this.map);
    }
  }

  loop(currentTime) {
    const rawDt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    let dt = rawDt;
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDt;
      dt = rawDt * 0.15; // Visceral impact frame pause
    }

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Instantiate and start (safely handle both loading and already-loaded DOM)
function initGame() {
  const game = new Game();
  // Debug handle: inspect state from the console (window.game.gameState, etc.)
  window.game = game;
  game.start();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}

