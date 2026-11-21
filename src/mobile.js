'use strict';

// ==================== [MODULE: mobile.js] ====================

/**
 * Mobile Controls & Touch Input Engine for Bunkerlypso
 * Provides authentic top-down twin-stick / action controls:
 * - Left analog floating/fixed thumbstick for smooth 360° movement
 * - Right aim thumbstick & direct touch-to-aim with smart Zombie Aim Assist
 * - Dedicated tactile military action buttons (Fire, Reload, Interact [F], Knife [V], Switch Weapon)
 * - Mobile HUD header (Pause & Fullscreen)
 * - Intelligent Mobile Device Detection (only activates when mobile/tablet is detected)
 * - Zero interference with existing keyboard & mouse desktop controls
 */

class MobileControls {
  constructor(game) {
    this.game = game;

    // Setting mode: 'auto' (detect mobile), 'on' (force touch UI), 'off' (disable touch UI)
    this.mode = localStorage.getItem('bunker_touch_mode') || 'auto';
    this.aimAssistEnabled = localStorage.getItem('bunker_aim_assist') !== 'false'; // default true

    // Detection flag
    this.isMobile = false;
    this.active = false;

    // Movement Joystick State
    this.moveTouchId = null;
    this.moveCenter = { x: 0, y: 0 };
    this.moveCurrent = { x: 0, y: 0 };
    this.moveMaxRadius = 55;
    this.moveDeadzone = 0.12;

    // Aim Joystick State
    this.aimTouchId = null;
    this.aimCenter = { x: 0, y: 0 };
    this.aimCurrent = { x: 0, y: 0 };
    this.aimMaxRadius = 55;
    this.aimDeadzone = 0.15;
    this.lastAimAngle = 0;

    // Firing State
    this.isFiring = false;

    // DOM Elements cache
    this.container = null;
    this.moveZone = null;
    this.moveBase = null;
    this.moveKnob = null;
    this.aimBase = null;
    this.aimKnob = null;
    this.btnFire = null;
    this.btnReload = null;
    this.btnInteract = null;
    this.btnKnife = null;
    this.btnSwitch = null;
    this.btnPause = null;
    this.btnFullscreen = null;
    this.switchLbl = null;

    this.init();
  }

  /**
   * Evaluates if current device / environment is a mobile or tablet touch device
   */
  detectMobile() {
    if (this.mode === 'on') return true;
    if (this.mode === 'off') return false;

    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const mobileUARegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|Silk/i;
    const isMobileUA = mobileUARegex.test(ua);

    const hasTouch = ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0) ||
                     (navigator.msMaxTouchPoints > 0);

    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isSmallOrTablet = Math.min(window.innerWidth, window.innerHeight) <= 1024;

    // Mobile UA + touch capability
    if (isMobileUA && hasTouch) {
      return true;
    }

    // Coarse pointer (primary touch device like phones/tablets)
    if (hasTouch && isCoarse && isSmallOrTablet) {
      return true;
    }

    return false;
  }

  init() {
    this.isMobile = this.detectMobile();

    // Cache or create DOM elements
    this.createOrCacheElements();

    // Bind touch events
    this.bindTouchEvents();

    // Bind settings and responsive listeners
    this.bindWindowEvents();

    // Initial state setup
    this.updateVisibility();
    this.updateControlsGuide();
  }

  createOrCacheElements() {
    this.container = document.getElementById('mobile-controls');
    if (!this.container) return;

    this.moveZone = document.getElementById('mobile-joystick-zone-move');
    this.moveBase = document.getElementById('joystick-move-base');
    this.moveKnob = document.getElementById('joystick-move-knob');

    this.aimBase = document.getElementById('joystick-aim-base');
    this.aimKnob = document.getElementById('joystick-aim-knob');

    this.btnFire = document.getElementById('btn-touch-fire');
    this.btnReload = document.getElementById('btn-touch-reload');
    this.btnInteract = document.getElementById('btn-touch-interact');
    this.btnKnife = document.getElementById('btn-touch-knife');
    this.btnSwitch = document.getElementById('btn-touch-switch');
    this.btnPause = document.getElementById('btn-touch-pause');
    this.btnFullscreen = document.getElementById('btn-touch-fullscreen');
    this.switchLbl = document.getElementById('touch-switch-lbl');
  }

  updateVisibility() {
    this.isMobile = this.detectMobile();

    if (this.isMobile) {
      document.body.classList.add('is-mobile');
      if (this.game && this.game.gameState === 'PLAYING') {
        if (this.container) this.container.classList.remove('hidden');
        this.active = true;
      } else {
        if (this.container) this.container.classList.add('hidden');
        this.active = false;
      }
    } else {
      document.body.classList.remove('is-mobile');
      if (this.container) this.container.classList.add('hidden');
      this.active = false;
      this.resetInputs();
    }
  }

  updateControlsGuide() {
    const guideEl = document.getElementById('menu-controls-guide');
    if (!guideEl) return;

    if (this.isMobile) {
      guideEl.innerHTML = `
        <div class="guide-row"><span>LEFT STICK</span><span>MOVE</span></div>
        <div class="guide-row"><span>RIGHT STICK</span><span>AIM</span></div>
        <div class="guide-row"><span>FIRE</span><span>SHOOT</span></div>
        <div class="guide-row"><span>RELOAD [↻]</span><span>RELOAD</span></div>
        <div class="guide-row"><span>ACTION [F]</span><span>INTERACT</span></div>
        <div class="guide-row"><span>KNIFE [⚔]</span><span>MELEE</span></div>
        <div class="guide-row"><span>WEAPON [⇄]</span><span>SWITCH</span></div>
      `;
    } else {
      guideEl.innerHTML = `
        <div class="guide-row"><span>WASD</span><span>MOVE</span></div>
        <div class="guide-row"><span>MOUSE</span><span>AIM &amp; FIRE</span></div>
        <div class="guide-row"><span>R</span><span>RELOAD</span></div>
        <div class="guide-row"><span>F</span><span>INTERACT</span></div>
        <div class="guide-row"><span>V</span><span>MELEE (+130)</span></div>
        <div class="guide-row"><span>1 - 2</span><span>WEAPONS</span></div>
      `;
    }
  }

  bindWindowEvents() {
    window.addEventListener('resize', () => {
      this.updateVisibility();
      this.updateControlsGuide();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.updateVisibility();
      }, 150);
    });

    // Prevent default touch pull-to-refresh or gestures when playing
    document.addEventListener('touchmove', (e) => {
      if (this.active && this.game && this.game.gameState === 'PLAYING') {
        // Allow scrolling inside modals if any modal is visible
        if (e.target.closest('.screen-content') || e.target.closest('.settings-container')) {
          return;
        }
        e.preventDefault();
      }
    }, { passive: false });
  }

  bindTouchEvents() {
    if (!this.container) return;

    // 1. Left Movement Joystick Zone
    if (this.moveZone) {
      this.moveZone.addEventListener('touchstart', (e) => this.handleMoveStart(e), { passive: false });
      this.moveZone.addEventListener('touchmove', (e) => this.handleMoveMove(e), { passive: false });
      this.moveZone.addEventListener('touchend', (e) => this.handleMoveEnd(e), { passive: false });
      this.moveZone.addEventListener('touchcancel', (e) => this.handleMoveEnd(e), { passive: false });
    }

    // 2. Right Aim Joystick
    if (this.aimBase) {
      this.aimBase.addEventListener('touchstart', (e) => this.handleAimStart(e), { passive: false });
      this.aimBase.addEventListener('touchmove', (e) => this.handleAimMove(e), { passive: false });
      this.aimBase.addEventListener('touchend', (e) => this.handleAimEnd(e), { passive: false });
      this.aimBase.addEventListener('touchcancel', (e) => this.handleAimEnd(e), { passive: false });
    }

    // 3. Direct Screen Touch-to-Aim on Game Canvas (outside action buttons)
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('touchstart', (e) => this.handleCanvasTouch(e), { passive: false });
      canvas.addEventListener('touchmove', (e) => this.handleCanvasTouch(e), { passive: false });
      canvas.addEventListener('touchend', (e) => this.handleCanvasTouchEnd(e), { passive: false });
      canvas.addEventListener('touchcancel', (e) => this.handleCanvasTouchEnd(e), { passive: false });
    }

    // 4. Fire Button
    if (this.btnFire) {
      this.btnFire.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.isFiring = true;
        this.game.inputState.mouseDown = true;
        this.game.inputState.mouseJustPressed = true;
        this.btnFire.classList.add('btn-pressed');
      }, { passive: false });

      const stopFire = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.isFiring = false;
        this.game.inputState.mouseDown = false;
        if (this.btnFire) this.btnFire.classList.remove('btn-pressed');
      };

      this.btnFire.addEventListener('touchend', stopFire, { passive: false });
      this.btnFire.addEventListener('touchcancel', stopFire, { passive: false });
    }

    // 5. Reload Button
    if (this.btnReload) {
      this.btnReload.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.inputState.keys['KeyR'] = true;
        this.btnReload.classList.add('btn-pressed');
      }, { passive: false });

      const stopReload = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.game.inputState.keys['KeyR'] = false;
        if (this.btnReload) this.btnReload.classList.remove('btn-pressed');
      };

      this.btnReload.addEventListener('touchend', stopReload, { passive: false });
      this.btnReload.addEventListener('touchcancel', stopReload, { passive: false });
    }

    // 6. Interact (F) Button (Barricade Repair & Wall Buy)
    if (this.btnInteract) {
      this.btnInteract.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.inputState.keys['KeyF'] = true;
        this.game.inputState.fJustPressed = true;
        this.btnInteract.classList.add('btn-pressed');
      }, { passive: false });

      const stopInteract = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.game.inputState.keys['KeyF'] = false;
        if (this.btnInteract) this.btnInteract.classList.remove('btn-pressed');
      };

      this.btnInteract.addEventListener('touchend', stopInteract, { passive: false });
      this.btnInteract.addEventListener('touchcancel', stopInteract, { passive: false });
    }

    // 7. Melee Knife (V) Button
    if (this.btnKnife) {
      this.btnKnife.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.inputState.keys['KeyV'] = true;
        this.btnKnife.classList.add('btn-pressed');
      }, { passive: false });

      const stopKnife = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.game.inputState.keys['KeyV'] = false;
        if (this.btnKnife) this.btnKnife.classList.remove('btn-pressed');
      };

      this.btnKnife.addEventListener('touchend', stopKnife, { passive: false });
      this.btnKnife.addEventListener('touchcancel', stopKnife, { passive: false });
    }

    // 8. Weapon Switch Button
    if (this.btnSwitch) {
      this.btnSwitch.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.btnSwitch.classList.add('btn-pressed');
        if (this.game.player && !this.game.player.isDead) {
          this.game.player.nextWeapon();
          if (this.game.audio) {
            this.game.audio.playMetallicClick(0.3, 1100, 0.04);
          }
          this.updateWeaponButtonLabel();
        }
      }, { passive: false });

      this.btnSwitch.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.btnSwitch.classList.remove('btn-pressed');
      }, { passive: false });
    }

    // 9. Pause Button
    if (this.btnPause) {
      const handlePause = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game.gameState === 'PLAYING') {
          this.game.pauseGame();
        } else if (this.game.gameState === 'PAUSED') {
          this.game.resumeGame();
        }
      };
      this.btnPause.addEventListener('touchstart', handlePause, { passive: false });
      this.btnPause.addEventListener('click', handlePause);
    }

    // 10. Fullscreen Toggle Button
    if (this.btnFullscreen) {
      const handleFullscreen = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFullscreen();
      };
      this.btnFullscreen.addEventListener('touchstart', handleFullscreen, { passive: false });
      this.btnFullscreen.addEventListener('click', handleFullscreen);
    }
  }

  // ==================== MOVEMENT JOYSTICK HANDLERS ====================

  handleMoveStart(e) {
    if (!this.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (this.moveTouchId === null) {
        e.preventDefault();
        this.moveTouchId = touch.identifier;

        // Dynamic thumbstick placement under finger
        const rect = this.moveZone.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;

        // Center the base on touch point (clamped to zone bounds)
        const baseRadius = 65;
        const clampedX = Math.max(baseRadius, Math.min(rect.width - baseRadius, touchX));
        const clampedY = Math.max(baseRadius, Math.min(rect.height - baseRadius, touchY));

        this.moveCenter = { x: clampedX, y: clampedY };
        this.moveBase.style.left = `${clampedX}px`;
        this.moveBase.style.top = `${clampedY}px`;
        this.moveBase.style.transform = 'translate(-50%, -50%)';
        this.moveBase.classList.add('active');

        this.updateMoveVector(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  handleMoveMove(e) {
    if (!this.active || this.moveTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.moveTouchId) {
        e.preventDefault();
        this.updateMoveVector(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  handleMoveEnd(e) {
    if (this.moveTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.moveTouchId) {
        e.preventDefault();
        this.moveTouchId = null;
        if (this.moveKnob) {
          this.moveKnob.style.transform = 'translate(0px, 0px)';
        }
        if (this.moveBase) {
          this.moveBase.classList.remove('active');
          // Reset to default corner anchor
          this.moveBase.style.left = '';
          this.moveBase.style.top = '';
          this.moveBase.style.transform = '';
        }
        this.game.inputState.moveVector = { x: 0, y: 0 };
        break;
      }
    }
  }

  updateMoveVector(clientX, clientY) {
    const baseRect = this.moveBase.getBoundingClientRect();
    const centerX = baseRect.left + baseRect.width / 2;
    const centerY = baseRect.top + baseRect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, this.moveMaxRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (this.moveKnob) {
      this.moveKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }

    const normDist = clampedDist / this.moveMaxRadius;
    if (normDist < this.moveDeadzone) {
      this.game.inputState.moveVector = { x: 0, y: 0 };
    } else {
      const scale = (normDist - this.moveDeadzone) / (1.0 - this.moveDeadzone);
      this.game.inputState.moveVector = {
        x: Math.cos(angle) * scale,
        y: Math.sin(angle) * scale
      };
    }
  }

  // ==================== AIM JOYSTICK HANDLERS ====================

  handleAimStart(e) {
    if (!this.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (this.aimTouchId === null) {
        e.preventDefault();
        this.aimTouchId = touch.identifier;
        if (this.aimBase) this.aimBase.classList.add('active');
        this.updateAimVector(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  handleAimMove(e) {
    if (!this.active || this.aimTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.aimTouchId) {
        e.preventDefault();
        this.updateAimVector(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  handleAimEnd(e) {
    if (this.aimTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.aimTouchId) {
        e.preventDefault();
        this.aimTouchId = null;
        if (this.aimKnob) {
          this.aimKnob.style.transform = 'translate(0px, 0px)';
        }
        if (this.aimBase) {
          this.aimBase.classList.remove('active');
        }
        break;
      }
    }
  }

  updateAimVector(clientX, clientY) {
    const baseRect = this.aimBase.getBoundingClientRect();
    const centerX = baseRect.left + baseRect.width / 2;
    const centerY = baseRect.top + baseRect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, this.aimMaxRadius);
    let angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (this.aimKnob) {
      this.aimKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }

    const normDist = clampedDist / this.aimMaxRadius;
    if (normDist >= this.aimDeadzone) {
      // Apply subtle aim assist if enabled
      if (this.aimAssistEnabled) {
        angle = this.calculateAimAssist(angle);
      }

      this.lastAimAngle = angle;
      this.applyAimAngle(angle);
    }
  }

  // Direct canvas touch to aim (player taps or drags on enemy / screen)
  handleCanvasTouch(e) {
    if (!this.active || !this.game.player || this.game.player.isDead) return;
    if (this.game.gameState !== 'PLAYING') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // Only treat as aim touch if it's on the right half or top half of screen
      // (avoid interfering with left thumb movement zone)
      if (touch.clientX > window.innerWidth * 0.35 || touch.clientY < window.innerHeight * 0.45) {
        // Make sure it's not on top of action buttons
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
        if (targetEl && targetEl.closest('.touch-btn, .mobile-top-btn, #joystick-aim-base, #joystick-move-base')) {
          continue;
        }

        e.preventDefault();
        const worldX = touch.clientX + this.game.camera.x;
        const worldY = touch.clientY + this.game.camera.y;

        let angle = Math.atan2(worldY - this.game.player.y, worldX - this.game.player.x);
        if (this.aimAssistEnabled) {
          angle = this.calculateAimAssist(angle);
        }

        this.applyAimAngle(angle);
        break;
      }
    }
  }

  handleCanvasTouchEnd(e) {
    // Keep aiming at last targeted angle
  }

  /**
   * Applies aim angle to inputState and updates synthetic crosshair & camera forward look
   */
  applyAimAngle(angle) {
    this.game.inputState.aimAngle = angle;

    // Position crosshair ahead of the player on screen
    const forwardDist = 150;
    this.game.inputState.mouseX = (window.innerWidth / 2) + Math.cos(angle) * forwardDist;
    this.game.inputState.mouseY = (window.innerHeight / 2) + Math.sin(angle) * forwardDist;
  }

  /**
   * Tactical Aim Assist for Mobile:
   * Smoothly nudges aim towards the nearest visible zombie in the player's targeting cone
   */
  calculateAimAssist(rawAngle) {
    if (!this.game.player || !this.game.zombies || this.game.zombies.length === 0) {
      return rawAngle;
    }

    const p = this.game.player;
    let bestTarget = null;
    let minAngleDiff = 0.45; // ~26 degrees cone
    const maxRange = 340; // Max assist distance in pixels

    for (const z of this.game.zombies) {
      if (!z.alive) continue;
      const dist = Math.hypot(z.x - p.x, z.y - p.y);
      if (dist > maxRange) continue;

      const angleToZ = Math.atan2(z.y - p.y, z.x - p.x);
      let diff = Math.abs(angleToZ - rawAngle);
      while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

      if (diff < minAngleDiff) {
        minAngleDiff = diff;
        bestTarget = angleToZ;
      }
    }

    if (bestTarget !== null) {
      let diff = bestTarget - rawAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Smooth 40% magnetic pull towards enemy
      return rawAngle + diff * 0.40;
    }

    return rawAngle;
  }

  // ==================== LIFECYCLE & UPDATE LOOP ====================

  update() {
    if (!this.active) return;

    // Keep firing if Fire button is held down
    if (this.isFiring) {
      this.game.inputState.mouseDown = true;
    }

    // Dynamic Interact [F] button pulsing feedback when near interactable
    if (this.btnInteract && this.game.player) {
      if (this.game.player.currentInteraction) {
        this.btnInteract.classList.add('interact-ready');
      } else {
        this.btnInteract.classList.remove('interact-ready');
      }
    }
  }

  updateWeaponButtonLabel() {
    if (!this.switchLbl || !this.game.player) return;
    const weps = this.game.player.weapons;
    if (weps && weps.length > 1) {
      const nextIdx = (this.game.player.currentWeaponIndex + 1) % weps.length;
      const nextWep = weps[nextIdx];
      this.switchLbl.textContent = nextWep.name.split(' ')[0].toUpperCase();
    } else {
      this.switchLbl.textContent = 'WEAPON';
    }
  }

  onGameStart() {
    this.updateVisibility();
    this.updateWeaponButtonLabel();
  }

  onGamePause() {
    if (this.container) this.container.classList.add('hidden');
    this.resetInputs();
  }

  onGameResume() {
    this.updateVisibility();
  }

  onGameOver() {
    if (this.container) this.container.classList.add('hidden');
    this.resetInputs();
  }

  onReturnToMenu() {
    if (this.container) this.container.classList.add('hidden');
    this.resetInputs();
    this.updateControlsGuide();
  }

  resetInputs() {
    this.isFiring = false;
    this.moveTouchId = null;
    this.aimTouchId = null;

    if (this.game && this.game.inputState) {
      this.game.inputState.moveVector = { x: 0, y: 0 };
      this.game.inputState.aimAngle = null;
      this.game.inputState.mouseDown = false;
      this.game.inputState.mouseJustPressed = false;
      if (this.game.inputState.keys) {
        this.game.inputState.keys['KeyW'] = false;
        this.game.inputState.keys['KeyS'] = false;
        this.game.inputState.keys['KeyA'] = false;
        this.game.inputState.keys['KeyD'] = false;
        this.game.inputState.keys['KeyR'] = false;
        this.game.inputState.keys['KeyF'] = false;
        this.game.inputState.keys['KeyV'] = false;
      }
    }

    if (this.moveKnob) this.moveKnob.style.transform = 'translate(0px, 0px)';
    if (this.aimKnob) this.aimKnob.style.transform = 'translate(0px, 0px)';
    if (this.moveBase) this.moveBase.classList.remove('active');
    if (this.aimBase) this.aimBase.classList.remove('active');
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) docEl.requestFullscreen();
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
      else if (docEl.mozRequestFullScreen) docEl.mozRequestFullScreen();
      else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem('bunker_touch_mode', mode);
    this.updateVisibility();
    this.updateControlsGuide();
  }

  setAimAssist(enabled) {
    this.aimAssistEnabled = !!enabled;
    localStorage.setItem('bunker_aim_assist', this.aimAssistEnabled ? 'true' : 'false');
  }
}

// Make accessible globally
window.MobileControls = MobileControls;
