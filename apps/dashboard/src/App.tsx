import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";

// Temporary Stubs
const ConversationsPage = () => (
  <div className="p-6">Conversations Inbox Placeholder</div>
);
const MemoryPage = () => (
  <div className="p-6">Memory Management Placeholder</div>
);
const ProvidersPage = () => <div className="p-6">AI Providers Placeholder</div>;
const ConfigPage = () => <div className="p-6">Configuration Placeholder</div>;

import { SimulatorPage } from "./pages/SimulatorPage";

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/conversations" replace />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="config" element={<ConfigPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
      </Route>
    </Routes>
  );
}
