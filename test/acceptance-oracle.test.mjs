import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAcceptanceOracle, buildCounterfactualChecks, evaluateAcceptanceOracle } from "../src/acceptance-oracle.mjs";

describe("AcceptanceOracleV1", () => {
  it("evaluates exact terms and regex expectations together", () => {
    const oracle = buildAcceptanceOracle([
      "E_AUTH_104",
      {
        type: "regex",
        pattern: "src/auth/token_service\\.py:117",
        label: "token service frame"
      }
    ]);
    const result = evaluateAcceptanceOracle([
      "ERROR E_AUTH_104",
      "first failing frame: src/auth/token_service.py:117"
    ].join("\n"), oracle);

    assert.equal(oracle.schema, "AcceptanceOracleV1");
    assert.equal(oracle.type, "contains-and-regex");
    assert.equal(result.schema, "AcceptanceOracleResultV1");
    assert.equal(result.success, true);
    assert.equal(result.matched_count, 2);
    assert.deepEqual(result.missing, []);
  });

  it("detects counterfactual removals for regex expectations", () => {
    const oracle = buildAcceptanceOracle([
      "E_AUTH_104",
      "regex:/src\\/auth\\/token_service\\.py:117/"
    ]);
    const counterfactuals = buildCounterfactualChecks(
      "ERROR E_AUTH_104\nfirst failing frame: src/auth/token_service.py:117",
      oracle
    );

    assert.equal(counterfactuals.length, 2);
    assert.equal(counterfactuals.filter((item) => item.detected).length, 2);
    assert.ok(counterfactuals.some((item) => item.type === "regex" && item.present));
  });

  it("reports insensitive regex expectations when another match hides removal", () => {
    const oracle = buildAcceptanceOracle([
      "regex:/DEBUG/"
    ]);
    const counterfactuals = buildCounterfactualChecks(
      "DEBUG first\nDEBUG second",
      oracle
    );

    assert.equal(counterfactuals.length, 1);
    assert.equal(counterfactuals[0].present, true);
    assert.equal(counterfactuals[0].detected, false);
    assert.equal(counterfactuals[0].reason, "oracle-missed-removal");
  });

  it("reports invalid regex expectations as failed checks", () => {
    const oracle = buildAcceptanceOracle([
      {
        type: "regex",
        pattern: "[unterminated",
        label: "broken regex"
      }
    ]);
    const result = evaluateAcceptanceOracle("anything", oracle);

    assert.equal(result.success, false);
    assert.deepEqual(result.missing, ["broken regex"]);
    assert.equal(result.missing_details[0].reason, "invalid-regex");
    assert.match(result.missing_details[0].error, /Invalid regular expression/);
  });
});
