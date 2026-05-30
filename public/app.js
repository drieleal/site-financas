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
  return `${months[parseInt(mo)-1]} / ${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE TAB
// ─────────────────────────────────────────────────────────────────────────────
function EstoqueTab({ toast, accounts }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  
  const defaultAccount = accounts[0]?.name || '';
  const [form, setForm] = useState({ name: '', purchase_date: today(), cost: '', account: defaultAccount, store: '', status: 'estoque', quantity: '1' });
  const [filterStatus, setFilterStatus] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api('/api/items');
      setItems(data);
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditItem(null);
    setForm({ name: '', purchase_date: today(), cost: '', account: defaultAccount, store: '', status: 'estoque', quantity: '1' });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name, purchase_date: item.purchase_date || today(), cost: item.cost, account: item.account, store: item.store || '', status: item.status, quantity: item.quantity?.toString() || '1' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.cost || !form.account) return toast('Preencha os campos obrigatórios', 'error');
    try {
      if (editItem) {
        await api(`/api/items/${editItem.id}`, { method: 'PUT', body: form });
        toast('Item atualizado!', 'success');
      } else {
        await api('/api/items', { method: 'POST', body: form });
        toast('Item adicionado!', 'success');
      }
      setShowModal(false); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async (item) => {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    try {
      await api(`/api/items/${item.id}`, { method: 'DELETE' });
      toast('Item removido', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const filtered = items.filter(i => {
    if (filterStatus !== 'todos' && i.status !== filterStatus) return false;
    if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return React.createElement('div', null,
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 15, flexWrap: 'wrap' } },
      React.createElement('input', { type: 'text', placeholder: '🔍 Buscar item...', value: searchTerm, onChange: e => setSearchTerm(e.target.value), style: { flex: 1, minWidth: 200 } }),
      React.createElement('select', { value: filterStatus, onChange: e => setFilterStatus(e.target.value) },
        React.createElement('option', { value: 'todos' }, 'Todos os Status'),
        React.createElement('option', { value: 'estoque' }, 'Em Estoque'),
        React.createElement('option', { value: 'em_transporte' }, 'Em Transporte'),
        React.createElement('option', { value: 'vendido' }, 'Vendido')
      ),
      React.createElement('button', { className: 'btn btn-primary', onClick: openNew }, '+ Novo Item')
    ),
    React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
      React.createElement('table', { className: 'table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, 'Produto'),
            React.createElement('th', null, 'Custo Un.'),
            React.createElement('th', null, 'Conta Origem'),
            React.createElement('th', null, 'Status'),
            React.createElement('th', null, 'Comprador / Lucro'),
            React.createElement('th', { style: { textAlign: 'right' } }, 'Ações')
          )
        ),
        React.createElement('tbody', null,
          filtered.length === 0 ? React.createElement('tr', null, React.createElement('td', { colSpan: 6, style: { textAlign: 'center', color: '#94a3b8' } }, 'Nenhum item encontrado.')) :
          filtered.map(item => React.createElement('tr', { key: item.id + '-' + (item.sale_id || 'stock') },
            React.createElement('td', null,
              React.createElement('strong', null, item.name + (parseInt(item.quantity) > 1 && item.status !== 'vendido' ? ` (${item.quantity} un)` : '')),
              React.createElement('div', { className: 'text-muted', style: { fontSize: 11 } }, `Comprado em ${fmtDate(item.purchase_date)}` + (item.store ? ` na ${item.store}` : ''))
            ),
            React.createElement('td', null, fmt(item.cost)),
            React.createElement('td', null, React.createElement('span', { className: 'badge' }, item.account)),
            React.createElement('td', null,
              React.createElement('span', { className: `badge badge-${item.status === 'vendido' ? 'green' : item.status === 'em_transporte' ? 'orange' : 'primary'}` },
                item.status === 'estoque' ? 'Em Estoque' : item.status === 'em_transporte' ? 'Em Transporte' : 'Vendido'
              )
            ),
            React.createElement('td', null,
              item.status === 'vendido' ? React.createElement('div', null,
                React.createElement('div', null, React.createElement('strong', null, item.buyer), item.quantity_sold > 1 ? ` (${item.quantity_sold} un)` : ''),
                React.createElement('div', { style: { color: '#10b981', fontSize: 12 } }, `Lucro: ${fmt(item.profit)}`)
              ) : '—'
            ),
            React.createElement('td', { style: { textAlign: 'right' } },
              React.createElement('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
                React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => openEdit(item) }, '✏️'),
                React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => remove(item) }, '🗑️')
              )
            )
          ))
        )
      )
    ),
    showModal && React.createElement('div', { className: 'modal-backdrop' },
      React.createElement('div', { className: 'modal' },
        React.createElement('h3', null, editItem ? 'Editar Item' : 'Novo Item'),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Nome do Produto *'),
          React.createElement('input', { type: 'text', value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Custo Unitário (R$) *'),
            React.createElement('input', { type: 'number', value: form.cost, onChange: e => setForm({ ...form, cost: e.target.value }) })
          ),
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Quantidade Lote *'),
            React.createElement('input', { type: 'number', min: '1', value: form.quantity, onChange: e => setForm({ ...form, quantity: e.target.value }) })
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Conta de Origem *'),
          React.createElement('select', { value: form.account, onChange: e => setForm({ ...form, account: e.target.value }) },
            accounts.map(a => React.createElement('option', { key: a.id, value: a.name }, a.name))
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Loja / Fornecedor'),
          React.createElement('input', { type: 'text', value: form.store, onChange: e => setForm({ ...form, store: e.target.value }) })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Data da Compra'),
            React.createElement('input', { type: 'date', value: form.purchase_date, onChange: e => setForm({ ...form, purchase_date: e.target.value }) })
          ),
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Status'),
            React.createElement('select', { value: form.status, onChange: e => setForm({ ...form, status: e.target.value }) },
              React.createElement('option', { value: 'estoque' }, 'Em Estoque'),
              React.createElement('option', { value: 'em_transporte' }, 'Em Transporte'),
              React.createElement('option', { value: 'vendido' }, 'Vendido')
            )
          )
        ),
        React.createElement('div', { className: 'modal-actions' },
          React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowModal(false) }, 'Cancelar'),
          React.createElement('button', { className: 'btn btn-primary', onClick: save }, 'Salvar')
        )
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO TAB (COM EDIÇÃO DE PARCELAS)
// ─────────────────────────────────────────────────────────────────────────────
function FinanceiroTab({ toast, accounts }) {
  const [stockItems, setStockItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [loans, setLoans] = useState([]);
  
  const [showSale, setShowSale] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const [editSaleTarget, setEditSaleTarget] = useState(null);
  const [editLoanTarget, setEditLoanTarget] = useState(null);

  const [saleForm, setSaleForm] = useState({ item_id: '', client_name: '', sale_price: '', num_installments: '1', sale_date: today(), quantity_sold: '1' });
  const [loanForm, setLoanForm] = useState({ client_name: '', amount: '', repayment_amount: '', num_installments: '1', loan_date: today(), description: '', source_account: accounts[0]?.name || '' });
  
  const [paymentForm, setPaymentForm] = useState({ reference_type: '', reference_id: '', client_name: '', amount: '', payment_date: today(), installment_number: '1', max_installments: 1 });

  const load = useCallback(async () => {
    try {
      const items = await api('/api/items');
      setStockItems(items.filter(i => i.status !== 'vendido'));
      setSales(await api('/api/items').then(res => res.filter(i => i.status === 'vendido')));
      setLoans(await api('/api/loans'));
    } catch (e) { toast(e.message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const saveSale = async () => {
    if (!saleForm.item_id || !saleForm.client_name || !saleForm.sale_price) return toast('Campos obrigatórios faltando', 'error');
    try {
      if (editSaleTarget) {
        await api(`/api/sales/${editSaleTarget.id}`, { method: 'PUT', body: saleForm });
        toast('Venda atualizada com sucesso!', 'success');
      } else {
        await api('/api/sales', { method: 'POST', body: saleForm });
        toast('Venda registrada com sucesso!', 'success');
      }
      setShowSale(false); setEditSaleTarget(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveLoan = async () => {
    if (!loanForm.client_name || !loanForm.amount || !loanForm.repayment_amount) return toast('Campos obrigatórios faltando', 'error');
    try {
      if (editLoanTarget) {
        await api(`/api/loans/${editLoanTarget.id}`, { method: 'PUT', body: loanForm });
        toast('Empréstimo atualizado!', 'success');
      } else {
        await api('/api/loans', { method: 'POST', body: loanForm });
        toast('Empréstimo registrado!', 'success');
      }
      setShowLoan(false); setEditLoanTarget(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const openPayment = (clientName, target) => {
    setPaymentForm({
      reference_type: target.type,
      reference_id: target.id,
      client_name: clientName,
      amount: '',
      payment_date: today(),
      installment_number: '1',
      max_installments: target.num_installments
    });
    setShowPayment(true);
  };

  const savePayment = async () => {
    if (!paymentForm.amount) return toast('Defina o valor pago', 'error');
    try {
      await api('/api/payments', { method: 'POST', body: paymentForm });
      toast('Pagamento lançado!', 'success'); setShowPayment(false); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteSale = async (s) => {
    if (!confirm('Excluir essa venda? O item voltará para o estoque e o histórico de parcelas dela sumirá.')) return;
    try {
      await api(`/api/sales/${s.id}`, { method: 'DELETE' });
      toast('Venda excluída', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteLoan = async (l) => {
    if (!confirm('Excluir empréstimo?')) return;
    try {
      await api(`/api/loans/${l.id}`, { method: 'DELETE' });
      toast('Empréstimo excluído', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Consolidação de devedores ativos
  const debts = {};
  sales.forEach(s => {
    const bal = parseFloat(s.sale_price) - parseFloat(s.sale_paid_total);
    if (bal > 0.05) {
      if (!debts[s.buyer]) debts[s.buyer] = [];
      debts[s.buyer].push({ id: s.sale_id, type: 'sale', label: s.name, total: parseFloat(s.sale_price), paid: parseFloat(s.sale_paid_total), num_installments: s.sale_installments });
    }
  });
  loans.forEach(l => {
    const bal = parseFloat(l.repayment_amount) - parseFloat(l.paid_total);
    if (bal > 0.05) {
      if (!debts[l.client_name]) debts[l.client_name] = [];
      debts[l.client_name].push({ id: l.id, type: 'loan', label: l.description || 'Empréstimo em Dinheiro', total: parseFloat(l.repayment_amount), paid: parseFloat(l.paid_total), num_installments: l.num_installments, cost: l.amount, account: l.source_account });
    }
  });

  return React.createElement('div', null,
    React.createElement('div', { style: { display: 'flex', gap: 10, marginBottom: 15 } },
      React.createElement('button', { className: 'btn btn-green', onClick: () => { setEditSaleTarget(null); setSaleForm({ item_id: '', client_name: '', sale_price: '', num_installments: '1', sale_date: today(), quantity_sold: '1' }); setShowSale(true); } }, '＋ Registrar Venda'),
      React.createElement('button', { className: 'btn btn-orange', onClick: () => { setEditLoanTarget(null); setLoanForm({ client_name: '', amount: '', repayment_amount: '', num_installments: '1', loan_date: today(), description: '', source_account: accounts[0]?.name || '' }); setShowLoan(true); } }, '➔ Novo Empréstimo')
    ),
    React.createElement('h3', { style: { marginBottom: 10 } }, 'Debritos e Financiamentos Ativos'),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      Object.keys(debts).length === 0 ? React.createElement('p', { className: 'text-muted' }, 'Tudo quitado! Nenhuma pendência em aberto.') :
      Object.entries(debts).map(([name, items]) => React.createElement('div', { key: name, className: 'card' },
        React.createElement('h4', { style: { borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 8 } }, name),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 } },
          items.map((item, idx) => {
            const pending = item.total - item.paid;
            return React.createElement('div', { key: idx, style: { background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #edf2f7' } },
              React.createElement('div', { style: { fontWeight: 'bold', fontSize: 13 } }, item.label),
              React.createElement('div', { style: { fontSize: 12, marginTop: 4 } }, `Total: ${fmt(item.total)} | Pago: ${fmt(item.paid)}`),
              React.createElement('div', { style: { fontSize: 13, color: '#e53e3e', fontWeight: 'bold', marginTop: 2 } }, `Falta: ${fmt(pending)}`),
              React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 10 } },
                React.createElement('button', { className: 'btn btn-green btn-sm', style: { flex: 1, justifyContent: 'center' }, onClick: () => openPayment(name, item) }, '+ Pagamento'),
                React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => {
                  if (item.type === 'sale') {
                    setEditSaleTarget(item);
                    setSaleForm({ item_id: item.id.toString(), client_name: name, sale_price: item.total.toString(), num_installments: item.num_installments.toString(), sale_date: today(), quantity_sold: '1' });
                    setShowSale(true);
                  } else {
                    setEditLoanTarget(item);
                    setLoanForm({ client_name: name, amount: item.cost.toString(), repayment_amount: item.total.toString(), num_installments: item.num_installments.toString(), loan_date: today(), description: item.label, source_account: item.account });
                    setShowLoan(true);
                  }
                }}, '✏️'),
                React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => item.type === 'sale' ? deleteSale(item) : deleteLoan(item) }, '🗑️')
              )
            );
          })
        )
      ))
    ),
    showSale && React.createElement('div', { className: 'modal-backdrop' },
      React.createElement('div', { className: 'modal' },
        React.createElement('h3', null, editSaleTarget ? 'Editar Detalhes da Venda' : 'Lançar Nova Venda'),
        !editSaleTarget && React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Selecione o Item do Estoque *'),
          React.createElement('select', { value: saleForm.item_id, onChange: e => setSaleForm({ ...saleForm, item_id: e.target.value }) },
            React.createElement('option', { value: '' }, 'Escolha...'),
            stockItems.map(i => React.createElement('option', { key: i.id, value: i.id }, `${i.name} (Custo: ${fmt(i.cost)}) [${i.quantity} un]`))
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Nome do Cliente *'),
          React.createElement('input', { type: 'text', value: saleForm.client_name, onChange: e => setSaleForm({ ...saleForm, client_name: e.target.value }) })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Preço Total de Venda (R$) *'),
            React.createElement('input', { type: 'number', value: saleForm.sale_price, onChange: e => setSaleForm({ ...saleForm, sale_price: e.target.value }) })
          ),
          !editSaleTarget && React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Qtd Vendida *'),
            React.createElement('input', { type: 'number', min: '1', value: saleForm.quantity_sold, onChange: e => setSaleForm({ ...saleForm, quantity_sold: e.target.value }) })
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Parcelas'),
            React.createElement('input', { type: 'number', min: '1', value: saleForm.num_installments, onChange: e => setSaleForm({ ...saleForm, num_installments: e.target.value }) })
          ),
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Data'),
            React.createElement('input', { type: 'date', value: saleForm.sale_date, onChange: e => setSaleForm({ ...saleForm, sale_date: e.target.value }) })
          )
        ),
        React.createElement('div', { className: 'modal-actions' },
          React.createElement('button', { className: 'btn btn-secondary', onClick: () => { setShowSale(false); setEditSaleTarget(null); } }, 'Cancelar'),
          React.createElement('button', { className: 'btn btn-primary', onClick: saveSale }, 'Confirmar')
        )
      )
    ),
    showLoan && React.createElement('div', { className: 'modal-backdrop' },
      React.createElement('div', { className: 'modal' },
        React.createElement('h3', null, editLoanTarget ? 'Editar Empréstimo' : 'Novo Empréstimo / Financiamento'),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Nome do Devedor *'),
          React.createElement('input', { type: 'text', value: loanForm.client_name, onChange: e => setLoanForm({ ...loanForm, client_name: e.target.value }) })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Descrição / Motivo'),
          React.createElement('input', { type: 'text', placeholder: 'Ex: Dinheiro emprestado, investimento inicial', value: loanForm.description, onChange: e => setLoanForm({ ...loanForm, description: e.target.value }) })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Valor Cedido (R$) *'),
            React.createElement('input', { type: 'number', value: loanForm.amount, onChange: e => setLoanForm({ ...loanForm, amount: e.target.value }) })
          ),
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Valor a Devolver (R$) *'),
            React.createElement('input', { type: 'number', value: loanForm.repayment_amount, onChange: e => setLoanForm({ ...loanForm, repayment_amount: e.target.value }) })
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Conta de Origem do Capital'),
          React.createElement('select', { value: loanForm.source_account, onChange: e => setLoanForm({ ...loanForm, source_account: e.target.value }) },
            React.createElement('option', { value: '' }, 'Nenhuma (Capital Próprio)'),
            accounts.map(a => React.createElement('option', { key: a.id, value: a.name }, a.name))
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Dividido em X vezes'),
            React.createElement('input', { type: 'number', min: '1', value: loanForm.num_installments, onChange: e => setLoanForm({ ...loanForm, num_installments: e.target.value }) })
          ),
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Data do Acordo'),
            React.createElement('input', { type: 'date', value: loanForm.loan_date, onChange: e => setLoanForm({ ...loanForm, loan_date: e.target.value }) })
          )
        ),
        React.createElement('div', { className: 'modal-actions' },
          React.createElement('button', { className: 'btn btn-secondary', onClick: () => { setShowLoan(false); setEditLoanTarget(null); } }, 'Cancelar'),
          React.createElement('button', { className: 'btn btn-primary', onClick: saveLoan }, 'Salvar')
        )
      )
    ),
    showPayment && React.createElement('div', { className: 'modal-backdrop' },
      React.createElement('div', { className: 'modal' },
        React.createElement('h3', null, `Amortizar Valor - ${paymentForm.client_name}`),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Valor Recebido (R$) *'),
          React.createElement('input', { type: 'number', value: paymentForm.amount, onChange: e => setPaymentForm({ ...paymentForm, amount: e.target.value }) })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Nº da Parcela'),
            React.createElement('input', { type: 'number', min: '1', max: paymentForm.max_installments, value: paymentForm.installment_number, onChange: e => setPaymentForm({ ...paymentForm, installment_number: e.target.value }) })
          ),
          React.createElement('div', { className: 'form-group', style: { flex: 1 } },
            React.createElement('label', null, 'Data do Recebimento'),
            React.createElement('input', { type: 'date', value: paymentForm.payment_date, onChange: e => setPaymentForm({ ...paymentForm, payment_date: e.target.value }) })
          )
        ),
        React.createElement('div', { className: 'modal-actions' },
          React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowPayment(false) }, 'Voltar'),
          React.createElement('button', { className: 'btn btn-green', onClick: savePayment }, 'Baixar Parcela')
        )
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES TAB
// ─────────────────────────────────────────────────────────────────────────────
function ClientesTab({ toast }) {
  const [items, setItems] = useState([]);
  useEffect(() => { api('/api/items').then(setItems).catch(e => toast(e.message, 'error')); }, [toast]);

  const map = {};
  items.forEach(i => {
    if (i.buyer) {
      if (!map[i.buyer]) map[i.buyer] = { name: i.buyer, buys: 0, total_spent: 0, profit_gen: 0 };
      map[i.buyer].buys += parseInt(i.quantity_sold || 1);
      map[i.buyer].total_spent += parseFloat(i.sale_price || 0);
      map[i.buyer].profit_gen += parseFloat(i.profit || 0);
    }
  });

  return React.createElement('div', { className: 'card', style: { padding: 0 } },
    React.createElement('table', { className: 'table' },
      React.createElement('thead', null,
        React.createElement('tr', null,
          React.createElement('th', null, 'Nome do Cliente'),
          React.createElement('th', null, 'Total Compras'),
          React.createElement('th', null, 'Valor Movimentado'),
          React.createElement('th', null, 'Lucro Gerado')
        )
      ),
      React.createElement('tbody', null,
        Object.keys(map).length === 0 ? React.createElement('tr', null, React.createElement('td', { colSpan: 4, style: { textAlign: 'center' } }, 'Nenhum cliente registrado.')) :
        Object.values(map).map(c => React.createElement('tr', { key: c.name },
          React.createElement('td', null, React.createElement('strong', null, c.name)),
          React.createElement('td', null, `${c.buys} un`),
          React.createElement('td', null, fmt(c.total_spent)),
          React.createElement('td', { style: { color: '#10b981', fontWeight: 'bold' } }, fmt(c.profit_gen))
        ))
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO PAGAMENTOS TAB
// ─────────────────────────────────────────────────────────────────────────────
function PagamentosTab({ toast }) {
  const [payments, setPayments] = useState([]);
  const load = useCallback(() => { api('/api/payments').then(setPayments).catch(e => toast(e.message, 'error')); }, [toast]);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    if (!confirm('Deseja estornar esse recebimento? A dívida do cliente aumentará novamente.')) return;
    try {
      await api(`/api/payments/${id}`, { method: 'DELETE' });
      toast('Pagamento estornado!', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return React.createElement('div', { className: 'card', style: { padding: 0 } },
    React.createElement('table', { className: 'table' },
      React.createElement('thead', null,
        React.createElement('tr', null,
          React.createElement('th', null, 'Data'),
          React.createElement('th', null, 'Cliente'),
          React.createElement('th', null, 'Origem'),
          React.createElement('th', null, 'Parcela'),
          React.createElement('th', null, 'Valor Pago'),
          React.createElement('th', { style: { textAlign: 'right' } }, 'Estorno')
        )
      ),
      React.createElement('tbody', null,
        payments.length === 0 ? React.createElement('tr', null, React.createElement('td', { colSpan: 6, style: { textAlign: 'center' } }, 'Nenhum pagamento registrado.')) :
        payments.map(p => React.createElement('tr', { key: p.id },
          React.createElement('td', null, fmtDate(p.payment_date)),
          React.createElement('td', null, React.createElement('strong', null, p.client_name)),
          React.createElement('td', null, React.createElement('span', { className: 'badge' }, p.reference_type === 'sale' ? 'Venda Estoque' : 'Empréstimo')),
          React.createElement('td', null, `${p.installment_number}ª`),
          React.createElement('td', { style: { color: '#10b981', fontWeight: 'bold' } }, fmt(p.amount)),
          React.createElement('td', { style: { textAlign: 'right' } },
            React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => remove(p.id) }, '🗑️')
          )
        ))
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO VENDAS TAB (DASHBOARD)
// ─────────────────────────────────────────────────────────────────────────────
function VendasTab({ toast }) {
  const [months, setMonths] = useState([]);
  useEffect(() => { api('/api/sales-by-month').then(setMonths).catch(e => toast(e.message, 'error')); }, [toast]);

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 15 } },
    months.map(m => React.createElement('div', { key: m.month, className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement('div', null,
        React.createElement('h3', null, monthLabel(m.month)),
        React.createElement('span', { className: 'text-muted', style: { fontSize: 13 } }, 'Faturamento Bruto Total')
      ),
      React.createElement('div', { style: { textAlign: 'right' } },
        React.createElement('div', { style: { fontSize: 22, fontWeight: 'bold', color: '#2563eb' } }, fmt(m.total_sales)),
        React.createElement('div', { style: { fontSize: 14, color: '#10b981', fontWeight: 'bold' } }, `Lucro Líquido: ${fmt(m.total_profit)}`)
      )
    ))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTAS TAB (ROMBO REAL COMPLETO)
// ─────────────────────────────────────────────────────────────────────────────
function ContasTab({ toast, accounts, onAddAccount }) {
  const [balances, setBalances] = useState([]);
  const [newAccount, setNewAccount] = useState('');

  const load = useCallback(() => { api('/api/account-balance').then(setBalances).catch(e => toast(e.message, 'error')); }, [toast]);
  useEffect(() => { load(); }, [load]);

  const createAccount = async () => {
    if (!newAccount.trim()) return;
    try {
      await api('/api/accounts', { method: 'POST', body: { name: newAccount } });
      toast('Nova conta de aporte adicionada!', 'success'); setNewAccount(''); onAddAccount(); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
    React.createElement('div', { className: 'card', style: { background: '#f8fafc' } },
      React.createElement('h3', { style: { marginBottom: 10 } }, 'Adicionar Nova Conta de Aporte/Capital'),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement('input', { type: 'text', placeholder: 'Nome da Conta (Ex: Sofisa, Cartão Ju, Itaú)', value: newAccount, onChange: e => setNewAccount(e.target.value), style: { flex: 1 } }),
        React.createElement('button', { className: 'btn btn-primary', onClick: createAccount }, 'Cadastrar')
      )
    ),
    React.createElement('h3', null, 'Déficit e Fluxo de Reposição de Capital'),
    balances.length === 0 ? React.createElement('p', { className: 'text-muted' }, 'Nenhuma conta está negativa ou com saldo pendente de devolução!') :
    balances.map(b => React.createElement('div', { key: b.account, className: 'card' },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #e2e8f0', paddingBottom: 6, marginBottom: 10, flexWrap: 'wrap' } },
        React.createElement('h3', null, b.is_lucro_virtual ? '📈 Projeção e Distribuição de Lucros' : `🏦 Conta: ${b.account}`),
        React.createElement('div', { style: { textAlign: 'right' } },
          React.createElement('span', { style: { fontSize: 12, color: '#64748b', block: 'block' } }, b.is_lucro_virtual ? 'Lucro Líquido a Receber:' : 'A Devolver para Origem:'),
          React.createElement('div', { style: { fontSize: 20, fontWeight: 'bold', color: b.is_lucro_virtual ? '#10b981' : '#e53e3e' } }, fmt(b.pending_reposto))
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 20, marginBottom: 15, fontSize: 13, color: '#475569', flexWrap: 'wrap' } },
        React.createElement('div', null, `${b.is_lucro_virtual ? 'Total Projetado:' : 'Total Aportado:'} `, React.createElement('strong', null, fmt(b.total_invested))),
        React.createElement('div', null, `${b.is_lucro_virtual ? 'Já Retirado:' : 'Já Reposto:'} `, React.createElement('strong', { style: { color: '#10b981' } }, fmt(b.total_reposto)))
      ),
      React.createElement('div', { style: { overflowX: 'auto' } },
        React.createElement('table', { className: 'table', style: { fontSize: 13 } },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Descrição / Item'),
              React.createElement('th', null, 'Cliente/Status'),
              React.createElement('th', null, b.is_lucro_virtual ? 'Lucro Margem' : 'Custo Original'),
              React.createElement('th', null, 'Amortizado'),
              React.createElement('th', null, 'Pendente')
            )
          ),
          React.createElement('tbody', null,
            b.entries.map((e, idx) => React.createElement('tr', { key: idx },
              React.createElement('td', null, e.item),
              React.createElement('td', null, React.createElement('span', { className: 'text-muted' }, e.client)),
              React.createElement('td', null, fmt(e.cost)),
              React.createElement('td', { style: { color: '#10b981' } }, fmt(e.reposto)),
              React.createElement('td', { style: { color: '#e53e3e', fontWeight: 'bold' } }, fmt(e.pending))
            ))
          )
        )
      )
    ))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('estoque');
  const [accounts, setAccounts] = useState([]);

  const loadAccounts = useCallback(() => {
    api('/api/accounts').then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const toast = (msg, type = 'success') => {
    const alertBox = document.createElement('div');
    alertBox.innerText = msg;
    alertBox.style.position = 'fixed';
    alertBox.style.bottom = '20px';
    alertBox.style.right = '20px';
    alertBox.style.padding = '12px 24px';
    alertBox.style.borderRadius = '8px';
    alertBox.style.color = '#fff';
    alertBox.style.fontWeight = 'bold';
    alertBox.style.zIndex = '99999';
    alertBox.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    alertBox.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b';
    document.body.appendChild(alertBox);
    setTimeout(() => alertBox.remove(), 3500);
  };

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
      tab === 'contas' && React.createElement(ContasTab, { toast, accounts, onAddAccount: loadAccounts })
    )
  );
}

const root = Azad || document.getElementById('root'); 
ReactDOM.render(React.createElement(App), document.getElementById('root'));