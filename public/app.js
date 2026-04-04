const { useState, useEffect, useCallback } = React;

const API = '';

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.split('T')[0] : String(d);
  if (!s || s === 'undefined' || s === 'null') return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
}

function today() { return new Date().toISOString().split('T')[0]; }

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(mo) - 1]} ${y}`;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  if (!msg) return null;
  return React.createElement('div', { className: `toast ${type}` }, msg);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, wide }) {
  return React.createElement('div', { className: 'modal-overlay', onClick: e => e.target === e.currentTarget && onClose() },
    React.createElement('div', { className: 'modal', style: wide ? { maxWidth: 640 } : {} },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        React.createElement('div', { className: 'modal-title' }, title),
        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: onClose }, '✕')
      ),
      children
    )
  );
}

// ─── BADGES ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = { estoque: ['badge-estoque', 'Estoque'], em_transporte: ['badge-transporte', 'Em Transporte'], vendido: ['badge-vendido', 'Vendido'] };
  const [cls, label] = map[status] || ['badge-estoque', status];
  return React.createElement('span', { className: `badge ${cls}` }, label);
}

const ACCT_COLORS = ['badge-sofisa', 'badge-studio', 'badge-estoque', 'badge-transporte'];
function AccountBadge({ account, accounts }) {
  if (!account) return null;
  const idx = accounts ? accounts.findIndex(a => a.name === account) : -1;
  const cls = ACCT_COLORS[idx >= 0 ? idx % ACCT_COLORS.length : 0];
  return React.createElement('span', { className: `badge ${cls}` }, account);
}

// ─── INSTALLMENT CHECKS ──────────────────────────────────────────────────────
function InstallmentChecks({ total, num_installments, paid }) {
  if (!num_installments || num_installments <= 0) return null;
  const installment_amount = total / num_installments;
  const completed = Math.min(Math.floor(paid / installment_amount), num_installments);
  const partial = paid % installment_amount > 0.01 && completed < num_installments;

  return React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 } },
    Array.from({ length: num_installments }, (_, i) => {
      const done = i < completed;
      const isPartial = !done && i === completed && partial;
      return React.createElement('div', {
        key: i,
        title: `Parcela ${i + 1}/${num_installments}`,
        style: {
          width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, cursor: 'default',
          background: done ? '#1a3a25' : isPartial ? '#2e2a10' : 'var(--surface2)',
          border: `1.5px solid ${done ? '#4ade80' : isPartial ? '#fbbf24' : 'var(--border)'}`,
          color: done ? '#4ade80' : isPartial ? '#fbbf24' : 'var(--muted)'
        }
      }, done ? '✓' : isPartial ? '~' : i + 1);
    }),
    React.createElement('span', { style: { fontSize: 11, color: 'var(--muted)', alignSelf: 'center', marginLeft: 4 } },
      `${completed}/${num_installments} parcelas`)
  );
}

// ─── ESTOQUE TAB ─────────────────────────────────────────────────────────────
function EstoqueTab({ toast, accounts }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const defaultAccount = accounts && accounts.length > 0 ? accounts[0].name : '';
  const [form, setForm] = useState({ name: '', purchase_date: today(), cost: '', account: defaultAccount, store: '', status: 'estoque' });

  const load = useCallback(async () => {
    try { setItems(await api('/api/items')); } catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditItem(null); setForm({ name: '', purchase_date: today(), cost: '', account: defaultAccount, store: '', status: 'estoque' }); setShowModal(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ name: item.name, purchase_date: item.purchase_date || today(), cost: item.cost, account: item.account, store: item.store || '', status: item.status }); setShowModal(true); };

  const save = async () => {
    if (!form.name || !form.cost || !form.purchase_date) return toast('Preencha todos os campos obrigatórios', 'error');
    try {
      if (editItem) await api(`/api/items/${editItem.id}`, { method: 'PUT', body: form });
      else await api('/api/items', { method: 'POST', body: form });
      toast(editItem ? 'Item atualizado!' : 'Item adicionado!', 'success');
      setShowModal(false); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const del = async (id) => {
    if (!confirm('Excluir este item?')) return;
    try { await api(`/api/items/${id}`, { method: 'DELETE' }); toast('Excluído!', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const filtered = items.filter(i =>
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.store || '').toLowerCase().includes(search.toLowerCase()) || (i.buyer || '').toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || i.status === filterStatus) &&
    (!filterAccount || i.account === filterAccount)
  );

  const totalCost = filtered.reduce((a, i) => a + parseFloat(i.cost || 0), 0);
  const counts = { estoque: 0, em_transporte: 0, vendido: 0 };
  filtered.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++; });

  return React.createElement('div', null,
    React.createElement('div', { className: 'stats-row' },
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Total'), React.createElement('div', { className: 'stat-value accent' }, filtered.length)),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Em Estoque'), React.createElement('div', { className: 'stat-value' }, counts.estoque)),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Em Transporte'), React.createElement('div', { className: 'stat-value yellow' }, counts.em_transporte)),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Vendidos'), React.createElement('div', { className: 'stat-value green' }, counts.vendido)),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Custo Total'), React.createElement('div', { className: 'stat-value red' }, fmt(totalCost)))
    ),
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-header' },
        React.createElement('div', { className: 'filter-row' },
          React.createElement('input', { className: 'search-bar', placeholder: '🔍 Buscar...', value: search, onChange: e => setSearch(e.target.value) }),
          React.createElement('select', { className: 'search-bar', style: { width: 150 }, value: filterStatus, onChange: e => setFilterStatus(e.target.value) },
            React.createElement('option', { value: '' }, 'Todos status'),
            React.createElement('option', { value: 'estoque' }, 'Estoque'),
            React.createElement('option', { value: 'em_transporte' }, 'Em Transporte'),
            React.createElement('option', { value: 'vendido' }, 'Vendido')
          ),
          React.createElement('select', { className: 'search-bar', style: { width: 160 }, value: filterAccount, onChange: e => setFilterAccount(e.target.value) },
            React.createElement('option', { value: '' }, 'Todas contas'),
            (accounts || []).map(a => React.createElement('option', { key: a.id, value: a.name }, a.name))
          )
        ),
        React.createElement('button', { className: 'btn btn-primary', onClick: openNew }, '+ Novo Item')
      ),
      loading ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'spinner' })) :
      filtered.length === 0 ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'empty-icon' }, '📦'), React.createElement('p', null, 'Nenhum item encontrado')) :
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null, React.createElement('tr', null,
            ['Nome', 'Compra', 'Custo', 'Conta', 'Loja', 'Status', 'Comprador', 'Venda', 'Lucro', ''].map(h => React.createElement('th', { key: h }, h))
          )),
          React.createElement('tbody', null, filtered.map(item =>
            React.createElement('tr', { key: item.id },
              React.createElement('td', null, React.createElement('strong', null, item.name)),
              React.createElement('td', null, fmtDate(item.purchase_date)),
              React.createElement('td', null, React.createElement('span', { style: { color: 'var(--red)', fontWeight: 600 } }, fmt(item.cost))),
              React.createElement('td', null, React.createElement(AccountBadge, { account: item.account, accounts })),
              React.createElement('td', null, item.store || React.createElement('span', { style: { color: 'var(--muted)' } }, '—')),
              React.createElement('td', null, React.createElement(StatusBadge, { status: item.status })),
              React.createElement('td', null, item.buyer ? React.createElement('span', { style: { fontWeight: 500 } }, item.buyer) : React.createElement('span', { style: { color: 'var(--muted)' } }, '—')),
              React.createElement('td', null, item.sale_price ? React.createElement('span', { style: { color: 'var(--yellow)', fontWeight: 600 } }, fmt(item.sale_price)) : React.createElement('span', { style: { color: 'var(--muted)' } }, '—')),
              React.createElement('td', null, item.profit != null && item.status === 'vendido' ?
                React.createElement('span', { style: { color: parseFloat(item.profit) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 } }, fmt(item.profit)) :
                React.createElement('span', { style: { color: 'var(--muted)' } }, '—')
              ),
              React.createElement('td', null,
                React.createElement('div', { style: { display: 'flex', gap: 6 } },
                  React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => openEdit(item) }, '✏️'),
                  item.status !== 'vendido' && React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => del(item.id) }, '🗑️')
                )
              )
            )
          ))
        )
      )
    ),
    showModal && React.createElement(Modal, { title: editItem ? 'Editar Item' : 'Novo Item', onClose: () => setShowModal(false) },
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('label', null, 'Nome *'),
          React.createElement('input', { value: form.name, onChange: e => setForm({ ...form, name: e.target.value }), placeholder: 'Ex: iPhone 14 Pro Max' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Data de Compra *'),
          React.createElement('input', { type: 'date', value: form.purchase_date, onChange: e => setForm({ ...form, purchase_date: e.target.value }) })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Custo (R$) *'),
          React.createElement('input', { type: 'number', step: '0.01', value: form.cost, onChange: e => setForm({ ...form, cost: e.target.value }), placeholder: '0,00' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Conta'),
          React.createElement('select', { value: form.account, onChange: e => setForm({ ...form, account: e.target.value }) },
            (accounts || []).map(a => React.createElement('option', { key: a.id, value: a.name }, a.name))
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Loja'),
          React.createElement('input', { value: form.store, onChange: e => setForm({ ...form, store: e.target.value }), placeholder: 'iPlace, ML...' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Status'),
          React.createElement('select', { value: form.status, onChange: e => setForm({ ...form, status: e.target.value }) },
            React.createElement('option', { value: 'em_transporte' }, 'Em Transporte'),
            React.createElement('option', { value: 'estoque' }, 'Estoque'),
            React.createElement('option', { value: 'vendido' }, 'Vendido')
          )
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowModal(false) }, 'Cancelar'),
        React.createElement('button', { className: 'btn btn-primary', onClick: save }, 'Salvar')
      )
    )
  );
}

// ─── FINANCEIRO TAB ──────────────────────────────────────────────────────────
function FinanceiroTab({ toast, accounts }) {
  const [overview, setOverview] = useState({});
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSale, setShowSale] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const defaultAccount = accounts && accounts.length > 0 ? accounts[0].name : '';
  const [saleForm, setSaleForm] = useState({ item_id: '', client_name: '', sale_price: '', num_installments: '1', sale_date: today() });
  const [loanForm, setLoanForm] = useState({ client_name: '', amount: '', repayment_amount: '', num_installments: '1', loan_date: today(), description: '', source_account: defaultAccount });
  const [payForm, setPayForm] = useState({ amount: '', payment_date: today() });

  const load = useCallback(async () => {
    try {
      const [ov, its] = await Promise.all([api('/api/financial-overview'), api('/api/items')]);
      setOverview(ov); setItems(its.filter(i => i.status !== 'vendido'));
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, []);

  const saveSale = async () => {
    if (!saleForm.item_id || !saleForm.client_name || !saleForm.sale_price) return toast('Preencha todos os campos', 'error');
    try { await api('/api/sales', { method: 'POST', body: saleForm }); toast('Venda registrada!', 'success'); setShowSale(false); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const saveLoan = async () => {
    if (!loanForm.client_name || !loanForm.amount) return toast('Preencha todos os campos', 'error');
    const repay = loanForm.repayment_amount || loanForm.amount;
    try { await api('/api/loans', { method: 'POST', body: { ...loanForm, repayment_amount: repay } }); toast('Empréstimo registrado!', 'success'); setShowLoan(false); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const deleteSale = async (item) => {
    if (!confirm(`Excluir a venda "${item.description}"? Pagamentos relacionados também serão removidos.`)) return;
    try { await api(`/api/sales/${item.id}`, { method: 'DELETE' }); toast('Venda excluída!', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const deleteLoan = async (item) => {
    if (!confirm(`Excluir o empréstimo "${item.description}"? Pagamentos relacionados também serão removidos.`)) return;
    try { await api(`/api/loans/${item.id}`, { method: 'DELETE' }); toast('Empréstimo excluído!', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const openPayment = (client, item) => { setPayTarget({ client, item }); setPayForm({ amount: '', payment_date: today() }); setShowPayment(true); };

  const savePayment = async () => {
    if (!payForm.amount) return toast('Informe o valor', 'error');
    const { item } = payTarget;
    try {
      await api('/api/payments', { method: 'POST', body: { reference_type: item.type, reference_id: item.id, client_name: payTarget.client, amount: payForm.amount, payment_date: payForm.payment_date } });
      toast('Pagamento registrado!', 'success'); setShowPayment(false); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const totalOwed = Object.values(overview).reduce((a, c) => a + c.total_balance, 0);
  const totalReposto = Object.values(overview).flatMap(c => c.items).reduce((a, i) => a + i.reposto, 0);

  const loanProfit = parseFloat(loanForm.repayment_amount || 0) - parseFloat(loanForm.amount || 0);

  return React.createElement('div', null,
    React.createElement('div', { className: 'section-header' },
      React.createElement('div', { className: 'section-title' }, 'Financeiro'),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => setShowSale(true) }, '💰 Nova Venda'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowLoan(true) }, '🤝 Novo Empréstimo')
      )
    ),
    React.createElement('div', { className: 'stats-row' },
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Total em Aberto'), React.createElement('div', { className: 'stat-value red' }, fmt(totalOwed))),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Reposição Pendente'), React.createElement('div', { className: 'stat-value', style: { color: '#60a5fa' } }, fmt(totalReposto)))
    ),
    React.createElement('div', { className: 'card-title', style: { marginBottom: 14, marginTop: 4 } }, 'Visão Geral — Quem deve'),
    loading ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'spinner' })) :
    Object.keys(overview).length === 0 ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'empty-icon' }, '✅'), React.createElement('p', null, 'Nenhuma dívida em aberto')) :
    React.createElement('div', { className: 'overview-grid' },
      Object.entries(overview).filter(([, c]) => c.total_balance > 0.01).map(([name, client]) =>
        React.createElement('div', { key: name, className: 'overview-card' },
          React.createElement('div', { className: 'overview-card-name' }, '👤 ' + name),
          client.items.filter(i => i.balance > 0.01).map(item =>
            React.createElement('div', { key: item.id, style: { marginBottom: 14, background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px' } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 } },
                React.createElement('div', null,
                  React.createElement('div', { style: { fontWeight: 600, fontSize: 13 } }, item.description),
                  item.account && React.createElement('div', { style: { marginTop: 3 } }, React.createElement(AccountBadge, { account: item.account, accounts }))
                ),
                React.createElement('span', { style: { fontSize: 11, color: 'var(--muted)' } }, item.type === 'sale' ? '💰 Venda' : '🤝 Empréstimo')
              ),
              React.createElement('div', { className: 'overview-row' }, React.createElement('span', { className: 'label' }, 'Total a receber'), React.createElement('span', null, fmt(item.total))),
              React.createElement('div', { className: 'overview-row' }, React.createElement('span', { className: 'label' }, 'Já pago'), React.createElement('span', { style: { color: 'var(--green)' } }, fmt(item.paid))),
              React.createElement('div', { className: 'overview-row' }, React.createElement('span', { className: 'label' }, 'Saldo devedor'), React.createElement('span', { style: { color: 'var(--red)', fontWeight: 700 } }, fmt(item.balance))),
              React.createElement('div', { style: { marginTop: 8, padding: '8px 10px', background: 'var(--surface)', borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 } },
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 } }, 'Conta ' + (item.account || 'Origem')),
                  React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: item.pending_origin > 0.01 ? '#60a5fa' : 'var(--green)' } },
                    item.pending_origin > 0.01 ? fmt(item.pending_origin) : '✓'
                  )
                ),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 } }, 'Conta Lucro'),
                  React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: item.pending_lucro > 0.01 ? 'var(--yellow)' : 'var(--green)' } },
                    item.pending_lucro > 0.01 ? fmt(item.pending_lucro) : item.total_profit > 0 ? '✓' : '—'
                  )
                )
              ),
              React.createElement(InstallmentChecks, { total: item.total, num_installments: item.num_installments, paid: item.paid }),
              React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 10 } },
                React.createElement('button', { className: 'btn btn-green btn-sm', style: { flex: 1, justifyContent: 'center' }, onClick: () => openPayment(name, item) }, '+ Pagamento'),
                item.type === 'sale' && React.createElement('button', { className: 'btn btn-danger btn-sm', title: 'Excluir venda', onClick: () => deleteSale(item) }, '🗑️'),
                item.type === 'loan' && React.createElement('button', { className: 'btn btn-danger btn-sm', title: 'Excluir empréstimo', onClick: () => deleteLoan(item) }, '🗑️')
              )
            )
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' } },
            React.createElement('span', { style: { color: 'var(--muted)', fontSize: 12 } }, 'Total devendo'),
            React.createElement('span', { style: { color: 'var(--red)', fontWeight: 700 } }, fmt(client.total_balance))
          )
        )
      )
    ),

    // NOVA VENDA
    showSale && React.createElement(Modal, { title: '💰 Nova Venda', onClose: () => setShowSale(false) },
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('label', null, 'Item do Estoque *'),
          React.createElement('select', { value: saleForm.item_id, onChange: e => { const it = items.find(i => i.id == e.target.value); setSaleForm({ ...saleForm, item_id: e.target.value, sale_price: it ? it.cost : '' }); } },
            React.createElement('option', { value: '' }, 'Selecione um item...'),
            items.map(i => React.createElement('option', { key: i.id, value: i.id }, `${i.name} — ${fmt(i.cost)} (${i.account})`))
          )
        ),
        React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('label', null, 'Comprador *'),
          React.createElement('input', { value: saleForm.client_name, onChange: e => setSaleForm({ ...saleForm, client_name: e.target.value }), placeholder: 'Nome do comprador' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Valor de Venda (R$) *'),
          React.createElement('input', { type: 'number', step: '0.01', value: saleForm.sale_price, onChange: e => setSaleForm({ ...saleForm, sale_price: e.target.value }) })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Parcelas'),
          React.createElement('input', { type: 'number', min: '1', value: saleForm.num_installments, onChange: e => setSaleForm({ ...saleForm, num_installments: e.target.value }) })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Data da Venda'),
          React.createElement('input', { type: 'date', value: saleForm.sale_date, onChange: e => setSaleForm({ ...saleForm, sale_date: e.target.value }) })
        ),
        saleForm.sale_price && saleForm.item_id && React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('div', { style: { background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 20, fontSize: 13 } },
            React.createElement('span', null, 'Custo: ', React.createElement('strong', { style: { color: 'var(--red)' } }, fmt(items.find(i => i.id == saleForm.item_id)?.cost))),
            React.createElement('span', null, 'Lucro: ', React.createElement('strong', { style: { color: 'var(--green)' } }, fmt(parseFloat(saleForm.sale_price || 0) - parseFloat(items.find(i => i.id == saleForm.item_id)?.cost || 0))))
          )
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowSale(false) }, 'Cancelar'),
        React.createElement('button', { className: 'btn btn-primary', onClick: saveSale }, 'Registrar Venda')
      )
    ),

    // NOVO EMPRÉSTIMO
    showLoan && React.createElement(Modal, { title: '🤝 Novo Empréstimo', onClose: () => setShowLoan(false) },
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('label', null, 'Para quem *'),
          React.createElement('input', { value: loanForm.client_name, onChange: e => setLoanForm({ ...loanForm, client_name: e.target.value }), placeholder: 'Nome' })
        ),
        React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('label', null, 'Descrição'),
          React.createElement('input', { value: loanForm.description, onChange: e => setLoanForm({ ...loanForm, description: e.target.value }), placeholder: 'Motivo, produto emprestado...' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Valor Emprestado (R$) *'),
          React.createElement('input', { type: 'number', step: '0.01', value: loanForm.amount, onChange: e => setLoanForm({ ...loanForm, amount: e.target.value }), placeholder: 'Quanto saiu' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Valor a Receber (R$)'),
          React.createElement('input', { type: 'number', step: '0.01', value: loanForm.repayment_amount, onChange: e => setLoanForm({ ...loanForm, repayment_amount: e.target.value }), placeholder: 'Deixar em branco = sem juros' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Conta de Origem'),
          React.createElement('select', { value: loanForm.source_account, onChange: e => setLoanForm({ ...loanForm, source_account: e.target.value }) },
            React.createElement('option', { value: '' }, '— Nenhuma —'),
            (accounts || []).map(a => React.createElement('option', { key: a.id, value: a.name }, a.name))
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Parcelas'),
          React.createElement('input', { type: 'number', min: '1', value: loanForm.num_installments, onChange: e => setLoanForm({ ...loanForm, num_installments: e.target.value }) })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Data'),
          React.createElement('input', { type: 'date', value: loanForm.loan_date, onChange: e => setLoanForm({ ...loanForm, loan_date: e.target.value }) })
        ),
        loanForm.amount && React.createElement('div', { className: 'form-group', style: { gridColumn: '1/-1' } },
          React.createElement('div', { style: { background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 20, fontSize: 13 } },
            React.createElement('span', null, 'Emprestado: ', React.createElement('strong', { style: { color: 'var(--red)' } }, fmt(loanForm.amount))),
            React.createElement('span', null, 'Lucro: ', React.createElement('strong', { style: { color: loanProfit > 0 ? 'var(--green)' : 'var(--muted)' } }, loanProfit > 0 ? fmt(loanProfit) : 'Sem juros')),
            loanProfit === 0 && React.createElement('span', { style: { color: 'var(--muted)', fontSize: 12, alignSelf: 'center' } }, '(não aparece no hist. de vendas)')
          )
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowLoan(false) }, 'Cancelar'),
        React.createElement('button', { className: 'btn btn-primary', onClick: saveLoan }, 'Registrar Empréstimo')
      )
    ),

    // REGISTRAR PAGAMENTO
    showPayment && payTarget && React.createElement(Modal, { title: `💳 Registrar Pagamento — ${payTarget.client}`, onClose: () => setShowPayment(false) },
      React.createElement('div', { style: { background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 } },
        React.createElement('div', { style: { fontWeight: 600, marginBottom: 6 } }, payTarget.item.description),
        React.createElement('div', { style: { display: 'flex', gap: 20, fontSize: 12, color: 'var(--muted)' } },
          React.createElement('span', null, 'Total: ', React.createElement('strong', { style: { color: 'var(--text)' } }, fmt(payTarget.item.total))),
          React.createElement('span', null, 'Saldo: ', React.createElement('strong', { style: { color: 'var(--red)' } }, fmt(payTarget.item.balance)))
        ),
        React.createElement(InstallmentChecks, { total: payTarget.item.total, num_installments: payTarget.item.num_installments, paid: payTarget.item.paid })
      ),
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Valor Recebido (R$) *'),
          React.createElement('input', { type: 'number', step: '0.01', value: payForm.amount, onChange: e => setPayForm({ ...payForm, amount: e.target.value }), placeholder: fmt(payTarget.item.installment_amount) })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Data do Pagamento'),
          React.createElement('input', { type: 'date', value: payForm.payment_date, onChange: e => setPayForm({ ...payForm, payment_date: e.target.value }) })
        )
      ),
      payForm.amount && React.createElement('div', { style: { background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13 } },
        React.createElement('span', { style: { color: 'var(--muted)' } }, 'Parcela estimada: '),
        React.createElement('strong', null, (() => {
          const amt = parseFloat(payForm.amount);
          const installAmt = payTarget.item.installment_amount;
          const prevPaid = payTarget.item.paid;
          const completed = Math.floor((prevPaid + amt) / installAmt);
          return `${Math.min(completed, payTarget.item.num_installments)}/${payTarget.item.num_installments}`;
        })())
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowPayment(false) }, 'Cancelar'),
        React.createElement('button', { className: 'btn btn-green', onClick: savePayment }, '✔ Confirmar')
      )
    )
  );
}

// ─── CLIENTES TAB ────────────────────────────────────────────────────────────
function ClientesTab({ toast }) {
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api('/api/financial-overview').then(setOverview).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, []);

  // Only show clients with at least one item that still has balance
  const entries = Object.entries(overview)
    .filter(([name, client]) => {
      const nameMatch = !search || name.toLowerCase().includes(search.toLowerCase());
      const hasBalance = client.items.some(i => i.balance > 0.01);
      return nameMatch && hasBalance;
    });

  return React.createElement('div', null,
    React.createElement('div', { className: 'section-header' },
      React.createElement('div', { className: 'section-title' }, 'Clientes'),
      React.createElement('input', { className: 'search-bar', placeholder: '🔍 Buscar cliente...', value: search, onChange: e => setSearch(e.target.value) })
    ),
    loading ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'spinner' })) :
    entries.length === 0 ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'empty-icon' }, '👥'), React.createElement('p', null, 'Nenhum cliente com saldo em aberto')) :
    React.createElement('div', { className: 'client-grid' },
      entries.map(([name, client]) => {
        const openItems = client.items.filter(i => i.balance > 0.01);
        const openBalance = openItems.reduce((a, i) => a + i.balance, 0);
        return React.createElement('div', { key: name, className: 'client-card' },
          React.createElement('div', { className: 'client-header' },
            React.createElement('div', { className: 'client-name' }, '👤 ' + name),
            React.createElement('div', { className: 'client-total' },
              React.createElement('span', null, 'Deve: ', React.createElement('span', { style: { color: 'var(--red)', fontWeight: 700 } }, fmt(openBalance)))
            )
          ),
          React.createElement('div', { className: 'client-items' },
            openItems.map((item, idx) => {
              const completedLabel = `${item.completed_installments}/${item.num_installments}`;
              return React.createElement('div', { key: idx, className: 'client-item' },
                React.createElement('div', null,
                  React.createElement('div', { className: 'client-item-desc' },
                    item.description,
                    React.createElement('span', { style: { marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 } }, `(${completedLabel})`)
                  ),
                  React.createElement('div', { className: 'client-item-sub' }, item.type === 'sale' ? '💰 Venda' : '🤝 Empréstimo', item.account ? ` · ${item.account}` : '')
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'client-item-label' }, 'Total'),
                  React.createElement('div', { className: 'client-item-val' }, fmt(item.total))
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'client-item-label' }, 'Pago'),
                  React.createElement('div', { className: 'client-item-val', style: { color: 'var(--green)' } }, fmt(item.paid))
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'client-item-label' }, 'Saldo'),
                  React.createElement('div', { className: 'client-item-val', style: { color: item.balance > 0.01 ? 'var(--red)' : 'var(--green)' } }, fmt(Math.max(0, item.balance)))
                )
              );
            })
          )
        );
      })
    )
  );
}

// ─── HISTÓRICO DE PAGAMENTOS ─────────────────────────────────────────────────
function PagamentosTab({ toast }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);

  useEffect(() => {
    api('/api/payments').then(data => {
      setPayments(data);
      // auto-expand the most recent month
      if (data.length > 0) {
        const firstMonth = data[0].payment_date ? data[0].payment_date.slice(0, 7) : null;
        setExpandedMonth(firstMonth);
      }
    }).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, []);

  // Group by month
  const byMonth = {};
  for (const p of payments) {
    const m = p.payment_date ? p.payment_date.slice(0, 7) : 'Sem data';
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(p);
  }
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  return React.createElement('div', null,
    React.createElement('div', { className: 'section-header' },
      React.createElement('div', { className: 'section-title' }, 'Histórico de Pagamentos')
    ),
    loading ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'spinner' })) :
    months.length === 0 ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'empty-icon' }, '💳'), React.createElement('p', null, 'Nenhum pagamento registrado')) :
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      months.map(m => {
        const isExp = expandedMonth === m;
        const monthPayments = byMonth[m];
        const totalMonth = monthPayments.reduce((a, p) => a + parseFloat(p.amount || 0), 0);
        return React.createElement('div', { key: m, className: 'card', style: { padding: 0, overflow: 'hidden' } },
          // Header (clicável)
          React.createElement('div', {
            style: { padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
            onClick: () => setExpandedMonth(isExp ? null : m)
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
              React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, monthLabel(m)),
              React.createElement('div', { style: { display: 'flex', gap: 14, fontSize: 13, color: 'var(--muted)' } },
                React.createElement('span', null, `${monthPayments.length} pagamento${monthPayments.length !== 1 ? 's' : ''}`),
                React.createElement('span', { style: { color: 'var(--green)', fontWeight: 600 } }, '+ ' + fmt(totalMonth))
              )
            ),
            React.createElement('span', { style: { color: 'var(--muted)', fontSize: 12 } }, isExp ? '▲ Fechar' : '▼ Ver detalhes')
          ),
          // Conteúdo expandido
          isExp && React.createElement('div', { style: { borderTop: '1px solid var(--border)' } },
            React.createElement('div', { style: { display: 'flex', gap: 16, padding: '12px 18px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' } },
              React.createElement('div', { className: 'stat-card', style: { flex: 1 } }, React.createElement('div', { className: 'stat-label' }, 'Registros'), React.createElement('div', { className: 'stat-value accent' }, monthPayments.length)),
              React.createElement('div', { className: 'stat-card', style: { flex: 1 } }, React.createElement('div', { className: 'stat-label' }, 'Total Recebido'), React.createElement('div', { className: 'stat-value green' }, fmt(totalMonth)))
            ),
            React.createElement('div', { className: 'table-wrap', style: { padding: '0 0 4px' } },
              React.createElement('table', null,
                React.createElement('thead', null, React.createElement('tr', null,
                  ['Data', 'Pessoa', 'Item / Descrição', 'Valor Pago', 'Parcela', 'Saldo Devedor'].map(h => React.createElement('th', { key: h }, h))
                )),
                React.createElement('tbody', null, monthPayments.map(p => {
                  const total = parseFloat(p.total_value || 0);
                  const cumPaid = parseFloat(p.cumulative_paid || p.amount || 0);
                  const saldo = Math.max(0, total - cumPaid);
                  const installAmt = total / parseInt(p.total_installments || 1);
                  const completedInstall = Math.min(Math.floor(cumPaid / installAmt), parseInt(p.total_installments || 1));
                  return React.createElement('tr', { key: p.id },
                    React.createElement('td', null, fmtDate(p.payment_date)),
                    React.createElement('td', null, React.createElement('strong', null, p.client_name)),
                    React.createElement('td', null,
                      React.createElement('div', null, p.item_name || '—'),
                      React.createElement('div', { style: { fontSize: 11, color: 'var(--muted)', marginTop: 2 } }, p.reference_type === 'sale' ? '💰 Venda' : '🤝 Empréstimo')
                    ),
                    React.createElement('td', null, React.createElement('span', { style: { color: 'var(--green)', fontWeight: 600 } }, fmt(p.amount))),
                    React.createElement('td', null, React.createElement('span', { className: 'badge badge-estoque' }, `${completedInstall}/${p.total_installments}`)),
                    React.createElement('td', null, React.createElement('span', { style: { color: saldo > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 } }, fmt(saldo)))
                  );
                }))
              )
            )
          )
        );
      })
    )
  );
}

// ─── HISTÓRICO DE VENDAS (acordeão por mês) ──────────────────────────────────
function VendasTab({ toast }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);

  useEffect(() => {
    api('/api/sales-history').then(data => {
      setHistory(data);
      if (data.length > 0) setExpandedMonth(data[0].month);
    }).catch(e => toast(e.message, 'error')).finally(() => setLoading(false));
  }, []);

  return React.createElement('div', null,
    React.createElement('div', { className: 'section-header' },
      React.createElement('div', { className: 'section-title' }, 'Histórico de Vendas')
    ),
    loading ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'spinner' })) :
    history.length === 0 ? React.createElement('div', { className: 'empty' }, React.createElement('div', { className: 'empty-icon' }, '📊'), React.createElement('p', null, 'Nenhuma venda registrada')) :
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      history.map(h => {
        const isExp = expandedMonth === h.month;
        const margin = parseFloat(h.total_invested) > 0 ? ((parseFloat(h.total_profit) / parseFloat(h.total_invested)) * 100).toFixed(0) : 0;
        return React.createElement('div', { key: h.month, className: 'card', style: { padding: 0, overflow: 'hidden' } },
          // Header clicável
          React.createElement('div', {
            style: { padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
            onClick: () => setExpandedMonth(isExp ? null : h.month)
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
              React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, monthLabel(h.month)),
              React.createElement('div', { style: { display: 'flex', gap: 14, fontSize: 13, color: 'var(--muted)' } },
                React.createElement('span', null, `${h.sales.length} venda${h.sales.length !== 1 ? 's' : ''}`),
                React.createElement('span', { style: { color: 'var(--green)', fontWeight: 600 } }, '+' + fmt(h.total_profit)),
                React.createElement('span', { style: { color: 'var(--muted)' } }, `(${margin}% margem)`)
              )
            ),
            React.createElement('span', { style: { color: 'var(--muted)', fontSize: 12 } }, isExp ? '▲ Fechar' : '▼ Ver detalhes')
          ),
          // Conteúdo expandido
          isExp && React.createElement('div', { style: { borderTop: '1px solid var(--border)' } },
            React.createElement('div', { style: { display: 'flex', gap: 12, padding: '12px 18px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' } },
              React.createElement('div', { className: 'stat-card', style: { flex: 1, minWidth: 120 } }, React.createElement('div', { className: 'stat-label' }, 'Vendas'), React.createElement('div', { className: 'stat-value accent' }, h.sales.length)),
              React.createElement('div', { className: 'stat-card', style: { flex: 1, minWidth: 120 } }, React.createElement('div', { className: 'stat-label' }, 'Investido'), React.createElement('div', { className: 'stat-value red' }, fmt(h.total_invested))),
              React.createElement('div', { className: 'stat-card', style: { flex: 1, minWidth: 120 } }, React.createElement('div', { className: 'stat-label' }, 'Faturado'), React.createElement('div', { className: 'stat-value yellow' }, fmt(h.total_revenue))),
              React.createElement('div', { className: 'stat-card', style: { flex: 1, minWidth: 120 } }, React.createElement('div', { className: 'stat-label' }, 'Lucro Bruto'), React.createElement('div', { className: 'stat-value green' }, fmt(h.total_profit)))
            ),
            React.createElement('div', { className: 'table-wrap', style: { padding: '0 0 4px' } },
              React.createElement('table', null,
                React.createElement('thead', null, React.createElement('tr', null,
                  ['', 'Data', 'Produto / Descrição', 'Cliente', 'Conta', 'Investido', 'Venda', 'Lucro', 'Recebido'].map(col => React.createElement('th', { key: col }, col))
                )),
                React.createElement('tbody', null, h.sales.map((s, idx) => {
                  const profit = parseFloat(s.profit || 0);
                  const revenue = parseFloat(s.revenue || 0);
                  const paidTotal = parseFloat(s.paid_total || 0);
                  const isQuitado = paidTotal >= revenue - 0.01;
                  return React.createElement('tr', { key: idx },
                    React.createElement('td', null,
                      isQuitado
                        ? React.createElement('span', { title: 'Quitado', style: { color: 'var(--green)', fontSize: 16 } }, '✅')
                        : React.createElement('span', { title: 'Pendente', style: { color: 'var(--yellow)', fontSize: 14 } }, '⏳')
                    ),
                    React.createElement('td', null, fmtDate(s.sale_date)),
                    React.createElement('td', null,
                      React.createElement('strong', null, s.item_name || '—'),
                      React.createElement('div', { style: { fontSize: 11, color: 'var(--muted)', marginTop: 2 } }, s.entry_type === 'loan' ? '🤝 Empréstimo c/ juros' : '💰 Venda')
                    ),
                    React.createElement('td', null, s.client_name),
                    React.createElement('td', null, s.account ? React.createElement('span', { className: 'badge badge-sofisa' }, s.account) : '—'),
                    React.createElement('td', null, React.createElement('span', { style: { color: 'var(--red)' } }, fmt(s.invested))),
                    React.createElement('td', null, React.createElement('span', { style: { color: 'var(--yellow)' } }, fmt(s.revenue))),
                    React.createElement('td', null, React.createElement('span', { style: { color: profit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 } }, fmt(profit))),
                    React.createElement('td', null, React.createElement('span', { style: { color: 'var(--muted)' } }, fmt(s.paid_total)))
                  );
                }))
              )
            )
          )
        );
      })
    )
  );
}

// ─── CONTAS TAB ──────────────────────────────────────────────────────────────
function ContasTab({ toast, accounts, reloadAccounts }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState([]);
  const [loadingBal, setLoadingBal] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState(null);

  const loadBalance = useCallback(async () => {
    try { setBalance(await api('/api/account-balance')); } catch (e) { toast(e.message, 'error'); } finally { setLoadingBal(false); }
  }, []);
  useEffect(() => { loadBalance(); }, []);

  const addAccount = async () => {
    if (!newName.trim()) return toast('Digite o nome da conta', 'error');
    setSaving(true);
    try { await api('/api/accounts', { method: 'POST', body: { name: newName.trim() } }); toast('Conta criada!', 'success'); setNewName(''); reloadAccounts(); loadBalance(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const del = async (acc) => {
    if (!confirm(`Excluir a conta "${acc.name}"?`)) return;
    try { await api(`/api/accounts/${acc.id}`, { method: 'DELETE' }); toast('Conta excluída!', 'success'); reloadAccounts(); loadBalance(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const totalPending = balance.reduce((a, b) => a + parseFloat(b.pending_reposto || 0), 0);
  const totalReposto = balance.reduce((a, b) => a + parseFloat(b.total_reposto || 0), 0);

  return React.createElement('div', null,
    React.createElement('div', { className: 'section-header' },
      React.createElement('div', { className: 'section-title' }, 'Contas')
    ),
    // Summary stats
    React.createElement('div', { className: 'stats-row' },
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Contas Cadastradas'), React.createElement('div', { className: 'stat-value accent' }, accounts.length)),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Já Reposto'), React.createElement('div', { className: 'stat-value green' }, fmt(totalReposto))),
      React.createElement('div', { className: 'stat-card' }, React.createElement('div', { className: 'stat-label' }, 'Pendente Repor'), React.createElement('div', { className: 'stat-value red' }, fmt(totalPending)))
    ),

    // Saldo por conta
    !loadingBal && balance.length > 0 && React.createElement('div', { style: { marginBottom: 20 } },
      React.createElement('div', { className: 'card-title', style: { marginBottom: 12 } }, 'Saldo por Conta — Detalhamento'),
      React.createElement('div', { style: { display: 'grid', gap: 10 } },
        balance.map(b => {
          const isExp = expandedAccount === b.account;
          const isLucro = b.is_lucro_virtual;
          return React.createElement('div', { key: b.account, className: 'card', style: { padding: 0, overflow: 'hidden', border: isLucro ? '1px solid rgba(74,222,128,.3)' : undefined } },
            React.createElement('div', {
              style: { padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
              onClick: () => setExpandedAccount(isExp ? null : b.account)
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
                isLucro
                  ? React.createElement('span', { className: 'badge badge-vendido', style: { fontSize: 12 } }, '💰 Conta Lucro')
                  : React.createElement(AccountBadge, { account: b.account, accounts }),
                React.createElement('div', null,
                  isLucro
                    ? React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: b.pending_reposto > 0.01 ? 'var(--yellow)' : 'var(--green)' } },
                        b.pending_reposto > 0.01 ? fmt(b.pending_reposto) + ' a depositar' : '✓ Em dia'
                      )
                    : React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: b.pending_reposto > 0.01 ? 'var(--red)' : 'var(--green)' } },
                        b.pending_reposto > 0.01 ? fmt(b.pending_reposto) + ' a depositar' : '✓ Em dia'
                      )
                )
              ),
              React.createElement('span', { style: { color: 'var(--muted)', fontSize: 12 } }, isExp ? '▲ Fechar' : '▼ Detalhar')
            ),
            isExp && React.createElement('div', { style: { borderTop: '1px solid var(--border)', padding: '0 18px 14px' } },
              isLucro && React.createElement('div', { style: { padding: '10px 0 8px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' } },
                'Todo o lucro vai para esta conta. Os valores abaixo mostram o lucro gerado por cada venda.'
              ),
              React.createElement('table', { style: { width: '100%' } },
                React.createElement('thead', null, React.createElement('tr', null,
                  isLucro
                    ? ['Tipo', 'Produto', 'Cliente', 'Lucro Total', 'Já Depositado', 'A Depositar'].map(h => React.createElement('th', { key: h }, h))
                    : ['Tipo', 'Produto', 'Cliente', 'Custo', 'Reposto', 'A Depositar', 'Lucro Gerado'].map(h => React.createElement('th', { key: h }, h))
                )),
                React.createElement('tbody', null, b.entries.map((e, i) =>
                  React.createElement('tr', { key: i },
                    React.createElement('td', null, React.createElement('span', { className: 'badge', style: { background: e.type === 'sale' ? '#1a3a25' : '#1a2a3a', color: e.type === 'sale' ? 'var(--green)' : 'var(--accent2)' } }, e.type === 'sale' ? '💰' : '🤝')),
                    React.createElement('td', null, e.item || '—'),
                    React.createElement('td', null, e.client),
                    isLucro
                      ? React.createElement(React.Fragment, null,
                          React.createElement('td', null, React.createElement('span', { style: { color: 'var(--yellow)', fontWeight: 600 } }, fmt(e.cost))),
                          React.createElement('td', null, React.createElement('span', { style: { color: 'var(--green)' } }, fmt(e.reposto))),
                          React.createElement('td', null, React.createElement('span', { style: { color: e.pending > 0.01 ? 'var(--yellow)' : 'var(--green)', fontWeight: 600 } }, e.pending > 0.01 ? fmt(e.pending) : '✓'))
                        )
                      : React.createElement(React.Fragment, null,
                          React.createElement('td', null, fmt(e.cost)),
                          React.createElement('td', null, React.createElement('span', { style: { color: '#60a5fa' } }, fmt(e.reposto))),
                          React.createElement('td', null, React.createElement('span', { style: { color: e.pending > 0.01 ? 'var(--red)' : 'var(--green)', fontWeight: 600 } }, e.pending > 0.01 ? fmt(e.pending) : '✓')),
                          React.createElement('td', null, React.createElement('span', { style: { color: 'var(--green)' } }, fmt(e.lucro)))
                        )
                  )
                ))
              )
            )
          );
        })
      )
    ),

    // Adicionar conta
    React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
      React.createElement('div', { className: 'card-title' }, 'Adicionar Nova Conta'),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement('input', { value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => e.key === 'Enter' && addAccount(), placeholder: 'Ex: Nubank, PJ, Reserva...', style: { maxWidth: 360 } }),
        React.createElement('button', { className: 'btn btn-primary', onClick: addAccount, disabled: saving }, saving ? '...' : '+ Adicionar')
      )
    ),

    // Lista de contas
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, `${accounts.length} conta${accounts.length !== 1 ? 's' : ''} cadastrada${accounts.length !== 1 ? 's' : ''}`),
      accounts.length === 0 ? React.createElement('div', { className: 'empty' }, React.createElement('p', null, 'Nenhuma conta')) :
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null, React.createElement('tr', null,
            React.createElement('th', null, '#'),
            React.createElement('th', null, 'Nome'),
            React.createElement('th', null, 'Criada em'),
            React.createElement('th', null, '')
          )),
          React.createElement('tbody', null, accounts.map((acc, i) =>
            React.createElement('tr', { key: acc.id },
              React.createElement('td', null, React.createElement('span', { style: { color: 'var(--muted)' } }, i + 1)),
              React.createElement('td', null, React.createElement(AccountBadge, { account: acc.name, accounts })),
              React.createElement('td', null, fmtDate(acc.created_at?.split('T')[0])),
              React.createElement('td', null,
                React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => del(acc) }, '🗑️ Excluir')
              )
            )
          ))
        )
      )
    )
  );
}

// ─── APP ROOT ────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('estoque');
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success');
  const [accounts, setAccounts] = useState([]);

  const toast = (msg, type = 'success') => { setToastMsg(msg); setToastType(type); };
  const clearToast = () => setToastMsg('');

  const loadAccounts = useCallback(async () => {
    try { setAccounts(await api('/api/accounts')); } catch (e) { /* silent */ }
  }, []);
  useEffect(() => { loadAccounts(); }, []);

  const tabs = [
    { id: 'estoque', label: '📦 Estoque' },
    { id: 'financeiro', label: '💵 Financeiro' },
    { id: 'clientes', label: '👥 Clientes' },
    { id: 'pagamentos', label: '💳 Hist. Pagamentos' },
    { id: 'vendas', label: '📊 Hist. Vendas' },
    { id: 'contas', label: '🏦 Contas' }
  ];

  return React.createElement('div', null,
    React.createElement('div', { className: 'header' },
      React.createElement('div', { className: 'header-title' }, React.createElement('span', null, '◆ '), 'Gestão de Revendas')
    ),
    React.createElement('div', { className: 'tabs' },
      tabs.map(t => React.createElement('button', { key: t.id, className: `tab${tab === t.id ? ' active' : ''}`, onClick: () => setTab(t.id) }, t.label))
    ),
    React.createElement('div', { className: 'main' },
      tab === 'estoque' && React.createElement(EstoqueTab, { toast, accounts }),
      tab === 'financeiro' && React.createElement(FinanceiroTab, { toast, accounts }),
      tab === 'clientes' && React.createElement(ClientesTab, { toast }),
      tab === 'pagamentos' && React.createElement(PagamentosTab, { toast }),
      tab === 'vendas' && React.createElement(VendasTab, { toast }),
      tab === 'contas' && React.createElement(ContasTab, { toast, accounts, reloadAccounts: loadAccounts })
    ),
    toastMsg && React.createElement(Toast, { msg: toastMsg, type: toastType, onClose: clearToast })
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
