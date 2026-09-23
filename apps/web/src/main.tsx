import { App } from '@cots/ui';
import { render } from 'preact';
import '@cots/ui/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
render(<App />, root);
