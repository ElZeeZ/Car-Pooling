import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getHomePathForRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice ?? '');
  const [loading, setLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState(null);

  const updateField = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setRoleSelection(null);
    setLoading(true);

    try {
      const result = await login(form);

      if (result.requiresRoleSelection) {
        setRoleSelection(result);
        return;
      }

      navigate(getHomePathForRole(result.role));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithRole = async (role) => {
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const user = await login({ ...form, role });
      navigate(getHomePathForRole(user.role));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel login-panel" aria-labelledby="login-heading">
        <div className="auth-showcase" aria-hidden="true">
          <div className="route-art">
            <span className="route-pin start" />
            <span className="route-line" />
            <span className="route-car" />
            <span className="route-pin end" />
          </div>
          <p className="eyebrow">Routely</p>
          <h2>Move through Lebanon together.</h2>
          <div className="auth-mini-grid">
            <span>Verified rides</span>
            <span>Live map</span>
            <span>Safe wallet</span>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="login-title-block">
            <h1 id="login-heading" className="login-brand-title" aria-label="Routely">
              <span className="brand-origin">R</span>
              <span className="brand-word">outely</span>
              <span className="brand-route" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </h1>
            <p>Sign in</p>
          </div>

          {error ? <p className="alert">{error}</p> : null}
          {notice ? <p className="success-alert">{notice}</p> : null}

          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} required />
            </label>

            <label>
              Password
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            New account? <Link to="/register">Register</Link>
          </p>
        </div>
      </section>

      {roleSelection ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" aria-labelledby="choose-role-heading">
            <h2 id="choose-role-heading">Choose account type</h2>
            <p>This email has both passenger and driver accounts. Choose where to sign in.</p>

            <div className="role-choice-grid">
              {roleSelection.roles.map((role) => (
                <button
                  key={role}
                  type="button"
                  className="primary-button"
                  onClick={() => signInWithRole(role)}
                  disabled={loading}
                >
                  {role === 'driver' ? 'Driver' : 'Passenger'}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={() => setRoleSelection(null)}
              disabled={loading}
            >
              Cancel
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default LoginPage;
