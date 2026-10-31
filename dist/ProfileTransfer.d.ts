import { type CompiledActionRegistry, type Profile } from "@moritzbrantner/input-bindings";
export declare function ProfileTransfer({ compiledRegistry, profile, onApply, onClose, }: {
    compiledRegistry: CompiledActionRegistry;
    profile: Profile;
    onApply: (profile: Profile) => void;
    onClose: () => void;
}): import("react").JSX.Element;
