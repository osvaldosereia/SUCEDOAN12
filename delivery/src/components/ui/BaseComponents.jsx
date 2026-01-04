import React, { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';

// Importando os componentes visuais que criamos acima
import { Card, Button, Input } from '../../components/ui/BaseComponents';

export default function ClientsModule({ clients = [], onAddClient = () => {}, onRemoveClient = () => {} }) {
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
    <div className="space-y-6 animate-in fade-in p-4 bg-slate-50 min-h-screen">
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
