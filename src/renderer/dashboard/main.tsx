import { createRoot } from 'react-dom/client'
import '../styles.css'
import { initStore } from '../common/store'
import { App } from './App'

initStore(['settings', 'water', 'events', 'alarms', 'chat'])
createRoot(document.getElementById('root')!).render(<App />)
