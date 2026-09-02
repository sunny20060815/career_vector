const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { formatFeedbackEmail, issueAssertion, normalizeFeedback, normalizePhone } = require("./index");

assert.equal(normalizePhone("156 0081 9195"), "15600819195");
assert.equal(normalizePhone("+86 15600819195"), "15600819195");
assert.equal(normalizePhone("12345"), null);

const { privateKey } = crypto.generateKeyPairSync("ed25519");
process.env.PHONE_AUTH_PRIVATE_KEY_B64 = privateKey
  .export({ format: "der", type: "pkcs8" })
  .toString("base64");
assert.equal(issueAssertion("15600819195", "a".repeat(32)).split(".").length, 2);

const feedback = normalizeFeedback({
  category: "data",
  message: "技能需求数据似乎没有及时更新。"
});
assert.equal(feedback.category, "data");
assert.match(formatFeedbackEmail(feedback, { id: "user-1", user_metadata: { phone_last4: "9195" } }), /数据问题/);
assert.equal(normalizeFeedback({ category: "data", message: "太短" }), null);

console.log("Phone and feedback validation tests passed");
