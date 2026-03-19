import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SimulatorPage } from "./pages/SimulatorPage";

// Temporary Stubs
const MemoryPage = () => (
  <div className="p-6">Memory Management Placeholder</div>
);
const ConfigPage = () => <div className="p-6">Configuration Placeholder</div>;

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/conversations" replace />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="config" element={<ConfigPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
      </Route>
    </Routes>
  );
}
