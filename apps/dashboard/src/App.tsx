import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { ArtifactFormPage } from "./pages/ArtifactFormPage";
import { ArtifactsPage } from "./pages/ArtifactsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ChannelFormPage } from "./pages/ChannelFormPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ChatPage } from "./pages/ChatPage";
import { ConfigPage } from "./pages/ConfigPage";
import { ContactFormPage } from "./pages/ContactFormPage";
import { ContactsPage } from "./pages/ContactsPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProviderFormPage } from "./pages/ProviderFormPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { RolesPage } from "./pages/RolesPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { WikiPage } from "./pages/wiki/WikiPage";

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
        <Route path="roles" element={<RolesPage />} />
        <Route path="artifacts">
          <Route index element={<ArtifactsPage />} />
          <Route path="add" element={<ArtifactFormPage />} />
          <Route path=":id/update" element={<ArtifactFormPage />} />
        </Route>
        <Route path="providers">
          <Route index element={<ProvidersPage />} />
          <Route path="add" element={<ProviderFormPage />} />
          <Route path=":id/update" element={<ProviderFormPage />} />
        </Route>
        <Route path="config" element={<ConfigPage />} />
        <Route path="audit-logs" element={<AuditLogsPage />} />
        <Route path="simulator" element={<SimulatorPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="wiki">
          <Route index element={<WikiPage />} />
          <Route path=":slug" element={<WikiPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
