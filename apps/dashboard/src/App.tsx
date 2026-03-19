import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { ChannelFormPage } from "./pages/ChannelFormPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ContactFormPage } from "./pages/ContactFormPage";
import { ContactsPage } from "./pages/ContactsPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ProviderFormPage } from "./pages/ProviderFormPage";
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
        <Route path="contacts">
          <Route index element={<ContactsPage />} />
          <Route path="add" element={<ContactFormPage />} />
          <Route path=":id/update" element={<ContactFormPage />} />
        </Route>
        <Route path="channels">
          <Route index element={<ChannelsPage />} />
          <Route path="add" element={<ChannelFormPage />} />
          <Route path=":id/update" element={<ChannelFormPage />} />
        </Route>
        <Route path="memory" element={<MemoryPage />} />
        <Route path="providers">
          <Route index element={<ProvidersPage />} />
          <Route path="add" element={<ProviderFormPage />} />
          <Route path=":id/update" element={<ProviderFormPage />} />
        </Route>
        <Route path="config" element={<ConfigPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
      </Route>
    </Routes>
  );
}
