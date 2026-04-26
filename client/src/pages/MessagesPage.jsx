const MessagesPage = () => (
  <section className="page-section">
    <div className="page-heading">
      <p className="eyebrow">Messages</p>
      <h2>In-app messaging</h2>
    </div>

    <div className="split-panel">
      <div className="conversation-list">
        <button type="button" className="conversation active">
          Booking #1
        </button>
        <button type="button" className="conversation">
          Booking #2
        </button>
      </div>

      <div className="message-thread">
        <p className="message incoming">Pickup location confirmed.</p>
        <p className="message outgoing">I will be there in 5 minutes.</p>
        <form className="message-form">
          <input placeholder="Write a message" />
          <button type="button" className="primary-button">
            Send
          </button>
        </form>
      </div>
    </div>
  </section>
);

export default MessagesPage;
