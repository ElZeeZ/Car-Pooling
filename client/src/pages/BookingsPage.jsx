import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';

const BookingsPage = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let mounted = true;
    setStatus('loading');

    api
      .get('/bookings')
      .then((payload) => {
        if (mounted) {
          setBookings(payload.bookings ?? []);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (mounted) {
          setStatus('offline');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Bookings</p>
          <h2>Booking history</h2>
        </div>
      </div>

      <div className="table-panel">
        <div className="table-row booking-row header">
          <span>Booking ID</span>
          <span>{user?.role === 'passenger' ? 'Driver' : 'Passenger'}</span>
          <span>Trip</span>
          <span>Status</span>
          <span>Payment</span>
        </div>

        {status === 'loading' ? <p className="empty-state">Loading bookings...</p> : null}
        {status === 'offline' ? <p className="empty-state">Connect the API to load bookings.</p> : null}

        {bookings.map((booking) => (
          <div className="table-row booking-row" key={booking.booking_id}>
            <span>#{booking.booking_id}</span>
            <span>{user?.role === 'passenger' ? booking.driver_name : booking.passenger_name || 'Unavailable'}</span>
            <span>{booking.origin} to {booking.destination}</span>
            <span>{booking.booking_status}</span>
            <span>
              {booking.payment_status}
              {booking.payment_amount ? `, $${Number(booking.payment_amount).toFixed(2)}` : ''}
            </span>
          </div>
        ))}

        {status === 'ready' && bookings.length === 0 ? (
          <p className="empty-state">No bookings are recorded for this account yet.</p>
        ) : null}
      </div>
    </section>
  );
};

export default BookingsPage;
