import { Route, Routes } from 'react-router-dom';
import { GuestRoute } from './components/GuestRoute';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/home" element={<Home />} />
    </Routes>
  );
}
