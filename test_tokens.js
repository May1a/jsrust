// @ts-nocheck
import { tokenize, TokenType } from './tokenizer.js';

const source = 'match c { Color::Red => 1, Color::Green => 2, Color::Blue => 3 }';
const tokens = tokenize(source);

// Print token names
const tokenNames = {};
for (const [name, value] of Object.entries(TokenType)) {
  tokenNames[value] = name;
}

for (const t of tokens) {
  console.log(`${tokenNames[t.type]}: '${t.value}'`);
}