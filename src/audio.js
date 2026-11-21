'use strict';

// ==================== [MODULE: audio.js] ====================

/**
 * Hybrid Game Sound Engine (SoundManager)
 * High-Tier Gun Sound Engine (Apex Legends / Modern AAA Arcade Feel):
 * - Snappy transient crack
 * - Deep, punchy sub-bass body (chest thump)
 * - Tactile mechanical bolt cycle / chamber resonance
 * - Spatial environmental reverb tail (concrete bunker reflection)
 * - Soft, juicy, satisfying sound design ("oyun seviyesinde yumuşak ama keyifli ve kaliteli tını")
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.convolver = null;
    this.convolverSend = null;
    this.convolverReturn = null;
    this.dryGain = null;
    this.sfxGain = null;
    this.ambientGain = null;

    this.masterVolume = 0.8;
    this.musicVolume = 0.7;
    this.sfxVolume = 1.0;
    this.ambienceVolume = 0.5;

    this.isInitialized = false;
    this.ambienceNodes = [];

    // Pre-allocated noise buffers
    this.whiteNoiseBuffer = null;
    this.pinkNoiseBuffer = null;

    // Decoded real sample audio buffers
    this.sampleBuffers = {};
    this.samplesLoaded = false;

    // Menu Music Engine (HTML5 Audio for zero-lag streaming, offline/file:// safety & smooth looping)
    this.menuMusic = null;
    this.isMenuMusicPlaying = false;
    this.musicFadeInterval = null;
    this.initMenuMusic();
  }

  initMenuMusic() {
    if (typeof Audio === 'undefined') return;
    try {
      this.menuMusic = new Audio('assets/audio/menu_music.mp3');
      this.menuMusic.loop = true;
      this.menuMusic.preload = 'auto';
      this.menuMusic.volume = Math.max(0, Math.min(1, this.masterVolume * this.musicVolume));
    } catch (e) {
      console.warn('Could not initialize menu music audio element:', e);
    }
  }

  playMenuMusic(fadeInDuration = 1.0) {
    if (!this.menuMusic) {
      this.initMenuMusic();
    }
    if (!this.menuMusic) return;

    if (this.musicFadeInterval) {
      clearInterval(this.musicFadeInterval);
      this.musicFadeInterval = null;
    }

    const targetVolume = Math.max(0, Math.min(1, this.masterVolume * this.musicVolume));

    if (this.isMenuMusicPlaying && !this.menuMusic.paused) {
      this.menuMusic.volume = targetVolume;
      return;
    }

    if (fadeInDuration > 0) {
      this.menuMusic.volume = 0;
    } else {
      this.menuMusic.volume = targetVolume;
    }

    const playPromise = this.menuMusic.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        this.isMenuMusicPlaying = true;
        if (fadeInDuration > 0 && targetVolume > 0) {
          const stepTime = 50;
          const totalSteps = Math.max(1, Math.floor((fadeInDuration * 1000) / stepTime));
          const volStep = targetVolume / totalSteps;
          let currentStep = 0;
          this.musicFadeInterval = setInterval(() => {
            currentStep++;
            if (!this.menuMusic || !this.isMenuMusicPlaying) {
              clearInterval(this.musicFadeInterval);
              this.musicFadeInterval = null;
              return;
            }
            const nextVol = Math.min(targetVolume, currentStep * volStep);
            this.menuMusic.volume = nextVol;
            if (currentStep >= totalSteps) {
              this.menuMusic.volume = targetVolume;
              clearInterval(this.musicFadeInterval);
              this.musicFadeInterval = null;
            }
          }, stepTime);
        }
      }).catch((err) => {
        // Autoplay policy prevented playback until user interaction
        this.isMenuMusicPlaying = false;
      });
    }
  }

  stopMenuMusic(fadeOutDuration = 0.6) {
    if (!this.menuMusic) return;

    if (this.musicFadeInterval) {
      clearInterval(this.musicFadeInterval);
      this.musicFadeInterval = null;
    }

    this.isMenuMusicPlaying = false;

    if (fadeOutDuration <= 0 || this.menuMusic.paused) {
      this.menuMusic.pause();
      this.menuMusic.currentTime = 0;
      return;
    }

    const startVolume = this.menuMusic.volume;
    const stepTime = 50;
    const totalSteps = Math.max(1, Math.floor((fadeOutDuration * 1000) / stepTime));
    const volStep = startVolume / totalSteps;
    let currentStep = 0;

    this.musicFadeInterval = setInterval(() => {
      currentStep++;
      if (!this.menuMusic) {
        clearInterval(this.musicFadeInterval);
        this.musicFadeInterval = null;
        return;
      }
      const nextVol = Math.max(0, startVolume - currentStep * volStep);
      this.menuMusic.volume = nextVol;
      if (currentStep >= totalSteps || nextVol <= 0) {
        this.menuMusic.pause();
        this.menuMusic.currentTime = 0;
        clearInterval(this.musicFadeInterval);
        this.musicFadeInterval = null;
      }
    }, stepTime);
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API not supported');
        return;
      }
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      // 1. MASTER CHAIN: DynamicsCompressor -> Master Gain -> Destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // DynamicsCompressor: Soft-knee punch limiter, keeping weapons loud and crisp without digital clipping
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-15, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(4.5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.09, this.ctx.currentTime);
      this.compressor.connect(this.masterGain);

      // 2. REVERB CHAIN: Procedural ConvolverNode (Cold WW2 Bunker Impulse Response)
      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = this.createBunkerImpulseResponse(1.4, 3.4);

      this.convolverSend = this.ctx.createGain();
      this.convolverSend.gain.setValueAtTime(0.24, this.ctx.currentTime);

      this.convolverReturn = this.ctx.createGain();
      this.convolverReturn.gain.setValueAtTime(0.28, this.ctx.currentTime);

      this.convolverSend.connect(this.convolver);
      this.convolver.connect(this.convolverReturn);
      this.convolverReturn.connect(this.compressor);

      // 3. DRY BUS & SFX BUS
      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.setValueAtTime(0.92, this.ctx.currentTime);
      this.dryGain.connect(this.compressor);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.dryGain);

      // 4. AMBIENCE BUS
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(this.ambienceVolume * 0.25, this.ctx.currentTime);
      this.ambientGain.connect(this.dryGain);

      // 5. Generate procedural White and Pink noise buffers
      this.createNoiseBuffers();

      // 6. Decode all embedded audio samples asynchronously
      this.loadSampleBuffers();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API could not be initialized:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Decode embedded base64 audio data into AudioBuffers
  async loadSampleBuffers() {
    if (!EMBEDDED_AUDIO_SAMPLES || !this.ctx) return;
    for (const [key, dataUri] of Object.entries(EMBEDDED_AUDIO_SAMPLES)) {
      try {
        const base64Data = dataUri.split(',')[1];
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const audioBuffer = await this.ctx.decodeAudioData(bytes.buffer);
        this.sampleBuffers[key] = audioBuffer;
      } catch (err) {
        console.warn('Failed to decode audio sample:', key, err);
      }
    }
    this.samplesLoaded = true;
  }

  // Organic pitch & filter variation (jitter between 5% and 12%)
  getJitter(percent = 0.08) {
    const range = Math.max(0.05, Math.min(0.12, percent));
    return 1 + (Math.random() * 2 - 1) * range;
  }

  // Procedural Bunker Impulse Response Synthesis
  createBunkerImpulseResponse(duration = 1.4, decay = 3.2) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.exp(-t * decay);
      const damp = Math.exp(-t * decay * 1.8);
      const isEarly = (i < sampleRate * 0.06) && (Math.random() < 0.04);
      const earlyCoeff = isEarly ? (Math.random() * 2 - 1) * 0.8 : 0;

      left[i] = ((Math.random() * 2 - 1) * env * damp + earlyCoeff) * 0.65;
      right[i] = ((Math.random() * 2 - 1) * env * damp + earlyCoeff) * 0.65;
    }

    return impulse;
  }

  createNoiseBuffers() {
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2.0;

    // White Noise
    this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const whiteData = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }

    // Pink Noise (Paul Kellet 1/f model)
    this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const pinkData = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  // Shared reverb send buses, keyed by send level. Reusing one gain node per
  // level avoids creating (and leaking) a new send node for every single shot.
  getSendGain(amount) {
    if (!this._sendGains) this._sendGains = new Map();
    const key = amount.toFixed(2);
    let sendGain = this._sendGains.get(key);
    if (!sendGain) {
      sendGain = this.ctx.createGain();
      sendGain.gain.setValueAtTime(amount, this.ctx.currentTime);
      sendGain.connect(this.convolverSend);
      this._sendGains.set(key, sendGain);
    }
    return sendGain;
  }

  routeNode(node, reverbAmount = 0.2) {
    // All one-shot SFX must pass through the SFX bus so the "Weapons & SFX"
    // volume slider actually affects them. (Ambience uses ambientGain directly.)
    node.connect(this.sfxGain || this.dryGain);
    if (reverbAmount > 0 && this.convolverSend) {
      node.connect(this.getSendGain(reverbAmount));
    }
  }

  // Play and manipulate an authentic real recording sample with Web Audio API
  playSample(sampleKey, {
    t = this.ctx.currentTime,
    playbackRate = 1.0,
    volume = 0.8,
    filterFreq = 0,
    filterType = 'lowpass',
    reverb = 0.2,
    attack = 0.002,
    duration = 0,
    pitchJitter = 0.08
  } = {}) {
    const buffer = this.sampleBuffers[sampleKey];
    if (!buffer) return false;

    const jitterP = this.getJitter(pitchJitter);
    const finalRate = Math.max(0.2, playbackRate * jitterP);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(finalRate, t);

    let lastNode = source;
    if (filterFreq > 0) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq * this.getJitter(0.08), t);
      source.connect(filter);
      lastNode = filter;
    }

    const gain = this.ctx.createGain();
    const peakVol = volume * this.getJitter(0.06);
    const playDur = duration > 0 ? duration : (buffer.duration / finalRate);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peakVol), t + attack);
    gain.gain.setValueAtTime(Math.max(0.001, peakVol), t + Math.max(0, playDur - 0.02));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + playDur);

    lastNode.connect(gain);
    this.routeNode(gain, reverb);

    source.start(t);
    source.stop(t + playDur + 0.01);
    return true;
  }

  // Procedural Noise Layer (Powder detonation, transient crack)
  createNoiseLayer(t, isPink, startFreq, endFreq, filterType, Q, duration, volume, reverb = 0.2) {
    const jitterP = this.getJitter(0.08);
    const jitterF = this.getJitter(0.10);

    const source = this.ctx.createBufferSource();
    source.buffer = isPink ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = Q;
    filter.frequency.setValueAtTime(Math.max(20, startFreq * jitterF), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq * jitterF), t + duration);

    const gain = this.ctx.createGain();
    const peakVol = Math.max(0.001, volume * jitterP);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peakVol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    this.routeNode(gain, reverb);

    source.start(t);
    source.stop(t + duration + 0.01);
  }

  // Procedural Punch Layer (Sub-bass chest thump)
  createPunchLayer(t, oscType, startFreq, endFreq, duration, volume, reverb = 0.15) {
    const jitterP = this.getJitter(0.07);
    const jitterF = this.getJitter(0.06);

    const osc = this.ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.setValueAtTime(Math.max(15, startFreq * jitterF), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq * jitterF), t + duration);

    const gain = this.ctx.createGain();
    const peakVol = Math.max(0.001, volume * jitterP);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peakVol, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    this.routeNode(gain, reverb);

    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  // Procedural Metallic Layer
  createMetallicLayer(t, freq, Q, duration, volume, reverb = 0.25) {
    const jitterF = this.getJitter(0.08);
    const jitterP = this.getJitter(0.08);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * jitterF, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45 * jitterF, t + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = Q;
    filter.frequency.setValueAtTime(freq * jitterF, t);

    const gain = this.ctx.createGain();
    const peakVol = Math.max(0.001, volume * jitterP);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peakVol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    this.routeNode(gain, reverb);

    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  // Procedural Suppressed / Pneumatic Puff Layer (CoD BO3 Kuda Style)
  createSuppressedPuff(t, duration = 0.055, volume = 0.28) {
    if (!this.ctx || !this.pinkNoiseBuffer) return;
    const jitterF = this.getJitter(0.06);
    const source = this.ctx.createBufferSource();
    source.buffer = this.pinkNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.35;
    filter.frequency.setValueAtTime(1300 * jitterF, t);
    filter.frequency.exponentialRampToValueAtTime(320 * jitterF, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    this.routeNode(gain, 0.08);

    source.start(t);
    source.stop(t + duration + 0.01);
  }

  // Procedural Retro-Futuristic Analog Synthesizer Voice (Smooth, Musical, Non-Grating Ray Gun)
  createSynthRaygunVoice(t) {
    if (!this.ctx) return;
    const jitterF = this.getJitter(0.03);

    // 1. Primary Analog Synth Voice (Triangle wave for rich musical harmonics without harsh buzzy treble)
    const oscMain = this.ctx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.setValueAtTime(840 * jitterF, t);
    oscMain.frequency.exponentialRampToValueAtTime(220 * jitterF, t + 0.14);
    oscMain.frequency.exponentialRampToValueAtTime(70 * jitterF, t + 0.22);

    // 2. Secondary Sub-Harmonic Voice (Sine wave for smooth low-mid fundamental weight)
    const oscSub = this.ctx.createOscillator();
    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(420 * jitterF, t);
    oscSub.frequency.exponentialRampToValueAtTime(110 * jitterF, t + 0.14);
    oscSub.frequency.exponentialRampToValueAtTime(45 * jitterF, t + 0.20);

    // 3. Resonant Analog Lowpass Filter Sweep (The iconic synth "zwooomp" envelope)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.6, t);
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(380, t + 0.16);

    // 4. Amplitude Envelope (Smooth 3ms attack to avoid clicks, silky decay)
    const gainMain = this.ctx.createGain();
    gainMain.gain.setValueAtTime(0.0001, t);
    gainMain.gain.exponentialRampToValueAtTime(0.55, t + 0.004);
    gainMain.gain.exponentialRampToValueAtTime(0.20, t + 0.09);
    gainMain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    const gainSub = this.ctx.createGain();
    gainSub.gain.setValueAtTime(0.0001, t);
    gainSub.gain.exponentialRampToValueAtTime(0.35, t + 0.006);
    gainSub.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    oscMain.connect(filter);
    oscSub.connect(filter);

    filter.connect(gainMain);
    this.routeNode(gainMain, 0.26);

    oscMain.start(t);
    oscMain.stop(t + 0.23);
    oscSub.start(t);
    oscSub.stop(t + 0.21);
  }

  // =========================================================================
  // 🎯 WEAPON AUDIO ENGINE: COMFORTABLE, PUNCHY & NON-FATIGUING SOUND DESIGN
  // Re-engineered from scratch:
  // - MP40: Black Ops 3 Kuda style (quiet, suppressed-like, tactical, soft punch)
  // - Pistol (Colt M1911): Deep, punchy, quiet subsonic handgun
  // - Kar98k: Punchy, satisfying bolt-action thud without harsh ear-piercing volume
  // - MG42: Signature rapid fire with balanced non-fatiguing high-speed profile
  // - Trench Gun: Deep, meaty, satisfying 12-gauge boom & pump at comfortable volume
  // - Ray Gun: Retro-futuristic synthesizer analog sweep, musical, smooth & non-grating
  // =========================================================================

  playGunshot(weaponType) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    switch (weaponType) {
      // -------------------------------------------------------------
      // 1. COLT M1911 ("Tok sessiz bir tabanca" - Subsonic .45 ACP Thud)
      // -------------------------------------------------------------
      case 'm1911': {
        // Layer 1: Softened warm acoustic body (harsh highs rolled off at 1900Hz)
        this.playSample('pistol_wav', {
          t,
          playbackRate: 0.94,
          volume: 0.45,
          filterFreq: 1900,
          reverb: 0.10,
          pitchJitter: 0.05
        });
        // Layer 2: Tok, deep sub-bass thump (122Hz -> 36Hz in 80ms)
        this.createPunchLayer(t, 'sine', 122, 36, 0.08, 0.58, 0.10);
        // Layer 3: Soft muffled gas expansion (pink noise, no harsh crack)
        this.createNoiseLayer(t, true, 1400, 240, 'lowpass', 1.0, 0.06, 0.25, 0.08);
        // Layer 4: Tactile mechanical slide clink (subtle, non-piercing)
        this.playSample('click_ogg', {
          t,
          playbackRate: 0.95,
          volume: 0.20,
          filterFreq: 1800,
          reverb: 0.08
        });
        break;
      }

      // -------------------------------------------------------------
      // 2. KAR98K ("Tok ama çok yüksek olmayan bir ses" - Meaty 7.92mm Thud)
      // -------------------------------------------------------------
      case 'kar98k': {
        // Layer 1: Resonant rifle acoustic report with smooth warm decay (vol: 0.68)
        this.playSample('shot2_wav', {
          t,
          playbackRate: 0.85,
          volume: 0.68,
          filterFreq: 2300,
          reverb: 0.28,
          pitchJitter: 0.04
        });
        // Layer 2: Deep wooden stock & chamber thud (140Hz -> 30Hz in 220ms, vol: 0.75)
        this.createPunchLayer(t, 'sine', 140, 30, 0.22, 0.75, 0.22);
        // Layer 3: Muffled powder blast (warm lowpass pink noise)
        this.createNoiseLayer(t, true, 2000, 260, 'lowpass', 1.2, 0.16, 0.45, 0.20);
        // Layer 4: Satisfying mechanical bolt cycle clack after 130ms
        setTimeout(() => {
          if (!this.isInitialized) return;
          const t2 = this.ctx.currentTime;
          this.playSample('metal_heavy_ogg', {
            t: t2,
            playbackRate: 1.20,
            volume: 0.32,
            filterFreq: 1600,
            reverb: 0.18
          });
          this.createMetallicLayer(t2, 1050, 3.5, 0.06, 0.25, 0.15);
        }, 130);
        break;
      }

      // -------------------------------------------------------------
      // 3. MP40 ("CoD Black Ops 3 Kuda gibi sessiz tarz" - Tactical Suppressed SMG)
      // -------------------------------------------------------------
      case 'mp40': {
        // Layer 1: Subdued acoustic core (pitched warm, lowpass 1700Hz, quiet vol: 0.38)
        this.playSample('pistol_wav', {
          t,
          playbackRate: 0.88,
          volume: 0.38,
          filterFreq: 1700,
          reverb: 0.08,
          pitchJitter: 0.04
        });
        // Layer 2: Kuda-style pneumatic suppressor gas puff (soft, non-fatiguing)
        this.createSuppressedPuff(t, 0.055, 0.28);
        // Layer 3: Tight, tactile sub-thump (128Hz -> 40Hz in 55ms)
        this.createPunchLayer(t, 'sine', 128, 40, 0.055, 0.60, 0.06);
        // Layer 4: Oiled internal bolt slide clack (muted triangle tone)
        this.createMetallicLayer(t, 1150, 3.2, 0.025, 0.14, 0.05);
        break;
      }

      // -------------------------------------------------------------
      // 4. TRENCH GUN ("Sesi çok yüksek olmadan tatmin edici bir ses")
      // -------------------------------------------------------------
      case 'shotgun': {
        // Layer 1: Meaty 12-gauge blast with rolled-off treble (vol: 0.72)
        this.playSample('shotgun_wav', {
          t,
          playbackRate: 0.95,
          volume: 0.72,
          filterFreq: 2200,
          reverb: 0.25,
          pitchJitter: 0.04
        });
        // Layer 2: Sub-bass pressure wave (155Hz -> 26Hz in 250ms, vol: 0.85)
        this.createPunchLayer(t, 'sine', 155, 26, 0.25, 0.85, 0.24);
        // Layer 3: Dispersal powder rumble (pink noise lowpass 1800Hz)
        this.createNoiseLayer(t, true, 1800, 180, 'lowpass', 1.1, 0.22, 0.50, 0.22);
        // Layer 4: Distinct tactile pump action after 320ms
        setTimeout(() => {
          if (this.isInitialized) this.playShotgunPump();
        }, 320);
        break;
      }

      // -------------------------------------------------------------
      // 5. MG42 ("Aynı kalabilir" - High-Velocity Rapid Machine Gun)
      // -------------------------------------------------------------
      case 'mg42': {
        // Layer 1: High velocity acoustic shot sample
        this.playSample('shot2_wav', {
          t,
          playbackRate: 1.55,
          volume: 0.70,
          filterFreq: 3200,
          reverb: 0.15,
          pitchJitter: 0.08
        });
        // Layer 2: Rapid hammer piston punch (135Hz -> 48Hz in 70ms)
        this.createPunchLayer(t, 'triangle', 135, 48, 0.07, 0.75, 0.10);
        // Layer 3: Hot chamber vibration
        this.createMetallicLayer(t, 2300, 3.5, 0.035, 0.35, 0.12);
        // Layer 4: Rapid gunpowder burst (tamed pink noise)
        this.createNoiseLayer(t, true, 2800, 500, 'lowpass', 1.5, 0.075, 0.55, 0.12);
        break;
      }

      // -------------------------------------------------------------
      // 6. RAY GUN ("Biraz daha synth bir ses ve rahatsız edici olmasın")
      // -------------------------------------------------------------
      case 'raygun': {
        // Katman 1: Analog Synthesizer Lead Voice (Dual Triangle + Sine sweep with resonant Moog-style filter)
        this.createSynthRaygunVoice(t);
        // Katman 2: Kadife sub-bas enerji darbesi (80Hz -> 30Hz in 120ms, yumuşak ve tatlı)
        this.createPunchLayer(t, 'sine', 80, 30, 0.12, 0.42, 0.15);
        // Katman 3: Muffled vintage energy discharge (lazer_wav tizleri kesilmiş, çok kısık)
        this.playSample('lazer_wav', {
          t,
          playbackRate: 0.95,
          volume: 0.16,
          filterFreq: 1600,
          reverb: 0.24,
          pitchJitter: 0.03
        });
        break;
      }

      default: {
        this.createNoiseLayer(t, true, 2200, 300, 'lowpass', 1.2, 0.15, 0.6, 0.15);
        this.createPunchLayer(t, 'sine', 120, 35, 0.12, 0.6, 0.15);
      }
    }
  }

  // Shotgun pump action (Tactile mechanical slide back and forward)
  playShotgunPump() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;
    // Slide back
    this.playSample('click_ogg', { t, playbackRate: 0.85, volume: 0.45, filterFreq: 2200, reverb: 0.12 });
    this.createMetallicLayer(t, 950, 3.2, 0.06, 0.30, 0.12);
    // Slide forward
    setTimeout(() => {
      if (!this.isInitialized) return;
      const t2 = this.ctx.currentTime;
      this.playSample('metal_medium_ogg', { t: t2, playbackRate: 1.20, volume: 0.45, filterFreq: 2400, reverb: 0.15 });
      this.createPunchLayer(t2, 'triangle', 120, 45, 0.06, 0.35, 0.08);
    }, 130);
  }

  // Reload sequence with tactile mechanical samples
  playReload() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Stage 1: Mag release latch (Apex style crisp tactile feedback)
    this.playSample('click_ogg', { t, playbackRate: 1.2, volume: 0.6, reverb: 0.15 });
    this.createMetallicLayer(t, 1400, 3.5, 0.06, 0.45, 0.15);

    // Stage 2 (450ms): Fresh mag insertion into well
    setTimeout(() => {
      if (!this.isInitialized) return;
      const t2 = this.ctx.currentTime;
      this.playSample('metal_heavy_ogg', { t: t2, playbackRate: 1.6, volume: 0.65, reverb: 0.2 });
      this.createPunchLayer(t2, 'triangle', 160, 55, 0.09, 0.6, 0.15);
    }, 450);

    // Stage 3 (950ms): Bolt pull and slide slam
    setTimeout(() => {
      if (!this.isInitialized) return;
      const t3 = this.ctx.currentTime;
      this.playSample('metal_medium_ogg', { t: t3, playbackRate: 1.1, volume: 0.75, reverb: 0.22 });
      this.createMetallicLayer(t3, 1650, 4.0, 0.06, 0.75, 0.25);
    }, 950);
  }

  playDryFire() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;
    this.playSample('click_ogg', { t, playbackRate: 1.5, volume: 0.38, filterFreq: 2400, reverb: 0.08 });
    this.createPunchLayer(t, 'triangle', 280, 95, 0.04, 0.25, 0.08);
  }

  playMetallicClick(vol = 0.4, freq = 1200, dur = 0.05) {
    if (!this.isInitialized) return;
    const t = this.ctx.currentTime;
    this.playSample('click_ogg', { t, playbackRate: freq / 1000, volume: vol, reverb: 0.15 });
    this.createMetallicLayer(t, freq, 3.5, dur, vol * 0.5, 0.15);
  }

  // --- 2. MELEE KNIFE & HITMARKER (Apex Shield/Hit feedback) ---

  playKnife(hit = false) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('knife_draw_ogg', { t, playbackRate: 1.25, volume: 0.75, reverb: 0.18 });
    this.createNoiseLayer(t, true, 1100, 220, 'bandpass', 3.0, 0.15, 0.5, 0.15);

    if (hit) {
      setTimeout(() => {
        if (!this.isInitialized) return;
        const ht = this.ctx.currentTime;
        this.playSample('knife_slice_ogg', { t: ht, playbackRate: 1.1, volume: 0.85, reverb: 0.22 });
        this.playSample('punch_heavy_ogg', { t: ht, playbackRate: 1.0, volume: 0.85, reverb: 0.2 });
        this.createPunchLayer(ht, 'sine', 155, 38, 0.16, 0.95, 0.25);
      }, 35);
    }
  }

  // Authentic Call of Duty: Black Ops 2 Crisp & Satisfying Hitmarker Sound
  playHitmarker(isHeadshot = false) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    const playClickPulse = (offsetTime, freq, vol) => {
      // 1. Damped fast transient tick (The classic BO2 "pık/tık" body)
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, offsetTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.45, offsetTime + 0.022);

      // 2. High-cut bandpass filter for metallic crispness without harshness
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * 1.1, offsetTime);
      filter.Q.setValueAtTime(3.8, offsetTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, offsetTime);
      gain.gain.exponentialRampToValueAtTime(vol, offsetTime + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, offsetTime + 0.024);

      osc.connect(filter);
      filter.connect(gain);
      this.routeNode(gain, 0.02);

      osc.start(offsetTime);
      osc.stop(offsetTime + 0.026);

      // 3. Ultra-short high snap transient (3.5kHz tap)
      const snapOsc = this.ctx.createOscillator();
      snapOsc.type = 'sine';
      snapOsc.frequency.setValueAtTime(freq * 1.8, offsetTime);
      snapOsc.frequency.exponentialRampToValueAtTime(freq * 0.9, offsetTime + 0.008);

      const snapGain = this.ctx.createGain();
      snapGain.gain.setValueAtTime(0.0001, offsetTime);
      snapGain.gain.exponentialRampToValueAtTime(vol * 0.45, offsetTime + 0.001);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, offsetTime + 0.010);

      snapOsc.connect(snapGain);
      this.routeNode(snapGain, 0.01);

      snapOsc.start(offsetTime);
      snapOsc.stop(offsetTime + 0.012);
    };

    if (isHeadshot) {
      // Iconic BO2 Headshot: Double-flam click ("t-tık!")
      playClickPulse(t, 2400, 0.36);
      playClickPulse(t + 0.015, 2900, 0.42);
    } else {
      // Crisp, soft, addictive standard hit tick
      playClickPulse(t, 1950, 0.28);
    }
  }

  // --- 3. BARRICADE WOOD MECHANICS ---

  playWoodBreak() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('wood_heavy_ogg', { t, playbackRate: 0.95, volume: 0.85, reverb: 0.25 });
    this.playSample('wood_plank_ogg', { t, playbackRate: 1.1, volume: 0.75, reverb: 0.28 });
    this.createPunchLayer(t, 'triangle', 115, 32, 0.20, 0.85, 0.25);
  }

  playWoodRepair() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('wood_medium_ogg', { t, playbackRate: 1.15, volume: 0.80, reverb: 0.20 });
    this.createMetallicLayer(t, 2900, 5.0, 0.065, 0.55, 0.25);
    this.createPunchLayer(t, 'triangle', 160, 48, 0.11, 0.80, 0.2);
  }

  // --- 4. ZOMBIE SOUNDS ---

  playZombieGroan(isAggressive = false) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    const baseFreq = isAggressive ? (85 + Math.random() * 45) : (52 + Math.random() * 32);
    const duration = isAggressive ? 0.48 : (0.75 + Math.random() * 0.45);
    const jitterF = this.getJitter(0.09);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * jitterF, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.35 * jitterF, t + duration * 0.4);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65 * jitterF, t + duration);

    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 5.0;
    f1.frequency.setValueAtTime(460 * jitterF, t);
    f1.frequency.linearRampToValueAtTime(750 * jitterF, t + duration * 0.5);
    f1.frequency.exponentialRampToValueAtTime(340 * jitterF, t + duration);

    const gain = this.ctx.createGain();
    const peakVol = isAggressive ? 0.42 : 0.28;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peakVol, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(f1);
    f1.connect(gain);
    this.routeNode(gain, 0.35);

    osc.start(t);
    osc.stop(t + duration + 0.01);

    this.createNoiseLayer(t, true, 850, 220, 'bandpass', 2.0, duration * 0.8, isAggressive ? 0.35 : 0.20, 0.3);
  }

  playZombieAttack() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playZombieGroan(true);
    this.playSample('punch_medium_ogg', { t, playbackRate: 1.1, volume: 0.7, reverb: 0.2 });
    this.createNoiseLayer(t, true, 800, 160, 'bandpass', 2.5, 0.18, 0.55, 0.2);
    this.createPunchLayer(t, 'triangle', 220, 60, 0.12, 0.45, 0.15);
  }

  // Visceral bullet impact into rotting zombie flesh
  playFleshImpact(isHeadshot = false) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    const rate = isHeadshot ? (1.3 + Math.random() * 0.25) : (0.92 + Math.random() * 0.22);
    this.playSample('punch_medium_ogg', {
      t,
      playbackRate: rate,
      volume: isHeadshot ? 0.65 : 0.52,
      reverb: 0.12
    });

    // Wet flesh perforation squelch
    this.createNoiseLayer(t, true, 1600, 320, 'bandpass', 2.8, 0.08, 0.38, 0.12);

    // If headshot: skull crack bone transient
    if (isHeadshot) {
      this.playSample('click_ogg', { t, playbackRate: 2.7, volume: 0.58, reverb: 0.08 });
      this.createPunchLayer(t, 'triangle', 380, 90, 0.07, 0.55, 0.12);
    }
  }

  // Visceral zombie death, bone crunch, and wet flesh dismemberment sound
  playFleshRip(isHeadshot = false, isShotgun = false) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. Bone / skull crunch snap (crisp wood plank sample pitched up)
    const boneRate = (isHeadshot ? 1.75 : 1.45) * this.getJitter(0.12);
    this.playSample('wood_plank_ogg', {
      t,
      playbackRate: boneRate,
      volume: isHeadshot ? 0.85 : 0.70,
      reverb: 0.16
    });

    // 2. Heavy flesh impact & meaty body collapse chunk
    const punchRate = (isHeadshot ? 1.05 : 0.82) * this.getJitter(0.08);
    this.playSample('punch_heavy_ogg', {
      t: t + 0.006,
      playbackRate: punchRate,
      volume: isShotgun ? 1.1 : 0.92,
      reverb: 0.22
    });

    // 3. Dual wet squishy gore splatter & blood spray (swept bandpass filtered noise)
    const noiseStart = isShotgun ? 2200 : 1850;
    this.createNoiseLayer(t, true, noiseStart, 220, 'bandpass', 3.8, isShotgun ? 0.25 : 0.18, 0.72, 0.20);
    this.createNoiseLayer(t + 0.018, true, 850, 95, 'bandpass', 2.4, 0.16, 0.55, 0.18);

    // 4. Low-end visceral sub-bass body thump
    const subVol = isShotgun ? 1.25 : 0.95;
    this.createPunchLayer(t, 'sine', 135, 26, 0.24, subVol, 0.18);

    // 5. Cartilage / skull breaking crack
    this.createPunchLayer(t + 0.01, 'triangle', isHeadshot ? 580 : 360, 85, 0.065, 0.65, 0.12);

    // 6. Dying guttural throat rattle / death groan exhale
    try {
      const dyingFreq = (isHeadshot ? 95 : 75) * this.getJitter(0.10);
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(dyingFreq, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.30);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 4.2;
      filter.frequency.setValueAtTime(420 * this.getJitter(0.08), t);
      filter.frequency.linearRampToValueAtTime(240, t + 0.30);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);

      osc.connect(filter);
      filter.connect(gain);
      this.routeNode(gain, 0.28);

      osc.start(t);
      osc.stop(t + 0.32);
    } catch (e) {
      // Audio context safety
    }
  }

  playPlayerHurt() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('punch_heavy_ogg', { t, playbackRate: 0.95, volume: 0.9, reverb: 0.25 });
    this.createPunchLayer(t, 'sine', 165, 30, 0.32, 1.3, 0.25);
    this.createPunchLayer(t, 'triangle', 125, 42, 0.19, 0.6, 0.2);
  }

  // --- 5. ROUND CHANGE & ATMOSPHERIC STINGS ---

  playRoundChange() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('bell_heavy_ogg', { t, playbackRate: 0.7, volume: 0.65, reverb: 0.55 });

    const notes = [73.42, 87.31, 103.83, 130.81, 155.56, 293.66];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * this.getJitter(0.05), t);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, t);
      filter.frequency.exponentialRampToValueAtTime(90, t + 3.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.32, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);

      osc.connect(filter);
      filter.connect(gain);
      this.routeNode(gain, 0.55);

      osc.start(t);
      osc.stop(t + 3.45);
    });

    this.createPunchLayer(t, 'sine', 70, 18, 2.2, 1.2, 0.5);
  }

  playPurchase() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('handle_coins_ogg', { t, playbackRate: 1.15, volume: 0.75, reverb: 0.25 });

    [1046.5, 1318.51, 1567.98].forEach((freq, idx) => {
      const noteTime = t + idx * 0.05;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * this.getJitter(0.05), noteTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.35, noteTime + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.42);

      osc.connect(gain);
      this.routeNode(gain, 0.3);

      osc.start(noteTime);
      osc.stop(noteTime + 0.43);
    });
  }

  playDebrisClear() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('door_close_ogg', { t, playbackRate: 0.85, volume: 1.1, reverb: 0.4 });
    this.createPunchLayer(t, 'sine', 110, 20, 0.85, 1.5, 0.4);
    this.createNoiseLayer(t, true, 2400, 150, 'lowpass', 1.5, 0.75, 1.3, 0.4);
    setTimeout(() => {
      if (this.isInitialized) this.createMetallicLayer(this.ctx.currentTime, 700, 4.0, 0.16, 0.65, 0.3);
    }, 220);
  }

  // Perk Machine Jingle (Nugi / Juggernog)
  playNugi() {
    this.playJuggernog();
  }

  // Speed Cola / Spodi Reload Perk Jingle (Electric, fast, sparkling ascending notes)
  playSpodi() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Heavy coin insert clink
    this.playSample('handle_coins_ogg', { t, volume: 0.85, reverb: 0.15 });

    // Fast, crisp ascending electric arpeggio (C5 -> E5 -> G5 -> C6)
    const spodiNotes = [523.25, 659.25, 783.99, 1046.50];
    spodiNotes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.isInitialized) return;
        const nt = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, nt);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, nt);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, nt);
        gain.gain.exponentialRampToValueAtTime(0.38, nt + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.22);

        osc.connect(filter);
        filter.connect(gain);
        this.routeNode(gain, 0.35);

        osc.start(nt);
        osc.stop(nt + 0.24);
      }, 250 + idx * 80);
    });
  }

  playJuggernog() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('click_ogg', { t, playbackRate: 1.8, volume: 0.65, reverb: 0.2 });
    this.createMetallicLayer(t, 2100, 5.0, 0.045, 0.65, 0.2);

    setTimeout(() => {
      if (this.isInitialized) this.createPunchLayer(this.ctx.currentTime, 'sine', 170, 75, 0.11, 0.55, 0.15);
    }, 180);
    setTimeout(() => {
      if (this.isInitialized) this.createPunchLayer(this.ctx.currentTime, 'sine', 155, 70, 0.11, 0.55, 0.15);
    }, 420);

    const jingleNotes = [261.63, 329.63, 392.00, 523.25];
    jingleNotes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.isInitialized) return;
        const nt = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, nt);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, nt);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, nt);
        gain.gain.exponentialRampToValueAtTime(0.34, nt + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.38);

        osc.connect(filter);
        filter.connect(gain);
        this.routeNode(gain, 0.4);

        osc.start(nt);
        osc.stop(nt + 0.39);
      }, 680 + idx * 130);
    });
  }

  playMysteryBoxSpin() {
    if (!this.isInitialized) return;
    this.resume();

    for (let i = 0; i < 18; i++) {
      setTimeout(() => {
        if (!this.isInitialized) return;
        const nt = this.ctx.currentTime;
        this.playSample('click_ogg', {
          t: nt,
          playbackRate: 0.9 + (i % 6) * 0.2,
          volume: 0.4,
          reverb: 0.2
        });

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime((420 + (i % 6) * 160) * this.getJitter(0.06), nt);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, nt);
        gain.gain.exponentialRampToValueAtTime(0.20, nt + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.075);

        osc.connect(gain);
        this.routeNode(gain, 0.25);

        osc.start(nt);
        osc.stop(nt + 0.08);
      }, i * 110);
    }
  }

  playMysteryBoxDone() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const nt = t + idx * 0.06;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * this.getJitter(0.05), nt);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, nt);
      gain.gain.exponentialRampToValueAtTime(0.38, nt + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.55);

      osc.connect(gain);
      this.routeNode(gain, 0.45);

      osc.start(nt);
      osc.stop(nt + 0.56);
    });
  }

  playPowerup() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('powerup_ogg', { t, playbackRate: 1.0, volume: 0.7, reverb: 0.35 });

    [440, 554.37, 659.25, 880, 1108.73].forEach((freq, idx) => {
      const nt = t + idx * 0.07;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * this.getJitter(0.05), nt);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, nt);
      gain.gain.exponentialRampToValueAtTime(0.25, nt + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.48);

      osc.connect(gain);
      this.routeNode(gain, 0.35);

      osc.start(nt);
      osc.stop(nt + 0.49);
    });
  }

  playNuke() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    this.playSample('explosion_mp3', { t, playbackRate: 0.8, volume: 1.4, reverb: 0.5 });
    this.createPunchLayer(t, 'sine', 95, 14, 2.6, 1.9, 0.55);
    this.createNoiseLayer(t, true, 2200, 25, 'lowpass', 1.2, 2.2, 1.7, 0.5);
  }

  // --- Pack-a-Punch Audio Experience ---
  playPackAPunch(tier = 1) {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. Initial mechanical lock / coin clink
    this.playSample('metal_heavy_ogg', { t, playbackRate: 1.35, volume: 0.85, reverb: 0.25 });
    this.playSample('click_ogg', { t: t + 0.08, playbackRate: 1.15, volume: 0.65, reverb: 0.15 });

    // 2. Rising energy harmonic sweep
    const sweepOsc = this.ctx.createOscillator();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(160, t + 0.1);
    sweepOsc.frequency.exponentialRampToValueAtTime(1050 + tier * 280, t + 0.8);

    const sweepFilter = this.ctx.createBiquadFilter();
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.setValueAtTime(450, t + 0.1);
    sweepFilter.frequency.exponentialRampToValueAtTime(3400, t + 0.8);

    const sweepGain = this.ctx.createGain();
    sweepGain.gain.setValueAtTime(0.0001, t + 0.1);
    sweepGain.gain.exponentialRampToValueAtTime(0.38, t + 0.4);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

    sweepOsc.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    this.routeNode(sweepGain, 0.45);
    sweepOsc.start(t + 0.1);
    sweepOsc.stop(t + 0.86);

    // 3. Authentic Call of Duty Pack-a-Punch jingle fanfare chords
    const notes = [311.13, 392.00, 466.16, 622.25]; // Eb major power chord
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.isInitialized) return;
        const nt = this.ctx.currentTime;
        const bell = this.ctx.createOscillator();
        bell.type = 'triangle';
        bell.frequency.setValueAtTime(freq * (1 + (tier - 1) * 0.12), nt);

        const bellGain = this.ctx.createGain();
        bellGain.gain.setValueAtTime(0.0001, nt);
        bellGain.gain.exponentialRampToValueAtTime(0.45, nt + 0.005);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.65);

        bell.connect(bellGain);
        this.routeNode(bellGain, 0.55);
        bell.start(nt);
        bell.stop(nt + 0.66);
      }, 700 + idx * 115);
    });

    // 4. Climax punch release
    setTimeout(() => {
      if (!this.isInitialized) return;
      this.playSample('explosion_mp3', { playbackRate: 1.55, volume: 0.75, reverb: 0.4 });
      this.playSample('bell_heavy_ogg', { playbackRate: 1.25, volume: 0.8, reverb: 0.5 });
      this.createPunchLayer(this.ctx.currentTime, 'sine', 160, 45, 0.28, 0.9, 0.25);
    }, 1150);
  }

  playPackAPunchShot(tier = 1) {
    if (!this.isInitialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const startFreq = 850 + tier * 320;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.065);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200 + tier * 350, t);
    filter.Q.setValueAtTime(3.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.22 + tier * 0.06, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

    osc.connect(filter);
    filter.connect(gain);
    this.routeNode(gain, 0.25);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  playMiniExplosion() {
    if (!this.isInitialized) return;
    this.resume();
    const t = this.ctx.currentTime;
    this.playSample('shot2_wav', { t, playbackRate: 0.70, volume: 0.80, reverb: 0.35 });
    this.createPunchLayer(t, 'sine', 130, 40, 0.16, 0.75, 0.25);
  }

  // --- 6. CONTINUOUS BUNKER DRONE & WIND ---

  startBunkerAmbience() {
    if (!this.isInitialized) return;
    if (this.ambienceNodes && this.ambienceNodes.length > 0) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(45.0, t);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(47.8, t);

    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.24, t);

    osc1.connect(droneGain);
    osc2.connect(droneGain);
    droneGain.connect(this.ambientGain);

    osc1.start();
    osc2.start();

    const windSource = this.ctx.createBufferSource();
    windSource.buffer = this.pinkNoiseBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 4.5;
    windFilter.frequency.setValueAtTime(230, t);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.11, t);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(95, t);

    lfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.22, t);

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambientGain);

    windSource.start();
    lfo.start();

    this.ambienceNodes = [osc1, osc2, windSource, lfo];
  }

  stopBunkerAmbience() {
    if (!this.ambienceNodes || this.ambienceNodes.length === 0) return;
    this.ambienceNodes.forEach((node) => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (e) {}
    });
    this.ambienceNodes = [];
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    if (this.menuMusic && this.isMenuMusicPlaying && !this.musicFadeInterval) {
      this.menuMusic.volume = this.masterVolume * this.musicVolume;
    }
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    if (this.menuMusic && this.isMenuMusicPlaying && !this.musicFadeInterval) {
      this.menuMusic.volume = this.masterVolume * this.musicVolume;
    }
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  setAmbienceVolume(val) {
    this.ambienceVolume = Math.max(0, Math.min(1, val));
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setValueAtTime(this.ambienceVolume * 0.25, this.ctx.currentTime);
    }
  }
}

