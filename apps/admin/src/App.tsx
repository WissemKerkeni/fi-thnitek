import { DashboardOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { ThemedLayout, useNotificationProvider } from '@refinedev/antd';
import { Authenticated, Refine } from '@refinedev/core';
import routerProvider, { CatchAllNavigate, NavigateToResource } from '@refinedev/react-router';
import { App as AntdApp, ConfigProvider } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { authProvider } from './lib/auth-provider';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
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
