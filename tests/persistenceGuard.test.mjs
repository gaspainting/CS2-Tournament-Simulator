import assert from "node:assert/strict";
import test from "node:test";
import { createPersistenceGuard } from "../.test-dist/src/state/persistenceGuard.js";

test("a corrupted storage load blocks persistence until an explicit recovery", () => {
  const guard = createPersistenceGuard();
  assert.equal(guard.shouldPersist(true), false);
  guard.markLoadFailure();
  assert.equal(guard.shouldPersist(false), false);
  assert.equal(guard.shouldPersist(false), false);
  guard.markRecovery();
  assert.equal(guard.shouldPersist(false), true);
});
