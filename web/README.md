# MapToCode

MapToCode is a local-first flowchart editor that generates readable Python or C for a beginner-friendly subset of flowcharts.

## Run the website

From this `web` directory:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the homepage or [http://localhost:3000/workspace](http://localhost:3000/workspace) for the editor.

## Checks

```bash
npm test
npm run lint
npm run build
```

The code generator and validator are in `lib/flowchart.js`. Their tests use Node's built-in test tools, so no test package is required.

## Supported Python subset

- One Start block and one End block.
- Input blocks that read text or whole numbers into a simple variable name.
- Process blocks with one assignment using numbers, known variable names, parentheses, and `+`, `-`, `*`, `/`, `//`, or `%`.
- One Decision block with a comparison such as `age >= 18`; its True and False paths must rejoin at End.
- Output blocks that print a text message or a previously defined value/expression.

Loops, multiple decisions, arbitrary Python statements, and running generated code are not supported. The generator validates the diagram and expression subset before producing a `.py` file; generated code is never executed by the app.

## Supported C subset

- The same Start/End structure and one True/False Decision.
- Number input as whole integers and text input as one word.
- Process assignments with whole-number literals and variables using `+`, `-`, and `*`.
- One comparison per Decision condition and text or whole-number output.

C generation reports unsupported operators such as division, modulo, decimals, and `not` instead of producing code with different behavior. Download the result as a `.c` file and compile it with a local C compiler.

Diagrams are saved in browser local storage and can also be exported/imported as JSON. Image recognition for hand-drawn diagrams is not implemented.

## Share the standalone HTML version

The project root contains `MapToCode.html`, a complete single-file website with its own homepage and flowchart workspace. It opens directly in a modern browser without npm or a local server. Share that file with a friend; they can browse the homepage, build a diagram, and generate Python or C. Export a JSON file if you want to share a specific diagram as well.
