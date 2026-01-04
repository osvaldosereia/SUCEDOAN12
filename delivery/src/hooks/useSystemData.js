
const INITIAL_DATA = {
  products: [
    { id: 1, name: 'Produto Exemplo', price: 10.00, category: 'Geral', stock: 100 }
  ],
  clients: [],
  orders: []
};

function useSystemData() {
  const [data, setData] = useState(INITIAL_DATA);
  const [isLoaded, setIsLoaded] = useState(false);

  // Carregar dados (apenas no lado do cliente)
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('delivery_db') : null;
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar dados", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Salvar dados automaticamente
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem('delivery_db', JSON.stringify(data));
    }
  }, [data, isLoaded]);

  const actions = {
    addClient: (client) => {
      setData(prev => ({ ...prev, clients: [...prev.clients, client] }));
      alert('Cliente salvo com sucesso!');
    },
    removeClient: (id) => {
      if (confirm('Tem certeza que deseja remover este cliente?')) {
        setData(prev => ({ ...prev, clients: prev.clients.filter(c => c.id !== id) }));
      }
    },
    // Futuras ações de estoque e vendas viriam aqui...
  };

  return { data, actions, isLoaded };
}
