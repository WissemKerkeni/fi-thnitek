import { QueryClient } from '@tanstack/react-query';
import { createApiClient } from './api';
import { API_URL } from './config';

export const api = createApiClient(API_URL);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});
