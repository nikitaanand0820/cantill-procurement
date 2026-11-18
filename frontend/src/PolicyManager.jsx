
import { useEffect, useState } from 'react';
import {
  FileText,
  RefreshCw,
  Save,
  Upload,
  ShieldCheck,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

function differences(oldRules, newRules) {
  const before = oldRules || {};
  const after = newRules || {};

  const keys = new Set([
    ...Object.keys(before),
    ...Object.keys(after)
  ]);

  return [...keys].filter(
    key =>
      JSON.stringify(before[key]) !==
      JSON.stringify(after[key])
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

export default function PolicyManager() {
  const [policies, setPolicies] = useState([]);
  const [active, setActive] = useState(null);

  const [version, setVersion] = useState('5.2');
  const [date, setDate] = useState('2026-11-19');
  const [rules, setRules] = useState('');
  const [comment, setComment] = useState('');

  const [uploadedFileName, setUploadedFileName] =
    useState('');
  const [uploadMessage, setUploadMessage] =
    useState('');
  const [uploadError, setUploadError] =
    useState('');

  const [approver, setApprover] = useState('');
  const [approvalComment, setApprovalComment] =
    useState('');
  const [selectedDraft, setSelectedDraft] =
    useState('');

  const [audits, setAudits] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [amendmentText,setAmendmentText] = useState('');
  const [amendmentPdf,setAmendmentPdf] = useState(null);
  const [preview,setPreview] = useState(null);
  const [previewBusy,setPreviewBusy] = useState(false);

  async function loadPolicies() {
    try {
      const responses = await Promise.all([
        fetch('/api/policy/active'),
        fetch('/api/policy/versions'),
        fetch('/api/policy/audits')
      ]);

      const [
        activeData,
        versionsData,
        auditData
      ] = await Promise.all(
        responses.map(response => response.json())
      );

      if (responses.some(response => !response.ok)) {
        throw new Error(
          'Unable to load policy information.'
        );
      }

      setActive(activeData.policy);
      setPolicies(versionsData.versions || []);
      setAudits(auditData.audits || []);

      setRules(current =>
        current ||
        JSON.stringify(
          activeData.policy?.rules || {},
          null,
          2
        )
      );

      setSelectedDraft(current => {
        const drafts = (
          versionsData.versions || []
        ).filter(
          policy => policy.status === 'DRAFT'
        );

        return drafts.some(
          policy => String(policy.id) === current
        )
          ? current
          : String(drafts[0]?.id || '');
      });

      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  async function uploadPolicy(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadError('');
    setUploadMessage('');
    setUploadedFileName('');
    setError('');
    setMessage('');

    try {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error(
          'Please select a valid .json file.'
        );
      }

      const content = await file.text();
      const parsed = JSON.parse(content);

      const newRules = parsed.rules || parsed;

      if (!isObject(newRules)) {
        throw new Error(
          'The uploaded file must contain a JSON object.'
        );
      }

      if (!Array.isArray(newRules.decisions)) {
        throw new Error(
          'The policy must include a decisions array.'
        );
      }

      // The application expects complete policy rules,
      // not a partial amendment that deletes other sections.
      const requiredSections = [
        'clubbing',
        'contracts',
        'decisions',
        'valuation',
        'itemMatching',
        'consolidation',
        'supplierRanking'
      ];

      const missingSections =
        requiredSections.filter(
          section => !(section in newRules)
        );

      if (missingSections.length > 0) {
        throw new Error(
          'Incomplete policy JSON. Missing sections: ' +
          missingSections.join(', ') +
          '. Upload a complete policy document.'
        );
      }

      setRules(
        JSON.stringify(newRules, null, 2)
      );

      if (parsed.version) {
        setVersion(String(parsed.version));
      }

      if (parsed.effectiveFrom) {
        setDate(
          String(parsed.effectiveFrom).slice(0, 10)
        );
      }

      setUploadedFileName(file.name);

      setUploadMessage(
        'JSON amendment loaded successfully. ' +
        'Review the policy rules below before saving.'
      );
    } catch (err) {
      setUploadError(
        `Upload failed: ${err.message}`
      );
    }
  }

  async function previewAmendment() {
    setUploadError('');setUploadMessage('');setPreview(null);setPreviewBusy(true);
    try {
      const body=new FormData();
      body.append('description',amendmentText);
      if(amendmentPdf) body.append('file',amendmentPdf);
      // Choose a stable approved base rather than a future draft.
      if(active?.version) body.append('baseVersion',active.version);
      const response=await fetch('/api/policy/amendment/preview',{method:'POST',body});
      const data=await response.json();
      if(!response.ok||!data.success) throw new Error(data.error||'Preview failed');
      setRules(JSON.stringify(data.rules,null,2));
      setPreview(data);
      setUploadMessage('Amendment preview generated. Review every clause and set a NEW version/effective date before saving a draft.');
    } catch(err) {setUploadError(err.message)}
    finally {setPreviewBusy(false)}
  }

  async function saveDraft(event) {
    event.preventDefault();

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const parsedRules = JSON.parse(rules);

      if (!isObject(parsedRules)) {
        throw new Error(
          'Policy rules must be a JSON object.'
        );
      }

      if (!Array.isArray(parsedRules.decisions)) {
        throw new Error(
          'Policy rules must contain a decisions array.'
        );
      }

      const response = await fetch(
        '/api/policy/versions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            version: version.trim(),
            effectiveFrom: date,
            rules: parsedRules,
            comment: comment.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Could not save policy.'
        );
      }

      setMessage(
        `Policy ${version} saved as DRAFT. ` +
        'Select it below for approval.'
      );

      setSelectedDraft(String(data.policy.id));
      setComment('');

      await loadPolicies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function activateDraft() {
    setError('');
    setMessage('');

    if (!selectedDraft) {
      setError('Please select a draft policy.');
      return;
    }

    if (!confirmed) {
      setError(
        'Please confirm that you have reviewed ' +
        'the amendment before activation.'
      );
      return;
    }

    if (
      !approver.trim() ||
      !approvalComment.trim()
    ) {
      setError(
        'Approver name and approval reason ' +
        'are required.'
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/policy/versions/${selectedDraft}/activate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            approvedBy: approver.trim(),
            comment: approvalComment.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Activation failed.'
        );
      }

      setMessage(
        data.message ||
        'Policy activated successfully.'
      );

      setConfirmed(false);
      setApprovalComment('');

      await loadPolicies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const draft = policies.find(
    policy =>
      String(policy.id) === selectedDraft &&
      policy.status === 'DRAFT'
  );

  const changed = draft
    ? differences(active?.rules, draft.rules)
    : [];

  let editedChanges = [];

  try {
    editedChanges = differences(
      active?.rules,
      JSON.parse(rules)
    );
  } catch {
    // JSON validation appears when saving.
  }

  return (
    <section className="policy-panel">
      <div className="policy-heading">
        <div>
          <h2>
            <FileText size={22} />
            Policy Version Management
          </h2>

          <p>
            Upload JSON amendments, review changes,
            and activate approved policies without
            changing application code.
          </p>
        </div>

        <button
          type="button"
          className="detail-button"
          onClick={loadPolicies}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {active && (
        <div className="policy-active">
          <strong>
            Active Policy: Version {active.version}
          </strong>

          <span>
            Effective{' '}
            {active.effectiveFrom.slice(0, 10)}
          </span>

          <span className="policy-status">
            ACTIVE
          </span>
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
                <td>
                  {policy.effectiveFrom.slice(0, 10)}
                </td>
                <td>{policy.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="policy-form" style={{border:'1px solid #d8e1ed',padding:18,borderRadius:12,margin:'20px 0'}}>
        <h3>Amendment PDF or chat-style description</h3>
        <p>Preview supported global RFQ/RFP threshold changes. This does not save or activate a policy. For other clauses, edit the full JSON and review carefully.</p>
        <label>Describe amendment in plain English</label>
        <textarea rows={3} value={amendmentText} onChange={e=>setAmendmentText(e.target.value)} placeholder="Change the RFQ/RFP threshold to INR 800000" />
        <label>Or upload text-based amendment PDF</label>
        <input type="file" accept=".pdf,application/pdf" onChange={e=>setAmendmentPdf(e.target.files?.[0]||null)} />
        <button type="button" className="detail-button" disabled={previewBusy||(!amendmentText.trim()&&!amendmentPdf)} onClick={previewAmendment}>{previewBusy?'Reading...':'Preview amendment'}</button>
        {preview && <div style={{padding:12,background:'#f3f7fb',borderRadius:8}}>
          <strong>Preview against policy {preview.baseVersion}</strong>
          {preview.changes.map((c,i)=><p key={i}>{c.field}: INR {Number(c.from).toLocaleString('en-IN')} → INR {Number(c.to).toLocaleString('en-IN')}</p>)}
          <p><strong>Review warning:</strong> {preview.warning}</p>
          <details><summary>View extracted source text</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.extractedText}</pre></details>
        </div>}
      </div>

      <h3>
        1. Upload amendment or edit policy JSON
      </h3>

      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 12
          }}
        >
          <strong>
            Upload policy JSON (.json)
          </strong>

          <input
            type="file"
            accept=".json,application/json"
            onChange={uploadPolicy}
            style={{
              display: 'block',
              marginTop: 10
            }}
          />
        </label>

        {uploadedFileName && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#15803d',
              fontWeight: 600,
              marginTop: 12
            }}
          >
            <CheckCircle size={19} />
            Uploaded: {uploadedFileName}
          </div>
        )}

        {uploadMessage && (
          <div
            className="success-message"
            style={{ marginTop: 12 }}
          >
            <CheckCircle size={18} />
            {uploadMessage}
          </div>
        )}

        {uploadError && (
          <div
            className="error-message"
            style={{ marginTop: 12 }}
          >
            <AlertCircle size={18} />
            {uploadError}
          </div>
        )}
      </div>

      <form
        className="policy-form"
        onSubmit={saveDraft}
      >
        <label>New version</label>

        <input
          value={version}
          onChange={event =>
            setVersion(event.target.value)
          }
          required
        />

        <label>Effective date</label>

        <input
          type="date"
          value={date}
          onChange={event =>
            setDate(event.target.value)
          }
          required
        />

        <label>Policy rules (JSON)</label>

        <textarea
          value={rules}
          onChange={event =>
            setRules(event.target.value)
          }
          rows={12}
          required
          spellCheck={false}
          style={{
            fontFamily: 'monospace',
            fontSize: 13
          }}
        />

        <p style={{ fontSize: 13 }}>
          Changed sections versus active policy:{' '}
          <strong>
            {editedChanges.join(', ') || 'None'}
          </strong>
        </p>

        <label>Reason for change</label>

        <textarea
          value={comment}
          onChange={event =>
            setComment(event.target.value)
          }
          rows={3}
          required
          placeholder="Why is this amendment needed?"
        />

        <button
          type="submit"
          className="review-submit"
          disabled={loading}
        >
          <Save size={17} />

          {loading
            ? 'Saving...'
            : 'Save Draft Policy'}
        </button>
      </form>

      <hr
        style={{
          margin: '28px 0',
          border: 'none',
          borderTop: '1px solid #e1e8f2'
        }}
      />

      <h3>
        2. Review and activate a draft
      </h3>

      <p>
        Activation changes the approved policy version.
        Subsequent procurement processing runs should
        use the applicable active policy rules.
      </p>

      <div className="policy-form">
        <label>Select draft policy</label>

        <select
          value={selectedDraft}
          onChange={event => {
            setSelectedDraft(event.target.value);
            setConfirmed(false);
          }}
        >
          {policies.filter(
            policy => policy.status === 'DRAFT'
          ).length === 0 && (
            <option value="">
              No drafts available
            </option>
          )}

          {policies
            .filter(
              policy => policy.status === 'DRAFT'
            )
            .map(policy => (
              <option
                key={policy.id}
                value={String(policy.id)}
              >
                Version {policy.version} —{' '}
                {policy.effectiveFrom.slice(0, 10)}
              </option>
            ))}
        </select>

        {draft && (
          <>
            <p>
              Changed sections:{' '}
              <strong>
                {changed.join(', ') || 'None'}
              </strong>
            </p>

            <details>
              <summary>
                Inspect full draft JSON before approving
              </summary>

              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  background: '#f4f7fb',
                  padding: 14,
                  borderRadius: 8
                }}
              >
                {JSON.stringify(
                  draft.rules,
                  null,
                  2
                )}
              </pre>
            </details>
          </>
        )}

        <label>Approved by</label>

        <input
          value={approver}
          onChange={event =>
            setApprover(event.target.value)
          }
          placeholder="Reviewer name"
        />

        <label>Approval justification</label>

        <textarea
          value={approvalComment}
          onChange={event =>
            setApprovalComment(event.target.value)
          }
          rows={2}
          placeholder="Why is this version approved?"
        />

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center'
          }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event =>
              setConfirmed(event.target.checked)
            }
            style={{ width: 'auto' }}
          />

          I have reviewed the selected policy
          and approve its activation.
        </label>

        <button
          type="button"
          className="review-submit"
          disabled={loading || !draft}
          onClick={activateDraft}
        >
          <ShieldCheck size={17} />
          Activate Approved Policy
        </button>
      </div>

      <h3 style={{ marginTop: 28 }}>
        Policy audit history
      </h3>

      {audits.length === 0 ? (
        <p>No policy audit records.</p>
      ) : (
        <div
          style={{
            maxHeight: 250,
            overflowY: 'auto'
          }}
        >
          {audits.slice(0, 15).map(audit => (
            <div
              key={audit.id}
              style={{
                borderBottom:
                  '1px solid #e1e8f2',
                padding: '10px 0'
              }}
            >
              <strong>
                {audit.action}
              </strong>
              {' — '}
              {audit.entityId}

              <div style={{ fontSize: 13 }}>
                {audit.actor}
                {' · '}
                {new Date(
                  audit.createdAt
                ).toLocaleString()}
              </div>

              <div style={{ fontSize: 13 }}>
                {audit.comment}
              </div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div
          className="success-message"
          style={{ marginTop: 16 }}
        >
          <CheckCircle size={18} />
          {message}
        </div>
      )}

      {error && (
        <div
          className="error-message"
          style={{ marginTop: 16 }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}
    </section>
  );
}
