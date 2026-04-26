import { Navigate, Outlet } from 'react-router-dom';
import { getHomePathForRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const ProtectedRoute = ({ roles }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
