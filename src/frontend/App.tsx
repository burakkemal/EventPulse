import { DashboardProvider } from './store/index.js';
import { DashboardLayout } from './dashboard/layout/DashboardLayout.js';

export default function App() {
  return (
    <DashboardProvider>
      <DashboardLayout />
    </DashboardProvider>
  );
}
