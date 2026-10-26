export const CODE_LEVELS = ["beginner", "intermediate", "professional"];

export function normalizeCodeLevel(level) {
  return CODE_LEVELS.includes(level) ? level : "intermediate";
}

export function beginnerComment(statement) {
  if (statement.kind === "VariableDeclaration") return "Create a variable to store this value.";
  if (statement.kind === "Input") return "Ask the user for a value and save their answer.";
  if (statement.kind === "Assignment") return "Calculate the new value and store it in the variable.";
  if (statement.kind === "Output") return "Show the result to the user.";
  if (statement.kind === "IfStatement") return "Check this condition to choose the next step.";
  return "Perform the next step.";
}
