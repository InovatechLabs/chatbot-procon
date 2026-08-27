import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
      localStorage.setItem('authenticated', 'true');
      navigate('/analytics');
    } else {
      setErro('Usuário ou senha incorretos.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="sidebar-logo-icon">P</div>
          <h2>Painel PROCON<span>Admin</span></h2>
          <p>Informe suas credenciais para acessar o painel</p>
        </div>

        {erro && <div className="login-error">{erro}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              type="text"
              placeholder="Digite o usuário"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              placeholder="Digite a senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary btn-full">
            Entrar no Painel
          </button>
        </form>
      </div>
    </div>
  );
}