import React from 'react';
import { Header } from './components';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { user } = useAuth();
  return <Header user={user} />;
}
