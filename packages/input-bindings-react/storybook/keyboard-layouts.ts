export interface KeyboardLayoutFixture {
  id: "qwerty" | "qwertz" | "azerty" | "dvorak" | "colemak";
  label: string;
  description: string;
  layoutLabels: ReadonlyMap<string, string>;
}

export const KEYBOARD_LAYOUT_FIXTURES: readonly KeyboardLayoutFixture[] = [
  {
    id: "qwerty",
    label: "US QWERTY",
    description: "Default labels; logical and physical Z share the KeyZ position.",
    layoutLabels: new Map(),
  },
  {
    id: "qwertz",
    label: "German QWERTZ",
    description: "Representative German labels with Y/Z swapped and common umlaut keys.",
    layoutLabels: new Map([
      ["KeyY", "z"],
      ["KeyZ", "y"],
      ["BracketLeft", "ü"],
      ["Semicolon", "ö"],
      ["Quote", "ä"],
      ["Minus", "ß"],
      ["Equal", "´"],
      ["Backslash", "#"],
      ["Slash", "-"],
    ]),
  },
  {
    id: "azerty",
    label: "French AZERTY",
    description: "Representative French labels including A/Q, Z/W, M, and the number row.",
    layoutLabels: new Map([
      ["KeyQ", "a"],
      ["KeyW", "z"],
      ["KeyA", "q"],
      ["KeyZ", "w"],
      ["Semicolon", "m"],
      ["KeyM", ","],
      ["Comma", ";"],
      ["Period", ":"],
      ["Slash", "!"],
      ["Digit1", "&"],
      ["Digit2", "é"],
      ["Digit3", '"'],
      ["Digit4", "'"],
      ["Digit5", "("],
      ["Digit6", "-"],
      ["Digit7", "è"],
      ["Digit8", "_"],
      ["Digit9", "ç"],
      ["Digit0", "à"],
    ]),
  },
  {
    id: "dvorak",
    label: "Dvorak",
    description: "Standard Dvorak letter positions represented through Keyboard Layout Map labels.",
    layoutLabels: new Map([
      ["KeyQ", "'"],
      ["KeyW", ","],
      ["KeyE", "."],
      ["KeyR", "p"],
      ["KeyT", "y"],
      ["KeyY", "f"],
      ["KeyU", "g"],
      ["KeyI", "c"],
      ["KeyO", "r"],
      ["KeyP", "l"],
      ["KeyA", "a"],
      ["KeyS", "o"],
      ["KeyD", "e"],
      ["KeyF", "u"],
      ["KeyG", "i"],
      ["KeyH", "d"],
      ["KeyJ", "h"],
      ["KeyK", "t"],
      ["KeyL", "n"],
      ["Semicolon", "s"],
      ["KeyZ", ";"],
      ["KeyX", "q"],
      ["KeyC", "j"],
      ["KeyV", "k"],
      ["KeyB", "x"],
      ["KeyN", "b"],
      ["KeyM", "m"],
    ]),
  },
  {
    id: "colemak",
    label: "Colemak",
    description: "Standard Colemak letter positions while preserving the familiar bottom-left shortcuts.",
    layoutLabels: new Map([
      ["KeyE", "f"],
      ["KeyR", "p"],
      ["KeyT", "g"],
      ["KeyY", "j"],
      ["KeyU", "l"],
      ["KeyI", "u"],
      ["KeyO", "y"],
      ["KeyP", ";"],
      ["KeyS", "r"],
      ["KeyD", "s"],
      ["KeyF", "t"],
      ["KeyG", "d"],
      ["KeyJ", "n"],
      ["KeyK", "e"],
      ["KeyL", "i"],
      ["Semicolon", "o"],
      ["KeyN", "k"],
    ]),
  },
] as const;

export function keyboardLayoutFixture(
  id: KeyboardLayoutFixture["id"],
): KeyboardLayoutFixture {
  const fixture = KEYBOARD_LAYOUT_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown keyboard layout fixture: ${id}`);
  return fixture;
}
