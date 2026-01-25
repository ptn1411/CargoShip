import { ReactNode } from "react";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <main
      className="flex-1 overflow-auto bg-background"
      role="main"
      id="main-content">
      <div className="h-full">{children}</div>
    </main>
  );
}
