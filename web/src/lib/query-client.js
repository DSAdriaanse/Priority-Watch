import { QueryClient } from '@tanstack/react-query';


// Shared data cache (TanStack Query). Few screens use it directly; most fetch with entities.* instead.
export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});