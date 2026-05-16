import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ImageCropModal from '../components/ImageCropModal.jsx';
import { getHomePathForRole } from '../data/navigation.js';
import { useAuth } from '../context/AuthContext.jsx';

const initialForm = {
  role: 'passenger',
  fullName: '',
  email: '',
  phone: '',
  birthDate: '',
  password: '',
  confirmPassword: '',
  licenseNumber: '',
  vehicleInfo: '',
  availableSeats: 1,
  profileImage: ''
};

const phonePattern = /^\d+$/;
const licensePlatePattern = /^[A-Z]\d{1,7}$/;
const DRIVER_MIN_AGE = 21;

const formatPhoneNumber = (value) => value.replace(/\D/g, '');

const formatLicensePlate = (value) => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!normalized) {
    return '';
  }

  const firstCharacter = normalized[0];

  if (!/[A-Z]/.test(firstCharacter)) {
    return '';
  }

  return `${firstCharacter}${normalized.slice(1).replace(/\D/g, '').slice(0, 7)}`;
};

const getAgeFromBirthDate = (birthDate) => {
  const date = new Date(`${birthDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), date.getMonth(), date.getDate());

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age;
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const { registerDriver, registerPassenger } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingRoleVerification, setPendingRoleVerification] = useState(null);
  const [verificationPassword, setVerificationPassword] = useState('');
  const [profileImageFile, setProfileImageFile] = useState(null);

  const updateField = (event) => {
    const { name } = event.target;
    let { value } = event.target;

    if (name === 'phone') {
      value = formatPhoneNumber(value);
    }

    if (name === 'licenseNumber') {
      value = formatLicensePlate(value);
    }

    setForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setError('');
    setProfileImageFile(file);
  };

  const submitRegistration = async ({ existingPassword = '' } = {}) => {
    setError('');
    setNotice('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords must match.');
      return;
    }

    if (!phonePattern.test(form.phone)) {
      setError('Phone number must contain numbers only.');
      return;
    }

    if (form.role === 'driver' && !licensePlatePattern.test(form.licenseNumber)) {
      setError('Car license plate must be one letter followed by 1 to 7 numbers.');
      return;
    }

    if (form.role === 'driver') {
      const driverAge = getAgeFromBirthDate(form.birthDate);

      if (driverAge === null || driverAge < DRIVER_MIN_AGE) {
        setError('Drivers must be at least 21 years old to register.');
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: existingPassword || form.password,
        ...(existingPassword ? { existingPassword } : {})
      };

      const result =
        form.role === 'driver'
          ? await registerDriver({
              ...payload,
              birthDate: form.birthDate,
              licenseNumber: form.licenseNumber,
              vehicleInfo: form.vehicleInfo,
              availableSeats: Number(form.availableSeats),
              profileImage: form.profileImage || null
            })
          : await registerPassenger(payload);

      setPendingRoleVerification(null);
      setVerificationPassword('');

      if (result.pendingVerification) {
        navigate('/login', {
          state: {
            notice: 'Await admin verification. You can sign in after your driver account is approved.'
          },
          replace: true
        });
        return;
      }

      const user = result.user;
      navigate(getHomePathForRole(user.role));
    } catch (requestError) {
      if (requestError.details?.code === 'ACCOUNT_EXISTS_AS_OTHER_ROLE') {
        setPendingRoleVerification(requestError.details);
        setVerificationPassword('');
        return;
      }

      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitRegistration();
  };

  const handleVerifyExistingAccount = async (event) => {
    event.preventDefault();

    if (!verificationPassword) {
      setError('Enter the password for the existing account.');
      return;
    }

    await submitRegistration({ existingPassword: verificationPassword });
  };

  return (
    <main className="auth-page">
      <section className="auth-panel wide" aria-labelledby="register-heading">
        <div>
          <p className="eyebrow">Routely</p>
          <h1 id="register-heading">Register</h1>
        </div>

        {error ? <p className="alert">{error}</p> : null}
        {notice ? <p className="success-alert">{notice}</p> : null}

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
            <input
              name="phone"
              inputMode="numeric"
              pattern="[0-9]+"
              value={form.phone}
              onChange={updateField}
              required
            />
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
                Date of birth
                <input
                  name="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Car license plate
                <input
                  name="licenseNumber"
                  pattern="[A-Za-z][0-9]{1,7}"
                  maxLength="8"
                  placeholder="A1234567"
                  value={form.licenseNumber}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Vehicle info
                <input
                  name="vehicleInfo"
                  placeholder="e.g. Honda Civic, Mercedes C-Class"
                  value={form.vehicleInfo}
                  onChange={updateField}
                  required
                />
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

              <label className="full-span">
                Driver picture (optional)
                <input
                  name="profileImage"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleProfileImageChange}
                />
              </label>

              {form.profileImage ? (
                <div className="driver-photo-preview full-span">
                  <img src={form.profileImage} alt="Selected driver profile" />
                  <button
                    type="button"
                    className="ghost-button small-button"
                    onClick={() => setForm((current) => ({ ...current, profileImage: '' }))}
                  >
                    Remove picture
                  </button>
                </div>
              ) : null}
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

      {pendingRoleVerification ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" aria-labelledby="verify-role-heading">
            <h2 id="verify-role-heading">Account already exists</h2>
            <p>
              This email is already registered as a {pendingRoleVerification.existingRole}. Enter the
              same password to create the {pendingRoleVerification.requestedRole} account.
            </p>

            <form className="form-stack" onSubmit={handleVerifyExistingAccount}>
              <label>
                Existing account password
                <input
                  type="password"
                  value={verificationPassword}
                  onChange={(event) => setVerificationPassword(event.target.value)}
                  autoFocus
                  required
                />
              </label>

              <div className="modal-actions">
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? 'Verifying...' : 'Complete registration'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setPendingRoleVerification(null);
                    setVerificationPassword('');
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {profileImageFile ? (
        <ImageCropModal
          file={profileImageFile}
          title="Adjust driver picture"
          onCancel={() => setProfileImageFile(null)}
          onSave={(profileImage) => {
            setForm((current) => ({ ...current, profileImage }));
            setProfileImageFile(null);
          }}
        />
      ) : null}
    </main>
  );
};

export default RegisterPage;
