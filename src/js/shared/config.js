// Centralized backend identifiers + service credentials.
//
// ⚠️ SECURITY: these values ship to the browser — they are bundled into
// dist/bundle.js and also served raw to the case-management / 2D module pages.
// Centralizing them here does NOT make them secret; anyone can read them in
// DevTools. The only real fix is to move authentication server-side (a token
// exchange or API proxy). This module just gives one place to rotate the value
// and a single import for app code. See CODE_FLAGS.md #1/#2.

export const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

export const VIEWER_UUID = "AC4gRQXZJoNz9EhhW36Q8jMJXBsf";

export const LOGIN_CREDENTIALS = {
  id: 0,
  username: "faid",
  email: "",
  password: "faid30413041D**",
  salt: "",
  create_time: 0,
  is_admin: 1,
  uuid: "",
  deleted: 0,
};
