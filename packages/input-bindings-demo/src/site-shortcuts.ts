import type { ActionRegistry, Binding } from "@moritzbrantner/input-bindings";
import { InputRuntimeController } from "@moritzbrantner/input-bindings-runtime";
import { attachKeyboardRuntime } from "@moritzbrantner/input-bindings-web";

const logical = (
  id: string,
  action: string,
  key: string,
  modifiers: Binding["sequence"][number] extends { modifiers?: infer M } ? M : never = {},
): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "logical", value: key }, modifiers }],
});

const registry: ActionRegistry = {
  actions: [
    navigation("site.editor", "Keybinding editor", "1"),
    navigation("site.conflicts", "Conflict lab", "2"),
    navigation("site.runtime", "Runtime lab", "3"),
    navigation("site.devices", "Device lab", "4"),
    {
      id: "site.help",
      title: "Show site shortcuts",
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("site.help.default", "site.help", "?")],
      provenance: { source: "input-bindings-pages", version: "1" },
    },
  ],
};

function navigation(id: string, title: string, digit: string): ActionRegistry["actions"][number] {
  return {
    id,
    title,
    repeatPolicy: "never",
    allowedDevices: ["keyboard"],
    defaults: [logical(`${id}.default`, id, digit, { alt: true })],
    provenance: { source: "input-bindings-pages", version: "1" },
  };
}

const destinations: Readonly<Record<string, string>> = {
  "site.editor": "./",
  "site.conflicts": "./conflicts.html",
  "site.runtime": "./runtime.html",
  "site.devices": "./devices.html",
};

const controller = new InputRuntimeController({
  registry,
  getActiveContexts: () => new Set(["pages"]),
  consumePolicy: "matched",
  onDispatch(dispatch) {
    if (dispatch.phase !== "press") return;
    if (dispatch.action === "site.help") {
      toggleHelp();
      return;
    }
    const destination = destinations[dispatch.action];
    if (destination) window.location.assign(new URL(destination, window.location.href));
  },
});

attachKeyboardRuntime(controller, {
  ignoreTextEntry: true,
  mode: "logical",
});

installHint();

function installHint(): void {
  const hint = document.createElement("button");
  hint.type = "button";
  hint.className = "site-shortcut-hint";
  hint.textContent = "Shortcuts ?";
  hint.setAttribute("aria-haspopup", "dialog");
  hint.addEventListener("click", toggleHelp);
  document.body.append(hint);
}

function toggleHelp(): void {
  const existing = document.getElementById("site-shortcut-help");
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "site-shortcut-help";
  overlay.className = "site-shortcut-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "GitHub Pages shortcuts");
  overlay.innerHTML = `
    <div class="site-shortcut-dialog">
      <div class="site-shortcut-dialog-header">
        <h2>Site hotkeys</h2>
        <button type="button" data-close>Close</button>
      </div>
      <p>These shortcuts are dispatched through <code>input-bindings-runtime</code>.</p>
      <dl>
        <div><dt><kbd>Alt</kbd> + <kbd>1</kbd></dt><dd>Keybinding editor</dd></div>
        <div><dt><kbd>Alt</kbd> + <kbd>2</kbd></dt><dd>Conflict lab</dd></div>
        <div><dt><kbd>Alt</kbd> + <kbd>3</kbd></dt><dd>Runtime lab</dd></div>
        <div><dt><kbd>Alt</kbd> + <kbd>4</kbd></dt><dd>Device lab</dd></div>
        <div><dt><kbd>?</kbd></dt><dd>Toggle this help</dd></div>
      </dl>
    </div>`;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || (event.target as Element).closest?.("[data-close]")) {
      overlay.remove();
    }
  });
  document.body.append(overlay);
  (overlay.querySelector("[data-close]") as HTMLButtonElement | null)?.focus();
}
