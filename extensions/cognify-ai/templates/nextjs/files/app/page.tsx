import { greeting } from '../lib/greeting.mjs';

export default function Home() {
	return (
		<main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
			<h1>{greeting('{{projectName}}')}</h1>
			<p>Edit <code>app/page.tsx</code> and save to see your changes.</p>
		</main>
	);
}
