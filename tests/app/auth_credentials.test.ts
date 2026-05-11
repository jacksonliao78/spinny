import assert from "node:assert/strict";
import test from "node:test";
import { authEmailForUsername, usernameFromAuthEmail } from "../../app/auth/credentials";

test("authEmailForUsername maps usernames to internal auth emails", () => {
  assert.equal(authEmailForUsername("Player_One"), "player_one@users.spinny.invalid");
});

test("authEmailForUsername rejects invalid usernames", () => {
  assert.throws(() => authEmailForUsername("nope!"));
  assert.throws(() => authEmailForUsername("ab"));
});

test("usernameFromAuthEmail reads only internal auth emails", () => {
  assert.equal(usernameFromAuthEmail("player_one@users.spinny.invalid"), "player_one");
  assert.equal(usernameFromAuthEmail("player@example.com"), null);
  assert.equal(usernameFromAuthEmail(undefined), null);
});
