import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { navigationByRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navigation = navigationByRole[user?.role] ?? [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Smart Carpooling</p>
          <h1>{user?.role ?? 'Account'}</h1>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink key={item.path} to={item.path}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="user-block">
          <span>{user?.full_name ?? user?.email}</span>
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
