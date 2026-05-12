import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'N/A');
const formatMoney = (value) => `$${Number(value ?? 0).toFixed(2)}`;

const prettyStatus = (value) =>
  String(value ?? 'unknown')
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());

const TransactionHistoryPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState('idle');

  const loadTransactions = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setStatus('loading');
    }

    try {
      const payload = await api.get('/admin/transactions');
      setTransactions(payload.transactions ?? []);
      setStatus('ready');
    } catch {
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    loadTransactions({ showLoading: true });
    const timer = window.setInterval(() => loadTransactions(), 3000);

    return () => window.clearInterval(timer);
  }, [loadTransactions]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Transactions</p>
          <h2>Transaction history</h2>
        </div>
      </div>

      <div className="table-panel">
        <div className="table-row admin-transaction-row header">
          <span>Transaction</span>
          <span>Account</span>
          <span>Reference</span>
          <span>Amount</span>
          <span>Date</span>
        </div>

        {status === 'loading' ? <p className="empty-state">Loading transactions...</p> : null}
        {status === 'offline' ? <p className="empty-state">Connect the API to load transactions.</p> : null}

        {transactions.map((transaction) => (
          <div className="table-row admin-transaction-row" key={transaction.transaction_id}>
            <span>{prettyStatus(transaction.transaction_type)}</span>
            <span>{transaction.owner_name ?? 'Deleted account'} ({transaction.owner_type})</span>
            <span>{transaction.booking_id ? `Booking #${transaction.booking_id}` : 'Wallet'}</span>
            <span>{formatMoney(transaction.amount)}</span>
            <span>{formatDate(transaction.created_at)}</span>
          </div>
        ))}

        {status === 'ready' && transactions.length === 0 ? (
          <p className="empty-state">No wallet transactions have been recorded yet.</p>
        ) : null}
      </div>
    </section>
  );
};

export default TransactionHistoryPage;
