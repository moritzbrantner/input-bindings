import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ActionRegistry, Binding, Profile } from "@moritzbrantner/input-bindings";
import { KeybindingEditor } from "@moritzbrantner/input-bindings-react";
import "@moritzbrantner/input-bindings-react/styles.css";
import fixture from "../../../fixtures/conflicts.json";
import "./site.css";

const STORAGE_KEY = "input-bindings-conflict-fixture-profile-v1";
const PROFILE_ID = "conflict-fixture-user";
const bindings = fixture.bindings as Binding[];
const actionIds = [...new Set(bindings.map((binding) => binding.action))].sort();

const registry: ActionRegistry = {
  actions: actionIds.map((actionId) => ({
    id: actionId,
    title: actionId,
    description: "Generated directly from fixtures/conflicts.json.",
    categoryPath: ["Shared conflict fixture"],
    repeatPolicy: "never",
    allowedDevices: ["keyboard"],
    defaults: bindings.filter((binding) => binding.action === actionId),
    provenance: { source: "fixtures/conflicts.json", version: "1" },
  })),
};

function loadProfile(): Profile {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return { id: PROFILE_ID, patches: [] };
    const parsed = JSON.parse(value) as Partial<Profile>;
    if (typeof parsed.id === "string" && Array.isArray(parsed.patches)) return parsed as Profile;
  } catch {
    // Corrupt local state is ignored rather than reinterpreted.
  }
  return { id: PROFILE_ID, patches: [] };
}

function ConflictLab() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const updateProfile = (next: Profile) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / shared fixture</p>
          <h1>Conflict fixture lab</h1>
          <p>
            This catalog is generated from the same conflict fixture used by Rust and TypeScript conformance tests. Edit it here to explore exact overrides, ambiguity, duplicate bindings, and chord-prefix overlap.
          </p>
        </div>
        <a href="./">Back to realistic catalog</a>
      </header>
      <KeybindingEditor registry={registry} profile={profile} onProfileChange={updateProfile} />
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <ConflictLab />
  </StrictMode>,
);
