import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardSource = await readFile(
  new URL("../src/testdata/thucmuctest.jsx", import.meta.url),
  "utf8",
);

test("live DMS exposes a model-unavailable presentation state", () => {
  assert.match(dashboardSource, /unavailable:\s*\{\s*vi:\s*"MODEL UNAVAILABLE"/);
  assert.match(dashboardSource, /label:\s*"unavailable"/);
  assert.match(dashboardSource, /setHistory\(\[\]\)/);
});

test("live DMS does not silently relabel unavailable inference as safe", () => {
  assert.doesNotMatch(
    dashboardSource,
    /(?:catch|!res\.ok)[\s\S]{0,300}label:\s*"safe"/,
  );
});
