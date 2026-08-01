// The 2D apply/codec modules log a per-jaw summary on every load, so a suite that
// reloads a design a few hundred times buries its own results. Warnings and errors
// still come through — jawStruct.test.mjs reports its round-trip diffs on console.error.
console.log = () => {};
console.debug = () => {};
console.info = () => {};
