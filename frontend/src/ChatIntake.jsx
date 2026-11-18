
import { useState } from 'react';
import { MessageCircle, Send, CheckCircle } from 'lucide-react';

const API = '/api';

export default function ChatIntake() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! What would you like to purchase?'
    }
  ]);

  const [input, setInput] = useState('');
  const [draft, setDraft] = useState({});
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [decision, setDecision] = useState(null);
  const [processing, setProcessing] = useState(false);   
  const [error, setError] = useState('');

  async function sendMessage(event) {
    event.preventDefault();

    const message = input.trim();
    if (!message || loading || complete) return;

    setInput('');
    setError('');
    setLoading(true);

    setMessages(previous => [
      ...previous,
      { role: 'user', text: message }
    ]);

    try {
      const response = await fetch(`${API}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, draft })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Chat request failed');
      }

      setDraft(data.draft);
      setComplete(data.complete);

      setMessages(previous => [
        ...previous,
        { role: 'assistant', text: data.reply }
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPR() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API}/chat/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ draft })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not create PR');
      }

      setSubmitted(data.prNo);

      setMessages(previous => [
        ...previous,
        {
          role: 'assistant',
          text: `Purchase request ${data.prNo} was created successfully!`
        }
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
async function processPR() {
  if (!submitted || processing) return;

  setProcessing(true);
  setError('');

  try {
    const response = await fetch('/api/chat/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prNo: submitted })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Could not process PR');
    }

    setDecision(data.rows?.[0] || null);
  } catch (err) {
    setError(err.message);
  } finally {
    setProcessing(false);
  }
}

  function startNew() {
    setMessages([
      {
        role: 'assistant',
        text: 'Hello! What would you like to purchase?'
      }
    ]);
    setInput('');
    setDraft({});
    setComplete(false);
    setSubmitted(null);
    setDecision(null);
    setProcessing(false);
    setError('');
  }

  return (
    <section className="chat-panel">
      <div className="chat-heading">
        <div>
          <h2>
            <MessageCircle size={22} />
            Employee Chat Intake
          </h2>
          <p>
            Describe your purchase request and answer
            a few follow-up questions.
          </p>
        </div>

        <button className="detail-button" onClick={startNew}>
          New request
        </button>
      </div>

      <p className="chat-hint">
        Available plants: PUN1 (Pune - Bhosari), CHK1 (Chakan).
      </p>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`chat-bubble ${message.role}`}
          >
            {message.text}
          </div>
        ))}
      </div>

      {!complete && (
        <form className="chat-input" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Type your message..."
            disabled={loading}
          />

          <button disabled={loading || !input.trim()}>
            <Send size={17} />
            Send
          </button>
        </form>
      )}

      {complete && !submitted && (
        <div className="chat-confirmation">
          <h3>Review purchase request</h3>

          <p><strong>Item:</strong> {draft.description}</p>
          <p><strong>Quantity:</strong> {draft.quantity} {draft.uom}</p>
          <p><strong>Plant:</strong> {draft.plant}</p>
          <p><strong>Required by:</strong> {draft.needByDate}</p>
          <p><strong>Urgency:</strong> {draft.urgency}</p>
          <p><strong>Requester:</strong> {draft.requester}</p>
          <p><strong>Department:</strong> {draft.department}</p>

          <button
            className="review-submit"
            onClick={submitPR}
            disabled={loading}
          >
            <CheckCircle size={17} />
            {loading ? 'Submitting...' : 'Confirm & Submit PR'}
          </button>
        </div>
      )}

      
{submitted && (
  <div className="chat-confirmation">
    <div className="success-message">
      <CheckCircle size={19} />
      PR {submitted} saved successfully in the database.
    </div>

    <button
      className="review-submit"
      onClick={processPR}
      disabled={processing}
    >
      {processing ? 'Processing...' : 'Process PR'}
    </button>

    {decision && (
      <div className="chat-decision">
        <h3>Procurement Decision</h3>
        <p><strong>PR:</strong> {decision.pr_no}</p>
        <p><strong>Decision:</strong> {decision.decision}</p>
        <p><strong>Route:</strong> {decision.route}</p>
        <p><strong>Policy:</strong> {decision.policy_version}</p>
        <p><strong>Supplier:</strong> {decision.supplier_id || 'Not assigned'}</p>
        <p><strong>Reason:</strong> {decision.reason}</p>
      </div>
    )}
  </div>
)}


      {error && (
        <div className="error-message">{error}</div>
      )}
    </section>
  );
}
