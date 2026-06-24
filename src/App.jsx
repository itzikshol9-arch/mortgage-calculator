import React, { useState } from "react";
import MortgageCalculator from "./MortgageCalculator";
import ThirdAgeMortgageSimulator from "./ThirdAgeMortgageSimulator";

const NAV_CSS = `
.app-nav {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 560px;
  z-index: 200;
  display: flex;
  background: #1A2332;
  direction: rtl;
  font-family: 'Heebo', sans-serif;
  border-bottom: 2px solid #2a3548;
}
.app-nav-btn {
  flex: 1;
  padding: 13px 8px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: rgba(237,232,223,0.55);
  font-size: 13.5px;
  font-weight: 600;
  font-family: inherit;
  transition: color 0.2s, background 0.2s;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.app-nav-btn.nav-on {
  color: #EDE8DF;
  background: rgba(166,121,60,0.18);
  border-bottom-color: #A6793C;
}
.app-spacer { height: 48px; }
`;

export default function App() {
  const [tab, setTab] = useState("main");

  return (
    <>
      <style>{NAV_CSS}</style>
      <nav className="app-nav">
        <button
          className={`app-nav-btn ${tab === "main" ? "nav-on" : ""}`}
          onClick={() => setTab("main")}
        >
          מחשבון משכנתא
        </button>
        <button
          className={`app-nav-btn ${tab === "third" ? "nav-on" : ""}`}
          onClick={() => setTab("third")}
        >
          גיל השלישי ✦
        </button>
      </nav>
      <div className="app-spacer" />
      {tab === "main" ? <MortgageCalculator /> : <ThirdAgeMortgageSimulator />}
    </>
  );
}
