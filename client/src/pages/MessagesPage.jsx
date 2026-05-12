import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';

const MessagesPage = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [status, setStatus] = useState('idle');

  const loadConversations = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setStatus('loading');
    }

    const payload = await api.get('/messages/conversations');
    const nextConversations = payload.conversations ?? [];
    setConversations(nextConversations);
    setSelectedBookingId((currentBookingId) => {
      if (currentBookingId && nextConversations.some((conversation) => conversation.booking_id === currentBookingId)) {
        return currentBookingId;
      }

      return nextConversations[0]?.booking_id ?? null;
    });
    setStatus('ready');
  }, []);

  const loadMessages = useCallback(async (bookingId) => {
    const payload = await api.get(`/messages/booking/${bookingId}`);
    setMessages(payload.messages ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;

    const refresh = async (options) => {
      try {
        await loadConversations(options);
      } catch {
        if (mounted) {
          setStatus('offline');
        }
      }
    };

    refresh({ showLoading: true });
    const timer = window.setInterval(() => refresh(), 2500);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedBookingId) {
      setMessages([]);
      return undefined;
    }

    let mounted = true;

    const refresh = async () => {
      try {
        const payload = await api.get(`/messages/booking/${selectedBookingId}`);
        if (mounted) {
          setMessages(payload.messages ?? []);
        }
      } catch {
        if (mounted) {
          setMessages([]);
        }
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 1500);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [selectedBookingId]);

  const handleSend = async (event) => {
    event.preventDefault();

    if (!selectedBookingId || !messageText.trim()) {
      return;
    }

    await api.post('/messages', {
      bookingId: selectedBookingId,
      messageText: messageText.trim()
    });

    await loadMessages(selectedBookingId);
    setMessageText('');
  };

  const selectedConversation = conversations.find((conversation) => conversation.booking_id === selectedBookingId);
  const isAdmin = user?.role === 'admin';

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Messages</p>
          <h2>{isAdmin ? 'Message history' : 'In-app messaging'}</h2>
        </div>
      </div>

      <div className="split-panel">
        <div className="conversation-list">
          {status === 'loading' ? <p className="empty-state compact">Loading conversations...</p> : null}
          {status === 'offline' ? <p className="empty-state compact">Connect the API to load messages.</p> : null}

          {conversations.map((conversation) => (
            <button
              type="button"
              className={selectedBookingId === conversation.booking_id ? 'conversation active' : 'conversation'}
              key={conversation.booking_id}
              onClick={() => setSelectedBookingId(conversation.booking_id)}
            >
              Booking #{conversation.booking_id}
              <small>
                {isAdmin
                  ? `${conversation.passenger_name} / ${conversation.driver_name}`
                  : user?.role === 'driver'
                    ? conversation.passenger_name
                    : conversation.driver_name}
              </small>
            </button>
          ))}

          {status === 'ready' && conversations.length === 0 ? (
            <p className="empty-state compact">
              {isAdmin ? 'No booking messages have been recorded yet.' : 'No active accepted booking conversations.'}
            </p>
          ) : null}
        </div>

        <div className={selectedBookingId ? 'message-thread' : 'message-thread empty'}>
          {selectedConversation ? (
            <div className="message-context">
              <strong>
                {isAdmin
                  ? `${selectedConversation.passenger_name} / ${selectedConversation.driver_name}`
                  : user?.role === 'driver'
                    ? selectedConversation.passenger_name
                    : selectedConversation.driver_name}
              </strong>
              <span>Booking #{selectedConversation.booking_id}</span>
            </div>
          ) : null}

          <div className="message-list">
            <p className="message-policy-note">
              {isAdmin
                ? 'Read-only admin view. Driver and passenger messages are monitored for safety.'
                : 'Messages are monitored by admins for safety.'}
            </p>
            {messages.map((message) => (
              <p
                className={message.sender_type === user?.role ? 'message outgoing' : 'message incoming'}
                key={message.message_id}
              >
                {message.message_text}
              </p>
            ))}
            {selectedBookingId && messages.length === 0 ? (
              <p className="empty-state compact">No messages for this accepted booking yet.</p>
            ) : null}
            {!selectedBookingId ? (
              <p className="empty-state compact">
                {isAdmin
                  ? 'Select a booking conversation to review message history.'
                  : 'Messaging opens only for the current accepted booking.'}
              </p>
            ) : null}
          </div>

          {selectedBookingId && !isAdmin ? (
            <form className="message-form" onSubmit={handleSend}>
              <input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Write a message"
              />
              <button type="submit" className="primary-button">
                Send
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default MessagesPage;
