import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DIAGRAM, generateC, generatePython, validateConnection, validateDiagram } from "../lib/flowchart.js";

function diagram(nodes, edges) {
  return { id: "test", name: "Test", nodes, edges };
}

const start = { id: "start", type: "Start", label: "Start" };
const end = { id: "end", type: "End", label: "End" };

test("prevents self-connections, cycles, and unsupported multiple incoming connections", () => {
  const nodes = [start, { id: "input", type: "Input", label: "Ask", variable: "age", prompt: "Age?", inputType: "number" }, { id: "out", type: "Output", label: "Show", message: "Done" }, end];
  const edges = [{ id: "a", from: "start", to: "input" }, { id: "b", from: "input", to: "out" }];
  const project = diagram(nodes, edges);
  assert.match(validateConnection(project, "input", "input"), /cannot connect back to itself/);
  assert.match(validateConnection(project, "out", "input"), /already has an incoming connection/);
  assert.match(validateConnection(project, "out", "start"), /back to Start/);
  assert.equal(validateConnection(project, "out", "end"), "");
  assert.match(validateConnection({ ...project, edges: [...edges, { id: "c", from: "out", to: "end" }] }, "end", "input"), /cannot have an outgoing/);
});

test("reports a saved diagram that already contains a loop", () => {
  const project = diagram(
    [start, { id: "first", type: "Output", label: "First", message: "1" }, { id: "second", type: "Output", label: "Second", message: "2" }, end],
    [{ id: "a", from: "start", to: "first" }, { id: "b", from: "first", to: "second" }, { id: "c", from: "second", to: "first" }],
  );
  assert.ok(validateDiagram(project).some((message) => message.includes("loops back on itself")));
});

test("generates a Start → Output → End program", () => {
  const project = diagram(
    [start, { id: "say", type: "Output", label: "Say hello", message: "Hello, world!" }, end],
    [
      { id: "a", from: "start", to: "say" },
      { id: "b", from: "say", to: "end" },
    ],
  );

  assert.deepEqual(generatePython(project), { errors: [], code: 'print("Hello, world!")\n' });
});

test("generates the built-in age-check example from its structured blocks", () => {
  assert.equal(generatePython(DEFAULT_DIAGRAM).code, 'age = int(input("Enter your age: "))\n\nif age >= 18:\n    print("Adult")\nelse:\n    print("Minor")\n');
});

test("generates compilable C for the built-in True/False age check", () => {
  const result = generateC(DEFAULT_DIAGRAM);
  assert.deepEqual(result.errors, []);
  assert.match(result.code, /#include <stdio\.h>/);
  assert.match(result.code, /scanf\("%d", &age\);/);
  assert.match(result.code, /if \(age >= 18\) \{/);
  assert.match(result.code, /printf\("%s\\n", "Adult"\);\n    } else \{/);
  assert.match(result.code, /printf\("%s\\n", "Minor"\);/);
});

test("generates C for text input and text output", () => {
  const project = diagram(
    [start, { id: "name", type: "Input", label: "Ask name", variable: "name", prompt: "Your name? ", inputType: "text" }, { id: "echo", type: "Output", label: "Show name", outputMode: "expression", expression: "name" }, end],
    [{ id: "a", from: "start", to: "name" }, { id: "b", from: "name", to: "echo" }, { id: "c", from: "echo", to: "end" }],
  );
  const result = generateC(project);
  assert.deepEqual(result.errors, []);
  assert.match(result.code, /char name\[256\];/);
  assert.match(result.code, /scanf\("%255s", name\);/);
  assert.match(result.code, /printf\("%s\\n", name\);/);
});

test("explains C expressions outside its supported whole-number subset", () => {
  const project = diagram(
    [start, { id: "math", type: "Process", label: "Divide", assignment: "total = 12 / 3" }, { id: "say", type: "Output", label: "Done", message: "Done" }, end],
    [{ id: "a", from: "start", to: "math" }, { id: "b", from: "math", to: "say" }, { id: "c", from: "say", to: "end" }],
  );
  const result = generateC(project);
  assert.equal(result.code, "");
  assert.match(result.errors.join(" "), /C generation currently supports whole-number arithmetic/);

  const unsupportedCondition = {
    ...DEFAULT_DIAGRAM,
    nodes: DEFAULT_DIAGRAM.nodes.map((node) => node.id === "adult-check" ? { ...node, condition: "not age == 18" } : node),
  };
  assert.match(generateC(unsupportedCondition).errors.join(" "), /does not support.*not/i);
});

test("supports a safe Process assignment and checks that variables exist first", () => {
  const project = diagram(
    [start, { id: "math", type: "Process", label: "Calculate", assignment: "total = 3 * 7" }, { id: "done", type: "Output", label: "Show result", message: "Finished" }, end],
    [{ id: "a", from: "start", to: "math" }, { id: "b", from: "math", to: "done" }, { id: "c", from: "done", to: "end" }],
  );
  assert.equal(generatePython(project).code, 'total = 3 * 7\nprint("Finished")\n');
  const invalid = { ...project, nodes: project.nodes.map((node) => node.id === "math" ? { ...node, assignment: "total = price * 7" } : node) };
  assert.ok(validateDiagram(invalid).some((message) => message.includes("before it has a value")));
});

test("supports reading and printing text input as a value", () => {
  const project = diagram(
    [start, { id: "name", type: "Input", label: "Ask name", variable: "name", prompt: "What is your name? ", inputType: "text" }, { id: "echo", type: "Output", label: "Show name", outputMode: "expression", expression: "name" }, end],
    [{ id: "a", from: "start", to: "name" }, { id: "b", from: "name", to: "echo" }, { id: "c", from: "echo", to: "end" }],
  );
  assert.equal(generatePython(project).code, 'name = input("What is your name? ")\nprint(name)\n');
});

test("generates an input and decision with readable Python", () => {
  const project = diagram(
    [
      start,
      { id: "age", type: "Input", label: "Ask age", variable: "age", prompt: "Enter your age: ", inputType: "number" },
      { id: "adult", type: "Decision", label: "Adult?", condition: "age >= 18" },
      { id: "yes", type: "Output", label: "Adult message", message: "Adult" },
      { id: "no", type: "Output", label: "Minor message", message: "Minor" },
      end,
    ],
    [
      { id: "a", from: "start", to: "age" },
      { id: "b", from: "age", to: "adult" },
      { id: "c", from: "adult", to: "yes", branch: "true" },
      { id: "d", from: "adult", to: "no", branch: "false" },
      { id: "e", from: "yes", to: "end" },
      { id: "f", from: "no", to: "end" },
    ],
  );

  assert.deepEqual(generatePython(project), {
    errors: [],
    code: 'age = int(input("Enter your age: "))\n\nif age >= 18:\n    print("Adult")\nelse:\n    print("Minor")\n',
  });
});

test("preserves separate True and False decision branches", () => {
  const project = diagram(
    [start, { id: "n", type: "Input", label: "Ask", variable: "score", prompt: "Score: ", inputType: "number" }, { id: "d", type: "Decision", label: "Passed?", condition: "score >= 50" }, { id: "yes", type: "Output", label: "Pass", message: "Pass" }, { id: "no", type: "Output", label: "Try again", message: "Try again" }, end],
    [{ id: "1", from: "start", to: "n" }, { id: "2", from: "n", to: "d" }, { id: "3", from: "d", to: "yes", branch: "true" }, { id: "4", from: "d", to: "no", branch: "false" }, { id: "5", from: "yes", to: "end" }, { id: "6", from: "no", to: "end" }],
  );
  const result = generatePython(project);
  assert.equal(result.errors.length, 0);
  assert.match(result.code, /if score >= 50:/);
  assert.match(result.code, /print\("Pass"\)\nelse:\n    print\("Try again"\)/);
});

test("reports a missing connection instead of generating partial code", () => {
  const project = diagram([start, { id: "say", type: "Output", label: "Say hello", message: "Hello" }, end], [{ id: "a", from: "start", to: "say" }]);
  const result = generatePython(project);
  assert.equal(result.code, "");
  assert.match(result.errors.join(" "), /exactly one next block|no incoming connection|at least one path/);
});

test("rejects an invalid Decision condition", () => {
  const project = diagram(
    [start, { id: "n", type: "Input", label: "Ask", variable: "age", prompt: "Age: ", inputType: "number" }, { id: "d", type: "Decision", label: "Check", condition: "age >=" }, { id: "yes", type: "Output", label: "Yes", message: "Yes" }, { id: "no", type: "Output", label: "No", message: "No" }, end],
    [{ id: "1", from: "start", to: "n" }, { id: "2", from: "n", to: "d" }, { id: "3", from: "d", to: "yes", branch: "true" }, { id: "4", from: "d", to: "no", branch: "false" }, { id: "5", from: "yes", to: "end" }, { id: "6", from: "no", to: "end" }],
  );
  assert.ok(validateDiagram(project).some((message) => message.includes("ends too early")));
});

test("rejects unsupported multiple Decision blocks", () => {
  const project = diagram(
    [start, { id: "one", type: "Decision", label: "First?", condition: "1 == 1" }, { id: "two", type: "Decision", label: "Second?", condition: "1 == 2" }, end],
    [{ id: "a", from: "start", to: "one" }, { id: "b", from: "one", to: "two", branch: "true" }, { id: "c", from: "one", to: "end", branch: "false" }, { id: "d", from: "two", to: "end", branch: "true" }, { id: "e", from: "two", to: "end", branch: "false" }],
  );
  assert.ok(validateDiagram(project).some((message) => message.includes("supports one Decision")));
});

test("rejects Python syntax that could escape the supported expression subset", () => {
  const project = diagram(
    [start, { id: "d", type: "Decision", label: "Unsafe?", condition: "__import__('os')" }, { id: "yes", type: "Output", label: "Yes", message: "Yes" }, { id: "no", type: "Output", label: "No", message: "No" }, end],
    [{ id: "a", from: "start", to: "d" }, { id: "b", from: "d", to: "yes", branch: "true" }, { id: "c", from: "d", to: "no", branch: "false" }, { id: "d1", from: "yes", to: "end" }, { id: "e", from: "no", to: "end" }],
  );
  const result = generatePython(project);
  assert.equal(result.code, "");
  assert.ok(result.errors.length > 0);
});
