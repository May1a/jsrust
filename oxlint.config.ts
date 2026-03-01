import type { DummyRuleMap, RuleCategories } from "oxlint";
import { defineConfig } from "oxlint";

const disabledRules: DummyRuleMap = {
    "func-style": "off",
    "id-length": "off",
    "max-params": "off",
    "sort-imports": "off",
    "eslint/sort-keys": "off",
    "no-console": "off",
    "class-methods-use-this": "off",
    "no-continue": "off",
    "no-bitwise": "off",
    "no-ternary": "off",
    "no-plusplus": "off",
    "no-undefined": "off",
    "filename-case": "off",
    "prefer-readonly-parameter-types": "off",
    "unicorn/number-literal-case": "off",
    "init-declarations": "off",
    "typescript/consistent-type-definitions": "off",
};

const stricterRules: DummyRuleMap = {
    "typescript/ban-ts-comment": "error",
    "no-deprecated": "error",
    "unicorn/no-instanceof-array": "error",
    "unicorn/no-this-assignment": "error",
    "typescript/only-throw-error": "error",
};

const categoriesEnable: RuleCategories = {
    correctness: "error",
    nursery: "error",
    perf: "error",
    restriction: "error",
    style: "error",
    suspicious: "error",
};

export default defineConfig({
    categories: categoriesEnable,
    env: {
        builtin: true,
    },
    ignorePatterns: [
        "tests/**",
        "dist/**",
        "main.js",
        "oxlint.config.ts",
        "third_party/**",
        "docs/**",
        "examples/**",
        "out/**",
    ],
    overrides: [
        {
            env: {
                node: true,
            },
            files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
            rules: {
                ...disabledRules,
                ...stricterRules,
                "constructor-super": "error",
                curly: ["error", "multi-line"],
                eqeqeq: ["error", "always"],
                "max-statements": ["error", { max: 30 }],
                "no-else-return": [
                    "error",
                    {
                        allowElseIf: false,
                    },
                ],
                "no-use-before-define": [
                    "error",
                    {
                        classes: false,
                        functions: false,
                        variables: true,
                    },
                ],
                // Disable strict rules that generate too much noise
                "jsdoc/capitalization": "off",
                "jsdoc/text-escaping": "off",
                "jsdoc/check-access": "off",
                "jsdoc/no-defaults": "off",
                "jsdoc/tag-lines": "off",
                "eslint-plugin-jsdoc/capitalization": "off",
            },
        },
    ],
    plugins: ["typescript", "eslint", "unicorn", "oxc"],
    rules: {
        "@typescript-eslint/ban-ts-comment": [
            "error",
            {
                minimumDescriptionLength: 120,
            },
        ],
        "@typescript-eslint/consistent-indexed-object-style": [
            "error",
            "record",
        ],
        "@typescript-eslint/restrict-plus-operands": [
            "error",
            {
                allowAny: false,
                allowBoolean: false,
                allowNullish: false,
                allowNumberAndString: false,
                allowRegExp: false,
            },
        ],
        "@typescript-eslint/restrict-template-expressions": [
            "error",
            {
                allowAny: false,
                allowBoolean: false,
                allowNever: false,
                allowNullish: false,
                allowNumber: true,
                allowRegExp: false,
            },
        ],
        "@typescript-eslint/return-await": [
            "error",
            "error-handling-correctness-only",
        ],
        "eslint/no-magic-numbers": [
            "error",
            {
                ignoreEnums: true,
                ignoreDefaultValues: true,
                ignoreNumericLiteralTypes: true,
                ignoreReadonlyClassProperties: true,
                ignoreTypeIndexes: true,
                ignoreClassFieldInitialValues: true,
                ignoreArrayIndexes: true,
                ignore: [0, 1, 2],
            },
        ],
    },
    settings: {
        jsdoc: {
            augmentsExtendsReplacesDocs: false,
            exemptDestructuredRootsFromChecks: false,
            ignoreInternal: false,
            ignorePrivate: false,
            ignoreReplacesDocs: true,
            implementsReplacesDocs: false,
            overrideReplacesDocs: true,
            tagNamePreference: {},
        },
        "jsx-a11y": {
            attributes: {},
            components: {},
        },
        next: {
            rootDir: [],
        },
        react: {
            componentWrapperFunctions: [],
            formComponents: [],
            linkComponents: [],
        },
        vitest: {
            typecheck: false,
        },
    },
});
