# Benchmark evidence

The benchmark suite is evidence, not a timing gate. Normal pull-request CI never fails because a scenario is slower on a shared runner.

`benchmarks/scenarios.json` is the authoritative workload manifest. Each scenario has a stable id, deterministic seed, fixed input size, and fixed iteration count. Existing scenario ids must not be silently redefined; change the workload by adding a new versioned id such as `.v2`. `generatorVersion` must be incremented when shared generation semantics change.

The current scenarios exercise four public-core costs:

- `resolve.direct.256.v1`: direct single-stroke resolution across 256 bindings.
- `resolve.chord-prefix.256.v1`: pending chord-prefix resolution across 256 bindings.
- `conflicts.overlap.128.v1`: conflict analysis over a deliberately overlapping 128-binding registry.
- `profile.apply.256x96.v1`: profile application over 256 defaults and 96 replace/remove/add patches.

Both implementations emit JSON containing scenario ids, operation counts, elapsed time, nanoseconds per operation, and a deterministic checksum. The checksum is semantic evidence, not a performance score: investigate checksum changes before comparing timings because they may indicate that the workload or result changed.

Run TypeScript benchmarks with `npm run bench:ts` and Rust benchmarks with `npm run bench:rust`. Pass an output file as the final argument to either command to write JSON directly, for example `npm run bench:ts -- benchmark-results/typescript.json`.

The `Benchmarks` GitHub Actions workflow is manual (`workflow_dispatch`) and uploads Rust/TypeScript JSON plus runner metadata. Compare measurements only when the scenario id and generator version match, and prefer repeated runs on similar runner/runtime versions. Cross-language timings can be informative, but they are not a release criterion and should not by themselves justify moving browser execution across a TypeScript/WASM boundary.
