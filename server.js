const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// Esse ajuste permite que o banco de dados do Supabase converse com seu site com segurança
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ACCOUNTS ────────────────────────────────────────────────────────────────
app.get('/api/accounts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts ORDER BY id');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/accounts', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const result = await pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING *', [name.trim()]);
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Conta já existe' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const acc = await pool.query('SELECT name FROM accounts WHERE id=$1', [req.params.id]);
    if (!acc.rows.length) return res.status(404).json({ error: 'Conta não encontrada' });
    const inUse = await pool.query('SELECT COUNT(*) FROM items WHERE account=$1', [acc.rows[0].name]);
    if (parseInt(inUse.rows[0].count) > 0) return res.status(400).json({ error: 'Conta está em uso por itens do estoque' });
    await pool.query('DELETE FROM accounts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ITEMS (with sale info when sold) ────────────────────────────────────────
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        TO_CHAR(i.purchase_date, 'YYYY-MM-DD') AS purchase_date,
        s.client_name AS buyer,
        s.sale_price,
        TO_CHAR(s.sale_date, 'YYYY-MM-DD') AS sale_date,
        s.num_installments AS sale_installments,
        (s.sale_price - i.cost) AS profit,
        COALESCE(p.paid_total, 0) AS sale_paid_total
      FROM items i
      LEFT JOIN sales s ON s.item_id = i.id
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total
        FROM payments WHERE reference_type='sale' GROUP BY reference_id
      ) p ON p.reference_id = s.id
      WHERE NOT (
        i.status = 'vendido'
        AND s.id IS NOT NULL
        AND (s.sale_price - COALESCE(p.paid_total, 0)) < 0.01
      )
      ORDER BY i.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/items', async (req, res) => {
  const { name, purchase_date, cost, account, store, status } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO items (name, purchase_date, cost, account, store, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, TO_CHAR(purchase_date, \'YYYY-MM-DD\') AS purchase_date',
      [name, purchase_date, cost, account, store || null, status || 'estoque']
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/items/:id', async (req, res) => {
  const { name, purchase_date, cost, account, store, status } = req.body;
  try {
    const result = await pool.query(
      'UPDATE items SET name=$1, purchase_date=$2, cost=$3, account=$4, store=$5, status=$6 WHERE id=$7 RETURNING *, TO_CHAR(purchase_date, \'YYYY-MM-DD\') AS purchase_date',
      [name, purchase_date, cost, account, store || null, status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SALES ───────────────────────────────────────────────────────────────────
app.get('/api/sales', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        TO_CHAR(s.sale_date, 'YYYY-MM-DD') AS sale_date,
        i.name AS item_name, i.cost AS item_cost, i.account AS item_account
      FROM sales s
      LEFT JOIN items i ON s.item_id = i.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sales', async (req, res) => {
  const { item_id, client_name, sale_price, num_installments, sale_date } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO sales (item_id, client_name, sale_price, num_installments, sale_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [item_id, client_name, sale_price, num_installments, sale_date]
    );
    await client.query('UPDATE items SET status=$1 WHERE id=$2', ['vendido', item_id]);
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ─── LOANS ───────────────────────────────────────────────────────────────────
app.get('/api/loans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, TO_CHAR(loan_date, 'YYYY-MM-DD') AS loan_date FROM loans ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/loans', async (req, res) => {
  const { client_name, amount, repayment_amount, num_installments, loan_date, description, source_account } = req.body;
  const repay = repayment_amount || amount;
  try {
    const result = await pool.query(
      'INSERT INTO loans (client_name, amount, repayment_amount, num_installments, loan_date, description, source_account) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [client_name, amount, repay, num_installments, loan_date, description || null, source_account || null]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PAYMENTS (auto installment calculation) ─────────────────────────────────
app.delete('/api/loans/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM payments WHERE reference_type='loan' AND reference_id=$1", [req.params.id]);
    await client.query('DELETE FROM loans WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/api/payments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS payment_date,
        CASE
          WHEN p.reference_type = 'sale' THEN s.sale_price
          WHEN p.reference_type = 'loan' THEN l.repayment_amount
        END AS total_value,
        CASE
          WHEN p.reference_type = 'sale' THEN s.num_installments
          WHEN p.reference_type = 'loan' THEN l.num_installments
        END AS total_installments,
        CASE
          WHEN p.reference_type = 'sale' THEN i.name
          ELSE l.description
        END AS item_name,
        (SELECT COALESCE(SUM(p2.amount), 0)
         FROM payments p2
         WHERE p2.reference_type = p.reference_type
           AND p2.reference_id = p.reference_id
           AND p2.id <= p.id) AS cumulative_paid
      FROM payments p
      LEFT JOIN sales s ON p.reference_type = 'sale' AND p.reference_id = s.id
      LEFT JOIN items i ON s.item_id = i.id
      LEFT JOIN loans l ON p.reference_type = 'loan' AND p.reference_id = l.id
      ORDER BY p.payment_date DESC, p.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payments', async (req, res) => {
  const { reference_type, reference_id, client_name, amount, payment_date } = req.body;
  try {
    // Auto-calculate installment number
    let total, num_installments;
    if (reference_type === 'sale') {
      const s = await pool.query('SELECT sale_price, num_installments FROM sales WHERE id=$1', [reference_id]);
      total = parseFloat(s.rows[0].sale_price);
      num_installments = parseInt(s.rows[0].num_installments);
    } else {
      const l = await pool.query('SELECT repayment_amount, amount AS orig_amount, num_installments FROM loans WHERE id=$1', [reference_id]);
      total = parseFloat(l.rows[0].repayment_amount || l.rows[0].orig_amount);
      num_installments = parseInt(l.rows[0].num_installments);
    }
    const prevPaid = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE reference_type=$1 AND reference_id=$2',
      [reference_type, reference_id]
    );
    const installment_amount = total / num_installments;
    const completedBefore = Math.floor(parseFloat(prevPaid.rows[0].s) / installment_amount);
    const installment_number = completedBefore + 1;

    const result = await pool.query(
      'INSERT INTO payments (reference_type, reference_id, client_name, amount, payment_date, installment_number) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [reference_type, reference_id, client_name, amount, payment_date, installment_number]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FINANCIAL OVERVIEW ──────────────────────────────────────────────────────
app.delete('/api/sales/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sale = await client.query('SELECT item_id FROM sales WHERE id=$1', [req.params.id]);
    if (!sale.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Venda não encontrada' }); }
    await client.query("DELETE FROM payments WHERE reference_type='sale' AND reference_id=$1", [req.params.id]);
    await client.query("UPDATE items SET status='estoque', buyer=NULL, sale_price=NULL, profit=NULL WHERE id=$1", [sale.rows[0].item_id]);
    await client.query('DELETE FROM sales WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/api/financial-overview', async (req, res) => {
  try {
    const salesQ = await pool.query(`
      SELECT s.id, s.client_name, s.sale_price, s.num_installments,
             TO_CHAR(s.sale_date, 'YYYY-MM-DD') AS sale_date,
             i.cost AS item_cost, i.account AS item_account, i.name AS item_name,
             COALESCE(SUM(p.amount), 0) AS paid_total
      FROM sales s
      LEFT JOIN items i ON s.item_id = i.id
      LEFT JOIN payments p ON p.reference_type = 'sale' AND p.reference_id = s.id
      GROUP BY s.id, i.cost, i.account, i.name
    `);

    const loansQ = await pool.query(`
      SELECT l.id, l.client_name, l.amount, l.repayment_amount, l.num_installments,
             TO_CHAR(l.loan_date, 'YYYY-MM-DD') AS loan_date,
             l.description, l.source_account,
             COALESCE(SUM(p.amount), 0) AS paid_total
      FROM loans l
      LEFT JOIN payments p ON p.reference_type = 'loan' AND p.reference_id = l.id
      GROUP BY l.id
    `);

    const overview = {};

    for (const sale of salesQ.rows) {
      const total = parseFloat(sale.sale_price);
      const cost = parseFloat(sale.item_cost) || 0;
      const paid = parseFloat(sale.paid_total);
      const balance = total - paid;
      const reposto = Math.min(paid, cost);
      const lucro_received = Math.max(0, paid - cost);
      const total_profit = Math.max(0, total - cost);
      const pending_origin = Math.max(0, cost - reposto);
      const pending_lucro = Math.max(0, total_profit - lucro_received);
      const installment_amount = total / sale.num_installments;
      const completed_installments = Math.floor(paid / installment_amount);

      if (!overview[sale.client_name]) overview[sale.client_name] = { items: [], total_balance: 0 };
      overview[sale.client_name].items.push({
        type: 'sale', id: sale.id,
        description: sale.item_name, total, paid, balance, cost,
        account: sale.item_account, reposto: reposto, lucro: lucro_received,
        total_profit, pending_origin, pending_lucro,
        num_installments: parseInt(sale.num_installments),
        installment_amount, completed_installments,
        repayment_amount: total
      });
      overview[sale.client_name].total_balance += Math.max(0, balance);
    }

    for (const loan of loansQ.rows) {
      const origAmount = parseFloat(loan.amount);
      const repayment = parseFloat(loan.repayment_amount || loan.amount);
      const paid = parseFloat(loan.paid_total);
      const balance = repayment - paid;
      const reposto = Math.min(paid, origAmount);
      const lucro_received = Math.max(0, paid - origAmount);
      const total_profit = Math.max(0, repayment - origAmount);
      const pending_origin = Math.max(0, origAmount - reposto);
      const pending_lucro = Math.max(0, total_profit - lucro_received);
      const installment_amount = repayment / loan.num_installments;
      const completed_installments = Math.floor(paid / installment_amount);

      if (!overview[loan.client_name]) overview[loan.client_name] = { items: [], total_balance: 0 };
      overview[loan.client_name].items.push({
        type: 'loan', id: loan.id,
        description: loan.description || 'Empréstimo',
        total: repayment, paid, balance, cost: origAmount,
        account: loan.source_account, reposto, lucro: lucro_received,
        total_profit, pending_origin, pending_lucro,
        num_installments: parseInt(loan.num_installments),
        installment_amount, completed_installments,
        repayment_amount: repayment,
        is_zero_profit: Math.abs(repayment - origAmount) < 0.01
      });
      overview[loan.client_name].total_balance += Math.max(0, balance);
    }

    res.json(overview);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SALES HISTORY (per-sale detail by month, exclude zero-profit loans) ─────
app.get('/api/sales-history', async (req, res) => {
  try {
    const salesQ = await pool.query(`
      SELECT
        TO_CHAR(s.sale_date, 'YYYY-MM') AS month,
        s.id, s.client_name, s.sale_price AS revenue, s.num_installments,
        TO_CHAR(s.sale_date, 'YYYY-MM-DD') AS sale_date,
        i.name AS item_name, i.cost AS invested, i.account,
        (s.sale_price - i.cost) AS profit,
        COALESCE(paid.paid_total, 0) AS paid_total
      FROM sales s
      LEFT JOIN items i ON s.item_id = i.id
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total FROM payments
        WHERE reference_type = 'sale' GROUP BY reference_id
      ) paid ON paid.reference_id = s.id
      ORDER BY s.sale_date DESC
    `);

    const loansQ = await pool.query(`
      SELECT
        TO_CHAR(l.loan_date, 'YYYY-MM') AS month,
        l.id, l.client_name, l.repayment_amount AS revenue, l.num_installments,
        TO_CHAR(l.loan_date, 'YYYY-MM-DD') AS sale_date,
        l.description AS item_name, l.amount AS invested, l.source_account AS account,
        (l.repayment_amount - l.amount) AS profit,
        COALESCE(paid.paid_total, 0) AS paid_total
      FROM loans l
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total FROM payments
        WHERE reference_type = 'loan' GROUP BY reference_id
      ) paid ON paid.reference_id = l.id
      WHERE l.repayment_amount > l.amount
      ORDER BY l.loan_date DESC
    `);

    const byMonth = {};
    const allRows = [
      ...salesQ.rows.map(r => ({ ...r, entry_type: 'sale' })),
      ...loansQ.rows.map(r => ({ ...r, entry_type: 'loan' }))
    ];

    for (const row of allRows) {
      if (!byMonth[row.month]) byMonth[row.month] = { month: row.month, sales: [], total_invested: 0, total_revenue: 0, total_profit: 0 };
      byMonth[row.month].sales.push(row);
      byMonth[row.month].total_invested += parseFloat(row.invested || 0);
      byMonth[row.month].total_revenue += parseFloat(row.revenue || 0);
      byMonth[row.month].total_profit += parseFloat(row.profit || 0);
    }

    const sorted = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));
    res.json(sorted);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ACCOUNT BALANCE (detailed per-account) ──────────────────────────────────
app.get('/api/account-balance', async (req, res) => {
  try {
    // Sales contributions per account
    const salesQ = await pool.query(`
      SELECT
        i.account,
        i.name AS item_name, i.cost,
        s.sale_price, s.client_name,
        COALESCE(paid.paid_total, 0) AS paid_total
      FROM items i
      JOIN sales s ON s.item_id = i.id
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total FROM payments
        WHERE reference_type = 'sale' GROUP BY reference_id
      ) paid ON paid.reference_id = s.id
    `);

    // Loans contributions per account
    const loansQ = await pool.query(`
      SELECT
        l.source_account AS account,
        l.description AS item_name, l.amount AS cost,
        l.repayment_amount AS sale_price, l.client_name,
        COALESCE(paid.paid_total, 0) AS paid_total
      FROM loans l
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total FROM payments
        WHERE reference_type = 'loan' GROUP BY reference_id
      ) paid ON paid.reference_id = l.id
      WHERE l.source_account IS NOT NULL AND l.source_account != ''
    `);

    const accounts = {};
    const lucroVirtual = { account: 'Lucro', is_lucro_virtual: true, total_invested: 0, total_reposto: 0, pending_reposto: 0, total_lucro: 0, pending_lucro: 0, entries: [] };

    const addEntry = (rows, type) => {
      for (const row of rows) {
        const acct = row.account;
        if (acct) {
          if (!accounts[acct]) accounts[acct] = { account: acct, total_invested: 0, total_reposto: 0, pending_reposto: 0, total_lucro: 0, entries: [] };
          const cost = parseFloat(row.cost || 0);
          const paid = parseFloat(row.paid_total || 0);
          const reposto = Math.min(paid, cost);
          const pending = Math.max(0, cost - reposto);
          const lucro_received = Math.max(0, paid - cost);
          accounts[acct].total_invested += cost;
          accounts[acct].total_reposto += reposto;
          accounts[acct].pending_reposto += pending;
          accounts[acct].total_lucro += lucro_received;
          if (pending > 0.01) {
            accounts[acct].entries.push({ type, item: row.item_name, client: row.client_name, cost, reposto, pending, lucro: lucro_received });
          }
        }
        // Accumulate lucro for the virtual Lucro account
        const cost = parseFloat(row.cost || 0);
        const sale_price = parseFloat(row.sale_price || 0);
        const paid = parseFloat(row.paid_total || 0);
        const total_profit = Math.max(0, sale_price - cost);
        const lucro_received = Math.max(0, paid - cost);
        const pending_lucro = Math.max(0, total_profit - lucro_received);
        lucroVirtual.total_invested += total_profit;
        lucroVirtual.total_reposto += lucro_received;
        lucroVirtual.pending_reposto += pending_lucro;
        lucroVirtual.total_lucro += lucro_received;
        lucroVirtual.pending_lucro += pending_lucro;
        if (pending_lucro > 0.01) {
          lucroVirtual.entries.push({ type, item: row.item_name, client: row.client_name, cost: total_profit, reposto: lucro_received, pending: pending_lucro, lucro: lucro_received });
        }
      }
    };
    addEntry(salesQ.rows, 'sale');
    addEntry(loansQ.rows, 'loan');

    const result = Object.values(accounts).filter(a => a.pending_reposto > 0.01);
    if (lucroVirtual.pending_reposto > 0.01) result.push(lucroVirtual);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Isso faz o site funcionar na porta que a hospedagem escolher
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
