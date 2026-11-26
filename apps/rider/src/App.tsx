import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { GuestRoute } from './components/GuestRoute';
import { HomeSkeleton } from './pages/HomeSkeleton';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { PaymentSkeleton } from './pages/PaymentSkeleton';
import { ReceiptSkeleton, ReceiptsSkeleton } from './pages/ReceiptsSkeleton';
import { Signup } from './pages/Signup';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Payment = lazy(() => import('./pages/Payment').then((module) => ({ default: module.Payment })));
const Receipts = lazy(() => import('./pages/Receipts').then((module) => ({ default: module.Receipts })));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage').then((module) => ({ default: module.ReceiptPage })));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/home" element={<Suspense fallback={<HomeSkeleton />}><Home /></Suspense>} />
      <Route path="/payment" element={<Suspense fallback={<PaymentSkeleton />}><Payment /></Suspense>} />
      <Route path="/receipts" element={<Suspense fallback={<ReceiptsSkeleton />}><Receipts /></Suspense>} />
      <Route path="/receipts/:id" element={<Suspense fallback={<ReceiptSkeleton />}><ReceiptPage /></Suspense>} />
    </Routes>
  );
}
