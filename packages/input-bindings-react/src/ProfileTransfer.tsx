import {
  validateCompiledRegistry,
  type CompiledActionRegistry,
  type Profile,
} from "@moritzbrantner/input-bindings";
import { useMemo, useState } from "react";

export function ProfileTransfer({
  compiledRegistry,
  profile,
  onApply,
  onClose,
}: {
  compiledRegistry: CompiledActionRegistry;
  profile: Profile;
  onApply: (profile: Profile) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(profile, null, 2));
  const preview = useMemo(
    () => parseProfilePreview(compiledRegistry, draft),
    [compiledRegistry, draft],
  );
  return (
    <section className="ib-transfer" aria-labelledby="ib-transfer-title">
      <h2 id="ib-transfer-title">Import / export profile</h2>
      <p>Profiles contain only user deltas over consumer-owned defaults.</p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={14}
        spellCheck={false}
      />
      <div className="ib-transfer-preview" aria-live="polite">
        {preview.error && <strong>Cannot import: {preview.error}</strong>}
        {!preview.error && preview.report?.valid && (
          <span>
            Preview valid. {preview.profile?.patches.length ?? 0} patches will be applied.
          </span>
        )}
        {!preview.error && !preview.report?.valid && (
          <span>
            Preview rejected: {preview.report?.diagnostics.map((item) => item.kind).join(", ")}
          </span>
        )}
      </div>
      <div className="ib-recorder-actions">
        <button
          type="button"
          disabled={!preview.profile || !preview.report?.valid}
          onClick={() => preview.profile && onApply(preview.profile)}
        >
          Apply imported profile
        </button>
        <button type="button" onClick={() => setDraft(JSON.stringify(profile, null, 2))}>
          Restore current JSON
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}

function parseProfilePreview(compiledRegistry: CompiledActionRegistry, draft: string) {
  try {
    const value = JSON.parse(draft) as unknown;
    if (!isProfile(value)) {
      return { error: "JSON is not a profile with an id and patches array." };
    }
    try {
      return { profile: value, report: validateCompiledRegistry(compiledRegistry, value) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Profile validation failed." };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON." };
  }
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { id?: unknown; patches?: unknown };
  return typeof candidate.id === "string" && Array.isArray(candidate.patches);
}
