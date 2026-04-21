import { Suspense, lazy, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";

const queryClient = new QueryClient();
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Users = lazy(() => import("./pages/Users"));
const MyCalendar = lazy(() => import("./pages/MyCalendar"));
const Rooms = lazy(() => import("./pages/Rooms"));
const RoomEditor = lazy(() => import("./pages/RoomEditor"));
const RoomViewer = lazy(() => import("./pages/RoomViewer"));
const MyReservations = lazy(() => import("./pages/MyReservations"));
const PendingApprovals = lazy(() => import("./pages/PendingApprovals"));
const ReservationsCalendar = lazy(() => import("./pages/ReservationsCalendar"));
const SharedRooms = lazy(() => import("./pages/SharedRooms"));
const Planner = lazy(() => import("./pages/Planner"));
const Insight = lazy(() => import("./pages/Insight"));
const NotFound = lazy(() => import("./pages/NotFound"));

const routeFallback = (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
    Loading page...
  </div>
);

function RouteBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={routeFallback}>{children}</Suspense>;
}

function ProtectedPage({
  children,
  requiredRole,
}: {
  children: ReactNode;
  requiredRole?: "user" | "admin" | "super_admin";
}) {
  return (
    <ProtectedRoute requiredRole={requiredRole}>
      <Layout>
        <RouteBoundary>{children}</RouteBoundary>
      </Layout>
    </ProtectedRoute>
  );
}

const protectedRoutes = [
  { path: "/", element: Dashboard },
  { path: "/calendar", requiredRole: "user" as const, element: MyCalendar },
  { path: "/shared-rooms", requiredRole: "user" as const, element: SharedRooms },
  { path: "/rooms", requiredRole: "user" as const, element: Rooms },
  { path: "/rooms/:roomId/edit", requiredRole: "user" as const, element: RoomEditor },
  { path: "/rooms/:roomId/view", requiredRole: "user" as const, element: RoomViewer },
  { path: "/reservations", requiredRole: "user" as const, element: MyReservations },
  { path: "/calendar-view", requiredRole: "user" as const, element: ReservationsCalendar },
  { path: "/approvals", requiredRole: "admin" as const, element: PendingApprovals },
  { path: "/planner", requiredRole: "admin" as const, element: Planner },
  { path: "/insight", requiredRole: "admin" as const, element: Insight },
  { path: "/users", requiredRole: "admin" as const, element: Users },
];

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RouteBoundary>
              <Routes>
                <Route path="/login" element={<Login />} />
                {protectedRoutes.map(({ path, requiredRole, element: Page }) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <ProtectedPage requiredRole={requiredRole}>
                        <Page />
                      </ProtectedPage>
                    }
                  />
                ))}
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </RouteBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
