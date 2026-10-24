import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { AppProvider, useApp } from './lib/store';
import { initNotifications, isNative } from './lib/notify';
import { initPush } from './lib/push';
import Layout from './components/Layout';
import { Spinner, Toasts } from './components/ui';
import Auth from './pages/Auth';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import AddVital from './pages/AddVital';
import History from './pages/History';
import Trends from './pages/Trends';
import Meds from './pages/Meds';
import { AddMeal, FoodLog } from './pages/Food';
import Water from './pages/Water';
import Reports from './pages/Reports';
import Appointments from './pages/Appointments';
import Reminders from './pages/Reminders';
import PatientForm from './pages/PatientForm';
import Family, { Patients } from './pages/Family';
const Export = lazy(() => import('./pages/Export'));
import More from './pages/More';

function Native() {
  const nav = useNavigate();
  const { selectPatient, user } = useApp();
  useEffect(() => {
    // opened from a web notification: /history?patient=<id>
    const pid = new URLSearchParams(window.location.search).get('patient');
    if (pid) selectPatient(pid);
  }, []); // eslint-disable-line
  useEffect(() => {
    if (user) initPush((path, patientId) => { if (patientId) selectPatient(patientId); nav(path); });
  }, [user?.id]); // eslint-disable-line
  useEffect(() => {
    initNotifications(p => nav(p));
    if (!isNative()) return;
    const h = CapApp.addListener('backButton', ({ canGoBack }) => { if (canGoBack && window.location.pathname !== '/') window.history.back(); else CapApp.exitApp(); });
    return () => { h.then(x => x.remove()); };
  }, [nav]);
  return null;
}

function Gate() {
  const { ready, user, memberships } = useApp();
  if (!ready) return <Spinner />;
  if (!user) return <Auth />;
  if (!memberships.length) return <Routes><Route path="*" element={<Onboarding />} /></Routes>;
  return (
    <>
      <Native />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="add/:kind" element={<AddVital />} />
          <Route path="history" element={<History />} />
          <Route path="trends" element={<Trends />} />
          <Route path="meds" element={<Meds />} />
          <Route path="food" element={<FoodLog />} />
          <Route path="food/add" element={<AddMeal />} />
          <Route path="water" element={<Water />} />
          <Route path="reports" element={<Reports />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="reminders" element={<Reminders />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/new" element={<PatientForm />} />
          <Route path="patients/:id" element={<PatientForm />} />
          <Route path="family" element={<Family />} />
          <Route path="export" element={<Suspense fallback={<Spinner />}><Export /></Suspense>} />
          <Route path="more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Gate />
        <Toasts />
      </AppProvider>
    </BrowserRouter>
  );
}
