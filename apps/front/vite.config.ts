import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { readFileSync } from 'node:fs'

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			'/socket.io': {
				target: 'ws://localhost:13008',
				ws: true,
			},
		},
		host: true,
		https: {
			key: readFileSync('/data/localhost+1-key.pem'),
			cert: readFileSync('/data/localhost+1.pem'),
		},
	},
})
