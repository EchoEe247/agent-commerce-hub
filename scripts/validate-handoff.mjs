import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const schemaPath = new URL("../schemas/handoff.schema.json", import.meta.url);
const handoffPath = process.argv[2];

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(handoff);

if (!valid) {
  console.error("VALIDATION FAILED:");
  for (const err of validate.errors) {
    console.error(`- ${err.instancePath || "/"} ${err.message}`);
  }
  process.exit(1);
}
console.log("VALIDATION PASSED");
console.log(`status=${handoff.status}`);
console.log(`from=${handoff.from} to=${handoff.to}`);
console.log(`handoff_id=${handoff.handoff_id}`);
