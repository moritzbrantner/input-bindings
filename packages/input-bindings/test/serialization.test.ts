import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  canonicalizePortableConfiguration,
  serializePortableConfiguration,
  type PortableConfigurationV1,
} from "../src/public.ts";

const input = JSON.parse(
  readFileSync(new URL("../../../fixtures/serialization_v1_input.json", import.meta.url), "utf8"),
) as PortableConfigurationV1;
const expected = readFileSync(
  new URL("../../../fixtures/serialization_v1_expected.json", import.meta.url),
  "utf8",
).trimEnd();

test("portable v1 serialization is stable and compatibility-locked", () => {
  assert.equal(serializePortableConfiguration(input), expected);
});

test("portable canonicalization is idempotent", () => {
  const once = canonicalizePortableConfiguration(input);
  const twice = canonicalizePortableConfiguration(once);
  assert.deepEqual(twice, once);
  assert.equal(serializePortableConfiguration(twice), expected);
});
