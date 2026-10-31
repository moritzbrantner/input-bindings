import { useEffect, useState } from "react";
export function useKeyboardLayoutLabels() {
    const [labels, setLabels] = useState(() => new Map());
    useEffect(() => {
        let cancelled = false;
        const keyboard = navigator.keyboard;
        if (!keyboard?.getLayoutMap) {
            return;
        }
        keyboard
            .getLayoutMap()
            .then((layoutMap) => {
            if (!cancelled) {
                setLabels(new Map(layoutMap));
            }
        })
            .catch(() => {
            /* Physical fallback remains usable. */
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return labels;
}
