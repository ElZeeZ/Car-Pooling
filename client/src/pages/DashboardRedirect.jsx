import { Navigate } from 'react-router-dom';
import { getHomePathForRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const DashboardRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={getHomePathForRole(user?.role)} replace />;
};

export default DashboardRedirect;
