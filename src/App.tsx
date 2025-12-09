import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import MyCalendar from "./pages/MyCalendar";
import Rooms from "./pages/Rooms";
import RoomEditor from "./pages/RoomEditor";
import RoomViewer from "./pages/RoomViewer";
import MyReservations from "./pages/MyReservations";
import PendingApprovals from "./pages/PendingApprovals";
import ReservationsCalendar from "./pages/ReservationsCalendar";
import ManageOffices from "./pages/ManageOffices";
import Offices from "./pages/Offices";
import OfficeCalendar from "./pages/OfficeCalendar";
import OfficeAdminCalendar from "./pages/OfficeAdminCalendar";

const App = () => {
  console.log("App Version: 1.1 - Deployment Check");
  return (
    // Force rebuild for dashboard update
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Dashboard />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <MyCalendar />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rooms"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <Rooms />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rooms/:roomId/edit"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <RoomEditor />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rooms/:roomId/view"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <RoomViewer />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reservations"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <MyReservations />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar-view"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <ReservationsCalendar />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/approvals"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <PendingApprovals />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <Users />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manage-offices"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <ManageOffices />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manage-offices/:officeId/calendar"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <OfficeAdminCalendar />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/offices"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <Offices />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/offices/:officeId/book"
                element={
                  <ProtectedRoute requiredRole="user">
                    <Layout>
                      <OfficeCalendar />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
