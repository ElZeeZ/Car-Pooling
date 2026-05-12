import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';

const initialCard = {
  cardholderName: '',
  cardNumber: '',
  expiryMonth: '',
  expiryYear: ''
};

const cardEndingLabel = (card) => `Card ending in ${String(card.last_four ?? '').slice(-2).padStart(2, '0')}`;

const WalletPage = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [cardForm, setCardForm] = useState(initialCard);
  const [walletAmount, setWalletAmount] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [status, setStatus] = useState('loading');
  const [cardMessage, setCardMessage] = useState('');
  const [walletMessage, setWalletMessage] = useState('');
  const isDriver = user?.role === 'driver';

  const loadWallet = () => {
    setStatus('loading');
    api
      .get('/wallet')
      .then((payload) => {
        const nextCards = payload.cards ?? [];
        setWallet(payload.wallet);
        setCards(nextCards);
        setTransactions(payload.transactions ?? []);
        setSelectedCardId((currentCardId) =>
          nextCards.some((card) => String(card.card_id) === currentCardId)
            ? currentCardId
            : String(nextCards[0]?.card_id ?? '')
        );
        setStatus('ready');
      })
      .catch(() => {
        setStatus('offline');
      });
  };

  useEffect(() => {
    loadWallet();
  }, []);

  const handleChange = (field, value) => {
    setCardForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setCardMessage('');

    try {
      await api.post('/wallet/cards', cardForm);
      setCardForm(initialCard);
      setCardMessage('Demo card saved.');
      loadWallet();
    } catch (error) {
      setCardMessage(error.message || 'Could not save this card.');
    }
  };

  const handleWalletAction = async (event) => {
    event.preventDefault();
    setWalletMessage('');

    try {
      const path = isDriver ? '/wallet/withdraw' : '/wallet/top-up';
      await api.post(path, {
        amount: Number(walletAmount),
        cardId: selectedCardId ? Number(selectedCardId) : null
      });
      setWalletAmount('');
      setWalletMessage(isDriver ? 'Withdrawal recorded.' : 'Wallet balance updated.');
      loadWallet();
    } catch (error) {
      setWalletMessage(error.message || 'Could not update this wallet.');
    }
  };

  const handleDeleteCard = async (cardId) => {
    setCardMessage('');

    try {
      await api.delete(`/wallet/cards/${cardId}`);
      setCardMessage('Demo card deleted.');
      loadWallet();
    } catch (error) {
      setCardMessage(error.message || 'Could not delete this card.');
    }
  };

  return (
    <section className="page-section wallet-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Wallet</p>
          <h2>Payments and balance</h2>
        </div>
      </div>

      <div className="wallet-grid">
        <article className="wallet-balance">
          <span>Available balance</span>
          <strong>${Number(wallet?.balance ?? 0).toFixed(2)}</strong>
          <p>
            {isDriver
              ? 'Withdraw earned balance to one of your saved demo cards.'
              : 'Add demo funds instantly for local payment testing.'}
          </p>
          <form className="wallet-top-up" onSubmit={handleWalletAction}>
            <label>
              {isDriver ? 'Withdraw amount' : 'Add funds'}
              <input
                value={walletAmount}
                onChange={(event) => setWalletAmount(event.target.value)}
                placeholder="Amount"
                inputMode="decimal"
              />
            </label>
            {isDriver ? (
              <label>
                Withdraw to card
                <select value={selectedCardId} onChange={(event) => setSelectedCardId(event.target.value)}>
                  {cards.length === 0 ? <option value="">No saved cards</option> : null}
                  {cards.map((card) => (
                    <option value={card.card_id} key={card.card_id}>
                      {cardEndingLabel(card)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Top up from card
                <select value={selectedCardId} onChange={(event) => setSelectedCardId(event.target.value)}>
                  {cards.length === 0 ? <option value="">Demo card</option> : null}
                  {cards.map((card) => (
                    <option value={card.card_id} key={card.card_id}>
                      {cardEndingLabel(card)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className="primary-button">
              {isDriver ? 'Withdraw balance' : 'Top up balance'}
            </button>
            {walletMessage ? <p className="empty-state compact">{walletMessage}</p> : null}
          </form>
        </article>

        <form className="report-form wallet-form" onSubmit={handleSubmit}>
          <h3>Add payment card</h3>
          <label>
            Cardholder name
            <input
              value={cardForm.cardholderName}
              onChange={(event) => handleChange('cardholderName', event.target.value)}
              placeholder="Name on card"
            />
          </label>
          <label>
            Card number
            <input
              value={cardForm.cardNumber}
              onChange={(event) => handleChange('cardNumber', event.target.value)}
              placeholder="Test card number"
              inputMode="numeric"
            />
          </label>
          <div className="form-grid">
            <label>
              Expiry month
              <input
                value={cardForm.expiryMonth}
                onChange={(event) => handleChange('expiryMonth', event.target.value)}
                placeholder="MM"
                inputMode="numeric"
              />
            </label>
            <label>
              Expiry year
              <input
                value={cardForm.expiryYear}
                onChange={(event) => handleChange('expiryYear', event.target.value)}
                placeholder="YYYY"
                inputMode="numeric"
              />
            </label>
          </div>
          <button type="submit" className="primary-button">
            Save card
          </button>
          {cardMessage ? <p className="empty-state compact">{cardMessage}</p> : null}
        </form>
      </div>

      <div className="wallet-section-title">
        <h3>Saved cards</h3>
      </div>

      <div className="table-panel wallet-table">
        <div className="table-row card-row header">
          <span>Card</span>
          <span>Expires</span>
          <span>Status</span>
          <span>Action</span>
        </div>

        {status === 'loading' ? <p className="empty-state">Loading wallet...</p> : null}
        {status === 'offline' ? <p className="empty-state">Run the wallet database migration to enable card payments.</p> : null}

        {cards.map((card) => (
          <div className="table-row card-row" key={card.card_id}>
            <span>{cardEndingLabel(card)}</span>
            <span>{String(card.expiry_month).padStart(2, '0')}/{card.expiry_year}</span>
            <span>{card.card_status}</span>
            <span className="card-action-cell">
              <button
                type="button"
                className="ghost-button small-button danger-outline"
                onClick={() => handleDeleteCard(card.card_id)}
              >
                Delete
              </button>
            </span>
          </div>
        ))}

        {status === 'ready' && cards.length === 0 ? (
          <p className="empty-state">No cards saved yet.</p>
        ) : null}
      </div>

      <div className="wallet-section-title">
        <h3>Transaction history</h3>
      </div>

      <div className="table-panel wallet-table">
        <div className="table-row wallet-transaction-row header">
          <span>Transaction</span>
          <span>Reference</span>
          <span>Amount</span>
          <span>Date</span>
        </div>

        {transactions.map((transaction) => (
          <div className="table-row wallet-transaction-row" key={transaction.transaction_id}>
            <span>{transaction.description || transaction.transaction_type}</span>
            <span>{transaction.booking_id ? `#${transaction.booking_id}` : 'Wallet'}</span>
            <span>
              {['withdrawal', 'fare_payment'].includes(transaction.transaction_type) ? '-' : '+'}${Number(transaction.amount).toFixed(2)}
            </span>
            <span>{new Date(transaction.created_at).toLocaleString()}</span>
          </div>
        ))}

        {status === 'ready' && transactions.length === 0 ? (
          <p className="empty-state">No wallet transactions yet.</p>
        ) : null}
      </div>
    </section>
  );
};

export default WalletPage;
