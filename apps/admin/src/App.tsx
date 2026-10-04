import {
  AlertOutlined,
  BarChartOutlined,
  BugOutlined,
  CarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FlagOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { ThemedLayout, useNotificationProvider } from '@refinedev/antd';
import { Authenticated, Refine } from '@refinedev/core';
import routerProvider, { CatchAllNavigate, NavigateToResource } from '@refinedev/react-router';
import { App as AntdApp, ConfigProvider } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { authProvider } from './lib/auth-provider';
import { AppealList } from './pages/AppealList';
import { ClientErrorList } from './pages/ClientErrorList';
import { Dashboard } from './pages/Dashboard';
import { FieldMetrics } from './pages/FieldMetrics';
import { FlagList } from './pages/FlagList';
import { Login } from './pages/Login';
import { PickupSearch } from './pages/PickupSearch';
import { PlaceList } from './pages/PlaceList';
import { ReportList } from './pages/ReportList';
import { SessionList } from './pages/SessionList';
import { UserList } from './pages/UserList';
import { UserShow } from './pages/UserShow';
import { VerificationList } from './pages/VerificationList';
import { VerificationShow } from './pages/VerificationShow';

/** Same palette as the mobile app (ADR-212). */
const THEME = { token: { colorPrimary: '#0B4A8B', colorWarning: '#FFC629', borderRadius: 8 } };

export function App() {
  return (
    <BrowserRouter>
      <ConfigProvider locale={frFR} theme={THEME}>
        <AntdApp>
          <Refine
            routerProvider={routerProvider}
            authProvider={authProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: 'dashboard',
                list: '/',
                meta: { label: 'Tableau de bord', icon: <DashboardOutlined /> },
              },
              {
                name: 'verifications',
                list: '/verifications',
                show: '/verifications/:id',
                meta: { label: 'Vérifications', icon: <SafetyCertificateOutlined /> },
              },
              {
                name: 'sessions',
                list: '/sessions',
                meta: { label: 'Sessions', icon: <CarOutlined /> },
              },
              {
                name: 'reports',
                list: '/reports',
                meta: { label: 'Signalements', icon: <FlagOutlined /> },
              },
              {
                name: 'risk-flags',
                list: '/risk-flags',
                meta: { label: 'Alertes', icon: <AlertOutlined /> },
              },
              {
                name: 'users',
                list: '/users',
                show: '/users/:id',
                meta: { label: 'Utilisateurs', icon: <TeamOutlined /> },
              },
              {
                name: 'appeals',
                list: '/appeals',
                meta: { label: 'Contestations', icon: <MessageOutlined /> },
              },
              {
                name: 'pickups',
                list: '/pickups',
                meta: { label: 'Prises en charge', icon: <NodeIndexOutlined /> },
              },
              {
                name: 'field-metrics',
                list: '/field-metrics',
                meta: { label: 'Mesures terrain', icon: <BarChartOutlined /> },
              },
              {
                name: 'client-errors',
                list: '/client-errors',
                meta: { label: 'Erreurs', icon: <BugOutlined /> },
              },
              {
                name: 'places',
                list: '/places',
                meta: { label: 'Lieux', icon: <EnvironmentOutlined /> },
              },
            ]}
            options={{ disableTelemetry: true, syncWithLocation: true }}
          >
            <Routes>
              <Route
                element={
                  <Authenticated key="protected" fallback={<CatchAllNavigate to="/login" />}>
                    <ThemedLayout>
                      <Outlet />
                    </ThemedLayout>
                  </Authenticated>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="/verifications" element={<VerificationList />} />
                <Route path="/verifications/:userId" element={<VerificationShow />} />
                <Route path="/sessions" element={<SessionList />} />
                <Route path="/reports" element={<ReportList />} />
                <Route path="/risk-flags" element={<FlagList />} />
                <Route path="/users" element={<UserList />} />
                <Route path="/users/:userId" element={<UserShow />} />
                <Route path="/appeals" element={<AppealList />} />
                <Route path="/pickups" element={<PickupSearch />} />
                <Route path="/field-metrics" element={<FieldMetrics />} />
                <Route path="/client-errors" element={<ClientErrorList />} />
                <Route path="/places" element={<PlaceList />} />
              </Route>
              <Route
                element={
                  <Authenticated key="public" fallback={<Outlet />}>
                    <NavigateToResource resource="dashboard" />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<Login />} />
              </Route>
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
