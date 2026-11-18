
import { useEffect, useRef, useState } from 'react';
import ChatIntake from './ChatIntake';
import PolicyManager from './PolicyManager';

import {
  Package,
  Users,
  FileText,
  Database,
  Upload,
  Download,
  Search,
  CheckCircle,
  AlertCircle,
  ClipboardList,
  RefreshCw,
  LayoutDashboard,
  ShoppingCart,
  ShieldCheck,
  MessageCircle,
  ChevronRight
} from 'lucide-react';

const API = '/api';

const PROCUREMENT_ROUTES = [
  'CONTRACT_PO',
  'EMERGENCY_PO',
  'SPOT_PO',
  'RFQ',
  'RFP',
  'NEW_ITEM_SOURCING',
  'CAPEX_SOURCING'
];

function downloadCSV(content, filename) {
  if (!content) return;

  const blob = new Blob([content], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatMoney(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  return number.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  });
}

export default function App() {
  // Backend information
  const [health, setHealth] = useState('Checking API...');
  const [summary, setSummary] = useState(null);

  // CSV batch processing
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Policy version selector
  const [policyVersions, setPolicyVersions] = useState([]);
  const [selectedPolicyVersion, setSelectedPolicyVersion] =
    useState('AUTO');
  const [processedPolicyVersion, setProcessedPolicyVersion] =
    useState('');

  // Saved chat procurement decisions
  const [chatResults, setChatResults] = useState([]);

  // Decision table
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);

  // Buyer workspace
  const [reviews, setReviews] = useState({});
  const [audits, setAudits] = useState([]);
  const [reviewAction, setReviewAction] = useState('APPROVE');
  const [reviewComment, setReviewComment] = useState('');
  const [overrideRoute, setOverrideRoute] = useState('RFQ');
  const [overrideSupplier, setOverrideSupplier] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Sidebar
  const [activeNav, setActiveNav] = useState('overview');

  const buyerWorkspaceRef = useRef(null);

  // Load available policy versions
  useEffect(() => {
    async function loadPolicyVersions() {
      try {
        const response = await fetch(`${API}/policy/versions`);

        if (!response.ok) {
          throw new Error('Unable to load policy versions');
        }

        const data = await response.json();

        setPolicyVersions(
          Array.isArray(data.versions) ? data.versions : []
        );
      } catch (err) {
        console.error('Policy versions error:', err);
      }
    }

    loadPolicyVersions();
  }, []);

  // Load saved chat decisions
  useEffect(() => {
    async function loadSavedDecisions() {
      try {
        const response = await fetch(`${API}/chat/decisions`);

        if (!response.ok) {
          throw new Error('Unable to load saved decisions');
        }

        const data = await response.json();

        if (data.success) {
          setChatResults(data.rows || []);
        }
      } catch (err) {
        console.error('Failed to load saved decisions:', err);
      }
    }

    loadSavedDecisions();
  }, []);

  // Load backend information and buyer reviews
  useEffect(() => {
    fetch(`${API}/health`)
      .then(response => response.json())
      .then(data => setHealth(data.message))
      .catch(() => setHealth('Backend not connected'));

    fetch(`${API}/summary`)
      .then(response => response.json())
      .then(data => setSummary(data))
      .catch(() => {});

    loadReviews();
  }, []);

  // Load buyer reviews and audit history
  async function loadReviews() {
    try {
      const response = await fetch(`${API}/buyer/reviews`);

      if (!response.ok) {
        throw new Error('Unable to load buyer reviews');
      }

      const data = await response.json();

      setReviews(data.latest || {});
      setAudits(data.audits || []);
    } catch (err) {
      console.error('Review loading error:', err);
    }
  }

  // Sidebar navigation
  function navigateTo(sectionId) {
    setActiveNav(sectionId);

    const element = document.getElementById(sectionId);

    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  // CSV batch processing with selected policy
  async function processFile() {
    if (!file) {
      setError('Please select a CSV file first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setProcessedPolicyVersion('');
    setSelected(null);
    setSearch('');
    setRouteFilter('ALL');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint =
        selectedPolicyVersion === 'AUTO'
          ? `${API}/process-batch`
          : `${API}/process-batch?policyVersion=${encodeURIComponent(
              selectedPolicyVersion
            )}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Batch processing failed'
        );
      }

      const actualVersion =
        data.rows?.[0]?.policy_version ||
        data.policyVersion ||
        '';

      if (
        selectedPolicyVersion !== 'AUTO' &&
        actualVersion &&
        String(actualVersion) !== String(selectedPolicyVersion)
      ) {
        throw new Error(
          `Requested policy ${selectedPolicyVersion}, but backend ` +
          `returned policy ${actualVersion}. Export stopped.`
        );
      }

      setProcessedPolicyVersion(
        actualVersion ||
        (selectedPolicyVersion === 'AUTO'
          ? 'automatic'
          : selectedPolicyVersion)
      );

      setResult(data);
      await loadReviews();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Receive decisions from employee chat
  function handleChatDecision(data) {
    if (!data?.rows?.length) return;

    setChatResults(previous => {
      const existing = previous.filter(
        row =>
          !data.rows.some(
            incoming =>
              incoming.pr_no === row.pr_no &&
              Number(incoming.pr_line) === Number(row.pr_line)
          )
      );

      return [...existing, ...data.rows];
    });

    setSearch('');
    setRouteFilter('ALL');
    setSelected(null);

    loadReviews();
  }

  // Open decision in buyer workspace
  function openDecision(row) {
    setSelected(row);
    setActiveNav('buyer-workspace');

    setReviewAction('APPROVE');
    setReviewComment('');

    setOverrideRoute(
      PROCUREMENT_ROUTES.includes(row.route)
        ? row.route
        : 'RFQ'
    );

    setOverrideSupplier(row.supplier_id || '');
    setReviewMessage('');
    setReviewError(false);

    requestAnimationFrame(() => {
      setTimeout(() => {
        buyerWorkspaceRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 50);
    });
  }

  // Buyer approval, rejection and override
  async function submitReview() {
    if (!selected) return;

    if (
      reviewAction !== 'APPROVE' &&
      !reviewComment.trim()
    ) {
      setReviewMessage(
        'A justification is required for rejection or override.'
      );
      setReviewError(true);
      return;
    }

    setReviewLoading(true);
    setReviewMessage('');
    setReviewError(false);

    try {
      const response = await fetch(`${API}/buyer/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prNo: selected.pr_no,
          prLine: Number(selected.pr_line),
          action: reviewAction,
          comment: reviewComment.trim(),
          route:
            reviewAction === 'OVERRIDE'
              ? overrideRoute
              : undefined,
          supplierId:
            reviewAction === 'OVERRIDE'
              ? overrideSupplier.trim()
              : undefined,
          originalDecision: selected.route
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Unable to save buyer review'
        );
      }

      setReviewMessage(
        data.message || 'Buyer review saved successfully.'
      );
      setReviewError(false);
      setReviewComment('');

      await loadReviews();
    } catch (err) {
      setReviewMessage(err.message);
      setReviewError(true);
    } finally {
      setReviewLoading(false);
    }
  }

  // Combine CSV and saved chat decisions
  const rows = [
    ...(result?.rows || []),
    ...chatResults.filter(
      chatRow =>
        !(result?.rows || []).some(
          batchRow =>
            batchRow.pr_no === chatRow.pr_no &&
            Number(batchRow.pr_line) === Number(chatRow.pr_line)
        )
    )
  ];

  const routes = [
    'ALL',
    ...new Set(
      rows.map(row => row.route).filter(Boolean)
    )
  ];

  const filteredRows = rows.filter(row => {
    const matchesRoute =
      routeFilter === 'ALL' ||
      row.route === routeFilter;

    const searchableText = [
      row.pr_no,
      row.pr_line,
      row.resolved_item_code,
      row.supplier_id,
      row.route,
      row.po_id,
      row.group_id
    ]
      .join(' ')
      .toLowerCase();

    return (
      matchesRoute &&
      searchableText.includes(
        search.toLowerCase().trim()
      )
    );
  });

  const selectedKey = selected
    ? `${selected.pr_no}:${selected.pr_line}`
    : null;

  const selectedReview = selectedKey
    ? reviews[selectedKey]
    : null;

  const selectedAudits = selectedKey
    ? audits.filter(
        audit => audit.entityId === selectedKey
      )
    : [];

  const navigation = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard
    },
    {
      id: 'chat-intake',
      label: 'Employee Chat',
      icon: MessageCircle
    },
    {
      id: 'batch-processing',
      label: 'Batch processing',
      icon: Upload
    },
    {
      id: 'buyer-workspace',
      label: 'Buyer workspace',
      icon: ShoppingCart
    },
    {
      id: 'preferred-suppliers',
      label: 'Preferred suppliers',
      icon: Users
    },
    {
      id: 'policy-management',
      label: 'Policy management',
      icon: ShieldCheck
    }
  ];

  return (
    <div className="shell">

      {/* SIDEBAR */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <h2>◈ Cantill</h2>
          <p>Procurement automation</p>
        </div>

        <nav className="sidebar-nav">
          {navigation.map(item => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-link ${
                  activeNav === item.id ? 'active' : ''
                }`}
                onClick={() => {
                  if (
                    item.id === 'buyer-workspace' &&
                    selected
                  ) {
                    setActiveNav(item.id);
                    buyerWorkspaceRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  } else {
                    navigateTo(item.id);
                  }
                }}
              >
                <Icon size={19} strokeWidth={2} />
                <span>{item.label}</span>
                <ChevronRight
                  className="nav-chevron"
                  size={15}
                />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-dot" />
          Procurement platform
        </div>
      </aside>

      {/* MAIN DASHBOARD */}
      <main id="overview" className="dashboard-main">

        <header className="dashboard-header">
          <div>
            <h1>Procurement workspace</h1>
            <p>
              Corvo Engineering · PR-to-PO automation
            </p>
          </div>
        </header>

        {/* Backend status */}
        <div className="status">
          ● {health}
        </div>

        {/* Master data statistics */}
        <section className="stats">
          {[
            [Package, 'Items', summary?.items],
            [Users, 'Suppliers', summary?.suppliers],
            [FileText, 'Contracts', summary?.contracts],
            [Database, 'Historical POs', summary?.history]
          ].map(([Icon, label, value]) => (
            <article key={label}>
              <Icon size={23} />
              <small>{label}</small>
              <strong>{value ?? '—'}</strong>
            </article>
          ))}
        </section>

        {/* EMPLOYEE CHAT */}
        <div id="chat-intake" className="dashboard-section">
          <ChatIntake
            onDecisionProcessed={handleChatDecision}
          />
        </div>

        {/* POLICY MANAGEMENT */}
        <div
          id="policy-management"
          className="dashboard-section"
        >
          <PolicyManager />
        </div>

        {/* CSV BATCH PROCESSING */}
        <section
          className="upload-panel"
          id="batch-processing"
        >
          <div>
            <h2>
              <Upload size={22} />
              Process purchase requests
            </h2>

            <p>
              Upload a purchase-request CSV and choose
              which procurement policy to apply.
            </p>
          </div>

          {/* NEW POLICY VERSION DROPDOWN */}
          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="batch-policy-version"
              style={{
                display: 'block',
                fontWeight: 600,
                marginBottom: '8px'
              }}
            >
              Select procurement policy
            </label>

            <select
              id="batch-policy-version"
              value={selectedPolicyVersion}
              onChange={event => {
                setSelectedPolicyVersion(event.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                maxWidth: '400px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#111827',
                fontSize: '14px'
              }}
            >
              <option value="AUTO">
                Automatic — effective date
              </option>

              {policyVersions.map(policy => (
                <option
                  key={policy.id}
                  value={policy.version}
                  disabled={policy.status === 'DRAFT'}
                >
                  Policy {policy.version} — {policy.status}
                </option>
              ))}
            </select>

            <p
              style={{
                fontSize: '13px',
                marginTop: '8px'
              }}
            >
              Use 5.0 for the original-policy run and
              5.2 for the amended-policy test.
            </p>
          </div>

          <div className="upload-actions">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={event => {
                setFile(
                  event.target.files?.[0] || null
                );
                setError('');
              }}
            />

            <button
              onClick={processFile}
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw size={17} />
                  Processing...
                </>
              ) : (
                <>
                  <Upload size={17} />
                  Process batch
                </>
              )}
            </button>
          </div>

          {result && (
            <div className="success-message">
              <CheckCircle size={18} />
              Batch processed using policy{' '}
              {processedPolicyVersion || 'automatic'}.
            </div>
          )}

          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
        </section>

        {/* SUPPLIER RANKINGS */}
        <section
          id="preferred-suppliers"
          className="supplier-shortcut"
        >
          <div>
            <h2>
              <Users size={21} />
              Preferred suppliers
            </h2>

            <p>
              Supplier rankings are generated when you process
              a CSV batch. Download the ranking report to
              compare eligible suppliers and reference prices.
            </p>
          </div>

          {result?.supplierRankingCsv ? (
            <button
              className="detail-button"
              onClick={() =>
                downloadCSV(
                  result.supplierRankingCsv,
                  `supplier-ranking-policy-${
                    processedPolicyVersion || 'unknown'
                  }.csv`
                )
              }
            >
              <Download size={17} />
              Download supplier rankings
            </button>
          ) : (
            <button
              className="detail-button"
              onClick={() =>
                navigateTo('batch-processing')
              }
            >
              <Upload size={17} />
              Process a batch
            </button>
          )}
        </section>

        {/* RESULTS */}
        {(result || chatResults.length > 0) && (
          <>
            <div className="success-message">
              <CheckCircle size={19} />
              Procurement decisions are ready for buyer review.
            </div>

            {/* CSV summary */}
            {result && (
              <section className="stats">
                {[
                  ['CSV PR lines', result.summary?.total],
                  ['CSV requirements', result.summary?.groups],
                  [
                    'CSV purchase orders',
                    result.summary?.purchaseOrders
                  ],
                  [
                    'CSV exceptions',
                    result.summary?.notProcessed
                  ]
                ].map(([label, value]) => (
                  <article key={label}>
                    <ClipboardList size={22} />
                    <small>{label}</small>
                    <strong>{value ?? '—'}</strong>
                  </article>
                ))}
              </section>
            )}

            {/* Chat summary */}
            {chatResults.length > 0 && (
              <div className="success-message">
                <CheckCircle size={18} />
                {chatResults.length} chat-generated PR line(s)
                available in the buyer workspace.
              </div>
            )}

            {/* PROCUREMENT DECISION TABLE */}
            <section
              className="results-panel"
              id="buyer-workspace"
            >
              <div className="results-heading">
                <div>
                  <h2>
                    <ClipboardList size={22} />
                    Procurement decisions
                  </h2>

                  <p>
                    Review CSV and chat-generated PR lines,
                    procurement routes, suppliers and POs.
                  </p>
                </div>

                {result && (
                  <div className="download-actions">
                    <button
                      onClick={() =>
                        downloadCSV(
                          result.csv,
                          `decisions-policy-${
                            processedPolicyVersion || 'unknown'
                          }.csv`
                        )
                      }
                    >
                      <Download size={17} />
                      Export decisions
                    </button>

                    <button
                      onClick={() =>
                        downloadCSV(
                          result.supplierRankingCsv,
                          `supplier-ranking-policy-${
                            processedPolicyVersion || 'unknown'
                          }.csv`
                        )
                      }
                    >
                      <Download size={17} />
                      Supplier rankings
                    </button>
                  </div>
                )}
              </div>

              {/* Search and filters */}
              <div className="filters">
                <div className="search-box">
                  <Search size={18} />

                  <input
                    placeholder="Search PR, item, supplier or PO..."
                    value={search}
                    onChange={event =>
                      setSearch(event.target.value)
                    }
                  />
                </div>

                <select
                  value={routeFilter}
                  onChange={event =>
                    setRouteFilter(event.target.value)
                  }
                >
                  {routes.map(route => (
                    <option
                      key={route}
                      value={route}
                    >
                      {route === 'ALL'
                        ? 'All routes'
                        : route}
                    </option>
                  ))}
                </select>
              </div>

              {/* Decision table */}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>PR Number</th>
                      <th>Line</th>
                      <th>Item</th>
                      <th>Route</th>
                      <th>Supplier</th>
                      <th>Group value</th>
                      <th>PO ID</th>
                      <th>Review status</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.map((row, index) => {
                      const key =
                        `${row.pr_no}:${row.pr_line}`;

                      const review = reviews[key];

                      return (
                        <tr key={`${key}-${index}`}>
                          <td>{row.pr_no}</td>

                          <td>{row.pr_line}</td>

                          <td>
                            {row.resolved_item_code ||
                              'New item'}
                          </td>

                          <td>
                            <span className="route-tag">
                              {row.route}
                            </span>
                          </td>

                          <td>
                            {row.supplier_id || '—'}
                          </td>

                          <td>
                            {formatMoney(
                              row.group_value_inr
                            )}
                          </td>

                          <td>
                            {row.po_id || '—'}
                          </td>

                          <td>
                            <span
                              className={`review-status ${
                                review?.action
                                  ? review.action.toLowerCase()
                                  : 'pending'
                              }`}
                            >
                              {review?.action || 'PENDING'}
                            </span>
                          </td>

                          <td>
                            <button
                              className="detail-button"
                              onClick={() =>
                                openDecision(row)
                              }
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredRows.length === 0 && (
                  <p className="empty-state">
                    No matching decisions found.
                  </p>
                )}
              </div>

              <p className="row-count">
                Showing {filteredRows.length} of{' '}
                {rows.length} PR lines
              </p>
            </section>

            {/* BUYER REVIEW WORKSPACE */}
            {selected && (
              <section
                className="detail-panel"
                ref={buyerWorkspaceRef}
              >
                <div className="results-heading">
                  <h2>
                    <ClipboardList size={22} />
                    Buyer workspace
                  </h2>

                  <button
                    className="detail-button"
                    onClick={() =>
                      setSelected(null)
                    }
                  >
                    Close
                  </button>
                </div>

                <h3>Decision explanation</h3>

                <p>
                  <strong>PR:</strong>{' '}
                  {selected.pr_no}
                </p>

                <p>
                  <strong>PR line:</strong>{' '}
                  {selected.pr_line}
                </p>

                <p>
                  <strong>Group:</strong>{' '}
                  {selected.group_id || '—'}
                </p>

                <p>
                  <strong>Item:</strong>{' '}
                  {selected.resolved_item_code ||
                    'Unmatched item'}
                </p>

                <p>
                  <strong>Route:</strong>{' '}
                  {selected.route}
                </p>

                <p>
                  <strong>Decision:</strong>{' '}
                  {selected.decision}
                </p>

                <p>
                  <strong>Supplier:</strong>{' '}
                  {selected.supplier_id || '—'}
                </p>

                <p>
                  <strong>Suggested suppliers:</strong>{' '}
                  {selected.suggested_supplier_ids || '—'}
                </p>

                <p>
                  <strong>Group value:</strong>{' '}
                  {formatMoney(
                    selected.group_value_inr
                  )}
                </p>

                <p>
                  <strong>Policy version:</strong>{' '}
                  {selected.policy_version}
                </p>

                <p>
                  <strong>Reason:</strong>{' '}
                  {selected.reason}
                </p>

                <hr />

                <h3>Buyer review</h3>

                <p>
                  <strong>Current status:</strong>{' '}
                  <span
                    className={`review-status ${
                      selectedReview?.action
                        ? selectedReview.action.toLowerCase()
                        : 'pending'
                    }`}
                  >
                    {selectedReview?.action || 'PENDING'}
                  </span>
                </p>

                <div className="buyer-form">
                  <label>
                    Action

                    <select
                      value={reviewAction}
                      onChange={event => {
                        setReviewAction(
                          event.target.value
                        );
                        setReviewMessage('');
                        setReviewError(false);
                      }}
                    >
                      <option value="APPROVE">
                        Approve
                      </option>

                      <option value="REJECT">
                        Reject
                      </option>

                      <option value="OVERRIDE">
                        Override
                      </option>
                    </select>
                  </label>

                  {reviewAction === 'OVERRIDE' && (
                    <>
                      <label>
                        New procurement route

                        <select
                          value={overrideRoute}
                          onChange={event =>
                            setOverrideRoute(
                              event.target.value
                            )
                          }
                        >
                          {PROCUREMENT_ROUTES.map(
                            route => (
                              <option
                                key={route}
                                value={route}
                              >
                                {route}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label>
                        Override supplier ID (optional)

                        <input
                          value={overrideSupplier}
                          onChange={event =>
                            setOverrideSupplier(
                              event.target.value
                            )
                          }
                          placeholder="e.g. S015"
                        />
                      </label>
                    </>
                  )}

                  <label>
                    Comment{' '}
                    {reviewAction !== 'APPROVE'
                      ? '(required)'
                      : '(optional)'}

                    <textarea
                      value={reviewComment}
                      onChange={event =>
                        setReviewComment(
                          event.target.value
                        )
                      }
                      placeholder="Explain your review decision..."
                      rows={3}
                    />
                  </label>

                  <button
                    className="review-submit"
                    disabled={reviewLoading}
                    onClick={submitReview}
                  >
                    {reviewLoading
                      ? 'Saving...'
                      : `Submit ${reviewAction}`}
                  </button>

                  {reviewMessage && (
                    <div
                      className={
                        reviewError
                          ? 'error-message'
                          : 'success-message'
                      }
                    >
                      {reviewError ? (
                        <AlertCircle size={18} />
                      ) : (
                        <CheckCircle size={18} />
                      )}

                      {reviewMessage}
                    </div>
                  )}
                </div>

                <hr />

                <h3>Audit history for this PR</h3>

                {selectedAudits.length === 0 ? (
                  <p>
                    No buyer review actions recorded yet.
                  </p>
                ) : (
                  selectedAudits.map(audit => (
                    <div
                      className="audit-entry"
                      key={audit.id}
                    >
                      <strong>{audit.action}</strong>

                      <p>
                        {audit.comment ||
                          'No comment provided'}
                      </p>

                      <small>
                        {new Date(
                          audit.createdAt
                        ).toLocaleString()}
                      </small>

                      {audit.action === 'OVERRIDE' && (
                        <p>
                          New route:{' '}
                          {audit.details
                            ?.overriddenRoute || '—'}
                          {' · '}
                          Supplier:{' '}
                          {audit.details
                            ?.overriddenSupplier || '—'}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
