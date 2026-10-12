import { isTouchControlsEnabled } from './Device';

export interface KartInputState {
  throttle: number; // -1 (reverse/brake) to +1 (forward gas)
  steer: number;    // -1 (full left) to +1 (full right)
  drift: boolean;    // true if drift/handbrake held
  nitro: boolean;    // true on single frame when tactical nitro requested
  respawn: boolean;  // true if player presses R or touch reset
}

export class InputManager {
  public state: KartInputState = {
    throttle: 0,
    steer: 0,
    drift: false,
    nitro: false,
    respawn: false,
  };

  private keys: Record<string, boolean> = {};
  private isTouchDevice: boolean = false;
  private nitroTriggered: boolean = false;

  // Mobile Esports Touch States (Left Pedals, Right Steering Buttons)
  private touchSteerLeft: boolean = false;
  private touchSteerRight: boolean = false;
  private touchGas: boolean = false;
  private touchBrake: boolean = false;
  private touchGasBufferTimer: number = 0;
  private touchRespawn: boolean = false;

  constructor() {
    this.setupKeyboard();
    this.setupTouch();
  }

  private setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (['ShiftLeft', 'ShiftRight', 'Space', 'KeyN'].includes(e.code)) {
        this.nitroTriggered = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Reset keys if window loses focus
    window.addEventListener('blur', () => {
      this.keys = {};
      this.touchGas = false;
      this.touchBrake = false;
      this.touchSteerLeft = false;
      this.touchSteerRight = false;
      this.touchRespawn = false;
    });
  }

  private setupTouch() {
    const checkTouch = () => {
      this.isTouchDevice = isTouchControlsEnabled();
    };

    window.addEventListener('resize', checkTouch, { passive: true });
    window.addEventListener('fullscreenchange', checkTouch, { passive: true });
    checkTouch();

    // ── Left Steering Cluster: Dual Buttons (Left / Right) ──
    const steerClusterEl = document.getElementById('touch-steer-cluster');
    const leftBtn = document.getElementById('touch-btn-left');
    const rightBtn = document.getElementById('touch-btn-right');

    let leftL = 0, leftR = 0, leftT = 0, leftB = 0;
    let rightL = 0, rightR = 0, rightT = 0, rightB = 0;
    let rectsCached = false;

    const cacheSteerRects = () => {
      if (!leftBtn || !rightBtn) return;
      const rL = leftBtn.getBoundingClientRect();
      const rR = rightBtn.getBoundingClientRect();
      leftL = rL.left - 20;
      leftR = rL.right + 10;
      leftT = rL.top - 30;
      leftB = rL.bottom + 30;
      rightL = rR.left - 10;
      rightR = rR.right + 20;
      rightT = rR.top - 30;
      rightB = rR.bottom + 30;
      rectsCached = true;
    };

    window.addEventListener('resize', () => { rectsCached = false; }, { passive: true });
    window.addEventListener('orientationchange', () => { rectsCached = false; }, { passive: true });

    if (steerClusterEl && leftBtn && rightBtn) {
      const handleClusterTouch = (e: TouchEvent) => {
        if (!rectsCached) cacheSteerRects();

        let isLeft = false;
        let isRight = false;
        const touches = e.touches;
        const len = touches.length;

        for (let i = 0; i < len; i++) {
          const t = touches[i];
          const x = t.clientX;
          const y = t.clientY;
          if (x >= leftL && x <= leftR && y >= leftT && y <= leftB) {
            isLeft = true;
          }
          if (x >= rightL && x <= rightR && y >= rightT && y <= rightB) {
            isRight = true;
          }
        }

        if (this.touchSteerLeft !== isLeft) {
          this.touchSteerLeft = isLeft;
          leftBtn.classList.toggle('pressed', isLeft);
        }
        if (this.touchSteerRight !== isRight) {
          this.touchSteerRight = isRight;
          rightBtn.classList.toggle('pressed', isRight);
        }
      };

      steerClusterEl.addEventListener('touchstart', handleClusterTouch, { passive: true });
      steerClusterEl.addEventListener('touchmove', handleClusterTouch, { passive: true });
      steerClusterEl.addEventListener('touchend', handleClusterTouch, { passive: true });
      steerClusterEl.addEventListener('touchcancel', () => {
        if (this.touchSteerLeft) {
          this.touchSteerLeft = false;
          leftBtn.classList.remove('pressed');
        }
        if (this.touchSteerRight) {
          this.touchSteerRight = false;
          rightBtn.classList.remove('pressed');
        }
      }, { passive: true });

      // Desktop click fallbacks
      leftBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.touchSteerLeft = true; leftBtn.classList.add('pressed'); });
      rightBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.touchSteerRight = true; rightBtn.classList.add('pressed'); });
      window.addEventListener('mouseup', () => {
        if (this.touchSteerLeft) { this.touchSteerLeft = false; leftBtn.classList.remove('pressed'); }
        if (this.touchSteerRight) { this.touchSteerRight = false; rightBtn.classList.remove('pressed'); }
      });
    }

    // ── Right Pedals: Throttle, Brake, Nitro ──
    this.bindTouchButton('touch-btn-gas', (pressed) => { this.touchGas = pressed; });
    this.bindTouchButton('touch-btn-brake', (pressed) => { this.touchBrake = pressed; });
    this.bindTouchButton('touch-btn-nitro', (pressed) => {
      if (pressed) this.nitroTriggered = true;
    });
  }

  private bindTouchButton(elementId: string, callback: (pressed: boolean) => void) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let isCurrentlyPressed = false;
    const setPressed = (pressed: boolean) => {
      if (isCurrentlyPressed !== pressed) {
        isCurrentlyPressed = pressed;
        el.classList.toggle('pressed', pressed);
        callback(pressed);
      }
    };

    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPressed(true);
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPressed(false);
    }, { passive: false });

    el.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPressed(false);
    }, { passive: false });

    // Pointer / mouse fallback for desktop testing
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setPressed(true);
    });
    window.addEventListener('mouseup', () => {
      if (isCurrentlyPressed) {
        setPressed(false);
      }
    });
  }

  public update(dt: number = 0.016) {
    let throttle = 0;
    let steer = 0;
    let drift = false;
    let respawn = false;
    let nitro = this.nitroTriggered;
    this.nitroTriggered = false;

    // Keyboard controls: WASD & Arrows for Drive (Aage/Peeche), Shift & Space for Nitro
    if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer += 1;

    // Mobile touch controls (Left Steering & Nitro, Right Pedals)
    if (this.touchGas) {
      throttle += 1;
      this.touchGasBufferTimer = 0.35; // 350ms inertia grace buffer
    } else if (this.touchGasBufferTimer > 0) {
      this.touchGasBufferTimer -= dt;
      throttle += 1; // Preserve full throttle during thumb shift
    }

    if (this.touchBrake) {
      this.touchGasBufferTimer = 0; // Immediate brake cancel
      throttle -= 1;
    }

    if (this.touchSteerLeft) steer -= 1;
    if (this.touchSteerRight) steer += 1;

    if (this.touchRespawn) {
      respawn = true;
      this.touchRespawn = false;
    }

    // Gamepad API integration
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = gamepads[0];
    if (pad) {
      const axisX = pad.axes[0] || 0;
      if (Math.abs(axisX) > 0.15) steer = axisX;

      const triggerR = pad.buttons[7]?.value || (pad.buttons[7]?.pressed ? 1 : 0);
      const triggerL = pad.buttons[6]?.value || (pad.buttons[6]?.pressed ? 1 : 0);
      if (triggerR > 0.1) throttle += triggerR;
      if (triggerL > 0.1) throttle -= triggerL;
      if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[2]?.pressed) drift = true;
      if (pad.buttons[0]?.pressed || pad.buttons[5]?.pressed) nitro = true;
    }

    this.state.throttle = Math.max(-1, Math.min(1, throttle));
    this.state.steer = Math.max(-1, Math.min(1, steer));
    this.state.drift = drift;
    this.state.nitro = nitro;
    this.state.respawn = respawn;
  }
}
