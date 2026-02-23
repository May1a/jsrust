import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { compileFileToIRModule } from "../../main.js";
import {
    serializeModule,
    VERSION as BINARY_IR_VERSION,
} from "../../ir_serialize.js";
import { deserializeModule } from "../../ir_deserialize.js";
import { validateModule } from "../../ir_validate.js";
import {
    test,
    assertEqual,
    assertTrue,
    getResults,
    clearErrors,
} from "../lib.js";

const fixtureDir = path.resolve(process.cwd(), "tests/fixtures/backend_ir_v2");
const manifestPath = path.join(fixtureDir, "manifest.json");
const binaryContractDoc = path.resolve(
    process.cwd(),
    "docs/backend/binary-ir-contract-v2.md",
);
const validationDoc = path.resolve(
    process.cwd(),
    "docs/backend/validation-semantics.md",
);
const backendInterfaceDoc = path.resolve(
    process.cwd(),
    "docs/backend/wasm-backend-interface.md",
);

function sha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function assertBytesEqual(actual, expected, context) {
    assertEqual(
        actual.length,
        expected.length,
        `${context}: byte length mismatch`,
    );

    for (let i = 0; i < actual.length; i++) {
        assertEqual(
            actual[i],
            expected[i],
            `${context}: byte mismatch at ${i}`,
        );
    }
}

export function runBinaryConformanceTests() {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    test("Conformance: backend contract docs exist", () => {
        assertTrue(fs.existsSync(binaryContractDoc));
        assertTrue(fs.existsSync(validationDoc));
        assertTrue(fs.existsSync(backendInterfaceDoc));
    });

    test("Conformance: manifest version matches serializer version", () => {
        assertEqual(manifest.contractVersion, BINARY_IR_VERSION);
    });

    test("Conformance: binary contract document references live version", () => {
        const text = fs.readFileSync(binaryContractDoc, "utf-8");
        assertTrue(text.includes("Binary IR Contract v2"));
        assertTrue(
            text.includes(`Version: \`${BINARY_IR_VERSION}\``) ||
                text.includes(`Version: ${BINARY_IR_VERSION}`),
        );
        assertTrue(text.includes("32 bytes"));
    });

    for (const fixture of manifest.fixtures) {
        test(`Conformance: fixture ${fixture.source} binary artifact`, () => {
            const rsPath = path.join(fixtureDir, fixture.source);
            const artifactPath = path.join(fixtureDir, fixture.artifact);

            const compile = compileFileToIRModule(rsPath, { validate: false });
            assertTrue(
                compile.ok,
                `Compile failed: ${compile.errors.join("; ")}`,
            );
            assertTrue(compile.module, "Compile result should include module");

            const validation = validateModule(compile.module);
            assertTrue(
                validation.ok,
                `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
            );

            const actual = serializeModule(compile.module);
            const expected = fs.readFileSync(artifactPath);

            assertEqual(
                fixture.bytes,
                expected.length,
                "Manifest byte size mismatch",
            );
            assertEqual(
                fixture.sha256,
                sha256Hex(expected),
                "Manifest hash mismatch",
            );

            assertBytesEqual(actual, expected, fixture.source);

            const roundtrip = deserializeModule(expected);
            assertTrue(
                roundtrip.ok,
                `Deserialize failed for ${fixture.source}`,
            );

            if (roundtrip.ok) {
                const roundtripValidation = validateModule(roundtrip.value);
                assertTrue(
                    roundtripValidation.ok,
                    `Roundtrip validation failed: ${roundtripValidation.errors.map((e) => e.message).join("; ")}`,
                );
            }
        });
    }

    const result = getResults();
    clearErrors();
    return result.errors.length;
}
