import React, { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
// Note como importamos das pastas que acabamos de criar
import { Card, Button, Input } from '../../components/ui/BaseComponents';

export default function ClientsModule({ clients, onAddClient, onRemoveClient }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return alert('Preencha nome e telefone');
    
    onAddClient({ 
      ...formData, 
      id: Date.now(), 
      orders: 0 
    });
    
    setIsFormOpen(false);
    setFormData({ name: '', phone: '', address: '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Cabeçalho do Módulo */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gestão de Clientes</h2>
          <p className="text-sm text-slate-500">{clients.length} clientes cadastrados</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <UserPlus size={18} /> Novo Cliente
        </Button>
      </div>

      {/* Modal de Cadastro (Simples) */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-4">Cadastrar Novo Cliente</h3>
            <form onSubmit={handleSubmit}>
              <Input 
                label="Nome Completo" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                required 
              />
              <Input 
                label="Telefone / WhatsApp" 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
                required 
              />
              <Input 
                label="Endereço de Entrega" 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
              />
              
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="success">
                  Salvar Cliente
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Tabela de Clientes */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
            <tr>
              <th className="p-4">Nome / Contato</th>
              <th className="p-4">Endereço</th>
              <th className="p-4 text-center">Histórico</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-slate-400">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : (
              clients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-slate-800">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.phone}</p>
                  </td>
                  <td className="p-4 text-slate-600 truncate max-w-[200px]">
                    {client.address || <span className="text-slate-300 italic">Sem endereço</span>}
                  </td>
                  <td className="p-4 text-center">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">
                      {client.orders || 0} pedidos
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Button variant="ghost" className="inline-flex" onClick={() => onRemoveClient(client.id)}>
                      <Trash2 size={16} className="text-red-400 hover:text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
