import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import SharedRooms from "./pages/SharedRooms";
import Planner from "./pages/Planner";
import NotFound from "./pages/NotFound";

const Insight = lazy(() => import("./pages/Insight"));
const queryClient = new QueryClient();

function LoadingInsightFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Loading insight dashboard...
    </div>
  );
}

function App() {
  return (
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
                path="/shared-rooms"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <SharedRooms />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/rooms"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Rooms />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/rooms/:roomId/edit"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <RoomEditor />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/rooms/:roomId/view"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <RoomViewer />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reservations"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <MyReservations />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/calendar-view"
                element={
                  <ProtectedRoute>
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
                path="/planner"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <Planner />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/insight"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Layout>
                      <Suspense fallback={<LoadingInsightFallback />}>
                        <Insight />
                      </Suspense>
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

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
