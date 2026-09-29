import { createRoot } from 'react-dom/client'
import '../styles.css'
import './pet.css'
import { initStore } from '../common/store'
import { Pet } from './Pet'

initStore(['settings', 'chat'])
createRoot(document.getElementById('root')!).render(<Pet />)
