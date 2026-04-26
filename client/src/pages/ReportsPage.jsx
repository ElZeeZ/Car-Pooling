const ReportsPage = () => (
  <section className="page-section">
    <div className="page-heading">
      <p className="eyebrow">Reports</p>
      <h2>Ratings and safety reports</h2>
    </div>

    <form className="form-grid report-form">
      <label>
        Booking ID
        <input placeholder="Booking reference" />
      </label>
      <label>
        Report type
        <select defaultValue="driver_review">
          <option value="driver_review">Driver review</option>
          <option value="passenger_review">Passenger review</option>
          <option value="safety">Safety</option>
          <option value="payment">Payment</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Rating
        <input type="number" min="1" max="5" placeholder="1 to 5" />
      </label>
      <label className="full-span">
        Comment
        <textarea rows="5" placeholder="Add report details" />
      </label>
      <button type="button" className="primary-button full-span">
        Submit report
      </button>
    </form>
  </section>
);

export default ReportsPage;
