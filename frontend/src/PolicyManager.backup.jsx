
import { useEffect, useState } from 'react';
import { FileText, RefreshCw, Save } from 'lucide-react';

export default function PolicyManager() {
  const [policies, setPolicies] = useState([]);
  const [active, setActive] = useState(null);
  const [version, setVersion] = useState('5.1');
  const [date, setDate] = useState('2026-11-19');
  const [rules, setRules] = useState('');
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadPolicies() {
    try {
      const [activeResponse, versionsResponse] = await Promise.all([
        fetch('/api/policy/active'),
        fetch('/api/policy/versions')
      ]);

      const activeData = await activeResponse.json();
      const versionsData = await versionsResponse.json();

      if (!activeResponse.ok || !versionsResponse.ok) {
        throw new Error('Unable to load policies');
      }

      setActive(activeData.policy);
      setPolicies(versionsData.versions || []);
      setRules(JSON.stringify(activeData.policy?.rules || {}, null, 2));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  async function saveDraft(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const parsedRules = JSON.parse(rules);

      const response = await fetch('/api/policy/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version,
          effectiveFrom: date,
          rules: parsedRules,
          comment
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not save policy');
      }

      setMessage(`Policy version ${version} saved as DRAFT.`);
      setComment('');
      await loadPolicies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="policy-panel">
      <div className="policy-heading">
        <div>
          <h2><FileText size={22} /> Policy Version Management</h2>
          <p>Review procurement rules and create audited draft versions.</p>
        </div>

        <button
          className="detail-button"
          onClick={loadPolicies}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {active && (
        <div className="policy-active">
          <strong>Active Policy: Version {active.version}</strong>
          <span>
            Effective {active.effectiveFrom.slice(0, 10)}
          </span>
          <span className="policy-status">ACTIVE</span>
        </div>
      )}

      <h3>Stored policy versions</h3>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Effective date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {policies.map(policy => (
              <tr key={policy.id}>
                <td>{policy.version}</td>
                <td>{policy.effectiveFrom.slice(0, 10)}</td>
                <td>{policy.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Create new draft policy</h3>

      <form className="policy-form" onSubmit={saveDraft}>
        <label>Version</label>
        <input
          value={version}
          onChange={event => setVersion(event.target.value)}
          required
        />

        <label>Effective date</label>
        <input
          type="date"
          value={date}
          onChange={event => setDate(event.target.value)}
          required
        />

        <label>Policy rules (JSON)</label>
        <textarea
          value={rules}
          onChange={event => setRules(event.target.value)}
          rows={12}
          required
        />

        <label>Reason for change</label>
        <textarea
          value={comment}
          onChange={event => setComment(event.target.value)}
          placeholder="Explain why this policy version is being proposed..."
          rows={3}
          required
        />

        <button className="review-submit" disabled={loading}>
          <Save size={17} />
          {loading ? 'Saving...' : 'Save Draft Policy'}
        </button>
      </form>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
    </section>
  );
}
