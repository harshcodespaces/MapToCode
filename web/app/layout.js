import "./globals.css";

export const metadata = {
  title: "MapToCode — See your logic. Then write the code.",
  description: "Turn a flowchart into readable Python. MapToCode helps beginners see how each step and decision becomes a real program.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
