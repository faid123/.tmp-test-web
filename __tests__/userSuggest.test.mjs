/**
 * @jest-environment jsdom
 *
 * The invite-box roster in src/js/shared/userSuggest.js: what "N shared cases"
 * counts. It once counted every case any account on the browser had ever seen.
 */
import { jest } from "@jest/globals";

const signIn = (uuid, username) =>
  localStorage.setItem("loggedInUser", JSON.stringify({ uuid, username }));

// Cold copy of the module: the cache lives at module scope.
async function freshModule() {
  jest.resetModules();
  return import("../src/js/shared/userSuggest.js");
}

const sharedFor = (list, name) =>
  list.find((r) => r.name.toLowerCase() === name.toLowerCase())?.shared;

beforeEach(() => {
  localStorage.clear();
});

describe("roster storage", () => {
  test("is keyed per account — one browser, two users, two rosters", async () => {
    signIn("uuid-nyunt", "nyunt");
    let mod = await freshModule();
    mod.recordCollaborators([{ name: "shafik", caseId: 1 }]);

    signIn("uuid-faid", "faid123");
    mod = await freshModule();
    expect(mod.getCollaborators()).toEqual([]);

    // …and the first account's roster survived the other account's session.
    signIn("uuid-nyunt", "nyunt");
    mod = await freshModule();
    expect(sharedFor(mod.getCollaborators(), "shafik")).toBe(1);
  });

  test("drops the legacy unscoped key rather than adopting its counts", async () => {
    localStorage.setItem(
      "smartrpd.collaborators",
      JSON.stringify([{ name: "faid123", cases: ["1", "2", "3"] }])
    );
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();

    expect(mod.getCollaborators()).toEqual([]);
    expect(localStorage.getItem("smartrpd.collaborators")).toBeNull();
  });

  test("records nothing when nobody is signed in", async () => {
    const mod = await freshModule();
    mod.recordCollaborators([{ name: "shafik", caseId: 1 }]);

    const stored = Object.keys(localStorage).filter((k) => k.startsWith("smartrpd.collaborators"));
    expect(stored).toEqual([]);
  });
});

describe("counting", () => {
  test("counts each case once however often the list repaints", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    const paint = [
      { name: "shafik", caseId: 10 },
      { name: "shafik", caseId: 11 },
    ];
    mod.recordCollaborators(paint);
    mod.recordCollaborators(paint);

    expect(sharedFor(mod.getCollaborators(), "shafik")).toBe(2);
  });

  test("leaves the signed-in account out — you don't share with yourself", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([
      { name: "nyunt", caseId: 10 },
      { name: "NYUNT", caseId: 11 },
      { name: "shafik", caseId: 10 },
    ]);

    expect(mod.getCollaborators().map((r) => r.name)).toEqual(["shafik"]);
  });

  test("skips the unset-owner placeholder", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([{ name: "N/A", caseId: 10 }]);

    expect(mod.getCollaborators()).toEqual([]);
  });

  test("ranks by shared count, ties alphabetically", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([
      { name: "shafik", caseId: 1 },
      { name: "shafik", caseId: 2 },
      { name: "zoe", caseId: 3 },
      { name: "dentallab", caseId: 4 },
    ]);

    expect(mod.getCollaborators().map((r) => r.name)).toEqual(["shafik", "dentallab", "zoe"]);
  });
});

describe("reconcileCollaborators", () => {
  test("stops counting cases the account is no longer on", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([
      { name: "faid123", caseId: 1 },
      { name: "faid123", caseId: 2 },
      { name: "faid123", caseId: 99 }, // deleted, unshared, or another account's
    ]);

    expect(mod.reconcileCollaborators([1, 2])).toBe(true);
    expect(sharedFor(mod.getCollaborators(), "faid123")).toBe(2);
  });

  test("keeps the name at zero rather than forgetting the person", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([{ name: "faid123", caseId: 99 }]);
    mod.reconcileCollaborators([1, 2]);

    // shared: 0 is what userSuggest labels "Worked with before" — still a name
    // worth offering, just not one to rank on a count it no longer has.
    expect(mod.getCollaborators()).toEqual([{ name: "faid123", shared: 0 }]);
  });

  test("survives the reload it was written for", async () => {
    signIn("uuid-nyunt", "nyunt");
    let mod = await freshModule();
    mod.recordCollaborators([
      { name: "faid123", caseId: 1 },
      { name: "faid123", caseId: 99 },
    ]);
    mod.reconcileCollaborators([1]);

    mod = await freshModule();
    expect(sharedFor(mod.getCollaborators(), "faid123")).toBe(1);
  });

  test("reports no change when every counted case is still current", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([{ name: "faid123", caseId: 1 }]);

    expect(mod.reconcileCollaborators([1, 2, 3])).toBe(false);
  });

  test("id types don't matter — the list sends numbers, storage holds strings", async () => {
    signIn("uuid-nyunt", "nyunt");
    const mod = await freshModule();
    mod.recordCollaborators([{ name: "faid123", caseId: "1" }]);

    expect(mod.reconcileCollaborators([1])).toBe(false);
    expect(sharedFor(mod.getCollaborators(), "faid123")).toBe(1);
  });
});
