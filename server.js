const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// Conexão com o banco de dados (Neon / Supabase) via variável de ambiente
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

// ─── ITEMS (ESTOQUE) ──────────────────────────────────────────────────────────
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        TO_CHAR(i.purchase_date, 'YYYY-MM-DD') AS purchase_date,
        s.id AS sale_id,
        s.client_name AS buyer,
        s.sale_price,
        TO_CHAR(s.sale_date, 'YYYY-MM-DD') AS sale_date,
        s.num_installments AS sale_installments,
        s.quantity_sold,
        ((s.sale_price / COALESCE(NULLIF(s.quantity_sold, 0), 1)) - i.cost) * COALESCE(s.quantity_sold, 1) AS profit,
        COALESCE(p.paid_total, 0) AS sale_paid_total
      FROM items i
      LEFT JOIN sales s ON s.item_id = i.id
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total
        FROM payments WHERE reference_type='sale' GROUP BY reference_id
      ) p ON p.reference_id = s.id
      ORDER BY i.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/items', async (req, res) => {
  const { name, purchase_date, cost, account, store, status, quantity } = req.body;
  try {
    const qty = parseInt(quantity) || 1;
    const result = await pool.query(
      'INSERT INTO items (name, purchase_date, cost, account, store, status, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *, TO_CHAR(purchase_date, \'YYYY-MM-DD\') AS purchase_date',
      [name, purchase_date, cost, account, store || null, status || 'estoque', qty]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/items/:id', async (req, res) => {
  const { name, purchase_date, cost, account, store, status, quantity } = req.body;
  try {
    const qty = parseInt(quantity) || 1;
    const result = await pool.query(
      'UPDATE items SET name=$1, purchase_date=$2, cost=$3, account=$4, store=$5, status=$6, quantity=$7 WHERE id=$8 RETURNING *, TO_CHAR(purchase_date, \'YYYY-MM-DD\') AS purchase_date',
      [name, purchase_date, cost, account, store || null, status, qty, req.params.id]
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

// ─── SALES (VENDAS) ───────────────────────────────────────────────────────────
app.post('/api/sales', async (req, res) => {
  const { item_id, client_name, sale_price, num_installments, sale_date, quantity_sold } = req.body;
  const qtySold = parseInt(quantity_sold) || 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const itemRes = await client.query('SELECT * FROM items WHERE id=$1', [item_id]);
    if (!itemRes.rows.length) throw new Error('Item não encontrado');
    const item = itemRes.rows[0];
    const itemQty = parseInt(item.quantity) || 1;

    let targetItemId = item_id;

    // Se vendeu menos unidades do que o lote cadastrado, divide o item no estoque
    if (qtySold < itemQty) {
      await client.query('UPDATE items SET quantity = quantity - $1 WHERE id = $2', [qtySold, item_id]);
      
      const newItemRes = await client.query(
        'INSERT INTO items (name, purchase_date, cost, account, store, status, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [item.name, item.purchase_date, item.cost, item.account, item.store, 'vendido', qtySold]
      );
      targetItemId = newItemRes.rows[0].id;
    } else {
      await client.query('UPDATE items SET status=$1, quantity=$2 WHERE id=$3', ['vendido', qtySold, item_id]);
    }

    const result = await client.query(
      'INSERT INTO sales (item_id, client_name, sale_price, num_installments, sale_date, quantity_sold) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [targetItemId, client_name, sale_price, num_installments, sale_date, qtySold]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Rota de edição de vendas
app.put('/api/sales/:id', async (req, res) => {
  const { client_name, sale_price, num_installments, sale_date } = req.body;
  try {
    const result = await pool.query(
      'UPDATE sales SET client_name=$1, sale_price=$2, num_installments=$3, sale_date=$4 WHERE id=$5 RETURNING *',
      [client_name, sale_price, num_installments, sale_date, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sales/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saleRes = await client.query('SELECT item_id FROM sales WHERE id=$1', [req.params.id]);
    if (saleRes.rows.length) {
      const itemId = saleRes.rows[0].item_id;
      await client.query('UPDATE items SET status=\'estoque\' WHERE id=$1', [itemId]);
    }
    await client.query('DELETE FROM payments WHERE reference_type=\'sale\' AND reference_id=$1', [req.params.id]);
    await client.query('DELETE FROM sales WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ─── LOANS (EMPRÉSTIMOS) ──────────────────────────────────────────────────────
app.get('/api/loans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, TO_CHAR(l.loan_date, 'YYYY-MM-DD') AS loan_date, COALESCE(p.paid_total, 0) AS paid_total
      FROM loans l
      LEFT JOIN (
        SELECT reference_id, SUM(amount) AS paid_total
        FROM payments WHERE reference_type='loan' GROUP BY reference_id
      ) p ON p.reference_id = l.id
      ORDER BY l.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/loans', async (req, res) => {
  const { client_name, amount, repayment_amount, num_installments, loan_date, description, source_account } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO loans (client_name, amount, repayment_amount, num_installments, loan_date, description, source_account) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *, TO_CHAR(loan_date, \'YYYY-MM-DD\') AS loan_date',
      [client_name, amount, repayment_amount, num_installments, loan_date, description, source_account || null]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rota de edição de empréstimos
app.put('/api/loans/:id', async (req, res) => {
  const { client_name, amount, repayment_amount, num_installments, loan_date, description, source_account } = req.body;
  try {
    const result = await pool.query(
      'UPDATE loans SET client_name=$1, amount=$2, repayment_amount=$3, num_installments=$4, loan_date=$5, description=$6, source_account=$7 WHERE id=$8 RETURNING *, TO_CHAR(loan_date, \'YYYY-MM-DD\') AS loan_date',
      [client_name, amount, repayment_amount, num_installments, loan_date, description, source_account || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/loans/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM payments WHERE reference_type=\'loan\' AND reference_id=$1', [req.params.id]);
    await client.query('DELETE FROM loans WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ─── PAYMENTS (PAGAMENTOS) ────────────────────────────────────────────────────
app.get('/api/payments', async (req, res) => {
  try {
    const result = await pool.query('SELECT *, TO_CHAR(payment_date, \'YYYY-MM-DD\') AS payment_date FROM payments ORDER BY payment_date DESC, id DESC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payments', async (req, res) => {
  const { reference_type, reference_id, client_name, amount, payment_date, installment_number } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO payments (reference_type, reference_id, client_name, amount, payment_date, installment_number) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, TO_CHAR(payment_date, \'YYYY-MM-DD\') AS payment_date',
      [reference_type, reference_id, client_name, amount, payment_date, installment_number]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/payments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM payments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ACCOUNT BALANCE (CONTA DETALHADA COM DÉFICIT REAL) ───────────────────────
app.get('/api/account-balance', async (req, res) => {
  try {
    const salesQ = await pool.query(`
      SELECT i.account, i.name AS item_name, (i.cost * COALESCE(s.quantity_sold, i.quantity)) as cost, s.sale_price, s.client_name, COALESCE(paid.paid_total, 0) AS paid_total
      FROM items i JOIN sales s ON s.item_id = i.id
      LEFT JOIN (SELECT reference_id, SUM(amount) AS paid_total FROM payments WHERE reference_type = 'sale' GROUP BY reference_id) paid ON paid.reference_id = s.id
    `);

    const loansQ = await pool.query(`
      SELECT l.source_account AS account, l.description AS item_name, l.amount AS cost, l.repayment_amount AS sale_price, l.client_name, COALESCE(paid.paid_total, 0) AS paid_total
      FROM loans l LEFT JOIN (SELECT reference_id, SUM(amount) AS paid_total FROM payments WHERE reference_type = 'loan' GROUP BY reference_id) paid ON paid.reference_id = l.id
      WHERE l.source_account IS NOT NULL AND l.source_account != ''
    `);

    const nonSoldQ = await pool.query(`
      SELECT account, name AS item_name, (cost * quantity) AS cost, status FROM items WHERE status IN ('estoque', 'em_transporte')
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
            accounts[acct].entries.push({ type, item: row.item_name, client: row.client_name || '—', cost, reposto, pending, lucro: lucro_received });
          }
        }
        if (type !== 'not_sold') {
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
      }
    };

    addEntry(salesQ.rows, 'sale');
    addEntry(loansQ.rows, 'loan');
    addEntry(nonSoldQ.rows.map(r => ({ ...r, client_name: `Ainda em ${r.status === 'estoque' ? 'Estoque' : 'Transporte'}` })), 'not_sold');

    const result = Object.values(accounts).filter(a => a.pending_reposto > 0.01);
    if (lucroVirtual.pending_reposto > 0.01) result.push(lucroVirtual);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── VENDAS POR MÊS (DASHBOARD) ────────────────────────────────────────────────
app.get('/api/sales-by-month', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(s.sale_date, 'YYYY-MM') AS month, SUM(s.sale_price) AS total_sales,
             SUM(((s.sale_price / COALESCE(NULLIF(s.quantity_sold, 0), 1)) - i.cost) * COALESCE(s.quantity_sold, 1)) AS total_profit
      FROM sales s JOIN items i ON s.item_id = i.id
      GROUP BY month ORDER BY month DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fallback para SPA (Sempre serve o index.html da pasta public)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
