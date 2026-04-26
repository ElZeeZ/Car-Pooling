import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import BookingsPage from './pages/BookingsPage.jsx';
import DashboardRedirect from './pages/DashboardRedirect.jsx';
import DriverDashboard from './pages/DriverDashboard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import PassengerDashboard from './pages/PassengerDashboard.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import TripsPage from './pages/TripsPage.jsx';

const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />

    <Route element={<ProtectedRoute roles={['passenger', 'driver', 'admin']} />}>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardRedirect />} />
        <Route element={<ProtectedRoute roles={['passenger']} />}>
          <Route path="/passenger" element={<PassengerDashboard />} />
        </Route>
        <Route element={<ProtectedRoute roles={['driver']} />}>
          <Route path="/driver" element={<DriverDashboard />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default App;
