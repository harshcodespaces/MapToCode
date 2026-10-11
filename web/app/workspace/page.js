import WorkspaceClient from "./WorkspaceClient";

export const metadata = {
  title: "Workspace — MapToCode",
  description: "Explore the example flowchart and its Python preview in MapToCode.",
};

export default function WorkspacePage() {
  return <WorkspaceClient />;
}
