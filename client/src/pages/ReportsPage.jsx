import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';

const reportTypeOptionsByRole = {
  driver: [
    { value: 'safety', label: 'Safety' },
    { value: 'payment', label: 'Payment' },
    { value: 'other', label: 'Other' }
  ],
  passenger: [
    { value: 'safety', label: 'Safety' },
    { value: 'payment', label: 'Payment' },
    { value: 'other', label: 'Other' }
  ]
};

const getDefaultReportType = () => 'safety';
const closedReportStatuses = new Set(['resolved', 'dismissed']);

const ReportsPage = () => {
  const { user } = useAuth();
  const [form, setForm] = useState({
    bookingId: '',
    reportType: getDefaultReportType(user?.role),
    comment: ''
  });
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const reportTypeOptions = reportTypeOptionsByRole[user?.role] ?? reportTypeOptionsByRole.passenger;

  useEffect(() => {
    if (user?.role === 'admin') {
      return;
    }

    setForm((current) => ({
      ...current,
      reportType: reportTypeOptions.some((option) => option.value === current.reportType)
        ? current.reportType
        : getDefaultReportType(user?.role)
    }));
  }, [reportTypeOptions, user?.role]);

  const loadReports = useCallback(
    async ({ showLoading = false } = {}) => {
      if (user?.role !== 'admin') {
        return;
      }

      if (showLoading) {
        setStatus('loading');
      }

      try {
        const payload = await api.get('/reports');
        setReports(payload.reports ?? []);
        setStatus('ready');
      } catch {
        setStatus('offline');
      }
    },
    [user?.role]
  );

  useEffect(() => {
    if (user?.role !== 'admin') {
      return undefined;
    }

    loadReports({ showLoading: true });
    const timer = window.setInterval(() => loadReports(), 3000);

    return () => window.clearInterval(timer);
  }, [loadReports, user?.role]);

  const updateForm = (field, value) => {
    if (field === 'bookingId') {
      setForm((current) => ({ ...current, bookingId: value.replace(/\D/g, '') }));
      return;
    }

    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      await api.post('/reports', {
        bookingId: Number(form.bookingId),
        reportType: form.reportType,
        comment: form.comment
      });

      setForm((current) => ({
        ...current,
        bookingId: '',
        comment: ''
      }));
      setStatus('submitted');
    } catch (submitError) {
      setError(submitError.message || 'Could not submit this report.');
    }
  };

  const updateReportStatus = async (reportId, reportStatus) => {
    await api.patch(`/reports/${reportId}/status`, { reportStatus });
    await loadReports();
  };

  if (user?.role === 'admin') {
    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Reports</p>
            <h2>Report history</h2>
          </div>
        </div>

        <div className="table-panel">
          <div className="table-row report-row header">
            <span>Report ID</span>
            <span>Booking</span>
            <span>Passenger</span>
            <span>Driver</span>
            <span>Type</span>
            <span>Status</span>
            <span>Action</span>
          </div>

          {status === 'loading' ? <p className="empty-state">Loading reports...</p> : null}
          {status === 'offline' ? <p className="empty-state">Connect the API to load reports.</p> : null}

          {reports.map((report) => (
            <div className="table-row report-row" key={report.report_id}>
              <span>#{report.report_id}</span>
              <span>#{report.booking_id}</span>
              <span>{report.passenger_name}</span>
              <span>{report.driver_name}</span>
              <span>{report.report_type}</span>
              <span>{report.report_status}</span>
              <span className="button-row">
                {closedReportStatuses.has(report.report_status) ? (
                  <span className="muted-text">Closed</span>
                ) : (
                  <>
                    <button type="button" className="primary-button small-button" onClick={() => updateReportStatus(report.report_id, 'resolved')}>
                      Resolve
                    </button>
                    <button type="button" className="ghost-button small-button danger-outline" onClick={() => updateReportStatus(report.report_id, 'dismissed')}>
                      Dismiss
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}

          {status === 'ready' && reports.length === 0 ? <p className="empty-state">No reports submitted yet.</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Safety reports</h2>
        </div>
      </div>

      <form className="form-grid report-form" onSubmit={handleSubmit}>
        <label>
          Booking ID
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.bookingId}
            onChange={(event) => updateForm('bookingId', event.target.value)}
            placeholder="Booking reference"
            required
          />
        </label>
        <label className="full-span">
          Report type
          <select value={form.reportType} onChange={(event) => updateForm('reportType', event.target.value)}>
            {reportTypeOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Comment
          <textarea
            rows="5"
            value={form.comment}
            onChange={(event) => updateForm('comment', event.target.value)}
            placeholder="Add report details"
          />
        </label>
        <button type="submit" className="primary-button full-span">
          Submit report
        </button>
        {error ? <p className="alert full-span">{error}</p> : null}
        {status === 'submitted' ? <p className="empty-state compact full-span">Report submitted for admin review.</p> : null}
      </form>
    </section>
  );
};

export default ReportsPage;
