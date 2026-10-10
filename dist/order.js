/**
 * Orders ids by UTF-16 code units, as the Rust core does, so equal-ranked binding winners
 * are locale-independent and identical across runtimes. Internal; not part of the API.
 */
export function compareCodeUnits(left, right) {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}
