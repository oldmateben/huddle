import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Admin from "./pages/Admin";
import DeckPage from "./pages/DeckPage";
import Decks from "./pages/Decks";
import Home from "./pages/Home";
import Join from "./pages/Join";
import { Privacy, Terms } from "./pages/Legal";
import Report from "./pages/Report";
import SignIn from "./pages/SignIn";
import Team from "./pages/Team";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/j/:code" element={<Join />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Decks />} />
          <Route path="t/:teamId" element={<Decks />} />
          <Route path="t/:teamId/members" element={<Team />} />
          <Route path="d/:id" element={<DeckPage />} />
          <Route path="d/:id/report" element={<Report />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
