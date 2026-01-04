import React, { useState, useEffect } from 'react';
import { 
  Users, // Ícone Clientes
  Box,   // Ícone Estoque
  Menu, X, UserPlus, Trash2
} from 'lucide-react';

// ==================================================================================
// 1. COMPONENTES UI (Base Visual)
// ➔ No seu PC: Copie este bloco para /src/components/ui/BaseComponents.jsx
// ==================================================================================

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-slate-200 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className = "", disabled = false, component="button", ...props }) => {
  const baseStyle = "px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    danger: "bg-red-500 text-white hover:bg-red-600",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-500 hover:bg-slate-100 p-2 rounded-full"
  };

  if (component === 'label') {
    return <label className={`${baseStyle} ${variants[variant]} ${className} cursor-pointer`} {...props}>{children}</label>;
  }

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Input = ({ label, className = "", ...props }) => (
  <div className={`mb-3 ${className}`}>
    {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
    <input className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" {...props} />
  </div>
);
