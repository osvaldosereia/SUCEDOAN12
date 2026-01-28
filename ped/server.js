const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ==========================================
// ⚙️ CONFIGURAÇÃO (DADOS DA DONA ANTÔNIA)
// ==========================================
const CLIENT_ID = "e99538b0f29b6f76e0b0855982b2f0c1e7d69fbc"; 
const CLIENT_SECRET = "c43f24d223f096b845d80fc4855c91d832d0f882ce3be22b29468df34fbb";

// O REDIRECT_URI precisa ser igual ao cadastrado no Bling
// Se for usar no Render, lembre-se de atualizar este link no painel do Bling!
const REDIRECT_URI = "http://localhost:3000/callback";

const TOKEN_FILE = 'token.json';
const ID_NATUREZA_OPERACAO = 15109544486; 

// ==========================================
// 🌐 ROTAS DE CONEXÃO
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/status', (req, res) => res.json({ conectado: fs.existsSync(TOKEN_FILE) }));

app.get('/login', (req, res) => {
    const url = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&state=renovar&redirect_uri=${REDIRECT_URI}`;
    res.redirect(url);
});

app.get('/callback', async (req, res) => {
    try {
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://www.bling.com.br/Api/v3/oauth/token', 
            { grant_type: 'authorization_code', code: req.query.code, redirect_uri: REDIRECT_URI },
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` } }
        );
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(response.data));
        res.redirect('/');
    } catch (error) {
        res.send(`Erro na autenticação: ${error.message}`);
    }
});

// ==========================================
// 🧠 PROCESSADOR V8.0 (MODO OUTRAS DESPESAS)
// ==========================================
app.post('/api/vender', async (req, res) => {
    const { cpf, lista, idPagamento, valorAlvo } = req.body;

    if (!fs.existsSync(TOKEN_FILE)) return res.status(401).json({ erro: "⚠️ Sistema Desconectado! Clique em RENOVAR." });
    
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
    const accessToken = tokens.access_token;

    try {
        console.log("\n--- [INÍCIO DA OPERAÇÃO V8.0] ---");

        // 1. PROCESSAMENTO DE PRODUTOS
        const linhas = lista.split('\n').filter(l => l.trim() !== '');
        const itensParaPedido = [];
        let subtotalProdutos = 0;
        const regex = /^(\d+)[\s]*[xX][\s]*(.+)/;

        for (let l of linhas) {
            const match = l.match(regex);
            if (!match) continue;

            const qtd = parseFloat(match[1]);
            const codigoLido = match[2].trim();
            
            console.log(`🔎 Consultando SKU: ${codigoLido}`);
            
            const buscaProd = await axios.get(`https://www.bling.com.br/Api/v3/produtos?codigo=${codigoLido}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (buscaProd.data.data && buscaProd.data.data.length > 0) {
                const prod = buscaProd.data.data[0];
                const precoUnitario = parseFloat(prod.preco || 0);
                
                subtotalProdutos += (precoUnitario * qtd);

                itensParaPedido.push({ 
                    "produto": { "id": prod.id }, 
                    "quantidade": qtd,
                    "unidade": prod.unidade || "UN",
                    "valor": precoUnitario
                });
                console.log(`   ✅ OK: ${prod.nome} | Qtd: ${qtd} | Unit: R$ ${precoUnitario}`);
            } else {
                throw new Error(`❌ Produto "${codigoLido}" não encontrado no Bling.`);
            }
        }

        if (itensParaPedido.length === 0) throw new Error("❌ Nenhum produto válido na lista.");

        // 2. CÁLCULO DO AJUSTE (VALOR ALVO)
        let valorAjuste = 0;
        const alvo = valorAlvo ? parseFloat(valorAlvo) : 0;

        if (alvo > 0) {
            if (alvo < (subtotalProdutos - 0.05)) { 
                throw new Error(`❌ O valor final (R$ ${alvo}) é menor que a soma dos produtos (R$ ${subtotalProdutos.toFixed(2)}).`);
            }
            valorAjuste = alvo - subtotalProdutos;
        }

        const totalProdutosFinal = Number(subtotalProdutos.toFixed(2));
        const ajusteFinal = Number(valorAjuste.toFixed(2));
        const totalVendaFinal = Number((totalProdutosFinal + ajusteFinal).toFixed(2));

        console.log(`📊 MATEMÁTICA: Produtos(${totalProdutosFinal}) + Ajuste(${ajusteFinal}) = TOTAL(${totalVendaFinal})`);

        // 3. BUSCA OU CRIAÇÃO DO CLIENTE
        const cleanCpf = cpf.replace(/[^0-9]/g, '');
        let contatoId = null;
        
        let buscaC = await axios.get(`https://www.bling.com.br/Api/v3/contatos?numero_documento=${cleanCpf}`, {
             headers: { 'Authorization': `Bearer ${accessToken}` }
        }).catch(() => ({ data: {} }));

        if (buscaC.data.data && buscaC.data.data.length > 0) {
            contatoId = buscaC.data.data[0].id;
        } else {
             const novo = await axios.post('https://www.bling.com.br/Api/v3/contatos', 
                 { 
                    "nome": `Cliente Site (${cleanCpf})`, 
                    "tipo": "F", 
                    "numeroDocumento": cleanCpf,
                    "enderecoGeral": { 
                        "endereco": "Entrega", "numero": "SN", "bairro": "Centro", 
                        "cep": "78000-000", "municipio": "Cuiabá", "uf": "MT" 
                    }
                 }, 
                 { headers: { 'Authorization': `Bearer ${accessToken}` } }
             );
             contatoId = novo.data.data.id;
        }

        // 4. MONTAGEM DO PEDIDO
        const payload = {
            "data": new Date().toISOString().split('T')[0],
            "numeroLoja": Date.now().toString(),
            "contato": { "id": contatoId },
            "itens": itensParaPedido,
            "outrasDespesas": ajusteFinal
        };

        if (ID_NATUREZA_OPERACAO > 0) payload.naturezaOperacao = { "id": ID_NATUREZA_OPERACAO };

        // 5. FINANCEIRO
        if (idPagamento && totalVendaFinal > 0) {
            payload.parcelas = [{
                "dataVencimento": new Date().toISOString().split('T')[0],
                "valor": totalVendaFinal,
                "formaPagamento": { "id": parseInt(idPagamento) }
            }];
        }

        // 6. ENVIO FINAL
        const pedido = await axios.post('https://www.bling.com.br/Api/v3/pedidos/vendas', payload,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        res.json({ sucesso: true, id: pedido.data.data.id, total: totalVendaFinal });

    } catch (error) {
        let msg = error.message;
        if (error.response && error.response.data && error.response.data.error) {
            const e = error.response.data.error;
            msg = e.fields ? `Erro em [${e.fields[0].element}]: ${e.fields[0].msg}` : (e.description || e.message);
        }
        res.status(400).json({ erro: msg });
    }
});

// ==========================================
// 🚀 INICIALIZAÇÃO
// ==========================================
const PORTA_FINAL = process.env.PORT || 3000;
app.listen(PORTA_FINAL, () => {
    console.log(`🚀 Motor V8.0 Dona Antônia Online na porta ${PORTA_FINAL}!`);
});
