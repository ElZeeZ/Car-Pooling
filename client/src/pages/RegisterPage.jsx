import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHomePathForRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const initialForm = {
  role: 'passenger',
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  licenseNumber: '',
  vehicleInfo: '',
  availableSeats: 1
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const { registerDriver, registerPassenger } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
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

    if (form.password !== form.confirmPassword) {
      setError('Passwords must match.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password
      };
      const user =
        form.role === 'driver'
          ? await registerDriver({
              ...payload,
              licenseNumber: form.licenseNumber,
              vehicleInfo: form.vehicleInfo,
              availableSeats: Number(form.availableSeats)
            })
          : await registerPassenger(payload);

      navigate(getHomePathForRole(user.role));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel wide" aria-labelledby="register-heading">
        <div>
          <p className="eyebrow">Smart Carpooling</p>
          <h1 id="register-heading">Register</h1>
        </div>

        {error ? <p className="alert">{error}</p> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Account type
            <select name="role" value={form.role} onChange={updateField}>
              <option value="passenger">Passenger</option>
              <option value="driver">Driver</option>
            </select>
          </label>

          <label>
            Full name
            <input name="fullName" value={form.fullName} onChange={updateField} required />
          </label>

          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>

          <label>
            Phone
            <input name="phone" value={form.phone} onChange={updateField} required />
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

          <label>
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={updateField}
              required
            />
          </label>

          {form.role === 'driver' ? (
            <>
              <label>
                License number
                <input
                  name="licenseNumber"
                  value={form.licenseNumber}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Vehicle info
                <input name="vehicleInfo" value={form.vehicleInfo} onChange={updateField} required />
              </label>

              <label>
                Available seats
                <input
                  name="availableSeats"
                  type="number"
                  min="1"
                  max="8"
                  value={form.availableSeats}
                  onChange={updateField}
                  required
                />
              </label>
            </>
          ) : null}

          <button type="submit" className="primary-button full-span" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Existing account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
};

export default RegisterPage;
