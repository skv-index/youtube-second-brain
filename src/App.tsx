import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import Shell from "@/components/Shell";
import ConnectGate from "@/components/ConnectGate";
import DashboardPage from "@/pages/DashboardPage";
import LibraryPage from "@/pages/LibraryPage";
import PlaylistsPage from "@/pages/PlaylistsPage";
import PlaylistDetailPage from "@/pages/PlaylistDetailPage";
import SubscriptionsPage from "@/pages/SubscriptionsPage";
import CollectionsPage from "@/pages/CollectionsPage";
import SettingsPage from "@/pages/SettingsPage";
import VideoDetailPage from "@/pages/VideoDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status ?? 0;
        return status !== 401 && status !== 400 && failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

function AppRoutes() {
  const auth = useAuth();
  return (
    <Routes>
      <Route
        path="/"
        element={
          auth?.connected ? (
            <Shell />
          ) : (
            <div className="min-h-dvh">
              <ConnectGate>
                <span />
              </ConnectGate>
            </div>
          )
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="videos/:id" element={<VideoDetailPage />} />
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter future={routerFutureFlags}>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
