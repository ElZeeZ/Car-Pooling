import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';

const emptyAdminData = {
  summary: {
    pendingDrivers: 0,
    openReports: 0,
    activeTrips: 0,
    activeBookings: 0,
    totalDrivers: 0,
    totalPassengers: 0
  },
  pendingDrivers: [],
  reports: [],
  accounts: [],
  trips: []
};

const operations = [
  { key: 'accounts', label: 'Manage accounts' },
  { key: 'trips', label: 'Monitor ongoing trips' }
];

const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'N/A');

const prettyStatus = (value) =>
  String(value ?? 'unknown')
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());

const AdminDashboard = () => {
  const [data, setData] = useState(emptyAdminData);
  const [activeOperation, setActiveOperation] = useState('accounts');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadAdminData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const [dashboard, accounts, trips, reports] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/accounts'),
        api.get('/admin/trips'),
        api.get('/admin/reports')
      ]);

      setData({
        summary: dashboard.summary ?? emptyAdminData.summary,
        pendingDrivers: dashboard.pendingDrivers ?? [],
        reports: reports.reports ?? dashboard.reports ?? [],
        accounts: accounts.accounts ?? [],
        trips: trips.trips ?? []
      });
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadAdminData();
    const intervalId = window.setInterval(() => loadAdminData({ silent: true }), 3000);

    return () => window.clearInterval(intervalId);
  }, [loadAdminData]);

  useEffect(() => {
    if (!selectedDriver) {
      return;
    }

    const freshDriver = data.pendingDrivers.find(
      (driver) => driver.driver_id === selectedDriver.driver_id
    );

    if (freshDriver) {
      setSelectedDriver(freshDriver);
    }
  }, [data.pendingDrivers, selectedDriver]);

  useEffect(() => {
    if (!selectedReport) {
      return;
    }

    const freshReport = data.reports.find((report) => report.report_id === selectedReport.report_id);

    if (freshReport) {
      setSelectedReport(freshReport);
    }
  }, [data.reports, selectedReport]);

  const stats = useMemo(
    () => [
      { label: 'Pending drivers', value: data.summary.pendingDrivers ?? 0 },
      { label: 'Open reports', value: data.summary.openReports ?? 0 },
      { label: 'Active trips', value: data.summary.activeTrips ?? 0 },
      { label: 'Active bookings', value: data.summary.activeBookings ?? 0 }
    ],
    [data.summary]
  );

  const pendingReports = useMemo(
    () => data.reports.filter((report) => ['open', 'reviewing'].includes(report.report_status)),
    [data.reports]
  );

  const ongoingTrips = useMemo(
    () => data.trips.filter((trip) => ['active', 'in_progress'].includes(trip.trip_status)),
    [data.trips]
  );

  const accountSummary = useMemo(() => {
    const drivers = data.accounts.filter((account) => account.role === 'driver').length;
    const passengers = data.accounts.filter((account) => account.role === 'passenger').length;
    return `${drivers} drivers, ${passengers} passengers`;
  }, [data.accounts]);

  const handleVerifyDriver = async (driverId) => {
    setNotice('');
    setError('');

    try {
      await api.patch(`/admin/drivers/${driverId}/verify`, {});
      setNotice('Driver account verified and activated.');
      setSelectedDriver(null);
      await loadAdminData({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleRejectDriver = async (driverId) => {
    setNotice('');
    setError('');

    try {
      await api.patch(`/admin/drivers/${driverId}/reject`, {});
      setNotice('Driver account request rejected.');
      setSelectedDriver(null);
      await loadAdminData({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleStatusChange = async (role, accountId, accountStatus) => {
    setNotice('');
    setError('');

    try {
      await api.patch(`/admin/accounts/${role}/${accountId}/status`, { accountStatus });
      setNotice('Account status updated.');
      await loadAdminData({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleDeleteAccount = async (account) => {
    const confirmed = window.confirm(`Delete ${account.full_name}'s ${account.role} account?`);

    if (!confirmed) {
      return;
    }

    setNotice('');
    setError('');

    try {
      await api.delete(`/admin/accounts/${account.role}/${account.id}`);
      setNotice('Account deleted.');
      await loadAdminData({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleReportStatus = async (reportId, reportStatus) => {
    setNotice('');
    setError('');

    try {
      await api.patch(`/admin/reports/${reportId}/status`, { reportStatus });
      setNotice('Report status updated.');
      if (['resolved', 'dismissed'].includes(reportStatus)) {
        setSelectedReport(null);
      }
      await loadAdminData({ silent: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const renderEmpty = (message) => <p className="empty-state compact">{message}</p>;

  const renderDriverDetails = () => {
    if (!selectedDriver) {
      return null;
    }

    return (
      <article className="admin-detail-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Driver request</p>
            <h3>{selectedDriver.full_name}</h3>
          </div>
          <button
            type="button"
            className="ghost-button small-button"
            onClick={() => setSelectedDriver(null)}
          >
            Close
          </button>
        </div>

        <dl className="admin-detail-grid">
          <div>
            <dt>Email</dt>
            <dd>{selectedDriver.email}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{selectedDriver.phone}</dd>
          </div>
          <div>
            <dt>License number</dt>
            <dd>{selectedDriver.license_number}</dd>
          </div>
          <div>
            <dt>Vehicle info</dt>
            <dd>{selectedDriver.vehicle_info}</dd>
          </div>
          <div>
            <dt>Registered seats</dt>
            <dd>{selectedDriver.available_seats}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(selectedDriver.created_at)}</dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>{prettyStatus(selectedDriver.account_status)}</dd>
          </div>
          <div>
            <dt>Verification status</dt>
            <dd>{prettyStatus(selectedDriver.verification_status)}</dd>
          </div>
        </dl>

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => handleVerifyDriver(selectedDriver.driver_id)}
          >
            Confirm
          </button>
          <button
            type="button"
            className="ghost-button danger-outline"
            onClick={() => handleRejectDriver(selectedDriver.driver_id)}
          >
            Reject
          </button>
        </div>
      </article>
    );
  };

  const renderAccountsPanel = () => (
    <section className="admin-panel wide-panel">
      <div className="panel-title-row">
        <h3>Manage accounts</h3>
        <small>{data.accounts.length} total accounts</small>
      </div>

      {data.accounts.length === 0 ? (
        renderEmpty('No passenger or driver accounts have been created yet.')
      ) : (
        <div className="admin-data-table">
          <div className="admin-table-row admin-table-header accounts">
            <span>Name</span>
            <span>Role</span>
            <span>Email</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {data.accounts.map((account) => (
            <div className="admin-table-row accounts" key={`${account.role}-${account.id}`}>
              <span>{account.full_name}</span>
              <span>{prettyStatus(account.role)}</span>
              <span>{account.email}</span>
              <span>{prettyStatus(account.account_status)}</span>
              <span className="button-row wrap">
                <button
                  type="button"
                  className="ghost-button small-button"
                  onClick={() =>
                    handleStatusChange(
                      account.role,
                      account.id,
                      account.account_status === 'suspended' ? 'active' : 'suspended'
                    )
                  }
                >
                  {account.account_status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </button>
                <button
                  type="button"
                  className="ghost-button small-button danger-outline"
                  onClick={() => handleDeleteAccount(account)}
                >
                  Delete
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderTripsPanel = () => (
    <section className="admin-panel wide-panel">
      <div className="panel-title-row">
        <h3>Monitor ongoing trips</h3>
        <small>{ongoingTrips.length} ongoing trips</small>
      </div>

      {ongoingTrips.length === 0 ? (
        renderEmpty('No ongoing trips are running right now.')
      ) : (
        <div className="admin-data-table">
          <div className="admin-table-row admin-table-header trips">
            <span>Trip</span>
            <span>Driver</span>
            <span>Route</span>
            <span>Status</span>
            <span>Passengers</span>
            <span>Last location</span>
          </div>
          {ongoingTrips.map((trip) => (
            <div className="admin-table-row trips" key={trip.trip_id}>
              <span>#{trip.trip_id}</span>
              <span>{trip.driver_name}</span>
              <span>{trip.origin} to {trip.destination}</span>
              <span>{prettyStatus(trip.trip_status)}</span>
              <span>{trip.passengers || 'No passengers'}</span>
              <span>{trip.last_location_at ? formatDate(trip.last_location_at) : 'Not shared'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderReportDetails = () => {
    if (!selectedReport) {
      return null;
    }

    return (
      <article className="admin-detail-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Report details</p>
            <h3>{prettyStatus(selectedReport.report_type)}</h3>
          </div>
          <button
            type="button"
            className="ghost-button small-button"
            onClick={() => setSelectedReport(null)}
          >
            Close
          </button>
        </div>

        <dl className="admin-detail-grid">
          <div>
            <dt>Booking</dt>
            <dd>#{selectedReport.booking_id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{prettyStatus(selectedReport.report_status)}</dd>
          </div>
          <div>
            <dt>Passenger</dt>
            <dd>{selectedReport.passenger_name}</dd>
          </div>
          <div>
            <dt>Driver</dt>
            <dd>{selectedReport.driver_name}</dd>
          </div>
          <div>
            <dt>Rating</dt>
            <dd>{selectedReport.rating ?? 'N/A'}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(selectedReport.report_date)}</dd>
          </div>
          <div>
            <dt>Pickup</dt>
            <dd>{selectedReport.pickup_location}</dd>
          </div>
          <div>
            <dt>Drop-off</dt>
            <dd>{selectedReport.dropoff_location}</dd>
          </div>
        </dl>

        <p className="admin-detail-note">{selectedReport.comment || 'No report comment was added.'}</p>

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => handleReportStatus(selectedReport.report_id, 'resolved')}
          >
            Resolve
          </button>
          <button
            type="button"
            className="ghost-button danger-outline"
            onClick={() => handleReportStatus(selectedReport.report_id, 'dismissed')}
          >
            Dismiss
          </button>
        </div>
      </article>
    );
  };

  const renderReportsPanel = ({ compact = false } = {}) => (
    <section className={compact ? 'admin-panel' : 'admin-panel wide-panel'}>
      <div className="panel-title-row">
        <h3>Reports and violations</h3>
        <small>{compact ? `${pendingReports.length} open` : `${data.reports.length} submitted reports`}</small>
      </div>

      {(compact ? pendingReports : data.reports).length === 0 ? (
        renderEmpty(compact ? 'No open reports are waiting for review.' : 'No reports have been submitted yet.')
      ) : compact ? (
        (compact ? pendingReports : data.reports).map((report) => (
          <button
            type="button"
            className="admin-list-row button-like"
            key={report.report_id}
            onClick={() => setSelectedReport(report)}
          >
            <span>{prettyStatus(report.report_type)}</span>
            <small>Booking #{report.booking_id} - {report.passenger_name} / {report.driver_name}</small>
            <strong>Open</strong>
          </button>
        ))
      ) : (
        <div className="admin-data-table">
          <div className="admin-table-row admin-table-header reports">
            <span>Report</span>
            <span>Booking</span>
            <span>Users</span>
            <span>Status</span>
            <span>Comment</span>
            <span>Actions</span>
          </div>
          {(compact ? pendingReports : data.reports).map((report) => (
            <div className="admin-table-row reports" key={report.report_id}>
              <span>{prettyStatus(report.report_type)}</span>
              <span>#{report.booking_id}</span>
              <span>{report.passenger_name} / {report.driver_name}</span>
              <span>{prettyStatus(report.report_status)}</span>
              <span>{report.comment || 'No comment'}</span>
              <span className="button-row wrap">
                <button
                  type="button"
                  className="ghost-button small-button"
                  onClick={() => setSelectedReport(report)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="ghost-button small-button"
                  onClick={() => handleReportStatus(report.report_id, 'resolved')}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className="ghost-button small-button danger-outline"
                  onClick={() => handleReportStatus(report.report_id, 'dismissed')}
                >
                  Dismiss
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {renderReportDetails()}
    </section>
  );

  const renderOperationPanel = () => {
    if (activeOperation === 'trips') {
      return renderTripsPanel();
    }

    return renderAccountsPanel();
  };

  return (
    <section className="page-section admin-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administrator</p>
          <h2>Control dashboard</h2>
        </div>
        <small className="live-indicator">{loading ? 'Loading live data...' : 'Live database view'}</small>
      </div>

      {error ? <p className="alert">{error}</p> : null}
      {notice ? <p className="success-alert">{notice}</p> : null}

      <div className="admin-stat-grid">
        {stats.map((item) => (
          <article className="admin-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="admin-control-grid">
        <section className="admin-panel">
          <div className="panel-title-row">
            <h3>Driver verification</h3>
          </div>

          {data.pendingDrivers.length === 0 ? (
            renderEmpty('No driver account requests are waiting for review.')
          ) : (
            data.pendingDrivers.slice(0, 4).map((driver) => (
              <button
                type="button"
                className="admin-list-row button-like"
                key={driver.driver_id}
                onClick={() => setSelectedDriver(driver)}
              >
                <span>{driver.full_name}</span>
                <small>{driver.license_number} - {driver.vehicle_info}</small>
                <strong>Open</strong>
              </button>
            ))
          )}

          {renderDriverDetails()}
        </section>

        {renderReportsPanel({ compact: true })}

        <section className="admin-panel wide-panel">
          <div className="panel-title-row">
            <h3>Operations</h3>
            <small>{accountSummary}</small>
          </div>
          <div className="admin-action-grid">
            {operations.map((operation) => (
              <button
                type="button"
                className={activeOperation === operation.key ? 'active' : ''}
                key={operation.key}
                onClick={() => setActiveOperation(operation.key)}
              >
                {operation.label}
              </button>
            ))}
          </div>
        </section>

        {renderOperationPanel()}
      </div>
    </section>
  );
};

export default AdminDashboard;
