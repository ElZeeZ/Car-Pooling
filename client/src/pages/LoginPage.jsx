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
    setLoading(true);

    try {
      const user = await login(form);
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
          <p className="eyebrow">Smart Carpooling</p>
          <h2>Move through Lebanon together.</h2>
          <div className="auth-mini-grid">
            <span>Verified rides</span>
            <span>Live map</span>
            <span>Safe wallet</span>
          </div>
        </div>

        <div className="auth-form-panel">
          <div>
            <p className="eyebrow">Smart Carpooling</p>
            <h1 id="login-heading">Sign in</h1>
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
    </main>
  );
};

export default LoginPage;
