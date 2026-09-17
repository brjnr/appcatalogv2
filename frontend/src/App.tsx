import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import AppDetail from "@/pages/AppDetail";
import Login from "@/pages/Login";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminRoles from "@/pages/admin/AdminRoles";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminApplications from "@/pages/admin/AdminApplications";
import AdminServers from "@/pages/admin/AdminServers";
import AdminPics from "@/pages/admin/AdminPics";
import AdminDepartments from "@/pages/admin/AdminDepartments";
import AdminAccess from "@/pages/admin/AdminAccess";
import AdminDependencyMap from "@/pages/admin/AdminDependencyMap";
import AdminIntegrations from "@/pages/admin/AdminIntegrations";
import AdminImportExport from "@/pages/admin/AdminImportExport";
import StandbyCalendar from "@/pages/StandbyCalendar";
import Notes from "@/pages/Notes";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/app/:id" element={<AppDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/standby" element={<StandbyCalendar />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="applications" element={<AdminApplications />} />
          <Route path="servers" element={<AdminServers />} />
          <Route path="pics" element={<AdminPics />} />
          <Route path="departments" element={<AdminDepartments />} />
          <Route path="access" element={<AdminAccess />} />
          <Route path="dependency-map" element={<AdminDependencyMap />} />
          <Route path="import-export" element={<AdminImportExport />} />
          <Route path="integrations" element={<AdminIntegrations />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
