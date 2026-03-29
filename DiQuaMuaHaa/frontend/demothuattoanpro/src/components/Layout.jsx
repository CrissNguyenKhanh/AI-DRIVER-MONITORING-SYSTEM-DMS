import { useState } from "react";
import Sidebar from "./Sidebar";

const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 64;

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1e" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main
        style={{
          marginLeft: collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`,
          flex: 1,
          minWidth: 0,
          transition: "margin-left 0.25s ease",
        }}
      >
        {children}
      </main>
    </div>
  );
}
