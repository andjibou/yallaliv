import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LangProvider, SettingsProvider, AuthProvider, CartProvider, useAuth, homeFor, Toasts , initNativePush } from './lib.jsx';
import { ErrorBoundary } from './ui.jsx';
import { SwapModal, Spinner } from './ui.jsx';
import { Login, Register } from './pages/auth.jsx';
import Legal from './pages/legal.jsx';
import { ClientLayout, ClientHome, StorePage, CartPage, ClientOrders, ClientProfile, MarketPage, ListingDetailPage, PublishPage, NotificationsPage, SettingsPage } from './pages/client.jsx';
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

// 🔁 Mémorise le dernier écran visité (par compte) : réouvrir l'app y revient directement
function LastPathSaver() {
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => {
    if (!user) return;
    if (!loc.pathname.startsWith('/login') && !loc.pathname.startsWith('/register')) {
      try { localStorage.setItem('yl_last_path_' + user.id, loc.pathname + loc.search); } catch {}
    }
  }, [user?.id, loc.pathname, loc.search]);
  return null;
}

function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center-screen"><Spinner /></div>;
  if (!user) return <Navigate to="/app" />;   // visiteur -> espace client direct (sans compte)
  // L'utilisateur rouvre l'app (tuée depuis les récents) : retour LÀ OÙ IL ÉTAIT
  let last = null;
  try { last = localStorage.getItem('yl_last_path_' + user.id); } catch {}
  if (last) {
    const ok =
      (last.startsWith('/driver') && user.role === 'driver') ||
      (last.startsWith('/merchant') && user.role === 'merchant') ||
      (last.startsWith('/admin') && user.role === 'superadmin') ||
      (last.startsWith('/app') && ['client', 'merchant', 'superadmin'].includes(user.role));
    if (ok) return <Navigate to={last} />;
  }
  return <Navigate to={homeFor(user)} />;
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
  useEffect(() => { initNativePush(); }, []);   // 🔔 FCM : ré-enregistre le token à chaque démarrage de l'app
  return (
    <ErrorBoundary>
    <LangProvider>
      <SettingsProvider>
        <AuthProvider>
          <CartProvider>
            <BrowserRouter>
              <LastPathSaver />
              <Toasts />
              <SwapModal />
              {/* Version du front — sert à VÉRIFIER que l'app charge bien la dernière version
                  (badge discret en bas à droite de chaque écran). À incrémenter à chaque déploiement. */}
              <div style={{ position: 'fixed', bottom: 3, right: 8, fontSize: 10, opacity: 0.45, zIndex: 9999, pointerEvents: 'none' }}>YallaLiv v2026.09.26.1</div>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/legal" element={<Legal />} />
                <Route path="/app" element={<ClientGate />}>
                  <Route index element={<ClientHome />} />
                  <Route path="store/:id" element={<StorePage />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="orders" element={<ClientOrders />} />
                  <Route path="market" element={<MarketPage />} />
                  <Route path="market/:id" element={<ListingDetailPage />} />
                  <Route path="publish" element={<PublishPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
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
