# MapToCode — Product Brief

## One-line idea
MapToCode is a website that lets a user design a flowchart and convert its logic into readable Python code.

## Problem
Beginners often understand logic visually but struggle to translate the steps, decisions, and branches into program syntax. Writing code manually can make it harder to see how a program's logic maps to a flowchart.

## Proposed solution
A browser-based workspace with three main areas:
1. **Flowchart canvas** — users add and connect flowchart blocks.
2. **Node settings** — users configure the selected block's label, input name, expression, or output message.
3. **Python preview** — the website generates Python source from the flowchart and lets the user download it.

Later, users should be able to upload a photograph of a hand-drawn flowchart. Image recognition is explicitly a later milestone, not part of the initial promise.

## First supported use case
A simple age-check flowchart:
- Start
- Input: ask for age
- Decision: `age >= 18`
- True branch: output `Adult`
- False branch: output `Minor`
- End

Expected generated Python:

```python
age = int(input("Enter your age: "))

if age >= 18:
    print("Adult")
else:
    print("Minor")
```

## Intended users
- Students learning programming and algorithms.
- Beginners learning conditions, input/output, and program flow.
- People who prefer to express an idea visually before seeing source code.

## Product principles
- Start with Python.
- Make the flowchart the main interaction, not a text form.
- Keep generated code readable and downloadable.
- Explain validation problems in plain language.
- Work locally without accounts, analytics, external APIs, or hosted-service dependencies.
- Be honest about features that are prototypes or not yet implemented.

## Not in version one
- User accounts and cloud sync.
- Team collaboration.
- Multi-language code generation.
- Running untrusted generated code on a server.
- AI-based interpretation of photos before the local image-recognition design is proven.
