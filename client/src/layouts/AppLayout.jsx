import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { navigationByRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navigation = navigationByRole[user?.role] ?? [];
  const mapNavigationItem = navigation.find((item) => item.label === 'Map');
  const accountNavigation = navigation.filter((item) => item.label !== 'Map');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (user?.role === 'driver' || user?.role === 'passenger') {
    return (
      <div className="account-shell">
        <header className="account-toolbar">
          <div className="toolbar-welcome">
            <span>Welcome {user?.full_name ?? user?.email}</span>
            <small>{user?.role} dashboard</small>
          </div>

          {mapNavigationItem ? (
            <NavLink className="map-home-button account-map-button" to={mapNavigationItem.path}>
              {mapNavigationItem.label}
            </NavLink>
          ) : null}

          <nav className="map-nav account-nav" aria-label="Main navigation">
            {accountNavigation.map((item) => (
              <NavLink key={item.path} to={item.path}>
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={handleLogout}>
              Sign out
            </button>
          </nav>
        </header>

        <main className="account-content">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Routely</p>
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
