import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AppProvider } from "@/contexts/AppContext";
import Sidebar from "@/components/Sidebar";
import FeedPage from "@/pages/FeedPage";
import ProfilePage from "@/pages/ProfilePage";
import AccountsPage from "@/pages/AccountsPage";
import CreatePage from "@/pages/CreatePage";
import MessagesPage from "@/pages/MessagesPage";
import ExplorePage from "@/pages/ExplorePage";
import ReelsPage from "@/pages/ReelsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppProvider>
            <div className="flex min-h-screen bg-background text-foreground">
              <Sidebar />
              <main className="flex-1 ml-[72px] bg-background">
                <Routes>
                  <Route path="/" element={<FeedPage />} />
                  <Route path="/explore" element={<ExplorePage />} />
                  <Route path="/reels" element={<ReelsPage />} />
                  <Route path="/messages" element={<MessagesPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/create" element={<CreatePage />} />
                  <Route path="/profile/:accountId" element={<ProfilePage />} />
                  <Route path="/accounts" element={<AccountsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </div>
          </AppProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
