import { useEffect, useState } from "react";

export function useKeyboardLayoutLabels(): ReadonlyMap<string, string> {
  const [labels, setLabels] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const keyboard = (
      navigator as Navigator & {
        keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> };
      }
    ).keyboard;
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
