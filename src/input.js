// Purpose: Keep track of the keys that are pressed, hand the physics the input
// object it expects, and run the key that starts a new world.

const RESTART_KEY = "r"; // starts a run with a fresh random seed

// Keys the page must not react to: without this the player would scroll the
// document while jumping (space) or running (arrow keys).
const GAME_KEYS = [" ", "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

/**
 * Start listening to the keyboard.
 * `onRestart` runs when the restart key is pressed.
 * Returns { readInput } for the game loop.
 */
export function createKeyboard(onRestart) {
  const pressed = new Set();

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === RESTART_KEY) {
      onRestart();
      return;
    }

    pressed.add(key);
    if (GAME_KEYS.includes(key)) event.preventDefault();
  });

  window.addEventListener("keyup", (event) => pressed.delete(event.key.toLowerCase()));

  return { readInput: () => readInput(pressed) };
}

/** Turn the pressed keys into the input object used by the physics. */
function readInput(pressed) {
  return {
    left: pressed.has("a") || pressed.has("arrowleft"),
    right: pressed.has("d") || pressed.has("arrowright"),
    jump: pressed.has(" ") || pressed.has("w") || pressed.has("arrowup"),
    down: pressed.has("s") || pressed.has("arrowdown"),
  };
}
