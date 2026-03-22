import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import SignalMonitor from "./pages/SignalMonitor";
import DataEntry from "./pages/DataEntry";
import ModelOutput from "./pages/ModelOutput";
import Parameters from "./pages/Parameters";
import Sidebar from "./components/Sidebar";
import LiveDataBar from "./components/LiveDataBar";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <LiveDataBar />
            <main className="flex-1 overflow-y-auto overscroll-contain">
              <Switch>
                <Route path="/" component={SignalMonitor} />
                <Route path="/model" component={ModelOutput} />
                <Route path="/data" component={DataEntry} />
                <Route path="/parameters" component={Parameters} />
              </Switch>
            </main>
          </div>
        </div>
        <Toaster />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
