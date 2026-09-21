'use client';

import { useActionState, useState } from 'react';
import { sendMagicLink, signInWithPassword, type AuthState } from './actions';

const EMPTY: AuthState = {};

export function LoginForm({ linkExpired }: { linkExpired: boolean }) {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const action = mode === 'password' ? signInWithPassword : sendMagicLink;
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="authform">
      {linkExpired ? (
        <p className="formnote error">That sign-in link has expired or was already used.</p>
      ) : null}

      <label className="field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="email" required placeholder="you@clinic.in" />
      </label>

      {mode === 'password' ? (
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </label>
      ) : null}

      {state.error ? <p className="formnote error">{state.error}</p> : null}
      {state.notice ? <p className="formnote ok">{state.notice}</p> : null}

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? 'Working…' : mode === 'password' ? 'Sign in' : 'Email me a link'}
      </button>

      <button
        className="linkbtn"
        type="button"
        onClick={() => setMode(mode === 'password' ? 'link' : 'password')}
      >
        {mode === 'password' ? 'Email me a sign-in link instead' : 'Use a password instead'}
      </button>
    </form>
  );
}
