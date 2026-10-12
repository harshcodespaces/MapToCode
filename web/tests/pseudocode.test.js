import test from "node:test";
import assert from "node:assert/strict";
import { generateC, generatePython } from "../lib/flowchart.js";
import { diagramToPseudocode, pseudocodeToDiagram, PSEUDOCODE_EXAMPLES, tidyPseudocode } from "../lib/pseudocode.js";

test("turns the screenshot-style Input and IF/ELSE pseudocode into a valid flowchart", () => {
  const source = `BEGIN
INPUT x
IF x > 10 THEN
    x ← x + 5
ELSE
    x ← x - 5
END IF
OUTPUT x
END`;
  const diagram = pseudocodeToDiagram(source, "Pseudocode example");
  const result = generatePython(diagram);
  assert.deepEqual(result.errors, []);
  assert.match(result.code, /x = int\(input\("Enter x: "\)\)/);
  assert.match(result.code, /if x > 10:/);
  assert.match(result.code, /x = x \+ 5/);
  assert.match(result.code, /else:/);
  assert.match(result.code, /x = x - 5/);
  assert.match(result.code, /print\(x\)/);
});

test("converts a simple BEGIN, OUTPUT, END pseudocode program", () => {
  const diagram = pseudocodeToDiagram('BEGIN\nOUTPUT "Hello, friend"\nEND');
  assert.deepEqual(generatePython(diagram), { errors: [], code: 'print("Hello, friend")\n' });
});

test("keeps text input types and prompts when switching between editors", () => {
  const source = `BEGIN
INPUT name TYPE TEXT PROMPT "Your name? "
OUTPUT name
END`;
  const diagram = pseudocodeToDiagram(source);
  assert.equal(diagram.nodes.find((node) => node.type === "Input").inputType, "text");
  assert.equal(diagramToPseudocode(diagram), source);
  assert.deepEqual(generatePython(diagram), { errors: [], code: 'name = input("Your name? ")\nprint(name)\n' });
});

test("shows a clear error when decision branches are incomplete", () => {
  assert.throws(() => pseudocodeToDiagram(`BEGIN
IF age >= 18 THEN
OUTPUT "Adult"
END IF
END`), /needs ELSE and END IF/);
});

test("rejects nested decisions that the flowchart generator cannot represent", () => {
  const source = `BEGIN
IF x > 10 THEN
IF x > 20 THEN
OUTPUT "large"
ELSE
OUTPUT "medium"
END IF
ELSE
OUTPUT "small"
END IF
END`;
  assert.throws(() => pseudocodeToDiagram(source), /one IF\/ELSE decision/);
});

test("formats conditional branches with readable indentation", () => {
  const source = `BEGIN
IF x > 10 THEN
OUTPUT "yes"
ELSE
OUTPUT "no"
END IF
END`;
  assert.equal(tidyPseudocode(source), `BEGIN
IF x > 10 THEN
    OUTPUT "yes"
ELSE
    OUTPUT "no"
END IF
END`);
});

test("converts the current diagram into editable pseudocode", () => {
  const source = `BEGIN
INPUT age PROMPT "Enter your age: "
IF age >= 18 THEN
    OUTPUT "Adult"
ELSE
    OUTPUT "Minor"
END IF
END`;
  const result = pseudocodeToDiagram(source);
  assert.deepEqual(generatePython(result).errors, []);
  assert.equal(diagramToPseudocode(result), source);
});

test("every built-in pseudocode example converts to a valid flowchart", () => {
  assert.ok(PSEUDOCODE_EXAMPLES.length >= 4);
  for (const example of PSEUDOCODE_EXAMPLES) {
    const diagram = pseudocodeToDiagram(example.source, example.title);
    assert.deepEqual(generatePython(diagram).errors, [], `${example.title} should generate Python`);
    assert.deepEqual(generateC(diagram).errors, [], `${example.title} should generate C`);
  }
});
