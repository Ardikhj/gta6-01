// Keyboard and mouse input for Solmar Bay. The game reads this one object;
// nothing else touches key events. Keys are tracked by `code` (KeyW, ArrowUp,
// Space, KeyE, ...) so layouts do not matter.
export const input = {
  keys: new Set(),
  pressed: new Set(), // keys pressed since the last consume (edge-triggered)
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  mousePressed: false,
  /** True while the key is held. */
  down(code) {
    return this.keys.has(code);
  },
  /** True once, on the frame the key went down. */
  wasPressed(code) {
    return this.pressed.has(code);
  },
  /** WASD / arrows as a -1..1 pair, normalised. */
  move() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  },
  /** Clear the edge-triggered sets at the end of a frame. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
  },
};

/** Attach listeners to a canvas element. Call once at boot. */
export function bindInput(canvas) {
  const onKey = (event) => {
    if (event.repeat) return;
    input.keys.add(event.code);
    input.pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', (event) => input.keys.delete(event.code));
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      input.mouseDown = true;
      input.mousePressed = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}
