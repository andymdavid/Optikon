import { AccountMenu } from './components/account/AccountMenu'
import { CanvasBoard } from './components/CanvasBoard'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <AccountMenu />
      <CanvasBoard />
    </div>
  )
}

export default App
