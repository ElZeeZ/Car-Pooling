import { useEffect, useRef, useState } from 'react';
import ImageCropModal from '../components/ImageCropModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const phonePattern = /^\d+$/;
const licensePlatePattern = /^[A-Z]\d{1,7}$/;

const emptyVehicleForm = {
  licenseNumber: '',
  vehicleInfo: '',
  availableSeats: 1
};

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

const formatDateForInput = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const buildProfileForm = (accountUser) => ({
  fullName: accountUser?.full_name ?? '',
  email: accountUser?.email ?? '',
  phone: accountUser?.phone ?? '',
  birthDate: formatDateForInput(accountUser?.birth_date),
  profileImage: accountUser?.profile_image ?? ''
});

const AccountPage = () => {
  const {
    user,
    refreshAccount,
    updateAccountProfile,
    updateAccountPassword,
    addDriverVehicle,
    selectDriverVehicle,
    deleteDriverVehicle
  } = useAuth();
  const fileInputRef = useRef(null);
  const [profileForm, setProfileForm] = useState(() => buildProfileForm(user));
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [vehicles, setVehicles] = useState([]);
  const [cropFile, setCropFile] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const isDriver = user?.role === 'driver';

  const syncAccountData = (payload) => {
    if (payload?.user) {
      setProfileForm(buildProfileForm(payload.user));
    }

    if (Array.isArray(payload?.vehicles)) {
      setVehicles(payload.vehicles);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadAccount = async () => {
      setBusyAction('loading');
      setError('');

      try {
        const payload = await refreshAccount();

        if (!cancelled) {
          syncAccountData(payload);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      } finally {
        if (!cancelled) {
          setBusyAction('');
        }
      }
    };

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [refreshAccount]);

  const updateProfileField = (event) => {
    const { name } = event.target;
    let { value } = event.target;

    if (name === 'phone') {
      value = formatPhoneNumber(value);
    }

    setProfileForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const updateVehicleField = (event) => {
    const { name } = event.target;
    let { value } = event.target;

    if (name === 'licenseNumber') {
      value = formatLicensePlate(value);
    }

    setVehicleForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      setCropFile(file);
      setError('');
    }
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!profileForm.fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    if (!phonePattern.test(profileForm.phone)) {
      setError('Phone number must contain numbers only.');
      return;
    }

    setBusyAction('profile');

    try {
      const payload = await updateAccountProfile({
        fullName: profileForm.fullName.trim(),
        phone: profileForm.phone,
        ...(isDriver
          ? {
              profileImage: profileForm.profileImage || null
            }
          : {})
      });
      syncAccountData(payload);
      setNotice('Profile updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords must match.');
      return;
    }

    setBusyAction('password');

    try {
      const result = await updateAccountPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setNotice(result.message ?? 'Password updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleAddVehicle = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!licensePlatePattern.test(vehicleForm.licenseNumber)) {
      setError('Car license plate must be one letter followed by 1 to 7 numbers.');
      return;
    }

    if (!vehicleForm.vehicleInfo.trim()) {
      setError('Vehicle info is required.');
      return;
    }

    setBusyAction('add-vehicle');

    try {
      const payload = await addDriverVehicle({
        licenseNumber: vehicleForm.licenseNumber,
        vehicleInfo: vehicleForm.vehicleInfo.trim(),
        availableSeats: Number(vehicleForm.availableSeats)
      });
      syncAccountData(payload);
      setVehicleForm(emptyVehicleForm);
      setNotice('Car added.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleSelectVehicle = async (vehicleId) => {
    setError('');
    setNotice('');
    setBusyAction(`select-${vehicleId}`);

    try {
      const payload = await selectDriverVehicle(vehicleId);
      syncAccountData(payload);
      setNotice('Active car updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    setError('');
    setNotice('');
    setBusyAction(`delete-${vehicleId}`);

    try {
      const payload = await deleteDriverVehicle(vehicleId);
      syncAccountData(payload);
      setNotice('Car deleted.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  return (
    <section className="page-section account-page" aria-labelledby="account-heading">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h2 id="account-heading">Your details</h2>
        </div>
      </div>

      {error ? <p className="alert">{error}</p> : null}
      {notice ? <p className="success-alert">{notice}</p> : null}

      <div className="account-grid">
        <form className="account-card form-stack" onSubmit={handleProfileSubmit}>
          <div>
            <h3>Profile</h3>
            <p>Keep your visible account details current.</p>
          </div>

          {isDriver ? (
            <div className="profile-picture-row">
              <span className="driver-avatar large">
                {profileForm.profileImage ? (
                  <img src={profileForm.profileImage} alt="Driver profile" />
                ) : (
                  <span className="avatar-icon" aria-hidden="true" />
                )}
              </span>
              <div className="button-row wrap">
                <button
                  type="button"
                  className="ghost-button small-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change picture
                </button>
                {profileForm.profileImage ? (
                  <button
                    type="button"
                    className="ghost-button small-button danger-outline"
                    onClick={() => setProfileForm((current) => ({ ...current, profileImage: '' }))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleProfileImageChange}
              />
            </div>
          ) : null}

          <div className="form-grid">
            <label>
              Full name
              <input name="fullName" value={profileForm.fullName} readOnly />
            </label>

            <label>
              Email
              <input value={profileForm.email} readOnly />
            </label>

            <label>
              Phone
              <input
                name="phone"
                inputMode="numeric"
                pattern="[0-9]+"
                value={profileForm.phone}
                onChange={updateProfileField}
                required
              />
            </label>

            <label>
              Account type
              <input value={user?.role ?? ''} readOnly />
            </label>

            {isDriver ? (
              <label>
                Date of birth
                <input
                  name="birthDate"
                  type="date"
                  value={profileForm.birthDate}
                  disabled
                />
              </label>
            ) : null}
          </div>

          <button type="submit" className="primary-button" disabled={busyAction === 'profile'}>
            {busyAction === 'profile' ? 'Saving...' : 'Save profile'}
          </button>
        </form>

        <form className="account-card form-stack" onSubmit={handlePasswordSubmit}>
          <div>
            <h3>Password</h3>
            <p>Use the same password when this email has both account types.</p>
          </div>

          <label>
            Current password
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
              }
              required
            />
          </label>

          <label>
            New password
            <input
              type="password"
              minLength="6"
              value={passwordForm.newPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              minLength="6"
              value={passwordForm.confirmPassword}
              onChange={(event) =>
                setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              required
            />
          </label>

          <button type="submit" className="primary-button" disabled={busyAction === 'password'}>
            {busyAction === 'password' ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>

      {isDriver ? (
        <section className="account-card vehicle-manager" aria-labelledby="cars-heading">
          <div>
            <p className="eyebrow">Driver cars</p>
            <h3 id="cars-heading">Cars on this account</h3>
          </div>

          <div className="vehicle-list">
            {vehicles.length ? (
              vehicles.map((vehicle) => (
                <article className="vehicle-card" key={vehicle.vehicle_id}>
                  <div>
                    <strong>{vehicle.vehicle_info}</strong>
                    <span>{vehicle.license_number}</span>
                    <small>{vehicle.available_seats} available seats</small>
                  </div>

                  {vehicle.is_active ? <span className="active-badge">Active</span> : null}

                  <div className="button-row wrap">
                    <button
                      type="button"
                      className="ghost-button small-button"
                      onClick={() => handleSelectVehicle(vehicle.vehicle_id)}
                      disabled={Boolean(vehicle.is_active) || busyAction === `select-${vehicle.vehicle_id}`}
                    >
                      Use this car
                    </button>
                    <button
                      type="button"
                      className="ghost-button small-button danger-outline"
                      onClick={() => handleDeleteVehicle(vehicle.vehicle_id)}
                      disabled={vehicles.length <= 1 || busyAction === `delete-${vehicle.vehicle_id}`}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state compact">No cars are registered yet.</p>
            )}
          </div>

          <form className="form-grid add-vehicle-form" onSubmit={handleAddVehicle}>
            <label>
              Car license plate
              <input
                name="licenseNumber"
                pattern="[A-Za-z][0-9]{1,7}"
                maxLength="8"
                placeholder="A1234567"
                value={vehicleForm.licenseNumber}
                onChange={updateVehicleField}
                required
              />
            </label>

            <label>
              Vehicle info
              <input
                name="vehicleInfo"
                placeholder="e.g. Honda Civic, Mercedes C-Class"
                value={vehicleForm.vehicleInfo}
                onChange={updateVehicleField}
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
                value={vehicleForm.availableSeats}
                onChange={updateVehicleField}
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={busyAction === 'add-vehicle'}>
              {busyAction === 'add-vehicle' ? 'Adding...' : 'Add car'}
            </button>
          </form>
        </section>
      ) : null}

      {cropFile ? (
        <ImageCropModal
          file={cropFile}
          title="Adjust profile picture"
          onCancel={() => setCropFile(null)}
          onSave={(profileImage) => {
            setProfileForm((current) => ({ ...current, profileImage }));
            setCropFile(null);
            setNotice('Picture ready. Save profile to keep it.');
          }}
        />
      ) : null}
    </section>
  );
};

export default AccountPage;
