#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { compileFileToIRModule } from "../main.js";
import { serializeModule, VERSION as BINARY_IR_VERSION } from "../ir_serialize.js";
import { validateModule } from "../ir_validate.js";

const fixtureDir = path.resolve(process.cwd(), "tests/fixtures/backend_ir_v1");

/**
 * @typedef {{ source: string, artifact: string, bytes: number, sha256: string }} BackendFixtureManifestEntry
 * @typedef {{ contractVersion: number, generatedBy: string, fixtures: BackendFixtureManifestEntry[] }} BackendFixtureManifest
 */

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function sha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function main() {
    const entries = fs
        .readdirSync(fixtureDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".rs"))
        .map((entry) => entry.name)
        .sort();

    /** @type {BackendFixtureManifest} */
    const manifest = {
        contractVersion: BINARY_IR_VERSION,
        generatedBy: "scripts/generate_backend_fixtures.js",
        fixtures: [],
    };

    for (const name of entries) {
        const rsPath = path.join(fixtureDir, name);
        const compile = compileFileToIRModule(rsPath, { validate: false });
        if (!compile.ok || !compile.module) {
            const message = compile.errors.join("; ");
            throw new Error(`Failed to compile fixture ${name}: ${message}`);
        }

        const validation = validateModule(compile.module);
        if (!validation.ok) {
            throw new Error(
                `Fixture ${name} produced invalid IR: ${validation.errors.map((e) => e.message).join("; ")}`,
            );
        }

        const bytes = serializeModule(compile.module);
        const outName = name.replace(/\.rs$/, ".bin");
        const outPath = path.join(fixtureDir, outName);
        fs.writeFileSync(outPath, bytes);

        manifest.fixtures.push({
            source: name,
            artifact: outName,
            bytes: bytes.length,
            sha256: sha256Hex(bytes),
        });
    }

    const manifestPath = path.join(fixtureDir, "manifest.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

    console.log(`Generated ${manifest.fixtures.length} backend fixtures in ${fixtureDir}`);
}

main();
