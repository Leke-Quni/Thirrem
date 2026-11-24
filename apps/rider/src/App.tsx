import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { GuestRoute } from './components/GuestRoute';
import { HomeSkeleton } from './pages/HomeSkeleton';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/home" element={<Suspense fallback={<HomeSkeleton />}><Home /></Suspense>} />
    </Routes>
  );
}
