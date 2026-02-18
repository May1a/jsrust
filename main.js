import { tokenize, TokenType } from "./tokenizer.js";

const tokenNames = Object.fromEntries(
    Object.entries(TokenType).map(([k, v]) => [v, k])
);

const source = `
fn main() {
    let x = 42;
    let y = 3.14;
    let name = "hello";
    // this is a comment
    if x > 10 {
        return x + y;
    }
}
`;

const tokens = tokenize(source);

for (const token of tokens) {
    if (token.type === TokenType.Eof) continue;
    const typeName = tokenNames[token.type] || "Unknown";
    console.log(`${String(token.line).padStart(3)}:${String(token.column).padStart(3)} ${typeName.padEnd(12)} ${JSON.stringify(token.value)}`);
}
