\# Gestão de Revendas e Estoque



Sistema completo de gestão de revendas com controle de estoque, financeiro, clientes e histórico.



\## Arquitetura



\- \*\*Backend\*\*: Node.js + Express (porta 5000)

\- \*\*Frontend\*\*: React via CDN (sem build step), servido pelo Express

\- \*\*Banco de dados\*\*: PostgreSQL (Replit built-in)



\## Estrutura de Arquivos



```

server.js          # Backend Express com todas as rotas da API

public/

&#x20; index.html       # HTML principal com React CDN

&#x20; app.js           # Aplicação React completa (sem JSX transpiler)

&#x20; style.css        # Estilos minimalistas dark mode

package.json       # Dependências Node.js

```



\## Banco de Dados



\### Tabelas



\- \*\*items\*\* — Produtos do estoque (nome, data, custo, conta, loja, status)

\- \*\*sales\*\* — Vendas realizadas (item, cliente, preço, parcelas, data)

\- \*\*loans\*\* — Empréstimos (cliente, valor, parcelas, data, descrição)

\- \*\*payments\*\* — Pagamentos recebidos (referência, cliente, valor, parcela, data)



\## API Endpoints



| Método | Rota | Descrição |

|--------|------|-----------|

| GET | /api/items | Listar itens do estoque |

| POST | /api/items | Criar item |

| PUT | /api/items/:id | Atualizar item |

| DELETE | /api/items/:id | Excluir item |

| GET | /api/sales | Listar vendas |

| POST | /api/sales | Registrar venda (marca item como vendido) |

| GET | /api/loans | Listar empréstimos |

| POST | /api/loans | Registrar empréstimo |

| GET | /api/payments | Histórico de pagamentos |

| POST | /api/payments | Registrar pagamento |

| GET | /api/financial-overview | Visão geral financeira por cliente |

| GET | /api/sales-history | Resumo mensal de vendas |

| GET | /api/account-balance | Saldo reposto por conta (Sofisa/Studio) |



\## Regra de Ouro



Os primeiros pagamentos de uma venda repõem o custo na conta de origem (Sofisa/Studio) antes de contar como lucro. A lógica é:

\- `reposto = min(paid, cost)`

\- `lucro = max(0, paid - cost)`



O status "Reposição" aparece enquanto `reposto < cost`. Após isso, passa para "Lucro".



\## Funcionalidades



\### Estoque

\- Cadastrar itens com nome, data, custo, conta (Sofisa/Studio), loja e status

\- Filtrar por status e conta

\- Busca por nome/loja

\- Editar e excluir itens



\### Financeiro

\- Nova Venda: puxando itens do estoque disponível

\- Novo Empréstimo: registrar dívida sem item do estoque

\- Visão Geral: quem deve, saldo, status de reposição vs lucro

\- Registrar pagamentos diretamente da visão geral



\### Clientes

\- Agrupamento de dívidas por cliente

\- Visão consolidada de vendas e empréstimos por pessoa



\### Histórico de Pagamentos

\- Extrato completo com parcela (ex: 2/5) e saldo devedor

\- Filtro por busca



\### Histórico de Vendas

\- Resumo mensal de investimentos, faturamento, lucro e margem



\## Workflow



\- \*\*Start application\*\*: `node server.js` na porta 5000



