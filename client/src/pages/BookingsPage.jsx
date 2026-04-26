const bookingSteps = [
  'Passenger submits pickup and drop-off',
  'Driver accepts or rejects request',
  'Passenger tracks driver arrival',
  'Trip reaches drop-off',
  'Payment status is completed'
];

const BookingsPage = () => (
  <section className="page-section">
    <div className="page-heading">
      <p className="eyebrow">Bookings</p>
      <h2>Booking workflow</h2>
    </div>

    <div className="timeline">
      {bookingSteps.map((step, index) => (
        <article className="timeline-item" key={step}>
          <span>{index + 1}</span>
          <h3>{step}</h3>
        </article>
      ))}
    </div>
  </section>
);

export default BookingsPage;
