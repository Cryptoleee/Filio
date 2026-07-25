'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { api } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inloggen mislukt');
    }
  }

  return (
    <div className="backdrop" style={{ background: 'var(--bg)' }}>
      <div className="gateModal">
        <Logo size={34} />
        <div className="gateTitle">Filio</div>
        <div className="gateExplainer">Log in als editor om je projecten te beheren.</div>
        <input
          className="gateInput"
          autoFocus
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <input
          className="gateInput"
          type="password"
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        {error && (
          <div style={{ color: 'var(--destructive)', fontSize: 12, marginBottom: 10 }}>{error}</div>
        )}
        <button className="gateBtn" onClick={() => void submit()}>Log in</button>
        <div className="gateCaption">ÉÉN EDITOR · GEEN REGISTRATIE</div>
      </div>
    </div>
  );
}
