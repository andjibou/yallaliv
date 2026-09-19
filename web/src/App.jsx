import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LangProvider, SettingsProvider, AuthProvider, CartProvider, useAuth, homeFor, Toasts } from './lib.jsx';
import { ErrorBoundary } from './ui.jsx';
import { SwapModal, Spinner } from './ui.jsx';
import { Login, Register } from './pages/auth.jsx';
import Legal from './pages/legal.jsx';
import { ClientLayout, ClientHome, StorePage, CartPage, ClientOrders, ClientProfile } from './pages/client.jsx';
import MerchantApp from './pages/merchant.jsx';
import DriverApp from './pages/driver.jsx';
import AdminApp from './pages/superadmin.jsx';

function Require({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center-screen"><Spinner /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} />;
  return children;
}

function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center-screen"><Spinner /></div>;
  return <Navigate to={user ? homeFor(user) : '/app'} />;   // visiteur -> espace client direct (sans compte)
}

// Espace client ouvert aux INVITÉS (navigation, magasins, panier — compte créé à la commande)
// et aux MARCHANDS + SUPER ADMIN, qui peuvent aussi commander (bascule depuis le profil).
function ClientGate() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center-screen"><Spinner /></div>;
  if (user && !['client', 'merchant', 'superadmin'].includes(user.role)) return <Navigate to={homeFor(user)} />;
  return <ClientLayout />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <LangProvider>
      <SettingsProvider>
        <AuthProvider>
          <CartProvider>
            <BrowserRouter>
              <Toasts />
              <SwapModal />
              {/* Version du front — sert à VÉRIFIER que l'app charge bien la dernière version
                  (badge discret en bas à droite de chaque écran). À incrémenter à chaque déploiement. */}
              <div style={{ position: 'fixed', bottom: 3, right: 8, fontSize: 10, opacity: 0.45, zIndex: 9999, pointerEvents: 'none' }}>YallaLiv v2026.09.19.9</div>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/legal" element={<Legal />} />
                <Route path="/app" element={<ClientGate />}>
                  <Route index element={<ClientHome />} />
                  <Route path="store/:id" element={<StorePage />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="orders" element={<ClientOrders />} />
                  <Route path="profile" element={<ClientProfile />} />
                </Route>
                <Route path="/merchant" element={<Require roles={['merchant']}><MerchantApp /></Require>} />
                <Route path="/driver" element={<Require roles={['driver']}><DriverApp /></Require>} />
                <Route path="/admin" element={<Require roles={['superadmin']}><AdminApp /></Require>} />
                <Route path="*" element={<Root />} />
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </AuthProvider>
      </SettingsProvider>
    </LangProvider>
    </ErrorBoundary>
  );
}
